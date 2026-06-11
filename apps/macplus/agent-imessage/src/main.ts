#!/usr/bin/env -S npx tsx
/*
 * The Macinclaude iMessage agent.
 *
 *   tsx src/main.ts --listen 2328     TCP server (what the mux dials)
 *   tsx src/main.ts                   stdin/stdout (interactive testing)
 *
 * The Plus reaches us through the persistent-WiFi multiplexer (agent-mux):
 * it opens a logical channel to service "imessage" and that channel's bytes
 * are this line protocol. We read the Mac's chat.db and send via AppleScript.
 *
 * Commands (Plus -> agent), one line + \r:
 *   LIST              list recent conversations
 *   OPEN <idx>        load a thread (idx into the last LIST we sent)
 *   SEND <idx> <text> send an iMessage to that conversation
 *
 * We also poll chat.db every few seconds: new incoming mail refreshes the list,
 * and if it lands in the thread the Plus currently has open we re-push it.
 */

import net from 'node:net';
import { getConversations, getMessages, maxMessageRowid, incomingSince, type Conversation } from './chatdb.ts';
import { sendIMessage, sendIMessageToHandle } from './applescript.ts';
import { encodeList, encodeConversation, encodeStatus, encodeError, encodeSent } from './protocol.ts';

const BAUD = Math.max(300, parseInt(process.env.SURF_BAUD || '9600', 10) || 9600);
const TICK_MS = 100;
const BYTES_PER_TICK = Math.max(16, Math.round((BAUD / 10) * (TICK_MS / 1000)));
const POLL_MS = 3000;
const LIST_LIMIT = 20;
const THREAD_LIMIT = 40;

function log(m: string): void { console.error(`[imessage ${new Date().toISOString()}] ${m}`); }

class Conn {
  private outQ = Buffer.alloc(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private buf = '';
  private busy = false;
  private queue: string[] = [];
  private convs: Conversation[] = [];
  private openRowid: number | null = null;
  private openConv: Conversation | null = null;
  private seenRowid = 0;

  constructor(private write: (b: Buffer) => void) {
    try { this.seenRowid = maxMessageRowid(); } catch { /* FDA missing — surfaced on first command */ }
    this.poll = setInterval(() => this.tick(), POLL_MS);
  }

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

  close(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.poll) clearInterval(this.poll);
  }

  private async drain(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    while (this.queue.length) {
      try { await this.handle(this.queue.shift()!); }
      catch (e) { this.send(encodeError(e instanceof Error ? e.message : String(e))); }
    }
    this.busy = false;
  }

  private refreshConvs(): void {
    this.convs = getConversations(LIST_LIMIT);
  }

  private doList(): void {
    this.refreshConvs();
    this.send(encodeList(this.convs));
    log(`LIST -> ${this.convs.length} conversations`);
  }

  private doOpen(idx: number): void {
    const c = this.convs[idx];
    if (!c) { this.send(encodeError(`no conversation ${idx} - refresh the list`)); return; }
    this.openRowid = c.rowid;
    this.openConv = c;
    const msgs = getMessages(c.rowid, THREAD_LIMIT);
    this.send(encodeConversation(idx, c.name, msgs));
    log(`OPEN ${idx} (${c.name}) -> ${msgs.length} messages`);
  }

  private async doSend(idx: number, text: string): Promise<void> {
    // Address the OPENed conversation, never convs[idx]: incoming mail reorders
    // the list (tick() refreshes), so between the client's OPEN and its SEND the
    // same row index can silently rebind to a different chat — observed live: a
    // reply typed into the open "Bart Decrem" thread delivered to the group chat
    // that had moved into row 0. The reply bar on the Plus always replies to the
    // open thread, so the open conversation is the only correct target.
    const c = this.openConv;
    if (!c) { this.send(encodeError('no open conversation - open a thread first')); return; }
    if (!text) { this.send(encodeError('nothing to send')); return; }
    if (this.convs[idx]?.rowid !== c.rowid) {
      log(`SEND idx ${idx} drifted (list reordered) — sending to open thread "${c.name}"`);
    }
    try {
      await sendIMessage(c.guid, text);
      this.send(encodeSent(idx));
      log(`SEND ${idx} (${c.name}): ${JSON.stringify(text)}`);
      // reflect the just-sent message back by re-pushing the thread
      this.seenRowid = maxMessageRowid();
      const msgs = getMessages(c.rowid, THREAD_LIMIT);
      this.send(encodeConversation(idx, c.name, msgs));
    } catch (e) {
      this.send(encodeError(`send failed: ${e instanceof Error ? e.message : String(e)}`));
    }
  }

  /* "New" flow: text a recipient with no existing thread, then refresh the list
   * so the freshly-created conversation appears. */
  private async doSendTo(handle: string, text: string): Promise<void> {
    if (!handle) { this.send(encodeError('no recipient')); return; }
    if (!text) { this.send(encodeError('nothing to send')); return; }
    try {
      await sendIMessageToHandle(handle, text);
      log(`SENDTO ${handle}: ${JSON.stringify(text)}`);
      this.send(encodeStatus(`sent to ${handle}`));
      this.seenRowid = maxMessageRowid();
      this.doList();
    } catch (e) {
      this.send(encodeError(`send failed: ${e instanceof Error ? e.message : String(e)}`));
    }
  }

  private async handle(line: string): Promise<void> {
    const m = line.match(/^(\S+)\s*(.*)$/s);
    if (!m) return;
    const verb = m[1].toUpperCase();
    const rest = m[2].trim();
    if (verb === 'LIST') { this.doList(); return; }
    if (verb === 'OPEN') { this.doOpen(parseInt(rest, 10)); return; }
    if (verb === 'SEND') {
      const sp = rest.indexOf(' ');
      const idx = parseInt(sp < 0 ? rest : rest.slice(0, sp), 10);
      const text = sp < 0 ? '' : rest.slice(sp + 1);
      await this.doSend(idx, text);
      return;
    }
    if (verb === 'SENDTO') {
      const sp = rest.indexOf(' ');
      const handle = sp < 0 ? rest : rest.slice(0, sp);
      const text = sp < 0 ? '' : rest.slice(sp + 1);
      await this.doSendTo(handle, text);
      return;
    }
    this.send(encodeError(`unknown command ${verb} - try LIST / OPEN <n> / SEND <n> <text> / SENDTO <handle> <text>`));
  }

  /* poll chat.db for newly-arrived incoming mail */
  private tick(): void {
    let incoming: { rowid: number; chatRowid: number; text: string }[];
    try { incoming = incomingSince(this.seenRowid); }
    catch { return; }
    if (!incoming.length) return;
    this.seenRowid = Math.max(this.seenRowid, ...incoming.map((i) => i.rowid));

    // does any new message belong to the currently-open thread?
    const hitOpen = this.openRowid != null && incoming.some((i) => i.chatRowid === this.openRowid);
    // refresh the list (unread counts + ordering) and notify
    this.refreshConvs();
    this.send(encodeList(this.convs));
    const last = incoming[incoming.length - 1];
    const fromConv = this.convs.find((c) => c.rowid === last.chatRowid);
    this.send(encodeStatus(`new message${fromConv ? ' from ' + fromConv.name : ''}`));
    if (hitOpen) {
      const idx = this.convs.findIndex((c) => c.rowid === this.openRowid);
      const c = this.convs[idx];
      if (c) this.send(encodeConversation(idx, c.name, getMessages(c.rowid, THREAD_LIMIT)));
    }
  }
}

const WELCOME = encodeStatus('imessage ready - List the conversations to begin');

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
