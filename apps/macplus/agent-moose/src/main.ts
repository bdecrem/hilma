#!/usr/bin/env -S npx tsx
/*
 * The Talking Plus agent.
 *
 *   tsx src/main.ts --listen 2329     TCP server (what the Plus dials)
 *   tsx src/main.ts                   stdin/stdout (interactive testing)
 *
 * Commands (Plus -> agent), one line + \r:
 *   WAKE            a greeting with attitude (uses the briefing if present)
 *   NEWS            he gossips about today's real Hacker News
 *   SAY <topic>     he riffs on whatever you type
 * Agent -> Plus: TKMSTS lines, then a TKMUTT..TKMEND utterance (or TKMERR).
 */

import './main-env.ts';
import net from 'node:net';
import { compose } from './compose.ts';
import { status, errorLine, encodeUtterance } from './frame.ts';
import { topHackerNews, readBriefing, briefingToText } from './feeds.ts';

const BAUD = Math.max(300, parseInt(process.env.SURF_BAUD || '9600', 10) || 9600);
const TICK_MS = 100;
const BYTES_PER_TICK = Math.max(16, Math.round((BAUD / 10) * (TICK_MS / 1000)));

function log(m: string): void { console.error(`[moose ${new Date().toISOString()}] ${m}`); }

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
        if (this.outQ.length === 0) { clearInterval(this.timer!); this.timer = null; return; }
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
  close(): void { if (this.timer) clearInterval(this.timer); }
  private async drain(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    while (this.queue.length) await this.handle(this.queue.shift()!);
    this.busy = false;
  }

  private async buildTask(verb: string, arg: string): Promise<string> {
    if (verb === 'WAKE') {
      const b = await readBriefing();
      if (b) {
        return `It is the morning. Greet your human and react to today's briefing. Lead with a greeting, then pick the one or two most remark-worthy items and editorialize. Keep it short.\n\nTODAY'S BRIEFING:\n${briefingToText(b)}`;
      }
      return `It is the morning. Greet your human with a short, deadpan good-morning line. You have no briefing data today, so riff on that - being awake since 1986 with nothing on the calendar, or similar. Keep it short.`;
    }
    if (verb === 'NEWS') {
      const stories = await topHackerNews(8);
      const list = stories.map((s, i) => `${i + 1}. ${s.title} (${s.score} points, ${s.descendants} comments)`).join('\n');
      return `Gossip about today's Hacker News like the jaded old machine you are. Pick ONE or TWO real headlines below, name them, and have an opinion. Do not list them all - this is talk, not a feed.\n\nTODAY'S HACKER NEWS:\n${list}`;
    }
    // SAY
    return `Your human just said: "${arg}". Respond in character - short, dry, with a point of view.`;
  }

  private async handle(line: string): Promise<void> {
    log(`cmd: ${JSON.stringify(line)}`);
    const m = line.match(/^(\S+)\s*(.*)$/s);
    if (!m) return;
    const verb = m[1].toUpperCase();
    const arg = m[2].trim();
    if (verb !== 'WAKE' && verb !== 'NEWS' && verb !== 'SAY') {
      this.send(errorLine(`unknown command ${verb} - try WAKE / NEWS / SAY <topic>`));
      return;
    }
    if (verb === 'SAY' && !arg) { this.send(errorLine('SAY needs something to react to')); return; }
    try {
      this.send(status(verb === 'NEWS' ? 'reading the news...' : 'thinking...'));
      const task = await this.buildTask(verb, arg);
      this.send(status('composing a reply...'));
      const u = await compose(task, (s) => this.send(status(`thinking... (${s}s)`)));
      this.send(encodeUtterance(u));
      log(`said (${u.mood}, ${u.words.length} words): ${u.text}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`error: ${msg}`);
      this.send(errorLine(msg.slice(0, 170)));
    }
  }
}

const WELCOME =
  status('the talking plus is awake.') +
  status('Talk menu: Wake Him Up (Cmd-W), Read the News (Cmd-J),') +
  status('or Tell Him Something (Cmd-T). he has opinions.');

const listenIdx = process.argv.indexOf('--listen');
if (listenIdx >= 0) {
  const port = parseInt(process.argv[listenIdx + 1] ?? '2329', 10) || 2329;
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
