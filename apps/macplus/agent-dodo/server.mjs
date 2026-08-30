#!/usr/bin/env node
/*
 * agent-dodo — the mini half of Dodo for Macintosh (:2339).
 *
 * The Plus app (dodo/) is a single chat window whose title is the topic. It
 * connects over direct TCP (MacTCP/DaynaPORT) and speaks a tiny ASCII line
 * protocol; this agent turns those lines into calls against the F2 backend
 * (feynd.cc, the same /api/f2/* the phone uses) on behalf of ONE user.
 *
 * Auth: no password on the wire. Preferred: DODO_MACHINE_TOKEN — traded at
 * POST /api/f2/auth/machine for a session token (the server pairs the token
 * with one user; this is what production uses, since Vercel's session secret
 * isn't readable). Fallback for local testing: F2_SESSION_SECRET +
 * DODO_F2_USER_ID mint the cookie directly (same HMAC as src/lib/f2/auth.ts).
 * All from ~/.macplus-backend.env via run-service.sh. Trusted-LAN only.
 *
 * Dependency-free node (like agent-rsh / agent-pixel):
 *   node server.mjs --listen 2339
 *
 * Protocol (client lines end \r or \n; server lines end \r\n; ASCII only):
 *   client -> server
 *     LIST                 topics, newest first (numbers are per-connection)
 *     OPEN <n>             open topic n from the last LIST (becomes current)
 *     LAST                 open the most recently touched topic
 *     SAY <text>           send a message to the current topic
 *     NEW <text>           start a new topic with this first question
 *     PING
 *   server -> client
 *     DLIST                        list header
 *     DT <n> <date>|<name>         one topic row (date: today / yesterday / Aug 24)
 *     DTOPIC <name>                current topic (title bar); precedes a transcript
 *     DU <text> / DA <text>        a user / Dodo message (first line)
 *     D+ <text>                    continuation line of the previous message
 *                                  (empty text = paragraph break)
 *     DWAIT <text>                 status while a reply is being written
 *     DEND                         end of a list / transcript / reply
 *     DERR <text>
 *     DOK
 *
 * Env: DODO_MACHINE_TOKEN (prod) or F2_SESSION_SECRET + DODO_F2_USER_ID (local),
 *      DODO_F2_BASE (default https://feynd.cc), DODO_MODEL (optional registry key),
 *      DODO_PACE_BPS (output pacing, default 2400; use 960 for the Mini vMac harness).
 */
import net from 'node:net';
import { createHmac } from 'node:crypto';

const PORT = (() => {
  const i = process.argv.indexOf('--listen');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 2339;
})();
const BASE = (process.env.DODO_F2_BASE || 'https://feynd.cc').replace(/\/$/, '');
const SECRET = process.env.F2_SESSION_SECRET || '';
const USER_ID = process.env.DODO_F2_USER_ID || '';
const MACHINE_TOKEN = process.env.DODO_MACHINE_TOKEN || '';
const MODEL = process.env.DODO_MODEL || '';
const MAX_LINE = 900;          // longest wire line body (a paragraph); the Plus wraps by pixel width
const HISTORY = 14;            // messages replayed on OPEN
const LIST_MAX = 40;
const REPLY_TIMEOUT_MS = 240_000;
// Pace output to the wire (bytes/s). A full TCP burst overruns the small
// buffers on the serial path (Mini vMac's SCC bridge, the RetroWiFi SI) and
// drops bytes mid-frame — serial lesson #3 in apps/macplus/CLAUDE.md. Direct
// MacTCP on the Plus doesn't need it but tolerates it fine. 0 = unpaced.
const PACE_BPS = parseInt(process.env.DODO_PACE_BPS ?? '2400', 10);

function log(m) { console.error(`[dodo ${new Date().toISOString()}] ${m}`); }

/* ---------------- F2 session + HTTP ---------------- */

let machineSession = '';       // token from /api/f2/auth/machine (30-day; refetched on 401)

/** Same shape as signSession() in src/lib/f2/auth.ts: `${userId}.${exp}.${hmac}` */
function localSession() {
  const exp = Date.now() + 60 * 60 * 1000;   // an hour is plenty; minted per call
  const payload = `${USER_ID}.${exp}`;
  const sig = createHmac('sha256', SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

async function fetchMachineSession() {
  const res = await fetch(BASE + '/api/f2/auth/machine', {
    method: 'POST',
    headers: { 'x-f2-machine-token': MACHINE_TOKEN, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`machine auth failed (${res.status})`);
  const j = await res.json();
  machineSession = j.session;
  log(`machine session for ${String(j.user_id).slice(0, 8)}`);
}

async function sessionCookie() {
  if (MACHINE_TOKEN) {
    if (!machineSession) await fetchMachineSession();
    return `f2_session=${machineSession}`;
  }
  return `f2_session=${localSession()}`;
}

async function f2(path, init = {}, retry = true) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), REPLY_TIMEOUT_MS);
  try {
    const res = await fetch(BASE + path, {
      ...init,
      signal: ctl.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Cookie: await sessionCookie(),
        ...(init.headers || {}),
      },
    });
    if (res.status === 401 && MACHINE_TOKEN && retry) {
      machineSession = '';                     // expired/rotated: mint again once
      clearTimeout(t);
      return f2(path, init, false);
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON error page */ }
    if (!res.ok) {
      const msg = json?.error || `${res.status} ${res.statusText}`;
      throw new Error(msg);
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

const listTopics = async () => (await f2('/api/f2/topics')).topics ?? [];
const getThread = async (id) => (await f2(`/api/f2/topics/${id}`)).thread;
const sendMessage = (body) => f2('/api/f2/messages', { method: 'POST', body: JSON.stringify(body) });

/* ---------------- text shaping for a 1-bit 512px screen ---------------- */

const FOLD = [
  [/[‘’‚′]/g, "'"], [/[“”„″]/g, '"'],
  [/[–—―]/g, '-'], [/…/g, '...'], [/ /g, ' '],
  [/[•●◦]/g, '*'], [/×/g, 'x'], [/→/g, '->'],
];

function ascii(s) {
  let t = String(s ?? '');
  for (const [re, rep] of FOLD) t = t.replace(re, rep);
  // strip accents where possible, then drop anything else non-printable
  t = t.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  return t.replace(/[^\x20-\x7E\n]/g, '?');
}

/** Light markdown -> plain: headings, emphasis, code ticks, list bullets. */
function unmark(s) {
  return s
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '- ')
    .replace(/^\s*\d+\.\s+/gm, (m) => m.trim() + ' ');
}

/** Message text -> array of wire lines (each <= MAX_LINE); '' = paragraph break. */
function shape(text) {
  const paras = ascii(unmark(text)).replace(/\r/g, '').split(/\n{2,}/).map((p) => p.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = [];
  for (const p of paras) {
    if (out.length) out.push('');
    let line = '';
    for (const w of p.split(' ')) {
      if (w.length > MAX_LINE) {                    // pathological token: hard-split
        if (line) { out.push(line); line = ''; }
        for (let i = 0; i < w.length; i += MAX_LINE) out.push(w.slice(i, i + MAX_LINE));
        continue;
      }
      if ((line + ' ' + w).trim().length > MAX_LINE) { out.push(line); line = w; }
      else line = line ? line + ' ' + w : w;
    }
    if (line) out.push(line);
  }
  return out.length ? out : ['(empty)'];
}

function shortDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return d.getFullYear() === now.getFullYear() ? `${mon} ${d.getDate()}` : `${mon} ${d.getFullYear()}`;
}

/* ---------------- per-connection session ---------------- */

class Session {
  constructor(sock) {
    this.sock = sock;
    this.out = [];           // paced output queue (lines)
    this.pacing = false;
    this.buf = '';
    this.topics = [];        // from the last LIST (or LAST)
    this.current = null;     // { id, name }
    this.busy = false;
    this.queue = [];
  }

  send(line) {
    if (this.sock.destroyed) return;
    if (!PACE_BPS) { this.sock.write(line + '\r\n'); return; }
    this.out.push(line + '\r\n');
    if (!this.pacing) this.pump();
  }
  /** Write queued output in 64-byte slices at PACE_BPS. */
  pump() {
    this.pacing = true;
    const CH = 64;
    const step = () => {
      if (this.sock.destroyed || !this.out.length) { this.pacing = false; return; }
      let s = this.out[0];
      const piece = s.slice(0, CH);
      s = s.slice(CH);
      if (s.length) this.out[0] = s; else this.out.shift();
      this.sock.write(piece);
      setTimeout(step, Math.ceil(piece.length * 1000 / PACE_BPS));
    };
    step();
  }
  sendMessageLines(tag, lines) {
    lines.forEach((l, i) => this.send((i === 0 ? tag : 'D+') + ' ' + l));
  }
  err(msg) { this.send('DERR ' + ascii(String(msg)).slice(0, MAX_LINE)); }

  onData(chunk) {
    this.buf += chunk.toString('latin1');
    let i;
    while ((i = this.buf.search(/[\r\n]/)) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (line) this.enqueue(line);
    }
    if (this.buf.length > 4000) this.buf = '';   // runaway junk
  }

  enqueue(line) {
    this.queue.push(line);
    if (!this.busy) this.drain();
  }
  async drain() {
    this.busy = true;
    while (this.queue.length && !this.sock.destroyed) {
      const line = this.queue.shift();
      try { await this.handle(line); }
      catch (e) { log(`error: ${e.message}`); this.err(e.message); }
    }
    this.busy = false;
  }

  async handle(line) {
    const sp = line.indexOf(' ');
    const cmd = (sp < 0 ? line : line.slice(0, sp)).toUpperCase();
    const arg = sp < 0 ? '' : line.slice(sp + 1).trim();
    log(`< ${cmd}${arg ? ' ' + arg.slice(0, 60) : ''}`);
    switch (cmd) {
      case 'PING': this.send('DOK'); return;
      case 'LIST': return this.list();
      case 'OPEN': return this.open(parseInt(arg, 10));
      case 'LAST': return this.last();
      case 'SAY': return this.say(arg);
      case 'NEW': return this.fresh(arg);
      default: this.err(`unknown command ${cmd}`);
    }
  }

  async list() {
    this.topics = (await listTopics()).slice(0, LIST_MAX);
    this.send('DLIST');
    this.topics.forEach((t, i) => {
      const name = ascii(t.topic || 'Untitled').slice(0, 60);
      this.send(`DT ${i + 1} ${shortDate(t.updated_at) || '-'}|${name.replace(/\|/g, '/')}`);
    });
    this.send('DEND');
  }

  async open(n) {
    if (!this.topics.length) this.topics = (await listTopics()).slice(0, LIST_MAX);
    const t = this.topics[n - 1];
    if (!t) { this.err('no such topic'); return; }
    await this.showThread(t.id);
  }

  async last() {
    this.topics = (await listTopics()).slice(0, LIST_MAX);
    if (!this.topics.length) {
      this.current = null;
      this.send('DTOPIC Dodo');
      this.sendMessageLines('DA', ['No topics yet. Press Cmd-N and ask your first question.']);
      this.send('DEND');
      return;
    }
    await this.showThread(this.topics[0].id);
  }

  async showThread(id) {
    const th = await getThread(id);
    if (!th) { this.err('topic not found'); return; }
    this.current = { id: th.id, name: th.topic || 'Untitled' };
    this.send('DTOPIC ' + ascii(this.current.name).slice(0, 80));
    const msgs = (th.messages || []).slice(-HISTORY);
    for (const m of msgs) {
      this.sendMessageLines(m.role === 'user' ? 'DU' : 'DA', shape(m.text));
    }
    if (!msgs.length) this.sendMessageLines('DA', ['This topic has no messages yet. Ask away.']);
    this.send('DEND');
  }

  async say(text) {
    if (!text) { this.err('say what?'); return; }
    if (!this.current) { this.err('no topic open - Cmd-N starts one, Cmd-L picks one'); return; }
    this.send('DWAIT Dodo is thinking...');
    const body = { text, thread_id: this.current.id };
    if (MODEL) body.model = MODEL;
    const r = await sendMessage(body);
    if (r.thread_id && r.thread_id !== this.current.id) {
      // The router moved us (e.g. it decided this was a new topic). Follow it.
      const th = await getThread(r.thread_id).catch(() => null);
      this.current = { id: r.thread_id, name: th?.topic || this.current.name };
      this.send('DTOPIC ' + ascii(this.current.name).slice(0, 80));
    }
    this.sendMessageLines('DA', shape(r.reply || ''));
    this.send('DEND');
  }

  async fresh(text) {
    if (!text) { this.err('ask something to start a topic'); return; }
    this.send('DWAIT Dodo is thinking...');
    const body = { text, new_topic: true };
    if (MODEL) body.model = MODEL;
    const r = await sendMessage(body);
    if (!r.thread_id) { this.err('Dodo replied but no topic was created'); this.sendMessageLines('DA', shape(r.reply || '')); this.send('DEND'); return; }
    const th = await getThread(r.thread_id).catch(() => null);
    this.current = { id: r.thread_id, name: th?.topic || text.slice(0, 40) };
    this.send('DTOPIC ' + ascii(this.current.name).slice(0, 80));
    this.sendMessageLines('DU', shape(text));
    this.sendMessageLines('DA', shape(r.reply || ''));
    this.send('DEND');
  }
}

/* ---------------- server ---------------- */

if (!MACHINE_TOKEN && !(SECRET && USER_ID)) {
  log('need DODO_MACHINE_TOKEN, or F2_SESSION_SECRET + DODO_F2_USER_ID (see ~/.macplus-backend.env)');
  process.exit(64);
}

const server = net.createServer((sock) => {
  const s = new Session(sock);
  sock.setKeepAlive(true, 30_000);
  sock.setNoDelay(true);
  log(`connect ${sock.remoteAddress}`);
  sock.on('data', (d) => s.onData(d));
  sock.on('error', (e) => log(`socket: ${e.message}`));
  sock.on('close', () => log('close'));
});
server.listen(PORT, () => log(`listening :${PORT} -> ${BASE} (${MACHINE_TOKEN ? 'machine token' : 'local secret for ' + USER_ID.slice(0, 8)})`));
