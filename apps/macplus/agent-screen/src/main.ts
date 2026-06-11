#!/usr/bin/env -S npx tsx
/*
 * The Macinclaude screen agent — an on-demand screenshot of the real Plus.
 *
 *   tsx src/main.ts --listen 2334
 *
 * The WiFi system service on the Plus opens a channel named "screen" at connect
 * time (see wifi/screen.inc) and keeps it idle. When we want to see the Plus we
 * send "GRAB\r" down that channel; the Plus snapshots qd.screenBits (the whole
 * 512x342 1-bit screen, whatever app is frontmost), RLE+hex encodes it, and
 * streams it back as:
 *   SCR <w> <h> <rowBytes>\r
 *   <hex run pairs>\r   (CCBB CCBB ... = count, raw byte)
 *   SCREND\r
 * We un-RLE that, invert (Mac 1=black vs PNG 0=black), and write a 1-bit PNG.
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
function encodePng(w: number, h: number, bytesPerRow: number, raw: Buffer): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 1;   // bit depth
  ihdr[9] = 0;   // color type 0 = grayscale
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;  // deflate / adaptive filter / no interlace
  void bytesPerRow;
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---- a capture in progress ---- */
class Capture {
  w = 0; h = 0; rb = 0;
  private bytes: number[] = [];
  header(line: string): boolean {
    const m = line.match(/^SCR\s+(\d+)\s+(\d+)\s+(\d+)$/);
    if (!m) return false;
    this.w = +m[1]; this.h = +m[2]; this.rb = +m[3];
    this.bytes = [];
    return true;
  }
  /** decode a hex line of (count, byte) run pairs into the raw bitmap. */
  runs(line: string): void {
    const s = line.replace(/[^0-9A-Fa-f]/g, '');
    for (let i = 0; i + 4 <= s.length; i += 4) {
      const count = parseInt(s.slice(i, i + 2), 16);
      const byte = parseInt(s.slice(i + 2, i + 4), 16);
      for (let k = 0; k < count; k++) this.bytes.push(byte);
    }
  }
  /** assemble the PNG; returns null if the byte count is wrong. */
  finish(): Buffer | null {
    const expect = this.rb * this.h;
    if (!this.w || !this.h || !this.rb) return null;
    if (this.bytes.length !== expect) {
      log(`size mismatch: got ${this.bytes.length}, expected ${expect} (${this.rb}x${this.h})`);
      // pad/truncate so a partial frame still renders something
      while (this.bytes.length < expect) this.bytes.push(0);
      this.bytes.length = expect;
    }
    const bytesPerRow = Math.ceil(this.w / 8);
    const raw = Buffer.alloc((1 + bytesPerRow) * this.h);
    let o = 0;
    for (let y = 0; y < this.h; y++) {
      raw[o++] = 0;  // filter: none
      for (let x = 0; x < bytesPerRow; x++) {
        // Mac: 1 = black. PNG grayscale: 0 = black. Invert.
        raw[o++] = (~this.bytes[y * this.rb + x]) & 0xff;
      }
    }
    return encodePng(this.w, this.h, bytesPerRow, raw);
  }
}

/* ---- the Plus connection (one at a time; newest wins) ---- */
class Plus {
  private buf = '';
  private cap: Capture | null = null;
  constructor(private sock: net.Socket) {
    sock.setNoDelay(true);
    sock.on('data', (d) => this.feed(d.toString('latin1')));
    sock.on('error', () => {});
  }
  grab(): void {
    log('GRAB -> Plus');
    this.cap = new Capture();
    this.sock.write('GRAB\r');
  }
  private feed(data: string): void {
    this.buf += data;
    let nl: number;
    while ((nl = this.buf.search(/[\r\n]/)) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (line) this.line(line);
    }
  }
  private line(line: string): void {
    if (line.startsWith('SCR ')) {
      const c = new Capture();
      if (c.header(line)) { this.cap = c; log(`receiving ${c.w}x${c.h} rb=${c.rb}`); }
      return;
    }
    if (line === 'SCREND') {
      if (!this.cap) return;
      const png = this.cap.finish();
      this.cap = null;
      if (png) { writeFileSync(OUT, png); log(`wrote ${OUT} (${png.length} bytes)`); }
      return;
    }
    if (this.cap) this.cap.runs(line);
  }
}

let active: Plus | null = null;

const idx = process.argv.indexOf('--listen');
const port = idx >= 0 ? parseInt(process.argv[idx + 1] ?? '2334', 10) || 2334 : 2334;
const server = net.createServer((sock) => {
  log(`Plus connected from ${sock.remoteAddress}`);
  active = new Plus(sock);
  sock.on('close', () => { if (active && (active as any).sock === sock) active = null; });
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
