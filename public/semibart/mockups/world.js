/* CASBS Quest, layout mockups (2026-11-11). The live game at /semibart is untouched.

   One campus in five one-screen areas, 320x180 each, joined edge to edge along one walk:
   The Heart (the live map, unchanged but for the walk running out its east side), The Green,
   The Hill, The Pasture and The Grove: 54 studies plus 016. pages.html flips between the
   areas like rooms; glide.html lays them out as one strip and scrolls along it.
   Study numbers and names follow the roster in the big-map commit (8cad014e).
   The pixel helpers and the Heart's art are copied verbatim from public/semibart/index.html. */
(function () {
'use strict';
const W = 320, H = 144, OY = 18, FH = 180;

/* ---------- pixel helpers (verbatim) ---------- */
function rect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function disc(c, cx, cy, r, col) { c.fillStyle = col; for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(r * r - y * y) + 0.5); c.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1); } }
function oval(c, cx, cy, rx, ry, col) { c.fillStyle = col; for (let y = -ry; y <= ry; y++) { const w = Math.floor(rx * Math.sqrt(1 - (y * y) / (ry * ry)) + 0.5); c.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1); } }
function sprite(c, rows, pal, x, y) { x = Math.round(x); y = Math.round(y); for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) { const col = pal[rows[j][i]]; if (col) { c.fillStyle = col; c.fillRect(x + i, y + j, 1, 1); } } }
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const C = {
  grass: '#e6b547', grass2: '#d9a63c', grass3: '#f1c962', path: '#f3e2bd', pathEdge: '#c9a469',
  roof: '#ded3bb', roofLine: '#cdc0a5', fascia: '#6f3a20', wall: '#9a5631', wallLo: '#7d4326', glass: '#5d7f8c', glassHi: '#86a8b4',
  brick: '#c46a4a', brick2: '#ad593c', stone: '#b9b4a8', oak: '#2f6b45', oak2: '#24553a', oak3: '#4a8f5f', trunk: '#5b3a21',
  asphalt: '#7b7771', line: '#f4efe2', shadow: 'rgba(20,20,20,0.2)', ink: '#141414', paper: '#fff7e6', orange: '#ff5a1f', lit: '#ffd96a'
};
const DOORS_TOP = [34, 50, 66], WING_DOORS = [106, 122];
const DOORS_A = [28, 44, 60, 76, 92, 108], DOORS_B = [212, 228, 244, 260, 276, 292], DOORS_C = [114, 130, 146, 174, 190, 206];
function building(m, x, y, w, rh, wh, doors, wide) {
  rect(m, x + 2, y + rh + wh, w, 2, C.shadow);
  rect(m, x, y, w, rh, C.roof);
  for (let i = 4; i < rh - 1; i += 4) rect(m, x + 2, y + i, w - 4, 1, C.roofLine);
  rect(m, x, y, w, 1, C.fascia); rect(m, x, y, 1, rh, C.fascia); rect(m, x + w - 1, y, 1, rh, C.fascia); rect(m, x, y + rh - 1, w, 1, C.fascia);
  rect(m, x, y + rh, w, wh, C.wall);
  for (let i = x + 1; i < x + w; i += 3) rect(m, i, y + rh, 1, wh, C.wallLo);
  rect(m, x, y + rh + wh - 1, w, 1, C.fascia);
  doors.forEach(dx => {
    const half = wide ? 5 : 3;
    rect(m, dx - half, y + rh, half * 2, wh, C.fascia);
    rect(m, dx - half + 1, y + rh + 1, half * 2 - 2, wh - 1, C.glass);
    rect(m, dx - half + 1, y + rh + 1, 1, wh - 1, C.glassHi);
  });
}
function wing(m, x, y, w, h, doorYs, side = -1) {
  rect(m, x + 2, y + 2, w + 2, h + 6, C.shadow);
  rect(m, x, y, w, h, C.roof);
  for (let i = x + 3; i < x + w - 2; i += 4) rect(m, i, y + 2, 1, h - 4, C.roofLine);
  rect(m, x, y, w, 1, C.fascia); rect(m, x, y + h - 1, w, 1, C.fascia); rect(m, x, y, 1, h, C.fascia); rect(m, x + w - 1, y, 1, h, C.fascia);
  rect(m, x, y + h, w, 5, C.wall); for (let i = x + 1; i < x + w; i += 3) rect(m, i, y + h, 1, 5, C.wallLo); rect(m, x, y + h + 4, w, 1, C.fascia);
  const sx = side < 0 ? x - 4 : x + w, gx = side < 0 ? sx + 1 : sx;
  rect(m, sx, y + 1, 4, h + 3, C.wall); rect(m, side < 0 ? sx : sx + 3, y + 1, 1, h + 3, C.fascia);
  doorYs.forEach(dy => { rect(m, sx, dy - 3, 4, 7, C.fascia); rect(m, gx, dy - 2, 3, 5, C.glass); rect(m, gx, dy - 2, 3, 1, C.glassHi); });
}
function litDoor(m, dx, top, h) {
  rect(m, dx - 2, top, 4, h, C.lit); rect(m, dx - 2, top, 1, h, '#fff3c4');
  oval(m, dx, top + h + 3, 6, 2, 'rgba(255,217,106,0.35)');
}
function oak(m, x, y, r) { oval(m, x + 1, y + r + 2, r, 2, C.shadow); rect(m, x - 1, y + r - 2, 2, 5, C.trunk); disc(m, x, y, r, C.oak2); disc(m, x - 1, y - 1, r - 1, C.oak); disc(m, x - Math.round(r / 3), y - Math.round(r / 3), Math.max(1, Math.round(r / 3)), C.oak3); }
function car(m, x, y, col) { rect(m, x, y, 10, 15, C.ink); rect(m, x + 1, y + 1, 8, 13, col); rect(m, x + 2, y + 3, 6, 3, C.glassHi); rect(m, x + 2, y + 10, 6, 2, C.glassHi); }
function turkey(m, x, y) {
  sprite(m, ['..kTk........', '.kTtTk.......', 'kTtktTk...HH.', 'TtkBBBBB.HHEb', 'kBBBBBBBBRHH.', '.BBBBBBBBRR..', '..BBBBBBBR...', '...BBBBBB....', '....L..L.....', '...LL.LL.....'],
    { k: C.ink, T: '#e0892e', t: '#9a5326', B: '#4e3322', H: '#c7d3de', E: C.ink, b: '#e8b13a', R: '#d6402e', L: '#e8a33a' }, x, y);
}
const TINY = [['.HHH.', 'HSSS.', '.SSS.', 'OOOOO', '.OOO.', '.OOO.', '.P.P.', '.P.P.', '.K.K.'], ['.HHH.', 'HSSS.', '.SSS.', 'OOOOO', '.OOO.', '.OOO.', '..PP.', '.P.P.', 'K..K.']];
const TPAL = { H: '#3b2416', S: '#e8b08f', O: '#e8743b', P: '#2a2f55', K: '#141414' };

/* ---------- new pieces for the four new areas ---------- */
function stamp(m, s, h, col) { const n = Math.max(1, Math.ceil(Math.hypot(s[2] - s[0], s[3] - s[1]))); for (let i = 0; i <= n; i++) rect(m, s[0] + (s[2] - s[0]) * i / n - h, s[1] + (s[3] - s[1]) * i / n - h, h * 2, h * 2, col); }
// walks: all the edges first, then all the gravel, so crossings join cleanly (same widths as the live map)
function paths(m, segs) { segs.forEach(s => stamp(m, s, 4, C.pathEdge)); segs.forEach(s => stamp(m, s, 3, C.path)); }
function ground(m, seed, n) { const r = rng(seed); rect(m, 0, 0, W, FH, C.grass); for (let i = 0; i < n; i++) rect(m, r() * W, r() * FH, 2, 1, r() < 0.6 ? C.grass2 : C.grass3); return r; }
function poppies(m, r, x, y, w, h, n) { for (let i = 0; i < n; i++) rect(m, x + r() * w, y + r() * h, 2, 2, C.orange); }
// a row whose doors each say whether they are wide (the library's double door)
function hall(m, x, y, w, rh, wh, doors) {
  building(m, x, y, w, rh, wh, []);
  doors.forEach(d => { const half = d.wide ? 5 : 3; rect(m, d.x - half, y + rh, half * 2, wh, C.fascia); rect(m, d.x - half + 1, y + rh + 1, half * 2 - 2, wh - 1, C.glass); rect(m, d.x - half + 1, y + rh + 1, 1, wh - 1, C.glassHi); });
}
function litWing(m, x, w, side, dy) { const sx = side < 0 ? x - 4 : x + w, gx = side < 0 ? sx + 1 : sx; rect(m, gx, dy - 2, 3, 5, C.lit); rect(m, gx, dy - 2, 3, 1, '#fff3c4'); }
// eucalyptus: a pale peeling trunk under a tall grey-green crown
function euc(m, x, y, s) {
  oval(m, x + 3, y + 1, 6, 2, C.shadow);
  rect(m, x - 1, y - s, 3, s + 1, '#efe7d6'); rect(m, x + 1, y - s, 1, s + 1, '#cfc4ac'); rect(m, x - 1, y - Math.round(s / 2), 1, 2, '#b8ab8f');
  const cy = y - s - 4;
  oval(m, x + 1, cy + 1, 6, 8, '#3f5e48'); oval(m, x, cy, 5, 7, '#56775c'); oval(m, x - 2, cy - 3, 3, 4, '#6f9274');
  rect(m, x - 3, cy - 6, 2, 1, '#9ab89a'); rect(m, x + 2, cy + 2, 1, 2, '#9ab89a'); rect(m, x - 4, cy + 3, 1, 1, '#9ab89a');
}
function bench(m, x, y) { oval(m, x + 6, y + 7, 7, 1, C.shadow); rect(m, x, y, 12, 2, '#7d5632'); rect(m, x - 1, y + 2, 14, 4, C.ink); rect(m, x, y + 3, 12, 2, '#b07a45'); rect(m, x + 1, y + 6, 1, 1, C.ink); rect(m, x + 10, y + 6, 1, 1, C.ink); }
function umbrella(m, x, y, col) { oval(m, x + 1, y + 5, 5, 1, C.shadow); disc(m, x, y, 4, C.ink); disc(m, x, y, 3, col); rect(m, x, y, 1, 1, C.paper); }
function hay(m, x, y) { oval(m, x + 1, y + 6, 6, 2, C.shadow); disc(m, x, y, 5, '#8e6c22'); disc(m, x, y, 4, '#e0bd57'); disc(m, x, y, 2, '#c9a240'); rect(m, x, y, 1, 1, '#8e6c22'); rect(m, x - 3, y - 1, 1, 1, '#f1d98a'); }
function trough(m, x, y) { oval(m, x + 8, y + 7, 9, 2, C.shadow); rect(m, x, y, 16, 6, C.ink); rect(m, x + 1, y + 1, 14, 4, '#9aa3a8'); rect(m, x + 2, y + 2, 12, 2, '#5d8fb0'); rect(m, x + 3, y + 2, 4, 1, '#9cc6de'); }
function table(m, x, y) { oval(m, x + 5, y + 8, 6, 1, C.shadow); rect(m, x - 1, y - 1, 12, 8, C.ink); rect(m, x, y, 10, 6, '#b07a45'); rect(m, x, y + 4, 10, 1, '#9c6a3c'); rect(m, x + 2, y + 1, 3, 2, C.paper); }
function court(m, x, y, w, h) {
  rect(m, x - 4, y - 4, w + 8, h + 8, '#4f7d4f'); rect(m, x - 4, y - 4, w + 8, 1, '#3f6a40');
  rect(m, x, y, w, h, '#3f7392');
  const L = '#f4efe2', mid = y + Math.floor(h / 2), k = 11, cx = x + Math.floor(w / 2);
  rect(m, x, y, w, 1, L); rect(m, x, y + h - 1, w, 1, L); rect(m, x, y, 1, h, L); rect(m, x + w - 1, y, 1, h, L);
  rect(m, x, mid - k, w, 1, L); rect(m, x, mid + k, w, 1, L);
  rect(m, cx, y, 1, mid - k - y, L); rect(m, cx, mid + k, 1, y + h - mid - k, L);
  rect(m, x - 2, mid + 1, w + 4, 1, 'rgba(20,20,20,0.3)');
  rect(m, x - 3, mid, w + 6, 1, C.ink); rect(m, x - 2, mid - 1, w + 4, 1, '#e8e2d2');
  rect(m, x - 3, mid - 2, 1, 3, C.ink); rect(m, x + w + 2, mid - 2, 1, 3, C.ink);
}
function fence(m, x, y, w, h, gate) {
  const rail = 'rgba(91,58,33,0.55)';
  rect(m, x, y, w, 1, rail); rect(m, x, y, 1, h, rail); rect(m, x + w - 1, y, 1, h, rail);
  rect(m, x, y + h - 1, gate[0] - x, 1, rail); rect(m, gate[1], y + h - 1, x + w - gate[1], 1, rail);
  const post = (px, py) => { rect(m, px - 1, py - 2, 2, 3, C.trunk); rect(m, px - 1, py - 2, 2, 1, '#8a5a34'); };
  for (let i = x; i <= x + w; i += 8) { post(i, y); if (i < gate[0] - 1 || i > gate[1]) post(i, y + h - 1); }
  for (let j = y + 8; j < y + h - 2; j += 8) { post(x, j); post(x + w - 1, j); }
  post(gate[0] - 1, y + h - 1); post(gate[1] + 1, y + h - 1);
}

/* ---------- who is where (the roster from the big-map commit) ---------- */
const WHO = {
  1: 'Daniel', 2: 'Kah-Wee', 4: 'Mary Helen', 5: 'Luke', 6: 'Lewis', 7: 'Lawrence', 8: 'Brooke', 9: 'Katharyne', 10: 'Frances',
  11: 'James', 12: 'Fred', 13: 'John', 14: 'Garance', 15: 'Graeme', 16: 'Bart', 21: 'Mike', 22: 'Manny', 24: 'Sejung', 25: 'Bruce',
  27: 'Kevin, Raul, Mikael', 28: 'Jacqueline, Jūratė', 29: 'Ian, Ishara', 30: 'Juliana', 31: 'Inbal', 32: 'Milena', 33: 'T.L.', 34: 'Eli',
  35: 'Summerson', 36: 'Alison', 37: 'Salman', 38: 'June', 39: 'Lynda', 40: 'Robert', 41: 'Ralph', 42: 'Dessislava', 43: 'Joseph',
  44: 'Forrest', 45: 'Jamie', 46: 'Kepa', 47: 'Henry', 48: 'Corey', 49: 'Lana', 50: 'Shigehiro', 51: 'Andrius', 52: 'Bryn',
  53: 'Brian', 54: 'Heeju', '016': 'Toussaint, Matthew'
};
const NOTES = ['At lunch. Lunch is sacred.', 'Thinking under the oak.', 'Back in five. Five what, unclear.', 'In a seminar. Possibly this one.',
  'Walking to the Dish. Not listening to it.', 'Writing. Do not knock. (You knocked.)', 'On a call with a different time zone.',
  'In the library. The book is long.', 'Napping counts as fieldwork.', 'Gone to see the turkeys. For research.', 'Back after this paragraph.'];
function door(n, r, lit) {
  const who = WHO[n] || '', k = typeof n === 'number' ? n : 16;
  return { n, r, lit: !!lit, name: 'Study ' + n + (who ? ' · ' + who : ''),
    look: 'Study ' + n + (who ? ', ' + who : '') + '. ' + (lit ? "The light's on." : 'Dark. A note: "' + NOTES[k % NOTES.length] + '"') };
}
const spot = (name, r, look) => ({ name, r, look });

/* ---------- live helpers for animation ---------- */
function glowAt(g, t, pts) { const a = 0.28 + 0.2 * Math.sin(t * 2.2); pts.forEach(([x, y, rx, ry], i) => oval(g, x, y, rx || 8, ry || 3, 'rgba(255,217,106,' + (a + 0.04 * Math.sin(t * 3.1 + i)).toFixed(3) + ')')); }
function butterfly(g, t, cx, cy, ax, ay, p, c) {
  const x = Math.round(cx + ax * Math.sin(t * 0.6 + p) + 3 * Math.sin(t * 2.3 + p)), y = Math.round(cy + ay * Math.sin(t * 0.47 + p * 2) + 2 * Math.sin(t * 3.7));
  if (Math.floor(t * 9 + p) % 2) { rect(g, x - 2, y - 1, 2, 2, c); rect(g, x + 1, y - 1, 2, 2, c); } else { rect(g, x - 1, y - 3, 1, 3, c); rect(g, x + 1, y - 3, 1, 3, c); }
  rect(g, x, y - 1, 1, 2, C.ink);
}
function turkeys(g, t, list, calm, wander) {
  list.forEach(([x, y], i) => {
    const dx = wander && !calm ? Math.round(wander * Math.sin(t * 0.21 + i * 1.9)) : 0;
    const peck = !calm && Math.floor(t * 1.3 + i * 2.7) % 6 === 0 ? -1 : 0;
    oval(g, x + dx + 6, y + 10, 5, 1, C.shadow); turkey(g, x + dx, y + peck);
  });
}
function drifting(g, t, fx, src, life, fall) { // leaves falling from a crown
  fx.t -= 1 / 60; if (fx.t <= 0) { fx.t = 1.6 + Math.random() * 2.4; const s = src[Math.floor(Math.random() * src.length)]; fx.list.push({ x: s[0] + Math.random() * 10 - 5, y: s[1], a: 0, p: Math.random() * 6, c: s[2] }); }
  fx.list = fx.list.filter(l => (l.a += 1 / 60) < life);
  fx.list.forEach(l => rect(g, l.x + Math.sin(l.a * 3 + l.p) * 3, l.y + l.a * fall, 2, 1, l.c));
}

/* ---------- 1. The Heart: the live map ---------- */
function paintHeart(m) {
  { // mapFull, verbatim
    const r = rng(91);
    rect(m, 0, 0, W, FH, C.grass);
    for (let i = 0; i < 120; i++) { const y = r() < 0.5 ? r() * OY : FH - OY + r() * OY; rect(m, r() * W, y, 2, 1, r() < 0.6 ? C.grass2 : C.grass3); }
    m.save(); m.translate(0, OY);
    { // mapBg, verbatim
      const r = rng(7);
      rect(m, 0, 0, W, H, C.grass);
      for (let i = 0; i < 360; i++) rect(m, r() * W, r() * H, 2, 1, r() < 0.6 ? C.grass2 : C.grass3);
      const paths = [[60, 64, 60, 132], [10, 64, 304, 64], [240, 64, 240, 132], [50, 132, 292, 132], [160, 38, 160, 64], [140, 38, 140, 64], [180, 38, 180, 64], [10, 9, 82, 9], [10, 9, 10, 64], [292, 100, 292, 132]];
      DOORS_TOP.forEach(x => paths.push([x, 2, x, 9]));
      DOORS_A.concat(DOORS_B).forEach(x => paths.push([x, 54, x, 64]));
      DOORS_C.forEach(x => paths.push([x, 122, x, 132]));
      const box = (p, pad) => [Math.min(p[0], p[2]) - pad, Math.min(p[1], p[3]) - pad, Math.abs(p[2] - p[0]) + pad * 2, Math.abs(p[3] - p[1]) + pad * 2];
      paths.forEach(p => { const b = box(p, 4); rect(m, b[0], b[1], b[2], b[3], C.pathEdge); });
      paths.forEach(p => { const b = box(p, 3); rect(m, b[0], b[1], b[2], b[3], C.path); });
      rect(m, 117, 68, 86, 27, C.stone); rect(m, 118, 69, 84, 25, C.brick);
      for (let y = 69; y < 94; y += 2) for (let x = 118 + (((y - 69) / 2) % 2) * 2; x < 202; x += 4) rect(m, x, y, 1, 1, C.brick2);
      rect(m, 150, 68, 20, 1, C.brick); rect(m, 150, 94, 20, 1, C.brick);
      building(m, 16, 30, 100, 16, 8, DOORS_A);
      building(m, 204, 30, 100, 16, 8, DOORS_B);
      building(m, 128, 8, 64, 20, 10, [160], true);
      [140, 180].forEach(dx => { rect(m, dx - 3, 28, 6, 10, C.fascia); rect(m, dx - 2, 29, 4, 9, C.glass); rect(m, dx - 2, 29, 1, 9, C.glassHi); });
      building(m, 100, 98, 120, 16, 8, DOORS_C);
      litDoor(m, 180, 29, 9); litDoor(m, 292, 47, 7); litDoor(m, 276, 47, 7); litDoor(m, 76, 47, 7); litDoor(m, 114, 115, 7); litDoor(m, 130, 115, 7);
      oak(m, 160, 79, 8);
      rect(m, 108, 77, 10, 7, C.path); rect(m, 108, 77, 10, 1, C.pathEdge); rect(m, 108, 83, 10, 1, C.pathEdge);
      wing(m, 82, 68, 22, 22, [80], 1);
      {
        const STAR = ['...X...', '...X...', '..XXX..', 'XXXXXXX', '.XXXXX.', '..XXX..', '.XX.XX.', '.X...X.'];
        [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([ox, oy]) => sprite(m, STAR, { X: C.ink }, 90 + ox, 75 + oy));
        sprite(m, STAR, { X: '#ffd93b' }, 90, 75); rect(m, 92, 78, 1, 1, '#fff3c4');
      }
      rect(m, 4, 98, 46, 42, C.ink); rect(m, 5, 99, 44, 40, C.asphalt);
      [19, 33].forEach(x => rect(m, x, 100, 1, 18, C.line));
      car(m, 7, 102, '#2b3fff'); car(m, 21, 102, '#ff9ccf'); car(m, 35, 102, '#fff7e6');
      oval(m, 224, 22, 10, 3, C.shadow); rect(m, 221, 14, 1, 8, C.ink); rect(m, 227, 14, 1, 8, C.ink);
      oval(m, 224, 11, 8, 4, C.ink); oval(m, 224, 11, 7, 3, '#fffaf0'); rect(m, 224, 5, 1, 6, C.ink);
      [[100, 14, 5], [308, 82, 7], [22, 82, 6], [82, 116, 5], [118, 6, 4]].forEach(o => oak(m, o[0], o[1], o[2]));
      for (let i = 0; i < 26; i++) rect(m, 250 + r() * 66, 90 + r() * 46, 2, 2, C.orange);
      wing(m, 300, 96, 12, 36, WING_DOORS);
      rect(m, 297, 120, 3, 5, '#6b8c78'); rect(m, 297, 120, 3, 1, '#93b39f');
      rect(m, 204, 115, 4, 7, '#6b8c78'); rect(m, 204, 115, 1, 7, '#93b39f');
      [[124, 75], [180, 75]].forEach(([x, y]) => {
        oval(m, x + 8, y + 13, 9, 2, C.shadow);
        rect(m, x, y, 16, 2, '#7d5632'); rect(m, x, y + 10, 16, 2, '#7d5632');
        rect(m, x - 1, y + 3, 18, 6, C.ink); rect(m, x, y + 4, 16, 4, '#b07a45'); rect(m, x, y + 6, 16, 1, '#9c6a3c');
      });
      rect(m, 196, 22, 1, 20, C.ink);
      // mockup only: the main walk runs on out the east side, to The Green
      rect(m, 300, 60, 20, 1, C.pathEdge); rect(m, 300, 67, 20, 1, C.pathEdge); rect(m, 300, 61, 20, 6, C.path);
    }
    m.restore();
    building(m, 22, 2, 56, 12, 7, DOORS_TOP);
    litDoor(m, 34, 15, 6);
    rect(m, 48, 15, 4, 6, '#6b8c78'); rect(m, 48, 15, 1, 6, '#93b39f');
    rect(m, 55, 22, 3, 3, '#d8e84a'); rect(m, 55, 22, 3, 1, '#eef59a'); rect(m, 56, 23, 1, 1, '#9aa830');
    [[256, 6, 5], [300, 10, 6], [96, 170, 6], [180, 172, 5], [250, 168, 6], [30, 170, 5]].forEach(o => oak(m, o[0], o[1], o[2]));
    for (let i = 0; i < 14; i++) rect(m, 120 + r() * 120, 164 + r() * 14, 2, 2, C.orange);
  }
}
const heartFX = { list: [], t: 1 };
const HEART = {
  key: 'heart', name: 'The Heart', nums: '1 · 2 · 4 · 8 · 10 · 13–16 · 25 · 28 · 29 · 43–45',
  blurb: 'The lounge, the meeting room, the oak courtyard and the Dish.',
  paint: paintHeart,
  route: [[0, 82], [320, 82]], anchor: [160, 82], label: [160, 8],
  under(g, t, dt, calm) {
    g.save(); g.translate(0, OY);
    const wave = calm ? 0 : Math.round(Math.sin(t * 5));
    rect(g, 197, 22, 8, 5, C.ink); rect(g, 197, 23, 7, 3, C.orange); rect(g, 201, 23 + wave, 3, 3, C.orange);
    if (!calm) glowAt(g, t, [[180, 42], [292, 58], [276, 58], [76, 58], [114, 126], [130, 126], [34, 7]]);
    g.restore();
  },
  over(g, t, dt, calm) {
    g.save(); g.translate(0, OY);
    turkeys(g, t, [[256, 98], [266, 116], [22, 124]], calm, 0);
    if (!calm) {
      if (Math.floor(t * 0.9) % 2 === 0) { oval(g, 224, 4, 4, 3, 'rgba(255,59,47,0.4)'); rect(g, 223, 3, 2, 2, '#ff3b2f'); }
      const ph = t % 3.4;
      if (ph < 0.4) { const c = ph < 0.2 ? '#ffffff' : '#fff3c4'; rect(g, 92, 75, 9, 1, c); rect(g, 96, 71, 1, 9, c); rect(g, 95, 74, 3, 3, c); }
      butterfly(g, t, 44, 92, 18, 9, 0, '#fffaf0'); butterfly(g, t, 214, 104, 12, 7, 2.1, '#ffd93b');
      drifting(g, t, heartFX, [[160, 74, C.oak3], [160, 74, '#d9b44a']], 2.6, 7);
    }
    g.restore();
  },
  spots: [
    door(1, [106, 116, 16, 26], 1), door(2, [122, 116, 16, 26], 1), door(4, [182, 116, 16, 26]), door(8, [36, 48, 16, 26]),
    door(10, [68, 48, 16, 26], 1), door(16, [172, 40, 16, 18], 1), door(25, [220, 48, 16, 26]), door(28, [268, 48, 16, 26], 1),
    door(29, [284, 48, 16, 26], 1), door(43, [26, 2, 16, 20], 1), door(44, [42, 2, 16, 20]), door(45, [58, 2, 16, 20]),
    door(13, [294, 116, 20, 16]), door(14, [294, 132, 20, 16]),
    spot('cafeteria', [198, 116, 16, 26], 'A long sign on the door. The cafeteria has been dissolved.'),
    spot('main hall', [128, 26, 64, 30], 'The main hall. Lounge, mailboxes, coffee.'),
    spot('meeting room', [80, 84, 30, 30], 'The meeting room. Seminars happen in there.'),
    spot('courtyard oak', [148, 86, 24, 24], 'A big oak in a brick courtyard. Good for thinking under.'),
    spot('the Dish', [212, 20, 24, 22], "The Dish. It's listening to space."),
    spot('turkey', [252, 112, 30, 34], 'Wild turkeys. They run this part of campus.'),
    spot('parking lot', [4, 116, 46, 42], 'Three cars. Nobody biked today.')
  ]
};

/* ---------- 2. The Green: two wings face a striped lawn with a pickleball court ---------- */
const GREEN = {
  key: 'green', name: 'The Green', nums: '17–24 · 26 · 27',
  blurb: 'Two wings face a striped lawn. Court three is in the middle.',
  route: [[0, 82], [116, 82], [116, 30], [204, 30], [204, 82], [320, 82]], anchor: [160, 30], label: [52, 63],
  paint(m) {
    const r = ground(m, 21, 470);
    paths(m, [[-8, 82, 116, 82], [204, 82, 328, 82], [116, 30, 204, 30], [116, 150, 204, 150], [116, 30, 116, 150], [204, 30, 204, 150],
      [148, 23, 148, 30], [172, 23, 172, 30], [160, 150, 160, 158]]);
    // the lawn, mowed in stripes
    rect(m, 121, 35, 78, 110, '#5f8a3e');
    for (let y = 36; y < 144; y += 8) { rect(m, 122, y, 76, Math.min(4, 144 - y), '#86b056'); if (y + 4 < 144) rect(m, 122, y + 4, 76, Math.min(4, 140 - y), '#7aa34d'); }
    court(m, 142, 58, 36, 64);
    // the terrace with umbrellas, where lunch went after the cafeteria
    rect(m, 127, 157, 66, 21, C.pathEdge); rect(m, 128, 158, 64, 19, C.path);
    for (let x = 131; x < 190; x += 6) rect(m, x, 158, 1, 19, '#eadab2');
    umbrella(m, 142, 166, '#ff9ccf'); umbrella(m, 160, 170, '#2b3fff'); umbrella(m, 178, 165, '#ffd93b');
    // the cottage (26, 27) and the four short wings: the walk passes between each pair
    building(m, 136, 4, 48, 12, 7, [148, 172]);
    litDoor(m, 172, 17, 6);
    wing(m, 96, 36, 12, 34, [46, 62], 1); wing(m, 96, 92, 12, 38, [104, 120], 1);
    wing(m, 212, 36, 12, 34, [46, 62], -1); wing(m, 212, 92, 12, 38, [104, 120], -1);
    litWing(m, 212, 12, -1, 62);
    [[30, 40, 7], [62, 20, 5], [40, 132, 6], [74, 154, 5], [20, 160, 5], [92, 168, 4], [286, 36, 6], [262, 18, 5], [276, 134, 7], [300, 160, 5], [244, 162, 4]].forEach(o => oak(m, o[0], o[1], o[2]));
    bench(m, 34, 98); bench(m, 262, 98);
    poppies(m, r, 8, 100, 80, 70, 12); poppies(m, r, 232, 96, 80, 70, 14);
  },
  under(g, t, dt, calm) { if (!calm) glowAt(g, t, [[205, 62, 3, 4], [172, 24, 6, 2]]); },
  over(g, t, dt, calm) {
    // a rally on court three: the ball goes back and forth, the players shuffle after it
    const TOP = 66, BOT = 116, per = 1.15, k = calm ? 0.4 : t / per, n = Math.floor(k), f = k - n, down = n % 2 === 0;
    const xs = i => 160 + 10 * Math.sin(i * 2.3);
    const bx = xs(n) + (xs(n + 1) - xs(n)) * f, by = down ? TOP + (BOT - TOP) * f : BOT - (BOT - TOP) * f, hgt = Math.sin(f * Math.PI) * 9;
    const u = (by - TOP) / (BOT - TOP), p1 = 160 + (bx - 160) * (1 - u), p2 = 160 + (bx - 160) * u, fr = calm ? 0 : Math.floor(t * 6) % 2;
    oval(g, p1, 65, 3, 1, C.shadow); sprite(g, TINY[fr], { H: '#3b2416', S: '#c98d6c', O: '#d8e84a', P: '#2a2f55', K: C.ink }, p1 - 2, 57);
    oval(g, p2, 121, 3, 1, C.shadow); sprite(g, TINY[1 - fr], { H: '#e2b23c', S: '#e8b08f', O: '#ff9ccf', P: '#fff7e6', K: C.ink }, p2 - 2, 113);
    rect(g, bx - 1, by, 2, 1, 'rgba(20,20,20,0.35)'); rect(g, bx - 1, by - 1 - hgt, 2, 2, '#e4f05a'); rect(g, bx - 1, by - 1 - hgt, 1, 1, '#fbffc8');
    if (!calm) { butterfly(g, t, 60, 110, 16, 8, 1.3, '#fffaf0'); butterfly(g, t, 250, 120, 10, 6, 3.1, '#ff9ccf'); }
  },
  spots: [
    door(17, [100, 39, 16, 14]), door(18, [100, 55, 16, 14]), door(19, [100, 97, 16, 14]), door(20, [100, 113, 16, 14]),
    door(21, [204, 39, 16, 14]), door(22, [204, 55, 16, 14], 1), door(23, [204, 97, 16, 14]), door(24, [204, 113, 16, 14]),
    door(26, [140, 4, 16, 20]), door(27, [164, 4, 16, 20], 1),
    spot('pickleball court', [138, 54, 44, 72], 'Court three. The one that "ran long."'),
    spot('the Green', [121, 35, 78, 110], 'The Green. Mowed in stripes. Nobody knows who mows it.'),
    spot('the terrace', [127, 157, 66, 21], 'The terrace. Lunch moved out here after the cafeteria was dissolved.')
  ]
};

/* ---------- 3. The Hill: two terraces up the slope and a switchback between them ---------- */
const HILL_UP1 = [136, 152, 168, 184, 200], HILL_UP2 = [234, 250, 266, 282], HILL_LOW = [36, 52, 68, 84, 100];
const HILL = {
  key: 'hill', name: 'The Hill', nums: '38–42 · 46–54',
  blurb: 'Two terraces up the slope. A switchback, a bench, a kite.',
  route: [[0, 82], [132, 82], [200, 66], [140, 48], [196, 30], [312, 30], [312, 82], [320, 82]], anchor: [230, 30], label: [62, 64],
  paint(m) {
    const r = ground(m, 33, 470);
    // the slope: contour lines, closer together toward the top
    for (let k = 0; k < 6; k++) { const base = 6 + k * 12; for (let x = 0; x < W; x++) { const y = Math.round(base + 4 * Math.sin(x / 41 + k * 1.7) + 2 * Math.sin(x / 13 + k)); rect(m, x, y, 1, 1, k % 2 ? C.grass2 : '#d39a35'); } }
    paths(m, [[-8, 82, 132, 82], [132, 82, 200, 66], [200, 66, 140, 48], [140, 48, 196, 30], [124, 30, 312, 30], [312, 30, 312, 82], [312, 82, 328, 82],
      [116, 82, 116, 126], [20, 126, 116, 126]].concat(HILL_UP1.concat(HILL_UP2).map(d => [d, 21, d, 30]), HILL_LOW.map(d => [d, 118, d, 126])));
    building(m, 128, 2, 82, 12, 7, HILL_UP1); building(m, 226, 2, 66, 12, 7, HILL_UP2);
    litDoor(m, 152, 15, 6); litDoor(m, 250, 15, 6);
    building(m, 26, 96, 84, 14, 8, HILL_LOW); litDoor(m, 68, 111, 7);
    [[218, 8, 5], [18, 22, 6], [66, 30, 7], [100, 56, 5], [168, 120, 8], [214, 148, 6], [252, 108, 7], [292, 132, 6], [150, 162, 5], [276, 166, 5],
     [200, 98, 4], [14, 152, 6], [62, 160, 5], [106, 150, 6]].forEach(o => oak(m, o[0], o[1], o[2]));
    bench(m, 22, 48);
    poppies(m, r, 130, 96, 180, 80, 30); poppies(m, r, 4, 136, 116, 40, 8);
  },
  under(g, t, dt, calm) { if (!calm) glowAt(g, t, [[152, 22], [250, 22], [68, 119]]); },
  over(g, t, dt, calm) {
    // someone on the bench flying a kite
    const kx = Math.round(56 + (calm ? 0 : 5 * Math.sin(t * 0.8))), ky = Math.round(10 + (calm ? 0 : 3 * Math.sin(t * 1.3)));
    oval(g, 29, 52, 3, 1, C.shadow); sprite(g, TINY[0].slice(0, 6), { H: '#3b2416', S: '#e8b08f', O: '#3d3bff', P: '#2a2f55', K: C.ink }, 26, 43);
    for (let i = 1; i < 14; i++) { const k = i / 14; rect(g, 30 + (kx - 30) * k, 44 + (ky + 4 - 44) * k + Math.sin(k * Math.PI) * 4, 1, 1, 'rgba(20,20,20,0.45)'); }
    sprite(g, ['...k...', '..kRk..', '.kRRYk.', 'kRRYYYk', '.kYYYk.', '..kYk..', '...k...'], { k: C.ink, R: '#ff4b1f', Y: '#ffc31f' }, kx - 3, ky - 3);
    for (let i = 0; i < 3; i++) rect(g, kx + Math.round(Math.sin(t * 3 + i) * 1.5), ky + 5 + i * 3, 2, 1, i % 2 ? '#3d3bff' : '#ff4b1f');
    turkeys(g, t, [[226, 150], [246, 160]], calm, 0);
    if (!calm) butterfly(g, t, 190, 140, 14, 8, 0.7, '#fffaf0');
  },
  spots: [
    ...HILL_UP1.map((d, i) => door(46 + i, [d - 8, 2, 16, 22], d === 152)), ...HILL_UP2.map((d, i) => door(51 + i, [d - 8, 2, 16, 22], d === 250)),
    ...HILL_LOW.map((d, i) => door(38 + i, [d - 8, 96, 16, 24], d === 68)),
    spot('the bench', [16, 38, 28, 20], 'Someone flying a kite from the bench. They say it is research.'),
    spot('the switchback', [128, 40, 80, 48], 'The switchback. Faster than it looks. Slower than it feels.'),
    spot('turkey', [222, 146, 40, 26], 'Two turkeys. Uphill turkeys. Different crowd.')
  ]
};

/* ---------- 4. The Pasture: one long wing along a fenced field ---------- */
const PAST_DOORS = [22, 38, 54, 70, 94, 110, 126, 142];
const PASTURE = {
  key: 'pasture', name: 'The Pasture', nums: '30–37',
  blurb: 'One long wing along the turkeys’ field and its lone oak.',
  route: [[0, 82], [64, 82], [64, 166], [320, 166]], anchor: [64, 118], label: [222, 26],
  paint(m) {
    const r = ground(m, 47, 470);
    // the field: tufts, poppies, a worn track from the gate
    for (let i = 0; i < 160; i++) rect(m, 104 + r() * 202, 16 + r() * 130, 1, 2, r() < 0.5 ? '#d39a35' : '#c98f2e');
    poppies(m, r, 104, 16, 202, 130, 44);
    paths(m, [[-8, 82, 64, 82], [64, 10, 64, 166], [64, 166, 328, 166]]);
    for (let y = 120; y < 160; y += 2) { const w = 3 + (y > 150 ? 2 : 0); rect(m, 199 - (w >> 1) + Math.round(Math.sin(y / 9) * 2), y, w, 2, '#e3c88f'); }
    fence(m, 100, 12, 212, 140, [194, 206]);
    wing(m, 72, 12, 12, 138, PAST_DOORS, -1);
    litWing(m, 72, 12, -1, 38); litWing(m, 72, 12, -1, 110);
    oak(m, 206, 74, 10);
    hay(m, 148, 40); hay(m, 162, 46); hay(m, 270, 124); trough(m, 252, 34);
    [[30, 30, 6], [18, 58, 5], [24, 124, 7], [36, 150, 5], [120, 176, 4], [262, 177, 4], [300, 176, 4]].forEach(o => oak(m, o[0], o[1], o[2]));
  },
  under(g, t, dt, calm) { if (!calm) glowAt(g, t, [[66, 38, 3, 4], [66, 110, 3, 4]]); },
  over(g, t, dt, calm) {
    turkeys(g, t, [[128, 92], [150, 112], [236, 62], [270, 92], [176, 128]], calm, 8);
    if (!calm) { butterfly(g, t, 150, 70, 20, 10, 0.4, '#fffaf0'); butterfly(g, t, 280, 140, 12, 7, 2.6, '#ffd93b'); }
  },
  spots: [
    ...PAST_DOORS.map((dy, i) => door(30 + i, [64, dy - 7, 14, 14], i === 1 || i === 5)),
    spot('the lone oak', [194, 60, 26, 30], 'The lone oak. Older than the Center. Older than the turkeys, probably.'),
    spot('hay', [140, 32, 30, 22], 'Hay. Nobody here has a horse. Nobody asks.'),
    spot('trough', [250, 32, 20, 10], 'A water trough. For the turkeys, officially.'),
    spot('the pasture', [100, 12, 212, 140], 'The pasture. The turkeys let us walk through.')
  ]
};

/* ---------- 5. The Grove: the library under the eucalyptus ---------- */
const GROVE_ROW = [70, 86, 102, 118, 134], GROVE_ROW_N = [7, 9, 11, 12, 15], GROVE_WING = [42, 58, 74], GROVE_WING_N = [3, 5, 6];
const groveFX = { list: [], t: 1 };
const GROVE = {
  key: 'grove', name: 'The Grove', nums: '3 · 5–7 · 9 · 11 · 12 · 15 · 016',
  blurb: 'The library and its reading terrace, under the eucalyptus.',
  route: [[0, 166], [228, 166], [228, 50], [40, 50]], anchor: [120, 50], label: [128, 66],
  paint(m) {
    const r = ground(m, 59, 420);
    for (let i = 0; i < 220; i++) { const x = r() * W, y = r() * FH; if (x > 236 || y < 46 || x < 34) rect(m, x, y, 2, 1, r() < 0.5 ? '#c9a469' : '#b89a5a'); }
    paths(m, [[-8, 166, 228, 166], [40, 50, 40, 166], [40, 50, 228, 50], [228, 26, 228, 166], [150, 140, 150, 166]]
      .concat(GROVE_ROW.map(d => [d, 40, d, 50])));
    rect(m, 95, 125, 102, 16, C.pathEdge); rect(m, 96, 126, 100, 14, C.path);
    for (let x = 99; x < 196; x += 6) rect(m, x, 126, 1, 14, '#eadab2');
    paths(m, [[104, 117, 104, 126], [150, 117, 150, 126]]);
    rect(m, 96, 126, 100, 14, C.path); for (let x = 99; x < 196; x += 6) rect(m, x, 126, 1, 14, '#eadab2');
    building(m, 60, 18, 86, 14, 8, GROVE_ROW); litDoor(m, 70, 33, 7); litDoor(m, 118, 33, 7);
    hall(m, 88, 92, 112, 16, 9, [{ x: 104 }, { x: 150, wide: true }]); litDoor(m, 104, 109, 8);
    wing(m, 236, 30, 12, 54, GROVE_WING, -1); litWing(m, 236, 12, -1, 58);
    table(m, 118, 129); table(m, 168, 129);
    [[24, 36, 12], [160, 34, 10], [186, 40, 12], [208, 28, 9], [16, 86, 12], [20, 136, 11], [62, 86, 10], [78, 78, 12], [206, 88, 10],
     [262, 40, 12], [300, 34, 10], [284, 66, 14], [268, 104, 13], [298, 124, 12], [258, 150, 10], [290, 170, 11]].forEach(e => euc(m, e[0], e[1], e[2]));
    bench(m, 205, 130);
  },
  under(g, t, dt, calm) { if (!calm) glowAt(g, t, [[70, 41], [118, 41], [104, 118], [231, 58, 3, 4]]); },
  over(g, t, dt, calm) {
    if (!calm) {
      drifting(g, t, groveFX, [[284, 46, '#9ab89a'], [262, 22, '#6f9274'], [186, 22, '#9ab89a'], [78, 60, '#6f9274'], [268, 86, '#c9bfa8']], 3, 9);
      butterfly(g, t, 120, 70, 18, 8, 1.7, '#fffaf0');
    }
  },
  spots: [
    ...GROVE_ROW.map((d, i) => door(GROVE_ROW_N[i], [d - 8, 18, 16, 22], d === 70 || d === 118)),
    ...GROVE_WING.map((dy, i) => door(GROVE_WING_N[i], [228, dy - 7, 14, 14], dy === 58)),
    door('016', [96, 92, 16, 26], 1),
    spot('the library', [116, 92, 84, 26], 'The library. The book is long.'),
    spot('the reading terrace', [95, 125, 102, 16], 'The reading terrace. Quiet, mostly. One person reads out loud.'),
    spot('eucalyptus', [250, 0, 70, 180], 'Eucalyptus. Smells like a cough drop, in a good way.')
  ]
};

const AREAS = [HEART, GREEN, HILL, PASTURE, GROVE];
AREAS.forEach(A => { A.people = A.spots.filter(s => s.n !== undefined && WHO[s.n]).map(s => WHO[s.n]).join(' · '); });
const art = AREAS.map(A => { const c = document.createElement('canvas'); c.width = W; c.height = FH; A.paint(c.getContext('2d')); return c; });

/* ---------- walking along a polyline ---------- */
function route(pts) {
  const segs = []; let len = 0;
  for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > 0) { segs.push({ a, b, l, s0: len }); len += l; } }
  return {
    pts, len,
    at(s) { s = Math.max(0, Math.min(len, s)); for (const q of segs) if (s <= q.s0 + q.l) { const k = (s - q.s0) / q.l; return [q.a[0] + (q.b[0] - q.a[0]) * k, q.a[1] + (q.b[1] - q.a[1]) * k]; } const e = pts[pts.length - 1]; return [e[0], e[1]]; },
    project(x, y) { let best = 0, bd = Infinity; segs.forEach(q => { const dx = q.b[0] - q.a[0], dy = q.b[1] - q.a[1]; let k = ((x - q.a[0]) * dx + (y - q.a[1]) * dy) / (q.l * q.l); k = Math.max(0, Math.min(1, k)); const px = q.a[0] + dx * k, py = q.a[1] + dy * k, d = (px - x) ** 2 + (py - y) ** 2; if (d < bd) { bd = d; best = q.s0 + k * q.l; } }); return best; }
  };
}
function walker(g, x, y, fr) { oval(g, x, y + 1, 3, 1, C.shadow); sprite(g, TINY[fr], TPAL, x - 2, y - 8); }

window.World = { W, FH, OY, C, rect, oval, disc, sprite, rng, AREAS, art, route, walker, WHO };
})();
