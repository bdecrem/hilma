#!/usr/bin/env -S npx tsx
/*
 * Quote of the Day agent — a mini service the Plus reaches through the WiFi
 * system service (channel name "quote", routed by the multiplexer).
 *
 *   tsx src/main.ts --listen 2332
 *
 * Protocol (Plus -> agent), one line, CR or LF terminated:
 *   TODAY        the quote for today's date (deterministic)
 *   RANDOM       any quote
 * Agent -> Plus:
 *   QUOTE <text>\r\n
 *   BY <author>\r\n
 *
 * The quotes come from quotes.json (re-read each request, so editing the file
 * updates the service with no restart). ASCII-folded + paced to wire speed,
 * like the other Macinclaude agents.
 */
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUOTES = join(dirname(fileURLToPath(import.meta.url)), '..', 'quotes.json');

const BAUD = Math.max(300, parseInt(process.env.SURF_BAUD || '9600', 10) || 9600);
const TICK_MS = 100;
const BYTES_PER_TICK = Math.max(16, Math.round((BAUD / 10) * (TICK_MS / 1000)));

function log(m: string): void { console.error(`[quote ${new Date().toISOString()}] ${m}`); }

interface Quote { text: string; by: string; }

function loadQuotes(): Quote[] {
  try {
    const arr = JSON.parse(readFileSync(QUOTES, 'utf8'));
    if (Array.isArray(arr) && arr.length) return arr;
  } catch (e) { log(`bad quotes.json: ${(e as Error).message}`); }
  return [{ text: 'The best way to predict the future is to invent it.', by: 'Alan Kay' }];
}

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

/** Fold to printable ASCII and strip CR/LF so a quote can't break the framing. */
function toAscii(s: string): string {
  const fold: Record<string, string> = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '--', '…': '...' };
  let out = '';
  for (const ch of s) {
    if (ch in fold) { out += fold[ch]; continue; }
    const c = ch.codePointAt(0)!;
    out += c >= 32 && c < 127 ? ch : c === 9 ? ' ' : '';
  }
  return out;
}

class Conn {
  private outQ = Buffer.alloc(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  private buf = '';
  constructor(private sock: net.Socket) {
    sock.setNoDelay(true);
    sock.on('data', (d) => this.feed(d.toString('latin1')));
    sock.on('error', () => {});
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
  private feed(data: string): void {
    this.buf += data;
    let nl: number;
    while ((nl = this.buf.search(/[\r\n]/)) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (line) this.handle(line.toUpperCase());
    }
  }
  private handle(cmd: string): void {
    const quotes = loadQuotes();
    let q: Quote;
    if (cmd === 'RANDOM') {
      q = quotes[Math.floor(Math.random() * quotes.length)];
    } else {
      q = quotes[dayOfYear(new Date()) % quotes.length];   // TODAY (default)
    }
    log(`${cmd} -> "${q.text.slice(0, 40)}..." (${q.by})`);
    this.send(`QUOTE ${toAscii(q.text).slice(0, 220)}\r\n`);
    this.send(`BY ${toAscii(q.by).slice(0, 60)}\r\n`);
  }
}

const idx = process.argv.indexOf('--listen');
const port = idx >= 0 ? parseInt(process.argv[idx + 1] ?? '2332', 10) || 2332 : 2332;
const server = net.createServer((sock) => { log(`connection from ${sock.remoteAddress}`); new Conn(sock); });
server.listen(port, () => log(`quote of the day listening on :${port}`));
