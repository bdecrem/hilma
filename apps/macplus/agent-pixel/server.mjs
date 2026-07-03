#!/usr/bin/env node
/*
 * agent-pixel — the mini half of Daily Pixel (:2337).
 *
 * A persistent, collaborative 64x64 1-bit canvas. The Plus app (pixel/)
 * connects over direct TCP (MacTCP/DaynaPORT), receives the full canvas,
 * flips pixels with the mouse, and sees other contributors' strokes live.
 * Once a day (PIXEL_AI_HOURS, default 24) Claude looks at the canvas and
 * adds a few strokes of its own plus a one-line note — so a drawing slowly
 * emerges over days/weeks even when nobody is looking.
 *
 * Dependency-free node (like agent-rsh): run with
 *   node server.mjs --listen 2337
 *
 * Protocol (ASCII lines; client lines end \r or \n):
 *   client -> server
 *     SYNC                 resend the full canvas
 *     SET <x> <y> <0|1>    set one pixel (persisted, broadcast to others)
 *     CLAUDE               invite Claude to draw right now (guarded, 2 min)
 *   server -> client
 *     PXINFO 64 64                        frame header
 *     PXROW <row> <16 hex chars>          one canvas row (8 packed bytes,
 *                                         bit7 = leftmost, 1 = black)
 *     PXEND                               frame complete
 *     PXNOTE <text>                       latest note (Claude's remark/status)
 *     PX <x> <y> <v>                      live single-pixel update
 *     PXERR <msg>
 *
 * State: PIXEL_STATE (default ~/.pixel-canvas.json), written atomically.
 * Secrets: ANTHROPIC_API_KEY from ~/.macplus-backend.env via run-service.sh.
 * Env: PIXEL_MODEL (default claude-opus-4-8), PIXEL_AI_HOURS, PIXEL_FAKE_AI=1
 * (canned strokes instead of the API — used by selftest.mjs).
 */
import net from 'node:net';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const W = 64, H = 64, RB = 8;
const PORT = (() => {
  const i = process.argv.indexOf('--listen');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 2337;
})();
const STATE = process.env.PIXEL_STATE || join(homedir(), '.pixel-canvas.json');
const MODEL = process.env.PIXEL_MODEL || 'claude-opus-4-8';
const AI_MS = Math.max(0, parseFloat(process.env.PIXEL_AI_HOURS ?? '24')) * 3600 * 1000;
const FAKE_AI = process.env.PIXEL_FAKE_AI === '1';
const INVITE_GUARD_MS = 2 * 60 * 1000;   // min gap between CLAUDE invites

function log(m) { console.error(`[pixel ${new Date().toISOString()}] ${m}`); }

/* ---------------- state ---------------- */

function blankState() {
  return {
    w: W, h: H,
    rows: Array.from({ length: H }, () => '00'.repeat(RB)),
    note: 'a blank canvas. draw something -- claude visits daily.',
    lastAI: 0,
    history: [],           // [{ts, note, count}]
  };
}

function validState(s) {
  return s && s.w === W && s.h === H && Array.isArray(s.rows) &&
    s.rows.length === H && s.rows.every(r => typeof r === 'string' &&
      /^[0-9a-fA-F]{16}$/.test(r));
}

let state;
if (existsSync(STATE)) {
  let raw;
  try { raw = JSON.parse(readFileSync(STATE, 'utf8')); } catch { raw = null; }
  if (validState(raw)) {
    state = raw;
    log(`loaded canvas from ${STATE} (${popCount()} px set after load)`);
  } else {
    // Fail loudly: never silently discard a canvas. Keep the bad file aside.
    const bad = STATE + '.corrupt-' + Date.now();
    renameSync(STATE, bad);
    log(`ERROR: ${STATE} was unreadable/invalid — moved to ${bad}, starting fresh`);
    state = blankState();
    persist();
  }
} else {
  state = blankState();
  persist();
  log(`new canvas at ${STATE}`);
}

function persist() {
  const tmp = STATE + '.tmp';
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, STATE);
}

function getPixel(x, y) {
  const byte = parseInt(state.rows[y].slice((x >> 3) * 2, (x >> 3) * 2 + 2), 16);
  return (byte >> (7 - (x & 7))) & 1;
}

function setPixel(x, y, v) {
  const bi = x >> 3;
  const row = state.rows[y];
  let byte = parseInt(row.slice(bi * 2, bi * 2 + 2), 16);
  if (v) byte |= 1 << (7 - (x & 7)); else byte &= ~(1 << (7 - (x & 7)));
  state.rows[y] = row.slice(0, bi * 2) + byte.toString(16).padStart(2, '0') + row.slice(bi * 2 + 2);
}

function popCount() {
  let n = 0;
  for (const r of state.rows)
    for (let i = 0; i < RB; i++) {
      let b = parseInt(r.slice(i * 2, i * 2 + 2), 16);
      while (b) { n += b & 1; b >>= 1; }
    }
  return n;
}

/* ---------------- clients ---------------- */

const clients = new Set();

function sendFrame(sock) {
  let out = `PXINFO ${W} ${H}\r\n`;
  for (let y = 0; y < H; y++) out += `PXROW ${y} ${state.rows[y]}\r\n`;
  out += 'PXEND\r\n';
  out += `PXNOTE ${state.note}\r\n`;
  sock.write(out);
}

function broadcast(line, except) {
  for (const c of clients) if (c !== except) c.write(line + '\r\n');
}

function handleLine(sock, line) {
  const parts = line.trim().split(/\s+/);
  const cmd = (parts[0] || '').toUpperCase();
  if (cmd === 'SYNC') { sendFrame(sock); return; }
  if (cmd === 'SET') {
    const x = parseInt(parts[1], 10), y = parseInt(parts[2], 10), v = parseInt(parts[3], 10);
    if (!(x >= 0 && x < W && y >= 0 && y < H && (v === 0 || v === 1))) {
      sock.write('PXERR bad SET\r\n'); return;
    }
    setPixel(x, y, v);
    persist();
    broadcast(`PX ${x} ${y} ${v}`, sock);
    return;
  }
  if (cmd === 'CLAUDE') { inviteClaude(); return; }
  if (cmd) sock.write('PXERR unknown command\r\n');
}

const server = net.createServer(sock => {
  sock.setKeepAlive(true, 30000);
  sock.setNoDelay(true);
  clients.add(sock);
  log(`client connected (${clients.size} online)`);
  sendFrame(sock);
  let buf = '';
  sock.on('data', d => {
    buf += d.toString('latin1');
    let i;
    while ((i = buf.search(/[\r\n]/)) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (line) { try { handleLine(sock, line); } catch (e) { log(`handleLine: ${e.message}`); } }
    }
    if (buf.length > 512) buf = '';   // garbage guard
  });
  const drop = () => { clients.delete(sock); log(`client gone (${clients.size} online)`); };
  sock.on('close', drop);
  sock.on('error', e => { log(`sock: ${e.message}`); });
});

/* ---------------- Claude, the daily visitor ---------------- */

let aiBusy = false;
let lastInvite = 0;

function canvasAscii() {
  const lines = [];
  for (let y = 0; y < H; y++) {
    let s = '';
    for (let x = 0; x < W; x++) s += getPixel(x, y) ? '#' : '.';
    lines.push(s);
  }
  return lines.join('\n');
}

function fakeContribution() {
  // A tiny 5x5 heart, placed by how many visits happened — deterministic,
  // used by selftest and offline runs.
  const n = state.history.length;
  const ox = 4 + (n * 9) % 50, oy = 4 + (n * 7) % 50;
  const heart = [[1, 0], [3, 0], [0, 1], [2, 1], [4, 1], [0, 2], [4, 2], [1, 3], [3, 3], [2, 4]];
  return {
    pixels: heart.map(([dx, dy]) => [ox + dx, oy + dy, 1]),
    note: `fake claude left a heart at ${ox},${oy}`,
  };
}

async function askClaude() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const notes = state.history.slice(-6).map(h => `- ${h.note}`).join('\n') || '(none yet)';
  const body = {
    model: MODEL,
    max_tokens: 3000,
    system:
      'You are a pixel artist contributing to a shared 64x64 1-bit canvas that ' +
      'lives on a 1986 Macintosh Plus. A human adds pixels by mouse; you visit ' +
      'once a day and add a small, coherent contribution. Continue or complement ' +
      'what is already there (or start a simple motif if blank). Think landscape ' +
      'growing over weeks: a hill, a sun, a house, a creature -- built up a few ' +
      'strokes at a time. Respond with ONLY a JSON object, no markdown: ' +
      '{"pixels": [[x,y,v], ...], "note": "..."} where x,y are 0-63, v is 1 ' +
      '(black) or 0 (white/erase), at most 80 pixel ops, and note is a playful ' +
      'one-liner under 80 chars, plain ASCII, describing what you added.',
    messages: [{
      role: 'user',
      content:
        `The canvas today ('.'=white '#'=black, row 0 at top):\n\n${canvasAscii()}\n\n` +
        `Recent notes:\n${notes}\n\nAdd your strokes for today.`,
    }],
  };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const msg = await res.json();
  const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('no JSON in reply');
  const obj = JSON.parse(text.slice(a, b + 1));
  if (!Array.isArray(obj.pixels)) throw new Error('reply missing pixels[]');
  return obj;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function contribute(reason) {
  if (aiBusy) return;
  aiBusy = true;
  try {
    log(`claude contribution starting (${reason})`);
    broadcast('PXNOTE claude is looking at the canvas...');
    const c = FAKE_AI ? fakeContribution() : await askClaude();
    const ops = c.pixels
      .filter(p => Array.isArray(p) && p.length >= 3)
      .map(([x, y, v]) => [x | 0, y | 0, v ? 1 : 0])
      .filter(([x, y]) => x >= 0 && x < W && y >= 0 && y < H)
      .slice(0, 120);
    const note = String(c.note || 'claude was here')
      .replace(/[^\x20-\x7e]/g, '').slice(0, 100);
    for (const [x, y, v] of ops) {
      setPixel(x, y, v);
      broadcast(`PX ${x} ${y} ${v}`);
      if (clients.size) await sleep(120);   // let watchers see it drawn
    }
    state.note = note;
    state.lastAI = Date.now();
    state.history.push({ ts: state.lastAI, note, count: ops.length });
    if (state.history.length > 200) state.history = state.history.slice(-200);
    persist();
    broadcast(`PXNOTE ${note}`);
    log(`claude drew ${ops.length} px: ${note}`);
  } catch (e) {
    log(`claude contribution FAILED: ${e.message}`);
    broadcast('PXNOTE claude tried to draw but failed -- see mini logs');
  } finally {
    aiBusy = false;
  }
}

function inviteClaude() {
  const now = Date.now();
  if (now - lastInvite < INVITE_GUARD_MS) {
    broadcast('PXNOTE claude was here moments ago -- give it a minute');
    return;
  }
  lastInvite = now;
  contribute('invited from the Plus');
}

// Daily visit: check every 10 min; first-ever visit ~45 s after boot so a
// fresh canvas gets its opening strokes without waiting a day.
setInterval(() => {
  if (AI_MS > 0 && Date.now() - state.lastAI >= AI_MS) contribute('daily visit');
}, 10 * 60 * 1000);
if (!state.lastAI) setTimeout(() => contribute('first visit'), 45 * 1000);

server.listen(PORT, () => log(`listening on :${PORT} (state ${STATE}, model ${MODEL}, ai every ${AI_MS / 3600000}h${FAKE_AI ? ', FAKE' : ''})`));
