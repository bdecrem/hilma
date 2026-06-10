#!/usr/bin/env -S npx tsx
/*
 * The Bridge agent — pushes app binaries to the Plus over WiFi.
 *
 *   tsx src/main.ts --listen 2333
 *
 * The Plus's Bridge app opens a "bridge" channel (routed here by the mux). This
 * agent watches an outbox directory; whenever a MacBinary .bin file is there, it
 * streams it to the Plus as an FND frame (the same format Foundry delivers, see
 * agent-foundry/src/frame.ts + foundry/foundry_rx.inc), and the Bridge writes it
 * to the boot disk. After sending, the file is moved to a "sent" folder so it
 * isn't pushed twice. Drop a .bin in the outbox = it appears on the Plus.
 *
 * Outbox / sent dirs:  $BRIDGE_OUTBOX (default ~/bridge-outbox), ../bridge-sent.
 */
import net from 'node:net';
import { readdirSync, readFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const OUTBOX = process.env.BRIDGE_OUTBOX || join(homedir(), 'bridge-outbox');
const SENT   = join(OUTBOX, 'sent');
const POLL_MS = 1500;

const BAUD = Math.max(300, parseInt(process.env.SURF_BAUD || '9600', 10) || 9600);
const TICK_MS = 100;
const BYTES_PER_TICK = Math.max(16, Math.round((BAUD / 10) * (TICK_MS / 1000)));

function log(m: string): void { console.error(`[bridge ${new Date().toISOString()}] ${m}`); }

function ensureDirs(): void { for (const d of [OUTBOX, SENT]) if (!existsSync(d)) mkdirSync(d, { recursive: true }); }

function checksum16(buf: Buffer): number { let s = 0; for (const b of buf) s = (s + b) & 0xffff; return s; }

/** Encode a MacBinary file as a complete FNDBIN..FNDEND frame (matches Foundry). */
function encodeBin(bin: Buffer): string {
  const lines: string[] = [`FNDBIN ${bin.length} ${checksum16(bin)}\r\n`];
  for (let off = 0; off < bin.length; off += 128) lines.push(bin.subarray(off, off + 128).toString('hex').toUpperCase() + '\r\n');
  lines.push('FNDEND\r\n');
  return lines.join('');
}
function statusLine(msg: string): string { return `FNDSTS ${msg.replace(/[\r\n]/g, ' ').slice(0, 200)}\r\n`; }

class Conn {
  private outQ = Buffer.alloc(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  constructor(private sock: net.Socket) {
    sock.setNoDelay(true);
    sock.on('close', () => this.shutdown());
    sock.on('error', () => this.shutdown());
    this.send(statusLine('bridge online - drop a .bin in the outbox'));
    this.sweep();                                  // push anything already waiting
    this.poll = setInterval(() => this.sweep(), POLL_MS);
  }
  private send(s: string): void {
    this.outQ = Buffer.concat([this.outQ, Buffer.from(s, 'latin1')]);
    if (!this.timer) {
      this.timer = setInterval(() => {
        if (this.outQ.length === 0) { clearInterval(this.timer!); this.timer = null; return; }
        const chunk = this.outQ.subarray(0, BYTES_PER_TICK);
        this.outQ = this.outQ.subarray(chunk.length);
        this.sock.write(chunk);
      }, TICK_MS);
    }
  }
  private sweep(): void {
    if (this.busy) return;
    this.busy = true;
    try {
      const files = readdirSync(OUTBOX).filter((f) => f.toLowerCase().endsWith('.bin')).sort();
      for (const f of files) {
        const p = join(OUTBOX, f);
        let bin: Buffer;
        try { bin = readFileSync(p); } catch { continue; }
        if (bin.length < 128 || bin[0] !== 0) { log(`skip ${f}: not MacBinary`); renameSync(p, join(SENT, f)); continue; }
        log(`pushing ${f} (${bin.length} bytes)`);
        this.send(statusLine(`pushing ${f} (${bin.length} bytes)`));
        this.send(encodeBin(bin));
        renameSync(p, join(SENT, f));              // don't push it again
      }
    } catch (e) { log(`sweep error: ${(e as Error).message}`); }
    this.busy = false;
  }
  private shutdown(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.poll) clearInterval(this.poll);
  }
}

ensureDirs();
const idx = process.argv.indexOf('--listen');
const port = idx >= 0 ? parseInt(process.argv[idx + 1] ?? '2333', 10) || 2333 : 2333;
const server = net.createServer((sock) => { log(`connection from ${sock.remoteAddress}`); new Conn(sock); });
server.listen(port, () => log(`bridge listening on :${port} — outbox ${OUTBOX}`));
