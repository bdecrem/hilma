// CASBS Quest, rooms as data. What a fellow has added to their study is a piece of drawing code
// saved in the database (semibart_rooms), not part of this page: this file fetches it, runs it
// over the room through the game's hooks (window.quest.hooks), and gives a room's occupants a
// Decorate box that asks the server for a change ("put a cute pink rat in my room"). The server
// (src/lib/semibart/room-agent.ts) writes the code with Claude and test-runs it before saving;
// everyone in the room sees the new version within a few seconds. No deploy is involved.
//
// Room code is written by a model from a fellow's sentence and runs in every visitor's page, so
// it is fenced: it gets only the drawing helpers, every browser global is shadowed, the Function
// constructors are removed, and a room whose code throws or runs slow is switched off until its
// next version. The fence is for accidents and mischief among colleagues, not a hostile web.
(() => {
'use strict';
const q = window.quest;
if (!q || !q.hooks || !q.gfx) return;   // an older index.html: nothing to hook into
const G = q.gfx, g = G.g, S = q.S, W = 320, H = 144;
const API = '/api/semibart/rooms';
const MAX_OPS = 14000, POLL_MS = 4000;

/* ---------- the fence ---------- */
// No code from strings, from anywhere reachable inside room code.
for (const f of [function () {}, function* () {}, async function () {}, async function* () {}]) {
  try { Object.defineProperty(Object.getPrototypeOf(f), 'constructor', { value: undefined, writable: false, configurable: false }); } catch (e) {}
}
const SHADOW = ['window', 'document', 'globalThis', 'self', 'top', 'parent', 'frames', 'location', 'navigator', 'history', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
  'Worker', 'SharedWorker', 'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'cookieStore', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'requestIdleCallback',
  'queueMicrotask', 'postMessage', 'alert', 'confirm', 'prompt', 'open', 'close', 'print', 'Function', 'Promise', 'Reflect', 'Proxy', 'WebAssembly', 'quest', 'questRooms', 'Image',
  'Audio', 'Notification', 'crypto', 'performance', 'console', 'Object'];
const SAFE_OBJECT = Object.freeze({ keys: Object.keys, values: Object.values, entries: Object.entries, assign: Object.assign, freeze: Object.freeze, fromEntries: Object.fromEntries });
const SHADOW_ARGS = SHADOW.map(n => n === 'Object' ? SAFE_OBJECT : undefined);

/* ---------- the drawing helpers room code gets ---------- */
const FONT = (() => {
  const rows = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011',
    H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101',
    O: '010101101101010', P: '110101110100100', Q: '010101101111011', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111',
    V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111',
    0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111',
    7: '111001001010010', 8: '111101111101111', 9: '111101111001111',
    '.': '000000000000010', ',': '000000000010100', '!': '010010010000010', '?': '110001010000010', '-': '000000111000000', ':': '000010000010000',
    "'": '010010000000000', '/': '001001010100100', '+': '000010111010000', '&': '010101010101011'
  };
  return rows;
})();
let ops = 0, frameT = -1;
function tick(n) { ops += n || 1; if (ops > MAX_OPS) throw new Error('too many drawing calls in one frame'); }
const ok = v => typeof v === 'number' && isFinite(v);
function fill(x, y, w, h, col) { tick(); if (typeof col !== 'string' || !ok(x) || !ok(y) || !ok(w) || !ok(h)) return; G.rect(g, x, y, w, h, col); }
let youNow = Object.freeze({ x: 0, y: 0, face: 1, moving: false });
const api = Object.freeze(Object.defineProperties({
  W, H, calm: !!G.calm,
  rect: fill,
  px: (x, y, col) => fill(x, y, 1, 1, col),
  disc: (cx, cy, r, col) => { if (!ok(r) || r < 0 || r > 200 || typeof col !== 'string') return; tick(r * 2 + 1); G.disc(g, Math.round(cx), Math.round(cy), Math.round(r), col); },
  oval: (cx, cy, rx, ry, col) => { if (!ok(rx) || !ok(ry) || rx < 0 || ry < 0 || rx > 320 || ry > 200 || typeof col !== 'string') return; if (ry < 1) return fill(cx - rx, cy, rx * 2 + 1, 1, col); tick(ry * 2 + 1); G.oval(g, Math.round(cx), Math.round(cy), Math.round(rx), Math.round(ry), col); },
  dither: (x, y, w, h, a, b) => {
    if (!ok(x) || !ok(y) || !ok(w) || !ok(h) || w < 0 || h < 0 || w * h > 20000 || typeof a !== 'string' || typeof b !== 'string') return;
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h); tick(Math.ceil(w * h / 2) + 1);
    G.rect(g, x, y, w, h, b); g.fillStyle = a; for (let j = 0; j < h; j++) for (let i = (j + 1) % 2; i < w; i += 2) g.fillRect(x + i, y + j, 1, 1);
  },
  sprite: (rows, pal, x, y) => {
    if (!Array.isArray(rows) || rows.length > 160 || !pal || typeof pal !== 'object' || !ok(x) || !ok(y)) return;
    x = Math.round(x); y = Math.round(y);
    for (let j = 0; j < rows.length; j++) { const row = rows[j]; if (typeof row !== 'string' || row.length > 320) return; tick(row.length); for (let i = 0; i < row.length; i++) { const c = pal[row[i]]; if (typeof c === 'string' && c) { g.fillStyle = c; g.fillRect(x + i, y + j, 1, 1); } } }
  },
  text: (cx, y, s, col) => {
    if ((typeof s !== 'string' && typeof s !== 'number') || typeof col !== 'string' || !ok(cx) || !ok(y)) return;
    s = String(s).toUpperCase().slice(0, 60); tick(s.length * 8);
    let x = Math.round(cx - (s.length * 4 - 1) / 2); y = Math.round(y); g.fillStyle = col;
    for (const ch of s) { const d = FONT[ch]; if (d) for (let k = 0; k < 15; k++) if (d[k] === '1') g.fillRect(x + k % 3, y + (k / 3 | 0), 1, 1); x += 4; }
  },
  rng: seed => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
}, { you: { get: () => youNow, enumerable: true } }));

/* ---------- loading and running a room's code ---------- */
const LAYERS = ['back', 'mid', 'front'];
function compile(code) {
  const make = new Function(...SHADOW, '"use strict"; return (function () {\n' + code + '\n}).call(undefined);');
  const mod = make(...SHADOW_ARGS);
  const out = { back: null, mid: null, front: null, spots: null, errors: 0, ms: 0, frames: 0, dead: false };
  if (!mod || typeof mod !== 'object') return out;
  LAYERS.forEach(l => { if (typeof mod[l] === 'function') out[l] = mod[l]; });
  if (Array.isArray(mod.spots) || typeof mod.spots === 'function') out.spots = mod.spots;
  return out;
}
const rooms = {};      // room -> { version, mod }
let index = {};        // room -> version, from the server
const loading = {};
function setRoom(room, version, code) {
  let mod = null;
  if (code && code.trim()) { try { mod = compile(code); } catch (e) { console.warn('[rooms] ' + room + ' v' + version + ' did not load:', e); } }
  rooms[room] = { version, mod };
}
async function load(room, version) {
  if (loading[room] === version) return;
  loading[room] = version;
  try {
    const r = await fetch(API + '/' + encodeURIComponent(room) + '?v=' + version);
    if (!r.ok) return;
    const d = await r.json();
    if (typeof d.code === 'string' && typeof d.version === 'number' && (!rooms[room] || rooms[room].version < d.version)) setRoom(room, d.version, d.code);
  } catch (e) {} finally { if (loading[room] === version) delete loading[room]; }
}
async function refresh() {
  try {
    const r = await fetch(API, { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    if (!d || typeof d.rooms !== 'object') return;
    index = d.rooms;
    // The room you are standing in first, then the rest, so nothing pops in at a door.
    const here = S.scene === 'room' ? S.room : null;
    const keys = Object.keys(index).sort((a, b) => (b === here) - (a === here));
    for (const k of keys) if (!rooms[k] || rooms[k].version < index[k]) await load(k, index[k]);
  } catch (e) {}
}
refresh();
setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

function kill(room, m, why) { m.dead = true; console.warn('[rooms] ' + room + ' switched off until its next version:', why); }
function draw(layer, room, t) {
  const r = rooms[room], m = r && r.mod;
  if (!m || m.dead) return;
  if (t !== frameT) {
    frameT = t; ops = 0;
    youNow = Object.freeze({ x: S.x, y: S.y, face: S.face, moving: S.path.length > 0 });
    if (m.frames >= 90) { if (m.ms / m.frames > 5) return kill(room, m, 'it takes ' + (m.ms / m.frames).toFixed(1) + ' ms a frame'); m.frames = 0; m.ms = 0; }
    m.frames++;
  }
  const fn = m[layer];
  if (!fn) return;
  const t0 = performance.now();
  g.save();
  try { fn(api, t); } catch (e) { if (++m.errors >= 3) kill(room, m, e); }
  g.restore();
  m.ms += performance.now() - t0;
}
const hasMid = Array.isArray(q.hooks.roomMid);
q.hooks.roomBack.push((room, t) => draw('back', room, t));
if (hasMid) q.hooks.roomMid.push((room, t) => draw('mid', room, t));
q.hooks.roomFront.push((room, t) => { if (!hasMid) draw('mid', room, t); draw('front', room, t); });

// Things room code declares as lookable become ordinary hotspots: a name on hover, a line on click.
q.hooks.roomSpots.push(room => {
  const r = rooms[room], m = r && r.mod;
  if (!m || m.dead || !m.spots) return [];
  let list;
  try { list = typeof m.spots === 'function' ? m.spots(frameT) : m.spots; } catch (e) { return []; }
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const s of list.slice(0, 12)) {
    if (!s || typeof s.name !== 'string' || typeof s.look !== 'string' || !Array.isArray(s.r) || s.r.length !== 4 || !s.r.every(ok)) continue;
    const x = Math.max(0, Math.min(W - 3, Math.round(s.r[0]))), y = Math.max(0, Math.min(H - 3, Math.round(s.r[1])));
    const w = Math.max(3, Math.min(W - x, Math.round(s.r[2]))), h = Math.max(3, Math.min(H - y, Math.round(s.r[3])));
    out.push({ name: s.name.slice(0, 40), r: [x, y, w, h], walk: { x: Math.max(40, Math.min(300, x + w / 2)), y: 134 }, def: 'look', on: { look: s.look.slice(0, 220) } });
  }
  return out;
});

/* ---------- the Decorate box ---------- */
function mine(room) {
  const me = q.me;
  if (!me || !room) return false;
  if (me.role === 'admin') return true;
  const who = typeof q.occupants === 'function' ? q.occupants(room) : [room];
  return Array.isArray(who) && who.includes(me.character);
}
const stage = document.getElementById('stage');
const css = document.createElement('style');
css.textContent = `
#bDeco { position: absolute; left: 1cqw; top: 1cqw; color: var(--cyan); font-size: max(15px, 2.5cqw); padding: 0.4cqw 1.1cqw; background: rgba(0, 0, 0, 0.55); z-index: 4; }
#bDeco:hover, #bDeco:focus-visible { color: var(--hot); outline: none; }
#bDeco[hidden], #deco[hidden] { display: none; }
#deco { position: absolute; left: 0; right: 0; bottom: 0; z-index: 6; padding: 1.2cqw 2cqw 1.4cqw; background: rgba(10, 9, 7, 0.93); border-top: 0.4cqw solid var(--hot); color: #fff7e6; }
#deco form { display: flex; gap: 1cqw; align-items: stretch; }
#decoQ { flex: 1; min-width: 0; font: inherit; font-size: max(16px, 2.6cqw); padding: 0.5cqw 1cqw; background: #000; color: #fff7e6; border: 0.25cqw solid #4a4436; outline: none; border-radius: 0; }
#decoQ:focus { border-color: var(--hot); }
#decoQ:disabled { color: #8a8478; }
#deco button { font-size: max(15px, 2.5cqw); padding: 0.4cqw 1.4cqw; white-space: nowrap; }
#decoGo { background: var(--hot); color: #000; }
#decoGo:disabled { background: #6a6450; cursor: default; }
#decoUndo, #decoX { color: var(--cyan); border: 0.25cqw solid #4a4436; }
#decoUndo:hover:not(:disabled), #decoX:hover { color: var(--hot); border-color: var(--hot); }
#decoUndo:disabled { color: #6a6450; cursor: default; }
#decoMsg { margin: 0.8cqw 0 0; min-height: 1.1em; font-size: max(15px, 2.5cqw); line-height: 1.1; color: var(--choice); }
#decoMsg.bad { color: #ff7a5c; }
#decoMsg.good { color: var(--hot); }
`;
document.head.appendChild(css);
const btn = document.createElement('button');
btn.id = 'bDeco'; btn.type = 'button'; btn.className = 'outlined'; btn.textContent = 'Decorate'; btn.hidden = true;
const box = document.createElement('div');
box.id = 'deco'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Decorate this room');
box.innerHTML = '<form><input id="decoQ" type="text" maxlength="600" autocomplete="off" placeholder="What should be in your room?" aria-label="What should be in your room?"><button id="decoGo" type="submit">Add it</button><button id="decoUndo" type="button">Undo</button><button id="decoX" type="button" aria-label="Close">Close</button></form><p id="decoMsg" aria-live="polite"></p>';
stage.appendChild(btn); stage.appendChild(box);
const form = box.querySelector('form'), inp = box.querySelector('#decoQ'), go = box.querySelector('#decoGo'), undo = box.querySelector('#decoUndo'), msg = box.querySelector('#decoMsg');
// The canvas listens for clicks and keys on the stage and the window; nothing in the box is for it.
['pointerdown', 'pointerup', 'click', 'contextmenu', 'keydown', 'keyup', 'wheel'].forEach(ev => box.addEventListener(ev, e => e.stopPropagation()));
['pointerdown', 'pointerup', 'click'].forEach(ev => btn.addEventListener(ev, e => e.stopPropagation()));

const WAITING = ['Measuring the wall.', 'Finding the right pink.', 'Moving a few pixels around.', 'Checking it against the furniture.', 'Sweeping up.', 'Nearly there.'];
let busy = false, waitTimer = 0, uiOn = true;
function say(text, kind) { msg.textContent = text; msg.className = kind || ''; }
function setBusy(on) {
  busy = on; inp.disabled = on; go.disabled = on; undo.disabled = on || !(rooms[S.room] && rooms[S.room].version > 0);
  clearInterval(waitTimer);
  if (on) { let i = 0; say(WAITING[0]); waitTimer = setInterval(() => { i = Math.min(WAITING.length - 1, i + 1); say(WAITING[i]); }, 5000); }
}
function openBox() { box.hidden = false; btn.hidden = true; setBusy(busy); if (!busy) { say(''); inp.focus(); } }
function closeBox() { box.hidden = true; const cv = document.getElementById('cv'); cv.focus && cv.focus(); }
async function send(path, body, room) {
  setBusy(true);
  let kind = 'bad', line = 'That did not go through. Try again.';
  try {
    const r = await fetch(API + '/' + encodeURIComponent(room) + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (typeof d.say === 'string' && d.say) line = d.say;
    if (r.ok && typeof d.code === 'string' && typeof d.version === 'number') { setRoom(room, d.version, d.code); index[room] = d.version; kind = 'good'; if (path === '') inp.value = ''; }
    else if (r.ok) kind = '';
  } catch (e) {}
  setBusy(false);
  say(line, kind);
  if (!box.hidden) inp.focus();
}
btn.addEventListener('click', openBox);
box.querySelector('#decoX').addEventListener('click', closeBox);
form.addEventListener('submit', e => { e.preventDefault(); const text = inp.value.trim(); if (!text || busy || !mine(S.room)) return; send('', { prompt: text }, S.room); });
undo.addEventListener('click', () => { if (busy || !mine(S.room)) return; send('/undo', {}, S.room); });
box.addEventListener('keydown', e => { if (e.key === 'Escape') closeBox(); });
// The button belongs to the room scene, and only in a room that is yours.
setInterval(() => {
  const can = uiOn && S.started && S.scene === 'room' && !S.busy && !S.choices && S.zoomT < 0 && mine(S.room);
  if (!can && !box.hidden && !(S.scene === 'room' && mine(S.room))) closeBox();
  btn.hidden = !can || !box.hidden;
}, 200);

// ui(false): another way in has taken over (the in-room chat), so the button and box stay away.
window.questRooms = { rooms, refresh, api, compile, setRoom, ui(on) { uiOn = !!on; if (!uiOn) { btn.hidden = true; if (!box.hidden) closeBox(); } } };
})();
