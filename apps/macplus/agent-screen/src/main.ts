#!/usr/bin/env -S npx tsx
/*
 * The Macinclaude screen agent — an on-demand screenshot of the real Plus.
 *
 *   tsx src/main.ts --listen 2334
 *
 * The WiFi system service on the Plus opens a channel named "screen" at connect
 * time (see wifi/screen.inc) and keeps it idle. When we want to see the Plus we
 * send "GRAB\r" down that channel; the Plus snapshots qd.screenBits (the whole
 * 512x342 1-bit screen, whatever app is frontmost), PackBits-compresses it, and
 * streams it back as:
 *   SCRB <w> <h> <rowBytes> <packedLen>\r   header line
 *   <packedLen raw PackBits bytes>          count-delimited binary payload
 * We un-PackBits that, invert (Mac 1=black vs PNG 0=black), and write a 1-bit PNG.
 *
 * PackBits (Apple TN1023) keeps a grab tiny: a blank screen is ~342 bytes, the
 * gray desktop ~684, worst-case noise bounded at ~raw size (21,888). No hex.
 *
 * Trigger: touch the trigger file (default ~/.screen-grab). We poll its mtime
 * every second; on change, if the Plus is connected, we fire a GRAB. The PNG
 * lands at ~/screen-latest.png (overwritten) — scp it over and look at it.
 */
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { writeFileSync, statSync } from 'node:fs';

const TRIGGER = process.env.SCREEN_TRIGGER || path.join(os.homedir(), '.screen-grab');
const OUT = process.env.SCREEN_OUT || path.join(os.homedir(), 'screen-latest.png');

function log(m: string): void { console.error(`[screen ${new Date().toISOString()}] ${m}`); }

/* ---- minimal 1-bit grayscale PNG encoder ---- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
/** raw = h scanlines, each (1 + bytesPerRow) bytes: filter byte 0 then pixels. */
function encodePng(w: number, h: number, raw: Buffer): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 1;   // bit depth
  ihdr[9] = 0;   // color type 0 = grayscale
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;  // deflate / adaptive filter / no interlace
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** PackBits decode (Apple TN1023): hdr 0..127 = copy hdr+1 literal bytes;
 *  hdr 129..255 = repeat next byte 257-hdr times; 128 = no-op. */
function unpackBits(src: Buffer, expected: number): Buffer {
  const out = Buffer.alloc(expected);
  let o = 0, i = 0;
  while (i < src.length && o < expected) {
    const h = src[i++];
    if (h < 128) {
      const c = h + 1;
      for (let k = 0; k < c && o < expected && i < src.length; k++) out[o++] = src[i++];
    } else if (h > 128) {
      const c = 257 - h;
      const v = src[i++];
      for (let k = 0; k < c && o < expected; k++) out[o++] = v;
    }
  }
  return out;
}

function buildPng(w: number, h: number, rb: number, frame: Buffer): Buffer {
  const bytesPerRow = Math.ceil(w / 8);
  const raw = Buffer.alloc((1 + bytesPerRow) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;  // filter: none
    for (let x = 0; x < bytesPerRow; x++) {
      // Mac: 1 = black. PNG grayscale: 0 = black. Invert.
      raw[o++] = (~frame[y * rb + x]) & 0xff;
    }
  }
  return encodePng(w, h, raw);
}

/* ---- the Plus connection (one at a time; newest wins) ---- */
class Plus {
  private buf = Buffer.alloc(0);
  // null = waiting for a SCRB header line; else collecting `need` packed bytes
  private hdr: { w: number; h: number; rb: number; need: number } | null = null;
  constructor(public sock: net.Socket) {
    sock.setNoDelay(true);
    sock.on('data', (d) => this.feed(d));
    sock.on('error', () => {});
  }
  grab(): void {
    log('GRAB -> Plus');
    this.hdr = null;
    this.buf = Buffer.alloc(0);
    this.sock.write('GRAB\r');
  }
  private feed(d: Buffer): void {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      if (!this.hdr) {
        let cut = this.buf.indexOf(0x0d);             // header line ends at \r
        if (cut < 0) cut = this.buf.indexOf(0x0a);
        if (cut < 0) return;                          // header line not complete yet
        const line = this.buf.subarray(0, cut).toString('latin1').trim();
        this.buf = this.buf.subarray(cut + 1);
        const m = line.match(/^SCRB\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/);
        if (m) {
          this.hdr = { w: +m[1], h: +m[2], rb: +m[3], need: +m[4] };
          log(`receiving ${this.hdr.w}x${this.hdr.h} rb=${this.hdr.rb} packed=${this.hdr.need}B`);
        }
        // non-header lines (stray status) are ignored
        if (this.buf.length === 0) return;
        continue;
      }
      // collecting binary payload
      if (this.buf.length < this.hdr.need) return;
      const packed = this.buf.subarray(0, this.hdr.need);
      this.buf = this.buf.subarray(this.hdr.need);
      const { w, h, rb } = this.hdr;
      this.hdr = null;
      try {
        const frame = unpackBits(packed, rb * h);
        const png = buildPng(w, h, rb, frame);
        writeFileSync(OUT, png);
        log(`wrote ${OUT} (${png.length} bytes from ${packed.length}B packed)`);
      } catch (e) {
        log(`decode/encode failed: ${(e as Error).message}`);
      }
    }
  }
}

let active: Plus | null = null;

const idx = process.argv.indexOf('--listen');
const port = idx >= 0 ? parseInt(process.argv[idx + 1] ?? '2334', 10) || 2334 : 2334;
const server = net.createServer((sock) => {
  log(`Plus connected from ${sock.remoteAddress}`);
  active = new Plus(sock);
  sock.on('close', () => { if (active && active.sock === sock) active = null; });
});
server.listen(port, () => log(`screen agent listening on :${port} (trigger ${TRIGGER})`));

/* poll the trigger file: any mtime change fires a grab */
let lastMtime = 0;
try { lastMtime = statSync(TRIGGER).mtimeMs; } catch { /* not there yet */ }
setInterval(() => {
  let m = 0;
  try { m = statSync(TRIGGER).mtimeMs; } catch { return; }
  if (m !== lastMtime) {
    lastMtime = m;
    if (active) active.grab();
    else log('trigger fired but no Plus connected');
  }
}, 1000);
