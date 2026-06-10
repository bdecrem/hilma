#!/usr/bin/env -S npx tsx
/*
 * Macinclaude Foundry agent.
 *
 *   tsx src/main.ts --listen 2327     TCP server (what the Plus dials)
 *   tsx src/main.ts                   stdin/stdout (interactive testing)
 *
 * Protocol (Plus -> agent):  MAKE <one-line description of the app>\r
 * Agent -> Plus: FNDSTS build-log lines, then FNDBIN/<hex>/FNDEND delivering
 * the compiled MacBinary, or FNDERR. See src/frame.ts + foundry/foundry_rx.inc.
 *
 * No socat: this is its own TCP server (raw sockets, no pty echo/ONLCR traps).
 */

import './main-env.ts';
import net from 'node:net';
import { generateApp } from './codegen.ts';
import { compileApp, toolchainAvailable } from './compile.ts';
import { status, errorLine, encodeBin } from './frame.ts';

const MAX_ATTEMPTS = 4;

const BAUD = Math.max(300, parseInt(process.env.SURF_BAUD || '9600', 10) || 9600);
const TICK_MS = 100;
const BYTES_PER_TICK = Math.max(16, Math.round((BAUD / 10) * (TICK_MS / 1000)));

function log(msg: string): void {
  console.error(`[foundry ${new Date().toISOString()}] ${msg}`);
}

class Conn {
  private outQ = Buffer.alloc(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  private buf = '';
  private busy = false;
  private queue: string[] = [];

  constructor(private write: (b: Buffer) => void) {}

  send(s: string): void {
    this.outQ = Buffer.concat([this.outQ, Buffer.from(s, 'latin1')]);
    if (!this.timer) {
      this.timer = setInterval(() => {
        if (this.outQ.length === 0) {
          clearInterval(this.timer!);
          this.timer = null;
          return;
        }
        const chunk = this.outQ.subarray(0, BYTES_PER_TICK);
        this.outQ = this.outQ.subarray(chunk.length);
        this.write(chunk);
      }, TICK_MS);
    }
  }

  feed(data: string): void {
    this.buf += data;
    let nl: number;
    while ((nl = this.buf.search(/[\r\n]/)) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (line) this.queue.push(line);
    }
    void this.drain();
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async drain(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    while (this.queue.length) {
      await this.handle(this.queue.shift()!);
    }
    this.busy = false;
  }

  private async handle(line: string): Promise<void> {
    log(`cmd: ${JSON.stringify(line)}`);
    const m = line.match(/^(\S+)\s*(.*)$/s);
    if (!m) return;
    const verb = m[1].toUpperCase();
    const wish = m[2].trim();

    if (verb !== 'MAKE') {
      this.send(errorLine(`unknown command ${verb} - send: MAKE <what you want>`));
      return;
    }
    if (!wish) {
      this.send(errorLine('MAKE needs a description'));
      return;
    }
    if (!toolchainAvailable()) {
      this.send(errorLine('Retro68 toolchain not found on this machine'));
      return;
    }

    try {
      let prior: { code: string; errors: string } | undefined;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        this.send(status(
          attempt === 1
            ? `claude is writing the code...`
            : `fixing build errors (attempt ${attempt} of ${MAX_ATTEMPTS})...`
        ));
        const gen = await generateApp(wish, prior, (sec) =>
          this.send(status(`still writing... (${sec}s)`))
        );
        this.send(status(`wrote ${gen.name} (${gen.code.split('\n').length} lines of C)`));
        this.send(status(`cross-compiling for the 68000...`));
        const res = await compileApp(gen.name, gen.code);
        if (res.ok && res.bin) {
          this.send(status(`compiled clean - ${res.bin.length} bytes`));
          this.send(status(`delivering ${gen.name} (about ${Math.ceil((res.bin.length * 2.1) / (BAUD / 10))}s at ${BAUD} baud)...`));
          this.send(encodeBin(res.bin));
          log(`delivered ${gen.name}: ${res.bin.length} bytes (attempt ${attempt})`);
          return;
        }
        log(`attempt ${attempt} failed:\n${res.errors}`);
        const firstErr = (res.errors ?? '').split('\n')[0]?.slice(0, 160) ?? 'unknown error';
        this.send(status(`compile failed: ${firstErr}`));
        prior = { code: gen.code, errors: res.errors ?? 'unknown error' };
      }
      this.send(errorLine(`could not get a clean build after ${MAX_ATTEMPTS} attempts - try rewording`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`pipeline error: ${msg}`);
      this.send(errorLine(msg.slice(0, 180)));
    }
  }
}

const WELCOME =
  status('macinclaude foundry ready') +
  status('Foundry menu > New App... and describe what you want') +
  status('claude writes it, the 68000 cross-compiler builds it,') +
  status('and it lands on your disk as a real application.');

const listenIdx = process.argv.indexOf('--listen');
if (listenIdx >= 0) {
  const port = parseInt(process.argv[listenIdx + 1] ?? '2327', 10) || 2327;
  const server = net.createServer((sock) => {
    log(`connection from ${sock.remoteAddress}`);
    const conn = new Conn((b) => sock.write(b));
    sock.setNoDelay(true);
    sock.on('data', (d) => conn.feed(d.toString('latin1')));
    sock.on('close', () => { conn.close(); log('connection closed'); });
    sock.on('error', () => { conn.close(); });
    conn.send(WELCOME);
  });
  server.listen(port, () => log(`listening on :${port}`));
} else {
  const conn = new Conn((b) => process.stdout.write(b));
  conn.send(WELCOME);
  process.stdin.setEncoding('latin1');
  process.stdin.on('data', (d: string) => conn.feed(d));
  process.stdin.on('end', () => process.exit(0));
}
