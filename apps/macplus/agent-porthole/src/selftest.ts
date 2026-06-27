#!/usr/bin/env -S npx tsx
/*
 * Porthole agent self-test — no Plus, no network.
 *   1. render the bundled test.html with the real headless browser
 *   2. dither -> packed 1bpp -> encode an 'F' frame
 *   3. parse the frame back + inflate, assert the bytes round-trip exactly
 *   4. write /tmp/porthole-selftest.png (inverted 1-bit) to eyeball the render
 *
 *   npm run selftest
 */
import { inflateSync, deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { go, shot, CW, CH, CRB, FRAME_BYTES, shutdown } from './browser.ts';
import { frameFull } from './frame.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const TEST_HTML = resolve(HERE, '..', 'test', 'test.html');

/** minimal 1-bit grayscale PNG. packed = MSB-first, set bit = black (QuickDraw);
 *  PNG grayscale 1 = white, so invert. */
function png1bit(packed: Buffer, w: number, h: number, rb: number): Buffer {
  const raw = Buffer.alloc((rb + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (rb + 1)] = 0;                               // filter: none
    for (let i = 0; i < rb; i++) raw[y * (rb + 1) + 1 + i] = ~packed[y * rb + i] & 0xff;
  }
  const crc = (buf: Buffer) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return (~c) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 1; ihdr[9] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function main() {
  let pass = 0, fail = 0;
  const ok = (name: string, cond: boolean) => { if (cond) { pass++; console.log('  ok  ', name); } else { fail++; console.log('  FAIL', name); } };

  console.log('porthole selftest');
  const title = await go('file://' + TEST_HTML);
  ok('render returned a title', /Porthole/i.test(title));

  const packed = await shot();
  ok('dithered frame is the right size', packed.length === FRAME_BYTES);

  const frame = frameFull(packed, CW, CH, CRB);
  ok("frame starts with 'F'", frame[0] === 0x46);
  const clen = frame.readUInt32BE(11);
  ok('header w/h/rb correct', frame.readUInt16BE(5) === CW && frame.readUInt16BE(7) === CH && frame.readUInt16BE(9) === CRB);
  const z = frame.subarray(15, 15 + clen);
  const back = inflateSync(z);
  ok('inflate round-trips the exact bytes', back.length === packed.length && back.equals(Buffer.from(packed)));
  ok('compression actually shrank it', clen < packed.length);
  console.log(`  (frame: ${packed.length} B -> ${clen} B zlib, ${(100 * clen / packed.length).toFixed(0)}%)`);

  const out = '/tmp/porthole-selftest.png';
  writeFileSync(out, png1bit(Buffer.from(packed), CW, CH, CRB));
  console.log('  wrote', out, '(open it to eyeball the 1-bit render)');

  await shutdown();
  console.log(`\nporthole: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
