// Bart: Inbal's study as a rat palace, designed by hand (2026-11-13). One hero where the window was,
// a calm teal room around it, seven rats that each do one thing. The message board hangs upper right.
const INK = '#141414';
const TEAL = '#1f4a4c', TEAL_DOT = '#2a5c5e', WAIN = '#173c3e', WAIN_HI = '#245250', WAIN_LO = '#0f2d2e';
const GOLD = '#ffd04a', GOLD_HI = '#fff2b0', GOLD_LO = '#c98f1f', GOLD_DK = '#7a5410';
const IVORY = '#f2e6c6', IVORY_LO = '#d4c196', IVORY_DK = '#a8946a';
const BRICK = '#c46a4a', BRICK_LO = '#9a4c34', BRICK_HI = '#dc8a68';
const GLASS = '#14282b', LIT = '#ffcf6e', DARK = '#0e1b1d';
const PINK = '#ff9ccf', PINK_HI = '#ffd3ea', PINK_LO = '#d06a99';
const WOOD = '#6b3a20', WOOD_HI = '#a5653a', WOOD_LO = '#45220f';
const FUR = { grey: ['#a5a5b0', '#cfcfd8', '#73737f'], white: ['#efede6', '#ffffff', '#c2bcae'], brown: ['#9a6440', '#c4865a', '#66412a'] };
const CX = 98;                                    // the palace's centre line

/* ---------- the room: teal wallpaper above a walnut rail, dark panels below ---------- */
// the wall around the door (x 4-35 from y 30) and the bookshelf (x 266-313 from y 10)
const REG = [[0, 5, 4, 99], [4, 5, 32, 25], [36, 5, 230, 99], [266, 5, 48, 5], [314, 5, 6, 99]];
function onWall(x, y) { return REG.some(([rx, ry, rw, rh]) => x >= rx && x < rx + rw && y >= ry && y < ry + rh); }
function rug(api) {
  api.rect(52, 124, 168, 18, INK); api.rect(53, 125, 166, 16, '#d9a93a'); api.rect(55, 127, 162, 12, '#6e1f2b'); api.rect(56, 128, 160, 10, '#8a2a36');
  for (let x = 62; x < 212; x += 10) { api.px(x, 131, '#e8b84a'); api.px(x - 1, 132, '#e8b84a'); api.px(x + 1, 132, '#e8b84a'); api.px(x, 133, '#e8b84a'); api.px(x, 132, '#6e1f2b'); }
  for (let x = 53; x < 219; x += 4) { api.px(x, 142, '#d9a93a'); }
}
function room(api) {
  for (const [x, y, w, h] of REG) {
    const top = Math.min(y + h, 64);
    if (top > y) api.rect(x, y, w, top - y, TEAL);
    if (y + h > 67) { const y0 = Math.max(y, 67); api.rect(x, y0, w, y + h - y0, WAIN); }
  }
  // a small diamond pattern in the wallpaper, staggered
  for (let y = 10, r = 0; y < 60; y += 8, r++) for (let x = r % 2 ? 6 : 1; x < 320; x += 10) {
    if (!onWall(x, y - 1) || !onWall(x, y + 1)) continue;
    api.px(x, y - 1, TEAL_DOT); api.px(x - 1, y, TEAL_DOT); api.px(x + 1, y, TEAL_DOT); api.px(x, y + 1, TEAL_DOT);
  }
  // the chair rail and the wainscot panels, only where there is wall
  for (const [x, w] of [[0, 4], [36, 230], [314, 6]]) { api.rect(x, 64, w, 1, WOOD_HI); api.rect(x, 65, w, 2, '#4a2414'); }
  for (let x = 40; x + 24 <= 264; x += 30) {
    api.rect(x, 72, 24, 1, WAIN_LO); api.rect(x, 72, 1, 26, WAIN_LO);
    api.rect(x, 97, 24, 1, WAIN_HI); api.rect(x + 23, 73, 1, 25, WAIN_HI);
  }
  // the ceiling lamp warms the top of the wall a little
  for (let i = 0; i < 6; i++) api.rect(152 - 12 - i * 9, 5 + i * 5, 24 + i * 18, 5, 'rgba(255,226,160,0.035)');
}

/* ---------- the palace ---------- */
function onion(api, cx, base, h, max, bot) {
  for (let i = 0; i < h; i++) {
    const u = i / (h - 1), y = base - h + i;
    const hw = u < 0.66 ? Math.max(0, Math.round(max * Math.pow(u / 0.66, 0.85))) : Math.round(max - (u - 0.66) / 0.34 * (max - bot));
    api.rect(cx - hw - 1, y, hw * 2 + 3, 1, INK);
    if (hw > 0) {
      api.rect(cx - hw, y, hw * 2 + 1, 1, GOLD);
      const hl = Math.max(1, Math.round(hw * 0.28));
      if (u > 0.12 && u < 0.9) api.rect(cx - Math.round(hw * 0.55), y, hl, 1, GOLD_HI);
      api.rect(cx + hw - Math.max(1, Math.round(hw * 0.3)) + 1, y, Math.max(1, Math.round(hw * 0.3)), 1, GOLD_LO);
    }
  }
  api.rect(cx - bot - 2, base, bot * 2 + 5, 2, INK); api.rect(cx - bot - 1, base, bot * 2 + 3, 1, GOLD_DK);
  api.rect(cx, base - h - 3, 1, 3, GOLD); api.px(cx, base - h - 4, GOLD_HI);
}
function flag(api, cx, top, len, color, t) {
  api.rect(cx, top, 1, len, INK);
  for (let k = 0; k < 8; k++) {
    const off = api.calm ? 0 : Math.round(Math.sin(t * 4 - k * 0.7) * 0.8), hgt = Math.max(1, 4 - Math.floor(k / 2));
    api.rect(cx + 1 + k, top + off + Math.floor((4 - hgt) / 2), 1, hgt, color);
  }
}
function arched(api, x, y, w, h, lit) {
  api.rect(x, y + 1, w, h - 1, INK); api.rect(x + 1, y, w - 2, 1, INK);
  api.rect(x + 1, y + 1, w - 2, h - 2, lit ? LIT : GLASS);
  if (lit) api.rect(x + 1, y + h - 3, w - 2, 1, '#e8a94a');
  api.rect(x - 1, y + h - 1, w + 2, 1, GOLD_LO);
}
function cornice(api, y) {
  api.rect(67, y, 63, 3, INK); api.rect(68, y + 1, 61, 1, GOLD);
  for (let x = 71; x < 127; x += 3) api.px(x, y + 3, IVORY_DK);
}
function tower(api, x) {
  api.rect(x, 42, 13, 57, INK); api.rect(x + 1, 43, 11, 55, BRICK);
  api.rect(x + 1, 43, 1, 55, BRICK_HI); api.rect(x + 11, 43, 1, 55, BRICK_LO);
  for (let y = 47, k = 0; y < 97; y += 4, k++) { api.rect(x + 2, y, 9, 1, BRICK_LO); api.rect(x + (k % 2 ? 4 : 8), y - 3, 1, 3, BRICK_LO); }
  api.rect(x - 1, 42, 15, 2, INK); api.rect(x, 42, 13, 1, GOLD);
  arched(api, x + 4, 72, 5, 9, x > CX);
}
function palace(api, t) {
  // towers behind the body, then the body
  tower(api, 58); tower(api, 126);
  api.rect(70, 52, 57, 47, INK); api.rect(71, 53, 55, 45, IVORY); api.rect(122, 53, 4, 45, IVORY_LO);
  cornice(api, 52); cornice(api, 66); cornice(api, 80);
  const flick = api.calm ? 1 : Math.floor(t * 0.7) % 5;
  [77, 90, 103, 116].forEach((x, i) => arched(api, x, 56, 5, 9, i === 1 || i === 3 || (i === 0 && flick !== 0)));
  [77, 90, 103, 116].forEach((x, i) => arched(api, x, 70, 5, 7, i === 2));
  arched(api, 75, 86, 5, 9, false); arched(api, 117, 86, 5, 9, true);
  // the grand arch, and the wheel in it
  api.disc(CX, 95, 12, INK); api.disc(CX, 95, 11, DARK); api.rect(86, 95, 25, 4, INK); api.rect(87, 95, 23, 4, DARK);
  const a = api.calm ? 0.3 : t * 3.2;
  api.disc(CX, 91, 8, INK); api.disc(CX, 91, 7, GOLD_LO); api.disc(CX, 91, 6, '#1b2f31');
  for (let k = 0; k < 12; k++) { const b = a + k * Math.PI / 6; api.px(CX + Math.round(Math.cos(b) * 7), 91 + Math.round(Math.sin(b) * 7), GOLD_DK); }
  for (let s = 0; s < 4; s++) { const b = a + s * Math.PI / 2; for (let d = 2; d < 6; d++) api.px(CX + Math.round(Math.cos(b) * d), 91 + Math.round(Math.sin(b) * d), GOLD_LO); }
  api.disc(CX, 91, 1, GOLD_HI);
  rat(api, CX, 97, 1, 'brown', api.calm ? 0 : Math.floor(t * 12) % 2, t);
  // the drum and the great dome
  api.rect(82, 44, 33, 9, INK); api.rect(83, 45, 31, 7, IVORY); api.rect(110, 45, 4, 7, IVORY_LO);
  [86, 92, 98, 104, 110].forEach(x => api.rect(x, 45, 1, 7, GOLD_LO));
  onion(api, CX, 44, 22, 18, 15);
  onion(api, 64, 41, 12, 8, 6); onion(api, 132, 41, 12, 8, 6);
  flag(api, CX, 4, 15, '#2b3fff', t); flag(api, 64, 17, 11, PINK, t + 1); flag(api, 132, 17, 11, '#7ee0b5', t + 2);
  // bunting, spire to spire
  const sway = api.calm ? 0 : Math.sin(t * 1.3) * 0.8, cols = [PINK, '#7ee0b5', '#ffd93b', '#2b3fff', '#fff7e6'];
  [[64, 19, CX, 11], [CX, 11, 132, 19]].forEach(([x0, y0, x1, y1], side) => {
    for (let x = x0 + 1, n = 0; x < x1; x++) {
      const u = (x - x0) / (x1 - x0), y = Math.round(y0 + (y1 - y0) * u + (5 + sway) * Math.sin(Math.PI * u));
      api.px(x, y, '#3b2a1c');
      if ((x - x0) % 5 === 2) { const c = cols[(n++ + side * 3) % cols.length]; api.rect(x - 1, y + 1, 3, 1, c); api.px(x, y + 2, c); }
    }
  });
  // the balcony: a rat paces it behind the gold railing
  const bx = Math.round(CX + (api.calm ? -12 : Math.sin(t * 0.55) * 20)), bdir = api.calm || Math.cos(t * 0.55) >= 0 ? 1 : -1;
  rat(api, bx, 79, bdir, 'grey', api.calm || Math.abs(Math.cos(t * 0.55)) < 0.15 ? 0 : Math.floor(t * 7) % 2, t);
  api.rect(68, 75, 61, 1, GOLD); for (let x = 69; x < 128; x += 3) api.rect(x, 76, 1, 4, GOLD_LO); api.rect(68, 79, 61, 1, GOLD_DK);
  // the ledges by the dome: one rat looks out, one has brought lunch
  rat(api, 76, 52, -1, 'white', 0, t, { blink: true });
  // the ladder up the right tower
  api.rect(139, 46, 1, 53, INK); api.rect(144, 46, 1, 53, INK);
  for (let y = 49; y < 98; y += 4) api.rect(140, y, 4, 1, GOLD);
  // the plinth, its plaque and two rat doors
  api.rect(54, 98, 89, 14, INK); api.rect(55, 99, 87, 12, WOOD); api.rect(55, 99, 87, 2, WOOD_HI); api.rect(55, 109, 87, 2, WOOD_LO);
  api.rect(77, 101, 43, 8, INK); api.rect(78, 102, 41, 6, '#d9a93a'); api.rect(78, 102, 41, 1, '#f2d27a');
  api.text(CX, 103, 'RAT PALACE', '#4a2a0a');
  [60, 131].forEach(x => { api.rect(x, 104, 7, 7, INK); api.rect(x + 1, 103, 5, 1, INK); api.rect(x + 1, 105, 5, 6, '#120904'); api.rect(x + 1, 104, 5, 1, GOLD_LO); });
  api.rect(52, 112, 93, 1, 'rgba(0,0,0,0.28)');
}

/* ---------- the slide, out of the left tower's door and down to the floor ---------- */
const P = [[57, 63], [51, 76], [48, 97], [41, 105]];
const bez = u => { const v = 1 - u; return [0, 1].map(i => v * v * v * P[0][i] + 3 * v * v * u * P[1][i] + 3 * v * u * u * P[2][i] + u * u * u * P[3][i]); };
const CURVE = Array.from({ length: 120 }, (_, i) => bez(i / 119));
// the chute is worked out once, as runs of pixels per row: an ink edge, a pink bed, a light rail
// along the top edge and a shade underneath
const CHUTE = (() => {
  const px = new Map(), put = (x, y, c, keep) => { const k = x + ',' + y; if (!keep || !px.has(k)) px.set(k, c); };
  const dot = (cx, cy, r, c) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r) put(cx + x, cy + y, c); };
  // a ramp in profile, layered across the slope from underside to lip: ink, shade, bed, bed, the
  // light the lamp puts on the bed, a raised lip, ink
  const LAYERS = [INK, PINK_LO, PINK, PINK, PINK_HI, PINK_LO, INK];
  CURVE.forEach(([x, y], i) => {
    const [x2, y2] = CURVE[Math.min(CURVE.length - 1, i + 1)], [x1, y1] = CURVE[Math.max(0, i - 1)];
    let nx = y2 - y1, ny = -(x2 - x1); const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;     // the normal, pointing up and out
    if (ny > 0) { nx = -nx; ny = -ny; }
    for (let k = 0; k < LAYERS.length; k++) for (const h of [0, 0.5]) put(Math.round(x + nx * (k - 3 + h)), Math.round(y + ny * (k - 3 + h)), LAYERS[k], k === 0 || k === LAYERS.length - 1);
  });
  const rows = {}; px.forEach((c, k) => { const [x, y] = k.split(',').map(Number); (rows[y] = rows[y] || []).push([x, c]); });
  const out = [];
  Object.keys(rows).forEach(y => { const r = rows[y].sort((a, b) => a[0] - b[0]); let s0 = r[0][0], c0 = r[0][1], last = s0;
    for (let i = 1; i <= r.length; i++) { const e = r[i]; if (e && e[0] === last + 1 && e[1] === c0) { last = e[0]; continue; } out.push([s0, +y, last - s0 + 1, c0]); if (e) { s0 = e[0]; c0 = e[1]; last = s0; } } });
  return out;
})();
function slide(api) {
  // two walnut posts under it
  [0.38, 0.72].forEach(u => { const [x, y] = bez(u).map(Math.round); api.rect(x - 1, y + 3, 3, 111 - y - 3, INK); api.rect(x, y + 3, 1, 111 - y - 4, WOOD_HI); });
  // the chute: an ink edge, the pink bed, a light rail on its top edge and a shaded underside
  CHUTE.forEach(([x, y, w, c]) => api.rect(x, y, w, 1, c));
  // the run-out, flat on the floor
  api.rect(37, 104, 9, 5, INK); api.rect(38, 105, 7, 3, PINK); api.rect(38, 105, 7, 1, PINK_HI); api.rect(38, 107, 7, 1, PINK_LO);
  api.rect(37, 109, 11, 1, 'rgba(0,0,0,0.25)');
  // the little door it starts from, with a gold arch
  api.rect(58, 54, 6, 10, INK); api.rect(59, 55, 4, 8, DARK); api.rect(59, 54, 4, 1, GOLD_LO);
}
// one grey rat, every eight seconds: peeks out, slides, runs home into the left rat door
function slider(api, t) {
  const c = api.calm ? 1.4 : t % 8;
  if (c < 1.0) { const up = Math.min(1, c * 3); rat(api, 62 - Math.round(up * 6), 63, -1, 'grey', 0, t, { head: up < 0.5 }); return; }
  if (c < 2.4) { const u = Math.pow((c - 1) / 1.4, 1.6), [x, y] = bez(u); rat(api, Math.round(x), Math.round(y) - 3, -1, 'grey', 0, t, { tilt: u < 0.85 }); return; }
  if (c < 3.4) { const k = (c - 2.4) / 1.0, x = Math.round(40 + k * 23); rat(api, x, 111, 1, 'grey', Math.floor(t * 12) % 2, t); }
}

/* ---------- a rat, side on; x, y = where its feet are ---------- */
function rat(api, x, y, dir, coat, step, t, o) {
  o = o || {};
  const [f, hi, lo] = FUR[coat], hy = y - 5 + (o.nod || 0);
  if (!o.head) {
    // tail, then body
    const tw = api.calm ? 0 : Math.round(Math.sin(t * 5 + x) * 0.8);
    [[-4, -2], [-5, -2], [-6, -3], [-7, -3 + tw], [-8, -4 + tw]].forEach(([dx, dy]) => api.px(x + dir * dx, y + dy, PINK_LO));
    api.oval(x, y - 3, 4, 3, INK); api.oval(x, y - 3, 3, 2, f); api.rect(x - 2, y - 5, 3, 1, hi); api.rect(x - 2, y - 2, 5, 1, lo);
    if (!o.tilt) { api.px(x - 2 + step, y, INK); api.px(x + 2 - step, y, INK); }
  }
  // head, ear, eye, nose
  api.oval(x + dir * 4, hy, 3, 3, INK); api.oval(x + dir * 4, hy, 2, 2, f); api.px(x + dir * 3, hy - 1, hi);
  api.px(x + dir * 3, hy - 4, INK); api.px(x + dir * 2, hy - 4, INK); api.px(x + dir * 3, hy - 3, PINK); api.px(x + dir * 2, hy - 3, PINK);
  const shut = o.blink && !api.calm && (t % 4.1) < 0.15;
  api.px(x + dir * 5, hy - 1, shut ? f : INK);
  api.px(x + dir * 7, hy, PINK);
}
/* ---------- the other half: out in her office ---------- */
// The desk top is y 95 from x 148 to 263; her hands rest at x 181-199, her mug at 206-213, the monitor
// (seen from behind) x 221-250 from y 68, the pad and pen at 250. These are drawn in mid, over her and the desk.
// one with lunch at the left end of the desk
function luncher(api, t) {
  const nib = api.calm ? 0 : (Math.floor(t * 3) % 4 === 0 ? 1 : 0);
  rat(api, 158, 95, 1, 'brown', 0, t, { nod: nib });
  api.rect(165, 89 + nib, 4, 3, INK); api.rect(165, 89 + nib, 3, 2, '#ffd93b'); api.px(166, 90 + nib, '#d9a93a');
}
// one walks the desk, across her hands, to the mug and back, with a stop at each end
function walkX(t) { const c = t % 9, go = c < 3.5 ? c / 3.5 : c < 4.5 ? 1 : c < 8 ? 1 - (c - 4.5) / 3.5 : 0; return Math.round(176 + go * go * (3 - 2 * go) * 26); }
function deskWalker(api, t) {
  const c = api.calm ? 0.2 : t % 9, x = api.calm ? 176 : walkX(t), dir = c < 4 || c >= 8.5 ? 1 : -1, moving = (c < 3.5 || (c >= 4.5 && c < 8)) && !api.calm;
  rat(api, x, 95, dir, 'white', moving ? Math.floor(t * 9) % 2 : 0, t, { blink: !moving });
  return x;
}
// one sits on top of her monitor, tail down the side, now and then looking the other way
function monitorRat(api, t) {
  const look = api.calm || (t % 7) < 5 ? -1 : 1;
  const sw = api.calm ? 0 : Math.round(Math.sin(t * 2.2));
  [[244, 67], [245, 68], [246, 69], [246, 70], [246, 71], [246 + sw, 72], [246 + sw, 73]].forEach(([x, y]) => api.px(x, y, PINK_LO));
  rat(api, 236, 68, look, 'grey', 0, t, { blink: true });
}
// one scurries out of the palace's right rat door, along the front of the rug to the bookshelf, and home
const RUN = [[134, 111], [146, 120], [176, 129], [262, 129], [290, 118], [262, 129], [176, 129], [146, 120], [134, 111]];
function runnerAt(t) {
  const c = t % 14; if (c > 9) return null;
  const legs = RUN.length - 1, f = c / 9 * legs, i = Math.min(legs - 1, Math.floor(f)), k = f - i;
  const [x0, y0] = RUN[i], [x1, y1] = RUN[i + 1];
  if (c > 4.2 && c < 4.8) return { x: 290, y: 118, dir: -1, still: true };
  return { x: Math.round(x0 + (x1 - x0) * k), y: Math.round(y0 + (y1 - y0) * k), dir: x1 >= x0 ? 1 : -1 };
}
function runner(api, t, layer) {
  if (api.calm) return;
  const r = runnerAt(t); if (!r) return;
  const behind = r.y < api.you.y;                       // in front of the visitor only when nearer the viewer
  if ((layer === 'mid') !== behind) return;
  api.rect(r.x - 4, r.y + 1, 9, 1, 'rgba(0,0,0,0.22)');
  rat(api, r.x, r.y, r.dir, 'brown', r.still ? 0 : Math.floor(t * 12) % 2, t);
}
// one noses along the bottom of the bookshelf, stopping to sniff
function sniffer(api, t) {
  const c = api.calm ? 0 : t % 11, x = Math.round(300 - (c < 5 ? c * 5 : c < 6 ? 25 : 25 - (c - 6) * 5)), dir = c < 5.5 ? -1 : 1;
  const moving = !api.calm && (c < 5 || c > 6);
  api.rect(x - 4, 113, 9, 1, 'rgba(0,0,0,0.22)');
  rat(api, x, 112, dir, 'white', moving ? Math.floor(t * 8) % 2 : 0, t, { nod: moving || api.calm ? 0 : Math.floor(t * 8) % 2 });
}
// one asleep on top of the bookshelf, tail over the edge
function sleeper(api, t) {
  api.oval(290, 7, 6, 3, INK); api.oval(290, 7, 5, 2, FUR.white[0]); api.rect(287, 5, 5, 1, FUR.white[1]);
  api.oval(284, 8, 3, 2, INK); api.oval(284, 8, 2, 1, FUR.white[0]); api.px(282, 8, PINK); api.px(285, 6, PINK);
  const sw = api.calm ? 0 : Math.round(Math.sin(t * 1.4));
  [[296, 8], [297, 9], [297, 10], [297, 11], [296, 12]].forEach(([x, y], i) => api.px(x + (i > 2 ? sw : 0), y, PINK_LO));
  if (!api.calm) { const z = (t * 0.6) % 3; api.text(300 + Math.round(z), Math.round(6 - z * 2), 'Z', 'rgba(220,240,240,' + (0.8 - z * 0.25).toFixed(2) + ')'); }
}
// one climbing the ladder, up and down
function climber(api, t) {
  const c = api.calm ? 0.5 : (Math.sin(t * 0.45) + 1) / 2, y = Math.round(94 - c * 42), step = api.calm ? 0 : Math.floor(t * 6) % 2;
  const x = 142;
  for (let i = 1; i < 6; i++) api.px(x + (i > 3 && !api.calm ? Math.round(Math.sin(t * 3)) : 0), y + 4 + i, PINK_LO);
  api.oval(x, y, 3, 4, INK); api.oval(x, y, 2, 3, FUR.grey[0]); api.rect(x - 1, y - 2, 1, 3, FUR.grey[1]);
  api.oval(x, y - 6, 3, 3, INK); api.oval(x, y - 6, 2, 2, FUR.grey[0]);
  api.px(x - 2, y - 9, PINK); api.px(x + 2, y - 9, PINK);
  api.px(x - 3, y - 1 + step, INK); api.px(x + 3, y - step, INK);
}

return {
  back(api, t) { room(api); rug(api); slide(api); palace(api, t); slider(api, t); climber(api, t); sleeper(api, t); sniffer(api, t); },
  mid(api, t) { luncher(api, t); deskWalker(api, t); monitorRat(api, t); runner(api, t, 'mid'); },
  front(api, t) { runner(api, t, 'front'); },
  spots: t => [
    { name: 'rat on the desk', r: [walkX(t) - 8, 84, 18, 12], look: 'Walking across her keyboard. She types around it.' },
    { name: 'rat with cheese', r: [151, 84, 20, 12], look: 'It brought its own lunch. To her desk.' },
    { name: 'rat on the monitor', r: [229, 58, 20, 12], look: 'Warm up there. It knows.' },
    { name: 'rat by the books', r: [270, 102, 36, 12], look: 'Checking the bottom shelf. Looking for footnotes.' },
    { name: 'hamster wheel', r: [89, 82, 19, 17], look: 'She runs all night. Nobody asks where to.' },
    { name: 'slide', r: [31, 55, 30, 57], look: 'The slide. Rats only. I asked.' },
    { name: 'ladder', r: [137, 44, 10, 55], look: 'For when the slide is busy.' },
    { name: 'balcony', r: [68, 68, 61, 12], look: 'Pacing the balcony. Probably a deadline.' },
    { name: 'sleeping rat', r: [278, 0, 26, 19], look: 'Asleep on the classics. Fair.' },
    { name: 'rat palace', r: [54, 4, 92, 108], look: 'Three floors, two towers, gold domes. Nicer than my place.' }
  ],
  hide: ['window', 'rug']
};
