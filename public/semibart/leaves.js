/* CASBS Quest, loose leaves (2026-11-13). The one thing to collect.
   Everyone at CASBS is supposed to be writing a book. The oaks are writing it for them: now and
   then an oak drops a loose leaf, which is a page. Pick it up and it goes on the stack on your own
   desk, where anyone who walks in can see how far you have got. Ten pages make the book.
   The catch is that you start to talk like it. A page or two in, your lines grow footnotes. A few
   more and you hedge. Then you cite yourself. With the book done, you mention the book.
   Server: semibart_pages, GET and POST /api/semibart/pages (social-handlers.ts). Rides on the game
   through quest.hooks (mapOver, mapSpots, sayYou, roomMid, roomSpots). Loaded by notes.js. */
(() => {
'use strict';
const q = window.quest;
if (!q || !q.hooks || !q.gfx || !Array.isArray(q.hooks.mapOver) || window.questLeaves) return;
const G = q.gfx, g = G.g, S = q.S, R = (x, y, w, h, c) => G.rect(g, x, y, w, h, c);
const API = '/api/semibart/pages', BOOK = 10;
const pages = {};          // character -> pages, everyone
const me = () => (q.me ? q.me.character : null);
const mine = () => (me() ? pages[me()] || 0 : 0);
const nameOf = c => c === 'bart' ? 'Bart' : q.PEOPLE[c] ? q.PEOPLE[c].name : q.FELLOWS[c] ? q.FELLOWS[c].name : c;
// FNV-1a with a final stir, so that lines that differ a little land far apart
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return h >>> 0; };

async function load() {
  try { const r = await fetch(API); if (!r.ok) return; const d = await r.json(); if (d && d.pages) { Object.keys(pages).forEach(k => { if (k !== me()) delete pages[k]; }); Object.keys(d.pages).forEach(k => { if (k !== me() || d.pages[k] > (pages[k] || 0)) pages[k] = d.pages[k]; }); } } catch (e) {}
}
load(); setInterval(() => { if (!document.hidden) load(); }, 60000);
window.addEventListener('semibart:user', load);
window.addEventListener('semibart:event', e => { if (e.detail && e.detail.kind === 'system') load(); });

/* ---------- on the map: a leaf falls, lies there, gets picked up ---------- */
const PICKED = [
  "A loose leaf. From the oak. It is page 12 of something.",
  'Another leaf. Page 3. The oak is not writing in order.',
  'Page 40. It has footnotes. I am keeping the footnotes.',
  'Page 7. This is starting to sound like an argument.',
  'Half a manuscript. Arguably.',
  'Page 91. I disagree with it. I am keeping it anyway.',
  'The oak cites itself here. Oak, forthcoming.',
  'Page 2. So that is how it starts.',
  'One more and it is a book.',
  'The last page. It says THE END. I wrote a book. The oak helped.'
];
let leaf = null;           // { ox, oy, x, y, t0 } falling until t0 + FALL, then on the ground
let nextAt = 0, mapClock = 0, lastT = 0, picking = false;
const FALL = 2.6;
function drop(t) {
  const oaks = (q.oaks || []).filter(o => o[1] > S.cam + 24 && o[1] < S.cam + G.FH - 34);
  const pool = oaks.length ? oaks : q.oaks || [];
  if (!pool.length) return;
  const o = pool[Math.floor(Math.random() * pool.length)], side = Math.random() < 0.5 ? -1 : 1;
  leaf = { ox: o[0], oy: o[1] - o[2], x: Math.max(8, Math.min(G.W - 8, o[0] + side * (o[2] + 3 + Math.floor(Math.random() * 5)))), y: o[1] + o[2] + 4, t0: t };
}
q.hooks.mapOver.push(t => {
  const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
  if (!me() || mine() >= BOOK) { leaf = null; return; }
  if (!leaf && !picking) {
    mapClock += dt;
    if (!nextAt) nextAt = mapClock + (mine() ? 30 + Math.random() * 30 : 9 + Math.random() * 6);
    if (mapClock >= nextAt) { nextAt = 0; drop(t); }
  }
  if (!leaf) return;
  const k = G.calm ? 1 : Math.min(1, (t - leaf.t0) / FALL);
  if (k < 1) {   // on its way down, side to side
    const x = leaf.ox + (leaf.x - leaf.ox) * k + Math.sin(k * 9) * 5 * (1 - k), y = leaf.oy + (leaf.y - leaf.oy) * k * k;
    R(x - 1, y - 2, 3, 4, '#141414'); R(x, y - 1, Math.floor(k * 8) % 2 ? 1 : 2, 2, '#fff7e6');
    return;
  }
  // on the ground: a sheet with a line of writing, and a glint so it is not missed
  const { x, y } = leaf;
  R(x - 3, y - 2, 7, 5, '#141414'); R(x - 2, y - 1, 5, 3, '#fff7e6'); R(x - 1, y, 3, 1, '#9a917e');
  if (!G.calm && (t - leaf.t0) % 2.4 < 0.25) { R(x + 3, y - 5, 1, 3, '#ffffff'); R(x + 2, y - 4, 3, 1, '#ffffff'); }
});
async function pick() {
  if (!leaf) return;
  leaf = null; picking = true; q.SFX.pick();
  let n = null;
  try { const r = await fetch(API, { method: 'POST', credentials: 'same-origin' }); const d = await r.json(); if (r.ok && d.picked) n = d.pages; } catch (e) {}
  try {
    if (n === null) { await q.say('you', 'It blew away before I could read it.'); return; }
    pages[me()] = n;
    await q.say('you', PICKED[Math.max(0, Math.min(BOOK, n) - 1)]);
    if (n === 1) await q.say('you', 'It goes on my desk.');
    if (n >= BOOK) { q.SFX.jingle(); await q.say('you', 'It goes on my desk. I will be mentioning it.'); if (window.questTicker) setTimeout(window.questTicker.poll, 600); }
  } finally { picking = false; }
}
q.hooks.mapSpots.push(() => leaf && (G.calm || performance.now() / 1000 - leaf.t0 >= FALL) && me() ? [{ name: 'loose leaf', r: [leaf.x - 5, leaf.y - 5, 11, 11], walk: { x: leaf.x, y: leaf.y + 2 }, def: 'pick', on: { look: 'A loose leaf under the oak. There is writing on it.', pick } }] : []);

/* ---------- in a study: the stack on the desk ---------- */
const ELSEWHERE = { read: [237, 99, 6], stand: [236, 79, 10] };   // no desk: the side table, the standing desk
function stackAt(room, slug) {
  const d = (typeof q.desks === 'function' ? q.desks(room) || [] : []).find(e => e.slug === slug);
  if (d) return d.hidden ? null : [room === 'bart' ? 167 : d.x + d.w - 14, d.top - 1, 10];
  const p = q.PEOPLE[room];
  return p && slug === room && ELSEWHERE[p.scene] ? ELSEWHERE[p.scene] : null;
}
const stacks = room => q.occupants(room).map(slug => ({ slug, n: Math.min(BOOK, pages[slug] || 0), at: stackAt(room, slug) })).filter(s => s.n > 0 && s.at);
q.hooks.roomMid.push(room => {
  stacks(room).forEach(({ n, at: [x, y, w] }) => {
    if (n >= BOOK) {   // bound, standing up, with a title nobody can read from here
      R(x + 1, y - 13, w - 2, 14, '#141414'); R(x + 2, y - 12, w - 4, 12, '#2b3fff'); R(x + 2, y - 12, 1, 12, '#34446e'); R(x + 4, y - 10, w - 7, 1, '#ffd93b'); R(x + 4, y - 8, w - 8, 1, '#ffd93b');
      return;
    }
    R(x - 1, y - n, w + 2, n + 1, '#141414');
    for (let i = 0; i < n; i++) R(x + (i % 3 === 1 ? 1 : 0), y - i, w - (i % 3 === 1 ? 1 : 0), 1, i % 2 ? '#fff7e6' : '#e0d9c8');
    R(x + 2, y - n + 1, w - 5, 1, '#9a917e');
  });
});
q.hooks.roomSpots.push(room => stacks(room).map(({ slug, n, at: [x, y, w] }) => {
  const own = slug === me(), who = nameOf(slug), done = n >= BOOK, h = done ? 14 : n + 1;
  const line = done ? (own ? 'My book. Finished. I will be mentioning it.' : `${who}'s book. Finished. They will be mentioning it.`)
    : own ? `My manuscript. ${n} page${n === 1 ? '' : 's'}, ${BOOK - n} to go. The oaks have the rest.`
    : `${who}'s manuscript. ${n} loose page${n === 1 ? '' : 's'}. Found under the oaks, apparently.`;
  return { name: done ? (own ? 'my book' : `${who}'s book`) : own ? 'my manuscript' : `${who}'s manuscript`, r: [x - 2, y - h - 1, w + 4, h + 4], walk: { x: Math.max(40, Math.min(300, x - 20)), y: 134 }, def: 'read', on: { look: line, read: line } };
}));

/* ---------- how you talk: more like the book with every page ---------- */
function reword(text) {
  const n = mine();
  if (!n || text.length < 8 || /[\]\)]$/.test(text)) return text;
  // one line in five takes each habit, by the line itself, so the same line always comes out the same
  const h = hash(text), k = h % 5;
  if (n >= BOOK) return k === 0 ? text + ' As I say in the book.' : k === 1 ? `${text} (See chapter ${1 + h % 9}.)` : text;
  if (n >= 7) return k === 0 ? text + ' (Me, forthcoming.)' : k === 1 ? text + ' Arguably.' : text;
  if (n >= 4) return k === 1 ? text + ' Arguably.' : k === 2 ? `${text}[${1 + h % n}]` : text;
  return k === 2 ? `${text}[${1 + h % n}]` : text;
}
q.hooks.sayYou.push(reword);

window.questLeaves = { pages, load, reword, state: () => ({ mine: mine(), leaf: leaf ? { x: leaf.x, y: leaf.y } : null }), dropNow: () => { nextAt = 0; drop(performance.now() / 1000 - (G.calm ? 0 : FALL)); return leaf; } };
})();
