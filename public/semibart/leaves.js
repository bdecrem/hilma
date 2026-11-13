/* CASBS Quest, loose leaves and books (2026-11-13). The one thing to collect.
   Everyone at CASBS is supposed to be writing a book. Theirs is already written (books.ts, ahead
   of time, a different funny form for everyone: a Western, a cookbook, terms and conditions), and
   its pages are lying around campus. Now and then a loose leaf falls under an oak; pick it up and
   it is the next page of your book. Read what you have from the stack on your desk. At ten pages
   the book is finished: it stands bound on your desk, anyone who walks in can read it, and you
   can ask Claude on the door frame to change it. Admins can read every book, from every desk.
   The other catch is that you start to talk like an author: footnotes, then hedges, then citing
   yourself, then mentioning the book.
   Server: semibart_pages and semibart_books; GET and POST /api/semibart/pages, GET
   /api/semibart/books/:who (social-handlers.ts). Rides on the game through quest.hooks (mapOver,
   mapSpots, sayYou, roomMid, roomSpots, keyBlock). Loaded by notes.js. */
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
  'A loose page, under the oak. It says it is page one of my book. I have not written a book.',
  'Page two. It is better than page one.',
  'Page three. I would not have gone this way. It is working.',
  'Page four. I keep wanting to read ahead.',
  'Page five. Halfway. I have notes.',
  'Page six. I am starting to take credit for this.',
  'Page seven. My best work.',
  'Page eight. Something is about to happen.',
  'Page nine. One more.',
  'The last page. My book is finished. I wrote it, in a sense.'
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
    if (n === 1) await q.say('you', 'It goes on my desk. I can read it there.');
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
const isAdmin = () => !!(q.me && q.me.role === 'admin');
// what is on each desk: a stack of found pages, the finished book, or (for an admin's eyes only)
// the book nobody has started finding yet, shown faint
const stacks = room => q.occupants(room).map(slug => ({ slug, n: Math.min(BOOK, pages[slug] || 0), at: stackAt(room, slug) })).filter(s => s.at && (s.n > 0 || isAdmin()));
q.hooks.roomMid.push(room => {
  stacks(room).forEach(({ n, at: [x, y, w] }) => {
    if (n === 0) { R(x + 1, y - 2, w - 2, 3, 'rgba(20,20,20,0.35)'); R(x + 2, y - 1, w - 4, 1, 'rgba(43,63,255,0.55)'); return; }
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
  const own = slug === me(), who = nameOf(slug), done = n >= BOOK, h = done ? 14 : Math.max(3, n + 1);
  const name = done ? (own ? 'my book' : `${who}'s book`) : n === 0 ? `${who}'s book, unread` : own ? 'my manuscript' : `${who}'s manuscript`;
  const canRead = own || done || isAdmin();
  const line = done ? (own ? 'My book. Finished. I will be mentioning it.' : `${who}'s book. Finished. They will be mentioning it.`)
    : own ? `My manuscript. ${n} page${n === 1 ? '' : 's'}, ${BOOK - n} to go. The rest are lying around campus.`
    : `${who}'s manuscript. ${n} loose page${n === 1 ? '' : 's'}. Not finished. I should not read it.`;
  return { name, r: [x - 2, y - h - 1, w + 4, h + 4], walk: { x: Math.max(40, Math.min(300, x - 20)), y: 134 }, def: canRead ? 'read' : 'look', on: { look: line, read: canRead ? () => openBook(slug) : line } };
}));

/* ---------- reading a book ----------
   A cream page on the dark, one at a time: the cover, then the pages. Arrows or a click on either
   half to turn, Esc or a click outside to put it down. Pages you have not found yet are blank. */
const css = document.createElement('style');
css.textContent = `
.bk-veil { position: absolute; inset: 0; z-index: 7; display: grid; place-items: center; background: rgba(8, 7, 5, 0.82); }
.bk-page { position: relative; width: 52cqw; height: 47cqw; box-sizing: border-box; padding: 3cqw 3.6cqw 2.4cqw; background: #fff7e6; color: #2a2416; display: flex; flex-direction: column; gap: 1.6cqw; box-shadow: 0.8cqw 0.8cqw 0 #000; cursor: pointer; }
.bk-page.cover { background: #2b3fff; color: #fff7e6; }
.bk-form { color: #ffd93b; font-size: 2.1cqw; letter-spacing: 0.12em; text-transform: uppercase; }
.bk-title { margin: 0; font-weight: 400; font-size: 5cqw; line-height: 0.95; }
.bk-sub { font-size: 2.6cqw; line-height: 1.05; color: #d8dcff; }
.bk-by { margin-top: auto; font-size: 2.4cqw; }
.bk-text { white-space: pre-wrap; font-size: 2.75cqw; line-height: 1.1; }
.bk-page canvas { image-rendering: pixelated; align-self: center; flex: 1 1 auto; min-height: 0; max-width: 100%; object-fit: contain; }
.bk-blank { margin: auto; color: #a39c8c; font-size: 2.5cqw; text-align: center; }
.bk-n { position: absolute; right: 2cqw; bottom: 1.2cqw; font-size: 1.9cqw; color: #9a917e; }
.bk-page.cover .bk-n { color: #9aa2ff; }
`;
document.head.appendChild(css);
let reader = null;
function closeBook() { if (!reader) return; reader.el.remove(); reader = null; const cv = document.getElementById('cv'); cv && cv.focus && cv.focus(); }
function drawArt(art) {
  const c = document.createElement('canvas'), w = Math.max(...art.rows.map(r => r.length)), h = art.rows.length;
  c.width = w; c.height = h; const x = c.getContext('2d');
  art.rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const col = art.palette[r[i]]; if (col) { x.fillStyle = col; x.fillRect(i, j, 1, 1); } } });
  c.style.aspectRatio = w + ' / ' + h; return c;
}
function paint() {
  const { book, i, el } = reader, pg = el.querySelector('.bk-page'), total = book.pages.length;
  pg.className = 'bk-page' + (i === 0 ? ' cover' : ''); pg.textContent = '';
  const add = (cls, text) => { const d = document.createElement('div'); d.className = cls; d.textContent = text; pg.appendChild(d); return d; };
  if (i === 0) {
    add('bk-form', book.form);
    const t = document.createElement('h2'); t.className = 'bk-title'; t.textContent = book.title; pg.appendChild(t);
    if (book.subtitle) add('bk-sub', book.subtitle);
    add('bk-by', 'by ' + nameOf(book.character) + (book.unlocked ? '' : ` · ${book.found} of ${BOOK} pages found`));
  } else {
    const p = book.pages[i - 1];
    if (!p) add('bk-blank', 'A page you have not found yet.');
    else { if (p.art) pg.appendChild(drawArt(p.art)); if (p.text) add('bk-text', p.text); }
  }
  add('bk-n', i === 0 ? '' : `${i} / ${total}`);
}
function turn(d) { if (!reader) return; const n = reader.book.pages.length; reader.i = Math.max(0, Math.min(n, reader.i + d)); paint(); }
async function openBook(slug) {
  closeBook();
  let book = null;
  try { const r = await fetch('/api/semibart/books/' + encodeURIComponent(slug), { credentials: 'same-origin', cache: 'no-store' }); if (r.ok) book = await r.json(); } catch (e) {}
  if (!book) { await q.say('you', 'The pages are stuck together. Later.'); return; }
  const el = document.createElement('div'); el.className = 'bk-veil'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', book.title);
  el.innerHTML = '<div class="bk-page"></div>';
  ['pointerdown', 'pointerup', 'contextmenu', 'wheel', 'mousemove'].forEach(ev => el.addEventListener(ev, e => e.stopPropagation()));
  el.addEventListener('click', e => { e.stopPropagation(); if (e.target === el) return closeBook(); const b = el.querySelector('.bk-page').getBoundingClientRect(); turn(e.clientX < b.left + b.width / 3 ? -1 : 1); });
  document.getElementById('stage').appendChild(el);
  // open at the newest page you have found, or the cover
  const own = slug === me() && !book.unlocked;
  reader = { el, book, i: own && book.found ? book.found : 0 };
  q.SFX.pick(); paint();
}
q.hooks.keyBlock.push(e => {
  if (!reader) return false;
  if (e.key === 'Escape') closeBook(); else if (e.key === 'ArrowRight' || e.key === ' ') turn(1); else if (e.key === 'ArrowLeft') turn(-1);
  return true;
});

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

window.questLeaves = { pages, load, reword, openBook, closeBook, reading: () => (reader ? { who: reader.book.character, i: reader.i } : null), state: () => ({ mine: mine(), leaf: leaf ? { x: leaf.x, y: leaf.y } : null }), dropNow: () => { nextAt = 0; drop(performance.now() / 1000 - (G.calm ? 0 : FALL)); return leaf; } };
})();
