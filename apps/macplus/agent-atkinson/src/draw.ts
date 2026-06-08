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

// Provider: 'openai' (gpt-image-1) or 'together' (FLUX). Default openai.
const PROVIDER = (process.env.ATK_IMAGE_PROVIDER || 'openai').toLowerCase();

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
    }),
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
    await run('python3', [
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

/** prompt -> packed 1bpp frame (generate + dither). */
export async function promptToFrame(prompt: string): Promise<Buffer> {
  const img = await generateImage(prompt);
  return ditherToFrame(img);
}
