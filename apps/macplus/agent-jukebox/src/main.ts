#!/usr/bin/env -S npx tsx
/*
 * Macinclaude Jukebox agent.
 *
 *   tsx src/main.ts --listen 2328     TCP server (what the Plus dials)
 *   tsx src/main.ts                   stdin/stdout (interactive testing)
 *
 * Protocol (Plus -> agent):  SONG <vibe>\r
 * Agent -> Plus: JBXSTS lines, then a JBXSON..JBXEND score frame (or JBXERR).
 * Direct TCP server, paced output — the Surf/Foundry lessons baked in.
 */

import './main-env.ts';
import net from 'node:net';
import { compose } from './compose.ts';
import { status, errorLine, encodeScore } from './score.ts';

const BAUD = Math.max(300, parseInt(process.env.SURF_BAUD || '9600', 10) || 9600);
const TICK_MS = 100;
const BYTES_PER_TICK = Math.max(16, Math.round((BAUD / 10) * (TICK_MS / 1000)));

function log(msg: string): void {
  console.error(`[jukebox ${new Date().toISOString()}] ${msg}`);
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
    while (this.queue.length) await this.handle(this.queue.shift()!);
    this.busy = false;
  }

  private async handle(line: string): Promise<void> {
    log(`cmd: ${JSON.stringify(line)}`);
    const m = line.match(/^(\S+)\s*(.*)$/s);
    if (!m) return;
    const verb = m[1].toUpperCase();
    const vibe = m[2].trim();

    if (verb !== 'SONG') {
      this.send(errorLine(`unknown command ${verb} - send: SONG <what it should be about>`));
      return;
    }
    if (!vibe) {
      this.send(errorLine('SONG needs a description'));
      return;
    }
    try {
      this.send(status('claude is composing...'));
      const score = await compose(vibe, (sec) =>
        this.send(status(`still composing... (${sec}s)`))
      );
      this.send(status(
        `"${score.title}" - ${score.bpm} bpm, ${score.notes.length} notes, ${Math.round(score.totalTicks / 60)}s`
      ));
      this.send(encodeScore(score));
      log(`delivered "${score.title}": ${score.notes.length} notes, ${score.lyrics.length} lyric lines`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`compose error: ${msg}`);
      this.send(errorLine(msg.slice(0, 170)));
    }
  }
}

const WELCOME =
  status('macinclaude jukebox ready') +
  status('Jukebox menu > New Song... and describe the song you want.') +
  status('claude composes it; this machine sings it.');

const listenIdx = process.argv.indexOf('--listen');
if (listenIdx >= 0) {
  const port = parseInt(process.argv[listenIdx + 1] ?? '2328', 10) || 2328;
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
