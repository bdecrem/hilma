#!/usr/bin/env -S npx tsx
/*
 * selftest.ts - exercise the agent half end-to-end WITHOUT the Plus/serial:
 *   prompt -> generate image -> dither -> encode frame, then validate the frame
 *   and save a PNG you can eyeball.
 *
 *   TOGETHER_API_KEY=... npx tsx src/selftest.ts "a lighthouse at dusk"
 *
 * Validates: frame parses, header dims are 480x300x60, exactly 300 hex rows of
 * 120 chars, ATKEND present. Writes /tmp/atkinson-selftest.png from the decoded
 * 1bpp bytes so the actual dithered result is visible.
 */
import { writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { promptToFrame } from './draw.ts';
import { encodeFrame } from './frame.ts';
import { IMG_W, IMG_H, IMG_RB, FRAME_BYTES } from './draw.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

async function main() {
  const prompt = process.argv.slice(2).join(' ') || 'a lighthouse on a rocky coast at dusk';
  console.error(`[selftest] prompt: ${prompt}`);

  const packed = await promptToFrame(prompt);
  assert(packed.length === FRAME_BYTES, `packed ${packed.length} != ${FRAME_BYTES}`);
  console.error(`[selftest] dithered: ${packed.length} bytes`);

  const frame = encodeFrame(packed, IMG_W, IMG_H, IMG_RB);

  // --- validate the wire frame the way the Plus parser will read it ---
  const lines = frame.split('\r\n');
  assert(lines[0] === `ATKIMG ${IMG_W} ${IMG_H} ${IMG_RB}`, `header: ${lines[0]}`);
  const rows = lines.slice(1, 1 + IMG_H);
  assert(rows.length === IMG_H, `row count ${rows.length} != ${IMG_H}`);
  for (let i = 0; i < rows.length; i++) {
    assert(rows[i].length === IMG_RB * 2, `row ${i} len ${rows[i].length}`);
    assert(/^[0-9a-f]+$/.test(rows[i]), `row ${i} not hex`);
  }
  assert(lines[1 + IMG_H] === 'ATKEND', `terminator: ${lines[1 + IMG_H]}`);
  console.error('[selftest] frame OK: header + 300 hex rows + ATKEND');

  // --- decode back to a PNG so we can SEE it (round-trips the hex too) ---
  const decoded = Buffer.alloc(FRAME_BYTES);
  for (let r = 0; r < IMG_H; r++) {
    for (let i = 0; i < IMG_RB; i++) {
      decoded[r * IMG_RB + i] = parseInt(rows[r].substr(i * 2, 2), 16);
    }
  }
  assert(Buffer.compare(decoded, packed) === 0, 'hex round-trip mismatch');

  const outPng = '/tmp/atkinson-selftest.png';
  // 1bpp set-bit=black -> PGM via python (PIL already a dep of dither.py)
  const py = `
import sys
W,H,RB=${IMG_W},${IMG_H},${IMG_RB}
data=sys.stdin.buffer.read()
from PIL import Image
im=Image.new('1',(W,H))
px=im.load()
for y in range(H):
  for x in range(W):
    bit=(data[y*RB+(x>>3)]>>(7-(x&7)))&1
    px[x,y]=0 if bit else 1   # set bit = black
im.save('${outPng}')
print('wrote ${outPng}')
`;
  const res = spawnSync('python3', ['-c', py], { input: decoded });
  process.stderr.write(res.stderr?.toString() || '');
  process.stderr.write(res.stdout?.toString() || '');
  await writeFile('/tmp/atkinson-selftest.bin', packed);
  // raw wire frame (with banner + trailing junk) for the C parser host test
  await writeFile('/tmp/atkinson-selftest.frame',
    'welcome banner line\r\n\r\n' + frame + 'extra trailing line\r\n');
  console.error('[selftest] wrote /tmp/atkinson-selftest.{bin,frame,png}');
  console.error('[selftest] PASS');
}

main().catch((e) => { console.error('ERROR', e); process.exit(1); });
