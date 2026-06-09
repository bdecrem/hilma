#!/usr/bin/env -S npx tsx
/*
 * atk-draw - generate a real image from a prompt and show the 1-bit result the
 * Plus would paint. Same production pipeline as the live agent (draw.ts:
 * OpenAI gpt-image-1 + the house art direction + real Atkinson dither), minus
 * the serial wire - so it's the right tool for iterating on prompts/taste on
 * the iMac (or the mini). Writes a PNG and opens it.
 *
 *   OPENAI_API_KEY=... npm run draw "a submarine cutaway, every pipe labeled"
 *   ATK_IMAGE_PROVIDER=together TOGETHER_API_KEY=... npm run draw "..."   # free
 *
 * On the mini also set ATK_PYTHON=/usr/bin/python3 (the one with Pillow).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promptToFrame, IMG_W, IMG_H, IMG_RB, FRAME_BYTES } from './draw.ts';

const PYTHON = process.env.ATK_PYTHON || 'python3';

/* A usable API key is ASCII-printable and non-trivial. Rejects junk like the
 * literal "…" placeholder, which fetch can't put in a header (ByteString). */
function looksValid(k?: string): boolean {
  return !!k && k.length > 10 && /^[\x20-\x7e]+$/.test(k);
}

/* On the iMac the keys live in the repo .env.local (gitignored), not the shell.
 * Walk up from here to find it and load OPENAI/TOGETHER keys, unless the env
 * already has a valid one. On the mini there's no .env.local, so the env var
 * the listener sets is used as-is. */
function ensureApiKey(): void {
  /* Only skip the .env.local load when BOTH keys are already good - otherwise a
   * valid TOGETHER key in the shell would shadow a bogus OPENAI one and the
   * openai provider would still fail. The loop below never overwrites a key
   * that's already valid, so respecting the environment is preserved. */
  if (looksValid(process.env.OPENAI_API_KEY) && looksValid(process.env.TOGETHER_API_KEY)) return;
  let dir = fileURLToPath(new URL('.', import.meta.url));
  for (let i = 0; i < 8; i++) {
    const p = resolve(dir, '.env.local');
    if (existsSync(p)) {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^(OPENAI_API_KEY|TOGETHER_API_KEY)=(.*)$/);
        if (m && !looksValid(process.env[m[1]])) {
          process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
        }
      }
      return;
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
}

async function main() {
  const prompt = process.argv.slice(2).join(' ').trim();
  if (!prompt) {
    console.error('usage: npm run draw "your image idea"');
    process.exit(1);
  }

  ensureApiKey();
  const provider = (process.env.ATK_IMAGE_PROVIDER || 'openai').toLowerCase();
  const needed = provider === 'together' ? 'TOGETHER_API_KEY' : 'OPENAI_API_KEY';
  if (!looksValid(process.env[needed])) {
    console.error(`no valid ${needed} found (checked the environment and the repo .env.local).`);
    console.error(`set it in the environment, or run from inside the hilma checkout where .env.local lives.`);
    process.exit(1);
  }

  const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const out = `/tmp/atk-${slug || 'image'}.png`;

  console.error(`drawing: ${prompt}`);
  const packed = await promptToFrame(prompt);          // REAL gen + dither
  if (packed.length !== FRAME_BYTES) throw new Error(`bad frame: ${packed.length} bytes`);

  // Decode the packed 1bpp frame (set bit = black) to a viewable PNG.
  const py = `
import sys
W,H,RB=${IMG_W},${IMG_H},${IMG_RB}
data=sys.stdin.buffer.read()
from PIL import Image
im=Image.new('1',(W,H)); px=im.load()
for y in range(H):
  for x in range(W):
    bit=(data[y*RB+(x>>3)]>>(7-(x&7)))&1
    px[x,y]=0 if bit else 1     # set bit = black
im.save('${out}')
`;
  const r = spawnSync(PYTHON, ['-c', py], { input: packed });
  if (r.status !== 0) throw new Error(`png decode failed: ${r.stderr?.toString().slice(0, 200)}`);

  console.error(`wrote ${out}`);
  spawnSync('open', [out]);     // macOS: pop it open (no-op/!error elsewhere)
  console.log(out);            // stdout = just the path, so it's scriptable
}

main().catch((e) => { console.error('ERROR', e?.message ?? e); process.exit(1); });
