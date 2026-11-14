/* CASBS Quest sticky notes (2026-11-12). Rides on the game through window.quest.
   - Every desk has a pad of sticky notes and a pen. Click it in someone's study to leave them a
     note (140 characters); it lands on the front of their desk, where anyone who walks in can
     pick it up and read it. In a shared study you choose who it is for. In Bart's study the
     notes go on the pinboard on the wall instead (BOARD); the pad stays on the desk.
   - The pad and pen are the one thing on a desk that does something, so they are drawn to say
     so: an ink outline, a pen in the game's orange, and a small twinkle every few seconds.
   - Click a note to read the desk close up: every note, who left it, when. Its reader, its
     author and an admin can peel one off.
   - New notes on your own desk wiggle until you have read them, and the ticker tells you.
   Server: src/lib/semibart/social.ts behind /api/semibart/desk. This file also loads the two
   other social files (ticker.js, claude.js), so index.html needs one script tag for all three. */
(() => {
'use strict';
const q = window.quest;
if (!q || !q.hooks || !q.gfx) return;
const G = q.gfx, g = G.g, S = q.S, rect = (x, y, w, h, c) => G.rect(g, x, y, w, h, c);
const API = '/api/semibart/desk';
const stage = document.getElementById('stage');
const base = (document.currentScript && document.currentScript.src || '/semibart/notes.js').replace(/[^/]*$/, '');
['ticker.js', 'claude.js', 'leaves.js'].forEach(f => { const s = document.createElement('script'); s.src = base + f; s.async = false; document.body.appendChild(s); });

const INK = '#141414';
const PAPER = {
  yellow: { f: '#ffe566', s: '#d9b93a', i: '#8a7420' }, pink: { f: '#ff9ccf', s: '#d9709f', i: '#8a3560' },
  blue: { f: '#9fd8ff', s: '#6aa9d6', i: '#2f5f86' }, green: { f: '#b6f2a0', s: '#7fc46a', i: '#3b7a2c' }
};
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sceneOf = room => room === 'bart' ? 'bart' : q.PEOPLE[room] ? q.PEOPLE[room].scene : null;
const nameOf = c => c === 'bart' ? 'Bart' : q.PEOPLE[c] ? q.PEOPLE[c].name : q.FELLOWS[c] ? q.FELLOWS[c].name : c;
const mine = room => !!(q.me && q.occupants(room).includes(q.me.character));
function ago(iso) {
  const m = Math.max(0, (Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return Math.floor(m) + ' min ago';
  if (m < 60 * 24) return Math.floor(m / 60) + ' h ago';
  const d = Math.floor(m / 1440); return d === 1 ? 'yesterday' : d + ' days ago';
}

/* ---------- where things go, per kind of room (room coordinates) ----------
   A note is 9 x 9. Desk rooms: the front panel is x 151-260, y 101-122, two rows of nine
   (pitch 11, from x 156: 156 + 8 * 11 + 9 = 253). Bart's panel has a drawer at x 226-255, so
   six across. The reading room has no desk: notes go on the arms and back of the chair and one
   on the lampshade. At the standing desk they hang off the front edge, either side of the legs. */
function grid(x0, cols, ys) { const out = []; ys.forEach(y => { for (let i = 0; i < cols; i++) out.push([x0 + i * 11, y]); }); return out; }
const PLACES = {
  desk: { pad: [250, 92], slots: grid(156, 9, [103, 113]) },
  bart: { pad: [156, 92], slots: grid(156, 6, [103, 113]) },
  read: { pad: [214, 79], slots: [[149, 86], [214, 86], [149, 98], [214, 98], [158, 55], [205, 55], [241, 48]] },
  stand: { pad: [159, 77], slots: [[146, 86], [157, 86], [168, 86], [207, 86], [218, 86], [229, 86], [238, 86]] }
};
// When the room's own code has hidden the desk (or the reading chair), the notes move to the
// wall under the window, which no room can hide: two rows of six from x 50, the pad on the sill.
const WALL = { pad: [48, 69], slots: grid(50, 6, [78, 89]) };
// Bart's study has a pinboard on the wall (index.html, x 155-194, y 12-49; cork x 157-192,
// y 14-47): his notes are pinned there, three across (159 + 2 * 11 + 9 = 190) and three down
// (15 + 2 * 11 + 9 = 46). The pad stays where it would be. If his room's code hides the wall
// things ('extras'), the notes go back to the desk.
const BOARD = grid(159, 3, [15, 26, 37]);
// Rooms whose notes go on a message board on the wall. Bart's is painted into his room. Any
// other is drawn here, over the room's own decoration (frame = x, y, w, h; the cork is 2 in):
// Study 27's hangs between the tour poster and the arcade cabinet, three across and two down
// (131 + 2 * 11 + 9 = 162 inside cork x 130-163; 11 + 11 + 9 = 31 inside cork y 10-33). In a
// shared study the board is one for the room; every desk keeps its own pad.
const BOARDS = {
  bart: { slots: BOARD },
  kevin: { frame: [128, 8, 38, 28], slots: grid(131, 3, [11, 22]), look: 'The message board. The oldest network in the room.' }
};
function placeOf(room) {
  const sc = sceneOf(room); if (!PLACES[sc]) return null;
  const gone = window.questRooms && typeof window.questRooms.hidden === 'function' ? window.questRooms.hidden(room) || [] : [];
  const p = gone.includes(sc === 'read' ? 'chair' : 'desk') ? WALL : PLACES[sc];
  const bd = BOARDS[room];
  return bd && !(room === 'bart' && gone.includes('extras')) ? { pad: p.pad, slots: bd.slots, board: bd } : p;
}
/** Where a room's notes are kept, as a word: 'pinboard' in a room with a board, 'desk' everywhere else. */
const spotOf = room => { const p = placeOf(room); return p && p.board ? 'pinboard' : 'desk'; };

/* ---------- the notes of the room you are in ---------- */
const desks = {};   // room -> { notes: [...], at: ms, loading }
let dropped = null; // { id, t0 } a note that was just stuck on, for its little drop
async function load(room, force) {
  const d = desks[room] || (desks[room] = { notes: [], at: 0, loading: false });
  if (d.loading || (!force && Date.now() - d.at < 15000)) return d;
  d.loading = true;
  try {
    const r = await fetch(API + '?room=' + encodeURIComponent(room), { credentials: 'same-origin' });
    if (r.ok) { d.notes = (await r.json()).notes || []; d.at = Date.now(); }
  } catch (e) {}
  d.loading = false;
  return d;
}
const notesIn = room => (desks[room] ? desks[room].notes : []);
// A shared study with a desk per person (quest.desks, from the rooms layer) gets one group per
// desk: that person's notes on their own front panel, and a pad on their desk top. Everywhere
// else there is one group for the room.
function groupsOf(room) {
  const p = placeOf(room); if (!p) return [];
  const ds = p !== WALL && typeof q.desks === 'function' ? q.desks(room) || [] : [];
  if (ds.length < 2) return [{ to: null, pad: p.pad, slots: p.slots }];
  if (p.board) return [{ to: null, pad: null, slots: p.slots }].concat(ds.map(d => ({ to: d.slug, pad: [d.x + 3, d.top - 3], slots: [], padOnly: true })));
  return ds.map(d => {
    // The bottom row is clear; the top row shares the panel with the desk's name plate, so notes
    // go to either side of it. The bottom row fills first.
    const [px, py, pw] = d.panel, cols = Math.max(1, Math.floor((pw - 6) / 11)), x0 = px + 3 + Math.floor((pw - 6 - (cols * 11 - 2)) / 2);
    const beside = grid(x0, cols, [py + 2]).filter(([x]) => !d.plate || x + 9 <= d.plate[0] - 1 || x >= d.plate[0] + d.plate[2] + 1);
    return { to: d.slug, pad: [d.x + 3, d.top - 3], slots: grid(x0, cols, [py + 12]).concat(beside) };
  });
}
// What is on show: per group the newest notes that fit, oldest first so a note keeps its place;
// when there are more than fit, the last place is a stack.
function layout(room) {
  const all = notesIn(room);
  return groupsOf(room).map(gr => {
    const mine = gr.padOnly ? [] : gr.to ? all.filter(n => n.to.character === gr.to) : all;
    const keep = mine.length <= gr.slots.length ? mine : mine.slice(mine.length - (gr.slots.length - 1));
    return { to: gr.to, pad: gr.pad, items: keep.map((n, i) => ({ n, x: gr.slots[i][0], y: gr.slots[i][1] })), more: mine.length - keep.length, last: gr.slots[gr.slots.length - 1] };
  });
}
function shown(room) { const L = layout(room); return { notes: [].concat(...L.map(gr => gr.items.map(it => it.n))), more: L.reduce((a, gr) => a + gr.more, 0) }; }
const seenKey = () => 'sb-notes-seen-' + (q.me ? q.me.character : '');
function seenAt() { try { return localStorage.getItem(seenKey()) || ''; } catch (e) { return ''; } }
function markSeen() { try { localStorage.setItem(seenKey(), new Date().toISOString()); } catch (e) {} }
const fresh = n => !!(q.me && n.to.character === q.me.character && n.from.character !== q.me.character && n.created_at > seenAt());

/* ---------- drawing ---------- */
function drawNote(n, x, y, t) {
  const c = PAPER[n.color] || PAPER.yellow, h = hash(n.id);
  x += (h % 3) - 1; y += ((h >> 3) % 2);
  if (dropped && dropped.id === n.id) { const k = (performance.now() - dropped.t0) / 260; if (k < 1 && !G.calm) y -= Math.round((1 - k) * (1 - k) * 14); else if (k >= 1) dropped = null; }
  if (fresh(n) && !G.calm && Math.floor(t * 6) % 6 < 2) x += Math.floor(t * 12) % 2 ? 1 : -1;
  rect(x + 1, y + 1, 9, 9, 'rgba(20,20,20,0.35)');
  rect(x, y, 9, 9, c.f); rect(x, y, 9, 2, c.s);
  rect(x + 7, y + 7, 2, 2, c.s);
  for (let i = 0; i < 3; i++) rect(x + 1, y + 3 + i * 2, 3 + ((h >> (5 + i * 3)) % 5), 1, c.i);
  if (fresh(n)) { rect(x + 6, y - 1, 3, 3, INK); rect(x + 7, y, 1, 1, '#ff5a1f'); }
}
// The pad and pen, x, y = the pad's top-left. Everything else on a desk is scenery; this is a
// control, so it gets what the game gives things you can use: a full ink outline (pad 11 x 5,
// pen 3 thick), the pen in the interface's orange, and a twinkle at the pen's cap for 0.45 s
// every 3.6 s (three stepped frames; a still spark when motion is reduced). Each pad twinkles
// at its own moment, so a shared study does not blink in unison.
function drawPad(x, y, t) {
  rect(x - 1, y - 1, 11, 5, INK);
  rect(x, y, 9, 3, '#ffe566'); rect(x, y, 9, 1, '#fff3a6'); rect(x, y + 2, 9, 1, '#d9b93a');
  const pen = i => [x + 2 + i, y - 5 + Math.round(i * 0.67)];
  for (let i = 0; i < 7; i++) { const [px, py] = pen(i); rect(px - 1, py - 1, 3, 3, INK); }
  for (let i = 0; i < 7; i++) { const [px, py] = pen(i); rect(px, py, 1, 1, i === 0 ? '#fff7e6' : i === 6 ? '#ffd93b' : '#ff5a1f'); }
  const sx = x + 1, sy = y - 7, k = G.calm ? 1 : Math.floor((((t + x * 0.37) % 3.6) + 3.6) % 3.6 / 0.15);
  if (k === 0 || k === 2) { rect(sx - 1, sy, 3, 1, '#ffd93b'); rect(sx, sy - 1, 1, 3, '#ffd93b'); rect(sx, sy, 1, 1, '#fff7e6'); }
  if (k === 1) { rect(sx - 2, sy, 5, 1, '#ffd93b'); rect(sx, sy - 2, 1, 5, '#ffd93b'); rect(sx - 1, sy - 1, 3, 3, '#fff7e6'); }
}
let lastRoom = null, pollT = 0;
q.hooks.roomMid.push((room, t) => {
  const p = placeOf(room); if (!p) return;
  if (room !== lastRoom) { lastRoom = room; load(room, true); }
  else if (performance.now() - pollT > 20000) { pollT = performance.now(); load(room, true); }
  if (p.board && p.board.frame) { const [x, y, w, h] = p.board.frame; rect(x + 1, y + 1, w, h, 'rgba(0,0,0,0.3)'); rect(x, y, w, h, '#5c2e18'); rect(x + 2, y + 2, w - 4, h - 4, '#d9b48a'); rect(x + 2, y + 2, w - 4, 1, '#c29a6e'); rect(x + 2, y + 2, 1, h - 4, '#c29a6e'); }
  layout(room).forEach(gr => {
    gr.items.forEach(it => drawNote(it.n, it.x, it.y, t));
    if (gr.more) { const [x, y] = gr.last; for (let k = 2; k >= 0; k--) { rect(x + k, y + k - 1, 9, 9, k ? '#d9b93a' : '#ffe566'); } rect(x + 2, y + 3, 5, 1, '#8a7420'); rect(x + 4, y + 1, 1, 5, '#8a7420'); }
    if (gr.pad) drawPad(gr.pad[0], gr.pad[1], t);
  });
});
// Leaving a room: forget which one, so walking back in asks again.
setInterval(() => { if (S.scene !== 'room') lastRoom = null; }, 500);

/* ---------- hotspots: each note, and the pad ---------- */
q.hooks.roomSpots.push(room => {
  if (!placeOf(room)) return [];
  const shared = q.occupants(room).length > 1, out = [], wx = x => Math.max(60, Math.min(290, x + 4));
  layout(room).forEach(gr => {
    const perDesk = !!gr.to;
    gr.items.forEach(({ n, x, y }) => out.push({ name: shared && !perDesk ? `note for ${n.to.name}, from ${n.from.name}` : `note from ${n.from.name}`, r: [x - 1, y - 1, 11, 11], walk: { x: wx(x), y: 134 }, def: 'read',
      on: { look: `A ${n.color} sticky note from ${n.from.name}${perDesk ? ', on ' + nameOf(gr.to) + "'s desk" : ''}. Stuck there ${ago(n.created_at)}.`, read: () => openDesk(room, n.id) } }));
    if (gr.more) { const [x, y] = gr.last; out.push({ name: `${gr.more} more notes`, r: [x - 1, y - 2, 13, 13], walk: { x: wx(x), y: 134 }, def: 'read', on: { look: 'A whole stack of them. Somebody is popular.', read: () => openDesk(room, null) } }); }
    if (!gr.pad) return;
    const own = perDesk ? !!(q.me && q.me.character === gr.to) : mine(room);
    const who = own ? 'My' : perDesk ? nameOf(gr.to) + "'s" : shared ? 'Their' : nameOf(room) + "'s";
    out.push({ name: perDesk && !own ? `sticky notes and a pen, ${nameOf(gr.to)}'s` : 'sticky notes and a pen', r: [gr.pad[0] - 3, gr.pad[1] - 10, 15, 15], walk: { x: wx(gr.pad[0]), y: 134 }, def: 'write',
      on: { look: own ? 'My pad of sticky notes, and a pen. Anyone who visits can leave me one.' : `${who} pad of sticky notes, and a pen. For leaving a note on the ${spotOf(room)}.`, write: () => writeFlow(room, gr.to) } });
  });
  const bd = placeOf(room).board;
  if (bd && bd.frame) out.push({ name: 'message board', r: bd.frame, walk: { x: wx(bd.frame[0] + bd.frame[2] / 2), y: 134 }, def: 'read', on: { look: bd.look, read: () => openDesk(room, null) } });
  return out;
});

/* ---------- the desk, close up (DOM over the stage) ---------- */
const css = document.createElement('style');
css.textContent = `
.nb-veil { position: absolute; inset: 0; z-index: 7; display: grid; place-items: center; background: rgba(0, 0, 0, 0.6); }
.nb-board { width: 86cqw; height: 48cqw; display: flex; flex-direction: column; background: #c08a55; border: 0.5cqw solid #141414; box-shadow: inset 0 0 0 0.4cqw #9c6a3c, 1.2cqw 1.2cqw 0 #000; color: #fff7e6;
  background-image: repeating-linear-gradient(90deg, rgba(0,0,0,0) 0 11.6cqw, rgba(124, 78, 40, 0.5) 11.6cqw 12cqw); }
.nb-board.nb-cork { background: #d9b48a; background-image: none; box-shadow: inset 0 0 0 1cqw #5c2e18, 1.2cqw 1.2cqw 0 #000; padding: 1cqw; }
.nb-top { flex: none; display: flex; align-items: center; justify-content: space-between; padding: 1.2cqw 2cqw 0.4cqw; font-size: 3.2cqw; color: #2a1608; }
.nb-top button, .nb-bottom .nb-quiet { color: #2a1608; font-size: 2.4cqw; border: 0.25cqw solid #2a1608; padding: 0.2cqw 1.2cqw; }
.nb-top button:hover, .nb-bottom .nb-quiet:hover { background: #2a1608; color: #ffe566; }
.nb-notes { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-wrap: wrap; align-content: flex-start; justify-content: center; gap: 1.6cqw 1.4cqw; padding: 1.4cqw 2cqw 1cqw; }
.nb-empty { align-self: center; margin: auto; font-size: 3cqw; color: #2a1608; text-align: center; line-height: 1.15; }
.nb-note { position: relative; width: 18.6cqw; min-height: 17cqw; padding: 2cqw 1.2cqw 1cqw; display: flex; flex-direction: column; color: #2a2416; font-size: 2.35cqw; line-height: 1.02; box-shadow: 0.5cqw 0.5cqw 0 rgba(20, 20, 20, 0.4); overflow-wrap: anywhere; }
.nb-note::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 1.3cqw; background: rgba(0, 0, 0, 0.14); }
.nb-note p { margin: 0; flex: 1; white-space: pre-wrap; }
.nb-note .nb-by { margin-top: 0.8cqw; font-size: 1.9cqw; opacity: 0.72; display: flex; justify-content: space-between; align-items: flex-end; gap: 0.6cqw; }
.nb-note .nb-off { font-size: 1.8cqw; text-decoration: underline; color: inherit; flex: none; }
.nb-note .nb-off:hover { color: #b3261e; }
.nb-note.nb-new::after { content: 'new'; position: absolute; top: -0.9cqw; right: -0.8cqw; background: #ff5a1f; color: #141414; font-size: 1.8cqw; padding: 0 0.7cqw; border: 0.25cqw solid #141414; }
.nb-note.nb-focus { outline: 0.35cqw solid #141414; z-index: 1; }
.nb-yellow { background: #ffe566; } .nb-pink { background: #ffb3da; } .nb-blue { background: #b4e0ff; } .nb-green { background: #c3f5b0; }
.nb-bottom { flex: none; display: flex; align-items: center; gap: 1.6cqw; padding: 0.6cqw 2cqw 1.4cqw; }
.nb-btn { background: #ffe566; color: #141414; font-size: 2.6cqw; padding: 0.5cqw 2cqw; border: 0.3cqw solid #141414; box-shadow: 0.4cqw 0.4cqw 0 #141414; }
.nb-btn:hover { background: #fff; }
.nb-btn[disabled] { opacity: 0.5; cursor: default; }
.nb-hint { font-size: 2.1cqw; color: #2a1608; }
.nb-pad { width: 44cqw; background: #ffe566; color: #2a2416; padding: 2.6cqw 2.2cqw 1.6cqw; position: relative; box-shadow: 0.9cqw 0.9cqw 0 rgba(0, 0, 0, 0.55), 0 0 0 0.4cqw #141414; }
.nb-pad::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 1.8cqw; background: rgba(0, 0, 0, 0.14); }
.nb-pad h2 { margin: 0 0 0.6cqw; font-size: 3.1cqw; font-weight: 400; line-height: 1; }
.nb-pad .nb-for { display: flex; flex-wrap: wrap; gap: 0.8cqw; margin: 0 0 0.8cqw; }
.nb-pad .nb-for button { font-size: 2.3cqw; padding: 0.1cqw 1.1cqw; border: 0.25cqw solid #2a2416; color: #2a2416; }
.nb-pad .nb-for button[aria-pressed="true"] { background: #2a2416; color: #ffe566; }
.nb-pad textarea { display: block; width: 100%; height: 15cqw; resize: none; font: inherit; font-size: max(16px, 3cqw); line-height: 1.05; color: #2a2416; background: transparent; border: 0; outline: none; padding: 0;
  background-image: repeating-linear-gradient(180deg, transparent 0 calc(1.05em - 0.15cqw), rgba(42, 36, 22, 0.22) calc(1.05em - 0.15cqw) 1.05em); }
.nb-pad .nb-row { display: flex; align-items: center; gap: 1.4cqw; margin-top: 1cqw; }
.nb-pad .nb-count { margin-left: auto; font-size: 2.1cqw; opacity: 0.7; }
.nb-pad .nb-count.over { color: #b3261e; opacity: 1; }
.nb-pad .nb-quiet { font-size: 2.3cqw; text-decoration: underline; color: #2a2416; }
.nb-pad .nb-err { margin: 0.6cqw 0 0; min-height: 2.3cqw; font-size: 2.1cqw; color: #b3261e; }
`;
document.head.appendChild(css);
let veil = null, veilDone = null;
function openVeil(html) {
  closeVeil();
  veil = document.createElement('div'); veil.className = 'nb-veil'; veil.innerHTML = html;
  // The canvas listens on the stage and the window: nothing in here is for it.
  ['pointerdown', 'pointerup', 'click', 'contextmenu', 'keyup', 'wheel', 'mousemove'].forEach(ev => veil.addEventListener(ev, e => e.stopPropagation()));
  veil.addEventListener('click', e => { if (e.target === veil) closeVeil(); });
  stage.appendChild(veil);
  return new Promise(res => { veilDone = res; });
}
function closeVeil(result) {
  if (!veil) return;
  veil.remove(); veil = null;
  const d = veilDone; veilDone = null; if (d) d(result);
  const cv = document.getElementById('cv'); cv.focus && cv.focus();
}
q.hooks.keyBlock.push(e => { if (!veil) return false; if (e.key === 'Escape') closeVeil(); return true; });
window.addEventListener('keydown', e => { if (veil && e.key === 'Escape') closeVeil(); });

function noteHtml(n, room, focusId) {
  const shared = q.occupants(room).length > 1, tilt = ((hash(n.id) % 7) - 3) * 0.7;
  return `<div class="nb-note nb-${esc(PAPER[n.color] ? n.color : 'yellow')}${fresh(n) ? ' nb-new' : ''}${n.id === focusId ? ' nb-focus' : ''}" data-id="${esc(n.id)}" style="transform: rotate(${tilt}deg)">
    <p>${esc(n.body)}</p>
    <div class="nb-by"><span>${shared ? 'for ' + esc(n.to.name) + ' · ' : ''}${esc(n.from.name)}, ${esc(ago(n.created_at))}</span>${n.canRemove ? '<button type="button" class="nb-off">peel off</button>' : ''}</div>
  </div>`;
}
/** The desk close up. Resolves 'write' when the visitor asked for the pad, else undefined. */
async function openDesk(room, focusId) {
  await load(room, true);
  const board = spotOf(room) === 'pinboard';
  const title = board ? (q.occupants(room).length > 1 ? `The board in Study ${q.PEOPLE[room] ? q.PEOPLE[room].n : ''}` : mine(room) ? 'My pinboard' : `${nameOf(room)}'s pinboard`) : mine(room) ? 'My desk' : q.occupants(room).length > 1 ? `The desk in Study ${q.PEOPLE[room] ? q.PEOPLE[room].n : ''}` : `${nameOf(room)}'s desk`;
  const all = notesIn(room).slice().reverse();
  const done = openVeil(`<div class="nb-board${board ? ' nb-cork' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="nb-top"><span>${esc(title)}</span><button type="button" data-close>Close</button></div>
    <div class="nb-notes">${all.length ? all.map(n => noteHtml(n, room, focusId)).join('') : `<p class="nb-empty">No notes yet.<br>The pad is ${board ? 'on the desk' : 'right there'}.</p>`}</div>
    <div class="nb-bottom"><button type="button" class="nb-btn" data-write>${mine(room) ? 'Note to self' : 'Leave a note'}</button><span class="nb-hint">${all.length ? all.length + (all.length === 1 ? ' note' : ' notes') + '. Anyone who walks in can read them.' : ''}</span></div>
  </div>`);
  const el = veil;
  el.querySelector('[data-close]').addEventListener('click', () => closeVeil());
  el.querySelector('[data-write]').addEventListener('click', () => closeVeil('write'));
  el.querySelectorAll('.nb-off').forEach(b => b.addEventListener('click', async () => {
    const card = b.closest('.nb-note'), id = card.dataset.id; b.disabled = true;
    try {
      const r = await fetch(API + '?id=' + encodeURIComponent(id), { method: 'DELETE', credentials: 'same-origin' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'That did not come off.');
      desks[room].notes = desks[room].notes.filter(n => n.id !== id); card.remove(); q.SFX.pick && q.SFX.pick();
      if (!el.querySelector('.nb-note')) el.querySelector('.nb-notes').innerHTML = `<p class="nb-empty">A clean ${board ? 'board' : 'desk'}.</p>`;
    } catch (x) { b.disabled = false; b.textContent = x.message; }
  }));
  const f = el.querySelector('.nb-focus'); if (f) f.scrollIntoView({ block: 'center' });
  if (mine(room)) markSeen();
  if ((await done) === 'write') await writeFlow(room);
}

const THANKS = ['A note! I will read it the second you leave.', "Ooh. Don't tell me what it says.", 'Stuck on straight and everything. Thank you.', 'I love mail I do not have to answer.', 'It goes with the desk. Thank you.', 'Finally, something on this desk I did not put there.'];
const BOARD_THANKS = THANKS.filter(l => !/desk/.test(l)).concat(['Straight onto the board. Thank you.', 'Pinned. It outranks everything else up there.']);
async function writeFlow(room, forWhom) {
  if (!q.me) { await q.say('you', 'Sticky notes and a pen. I should sign in before I sign anything.'); return; }
  const people = q.occupants(room);
  let to = people.length === 1 ? people[0] : forWhom && people.includes(forWhom) ? forWhom : null;
  const title = () => to ? (to === q.me.character ? 'A note to self' : `A note for ${nameOf(to)}`) : 'A note for…';
  const done = openVeil(`<form class="nb-pad" role="dialog" aria-modal="true" aria-label="Write a sticky note">
    <h2></h2>
    ${people.length > 1 ? `<div class="nb-for">${people.map(c => `<button type="button" data-to="${esc(c)}" aria-pressed="false">${esc(c === q.me.character ? 'me' : nameOf(c))}</button>`).join('')}</div>` : ''}
    <textarea maxlength="200" aria-label="Your note" placeholder="Write something. Everyone who visits can read it."></textarea>
    <p class="nb-err" role="alert"></p>
    <div class="nb-row"><button class="nb-btn" type="submit">Stick it on</button><button class="nb-quiet" type="button" data-close>Never mind</button><span class="nb-count">140</span></div>
  </form>`);
  const el = veil, ta = el.querySelector('textarea'), h2 = el.querySelector('h2'), count = el.querySelector('.nb-count'), err = el.querySelector('.nb-err'), go = el.querySelector('[type=submit]');
  const paint = () => { h2.textContent = title(); const left = 140 - ta.value.trim().length; count.textContent = left; count.classList.toggle('over', left < 0); el.querySelectorAll('[data-to]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.to === to))); };
  el.querySelectorAll('[data-to]').forEach(b => b.addEventListener('click', () => { to = b.dataset.to; err.textContent = ''; paint(); ta.focus(); }));
  ta.addEventListener('input', paint);
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go.click(); } });
  el.querySelector('[data-close]').addEventListener('click', () => closeVeil());
  el.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const body = ta.value.trim().replace(/\s+/g, ' ');
    if (!to) { err.textContent = 'Pick who it is for.'; return; }
    if (!body) { err.textContent = 'It is blank. Mysterious, but no.'; return; }
    if (body.length > 140) { err.textContent = 'Too long for a sticky note: 140 characters.'; return; }
    go.disabled = true; err.textContent = '';
    try {
      const r = await fetch(API, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to, body }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.note) throw new Error(d.error || 'That did not stick. Try again.');
      d.note.to.name = nameOf(to);
      (desks[room] || (desks[room] = { notes: [], at: 0 })).notes.push(d.note);
      closeVeil(d.note);
    } catch (x) { go.disabled = false; err.textContent = x.message; }
  });
  paint(); setTimeout(() => ta.focus(), 30);
  const note = await done;
  if (!note) return;
  dropped = { id: note.id, t0: performance.now() }; q.SFX.pick && q.SFX.pick();
  await q.wait(0.35);
  if (to === q.me.character) await q.say('you', 'A note to self. Future me will be thrilled.');
  else { const lines = spotOf(room) === 'pinboard' ? BOARD_THANKS : THANKS; await q.say(to, lines[hash(note.id) % lines.length]); }
}

/* ---------- your own desk: tell you when something new is on it ---------- */
const myRoom = () => q.me ? ['bart'].concat(Object.keys(q.PEOPLE)).find(r => q.occupants(r).includes(q.me.character)) : null;
async function checkMine() {
  const room = myRoom(); if (!room) return;
  await load(room, true);
  const n = notesIn(room).filter(fresh).length;
  if (n && window.questTicker) window.questTicker.local(n === 1 ? `There is a new note on your ${spotOf(room)}.` : `There are ${n} new notes on your ${spotOf(room)}.`);
}
let told = false;
window.addEventListener('semibart:user', () => { if (q.me && !told) { told = true; setTimeout(checkMine, 2500); } });
// A note announced on the ticker: if it is for the room you are standing in, pick it up now.
window.addEventListener('semibart:event', e => { const ev = e.detail; if (ev && ev.kind === 'note' && S.scene === 'room' && ev.room === S.room) load(S.room, true); });

// Bart's study has a pinboard on the wall, and the notes people leave him are pinned to it
// (BOARD above). Clicking the board itself opens the same close-up as clicking a note.
{ const pin = q.ROOM.find(h => h.name === 'pinboard'); if (pin) { pin.def = 'read'; pin.on.look = 'The pinboard. People leave notes. They stay up.'; pin.on.read = () => openDesk('bart', null); } }

window.questNotes = { desks, load, openDesk, writeFlow, shown, placeOf };
})();
