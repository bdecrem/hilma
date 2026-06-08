/*
 * draw.ts - turn a text prompt into a 480x300 1bpp Atkinson-dithered bitmap.
 *
 *   1. generate an image from the prompt (Together.ai FLUX.1-schnell)
 *   2. Atkinson-dither + pack to 1bpp via the proven dither.py (which also
 *      DEFINES the wire format: 480x300, 60 bytes/row, MSB-first, set=black)
 *
 * dither.py is reused on purpose: it's the validated algorithm and the single
 * source of truth for the packed-byte layout the Plus renderer consumes.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const IMG_W = 480;
export const IMG_H = 300;
export const IMG_RB = IMG_W / 8;            // 60
export const FRAME_BYTES = IMG_RB * IMG_H;  // 18000

const HERE = fileURLToPath(new URL('.', import.meta.url));
// agent-atkinson/src -> ../../atkinson/dither.py
const DITHER_PY = resolve(HERE, '..', '..', 'atkinson', 'dither.py');

// Which python runs dither.py. Must be a python3 with Pillow. Explicit (not a
// bare "python3" PATH lookup) because the box can have several python3s and
// only one has Pillow - e.g. on the mini /usr/bin/python3 has it but the
// Homebrew python3 that wins on PATH (needed for node) does not.
const PYTHON = process.env.ATK_PYTHON || 'python3';

// Provider: 'openai' (gpt-image-1) or 'together' (FLUX). Default openai.
const PROVIDER = (process.env.ATK_IMAGE_PROVIDER || 'openai').toLowerCase();

/*
 * The taste layer. The Plus shows a 480x300 *1-bit* Atkinson-dithered bitmap,
 * so the generated source image has to be built for that: high-contrast
 * monochrome with a strong value structure and bold composition. We wrap every
 * user idea in this art direction so the result reads as gorgeous old-school
 * Mac art (MacPaint / 1980s b&w Mac game art) once dithered, instead of a muddy
 * downsample of a color photo. Override the whole thing with ATK_STYLE.
 *
 * Deliberately does NOT ask for "pixel art" or "dithering" - dither.py owns the
 * 1-bit conversion; asking the model to also dither just double-dithers to mush.
 */
const STYLE = process.env.ATK_STYLE || [
  'Black-and-white illustration in the style of vintage 1-bit Macintosh art —',
  'classic MacPaint and 1980s black-and-white Mac adventure games',
  '(Dark Castle, Shadowgate, The Manhole, Uninvited).',
  'Pure monochrome, absolutely no color.',
  'High contrast with deep blacks, bright whites, and a full range of grays.',
  'Dramatic chiaroscuro lighting, bold confident silhouette, one clear subject,',
  'clean composition with generous negative space so it reads at small size.',
  'Shading rendered as fine crosshatching, stippling, and engraved hatch lines.',
  'No text, no lettering, no captions, no border or frame.',
].join(' ');

/** Wrap a user's image idea in the house art direction. */
export function buildPrompt(userIdea: string): string {
  return `${STYLE}\n\nSubject: ${userIdea.trim()}`;
}

async function pickImage(json: any): Promise<Buffer> {
  const d = json?.data?.[0];
  if (d?.b64_json) return Buffer.from(d.b64_json, 'base64');
  if (d?.url) {
    const img = await fetch(d.url);
    if (!img.ok) throw new Error(`fetch image url ${img.status}`);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error('image API returned no image');
}

// Hard cap on the image-gen call so a slow/hung provider fails loudly (-> ATKERR
// on the Plus) instead of hanging the connection. gpt-image-1 'medium' is ~20s;
// 'high' ~50s. 90s leaves headroom while still timing out well before the user
// (or the Plus's own serial read) gives up. Override with ATK_GEN_TIMEOUT_MS.
const GEN_TIMEOUT_MS = Number(process.env.ATK_GEN_TIMEOUT_MS) || 90_000;

async function genTogether(prompt: string): Promise<Buffer> {
  const key = process.env.TOGETHER_API_KEY;
  if (!key) throw new Error('TOGETHER_API_KEY not set');
  const res = await fetch('https://api.together.xyz/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.ATK_IMAGE_MODEL || 'black-forest-labs/FLUX.1-schnell-Free',
      prompt, width: 1024, height: 768, n: 1, steps: 4, response_format: 'b64_json',
    }),
    signal: AbortSignal.timeout(GEN_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Together ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`);
  return pickImage(await res.json());
}

async function genOpenAI(prompt: string): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.ATK_IMAGE_MODEL || 'gpt-image-1',
      prompt, size: '1536x1024', n: 1,   // landscape; dither.py cover-fits to 480x300
      // 'medium' (~20s) not 'high' (~50s): after the 1-bit 480x300 Atkinson
      // dither the extra tonal detail is mostly thrown away, and 'high' was
      // overrunning the client's ~1-min timeout. Override with ATK_IMAGE_QUALITY.
      quality: process.env.ATK_IMAGE_QUALITY || 'medium',
    }),
    signal: AbortSignal.timeout(GEN_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`);
  return pickImage(await res.json());
}

/** Generate an image for `prompt`; returns raw PNG/JPEG bytes. */
export async function generateImage(prompt: string): Promise<Buffer> {
  return PROVIDER === 'together' ? genTogether(prompt) : genOpenAI(prompt);
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (b) => (err += b));
    p.on('error', rej);
    p.on('close', (code) =>
      code === 0 ? res() : rej(new Error(`${cmd} exited ${code}: ${err.slice(0, 200)}`)));
  });
}

/** Atkinson-dither `imageBytes` to the packed 1bpp frame via dither.py. */
export async function ditherToFrame(imageBytes: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'atk-'));
  const inPng = join(dir, 'in.png');
  const outBin = join(dir, 'out.bin');
  const previewPng = join(dir, 'preview.png');
  try {
    await writeFile(inPng, imageBytes);
    await run(PYTHON, [
      DITHER_PY, inPng, previewPng,
      '--size', `${IMG_W}x${IMG_H}`,
      '--fit', 'cover',
      '--contrast', '1.15',
      '--bin', outBin,
    ]);
    const packed = await readFile(outBin);
    if (packed.length !== FRAME_BYTES) {
      throw new Error(`dither produced ${packed.length} bytes, expected ${FRAME_BYTES}`);
    }
    return packed;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** prompt -> packed 1bpp frame (generate + dither). The user's idea is wrapped
 *  in the house art direction (buildPrompt) before it hits the model. */
export async function promptToFrame(prompt: string): Promise<Buffer> {
  const img = await generateImage(buildPrompt(prompt));
  return ditherToFrame(img);
}
