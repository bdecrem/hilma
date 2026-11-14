// The trailer's picture. renderAt(t) draws one 1920x1080 frame: act 1 on black (the slammed words
// in Anton), the crumble into 8-bit pixels, the title card resolving out of them, then the game's
// footage (out/shots, filmed by capture.mjs) framed and zoomed with nearest-neighbour scaling, the
// cards and the end card in the game's own font (Jersey 15). Stateless: any t, any order.
/* global E */
const W = 1920, H = 1080, YEL = '#ffff55', CYAN = '#55ffff';
const cv = document.getElementById('c'), g = cv.getContext('2d');
const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = x => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

/* ---------- footage frames ---------- */
const cache = new Map();
function img(src) {
  if (cache.has(src)) return cache.get(src);
  const p = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('missing ' + src)); i.src = src; });
  cache.set(src, p); if (cache.size > 90) cache.delete(cache.keys().next().value);
  return p;
}
const frameSrc = (shot, f) => `out/shots/${shot}/${String(f).padStart(5, '0')}.jpg`;
function drawView(im, view) {
  const [cx, cy, z] = view, sw = W / z, sh = H / z;
  const sx = clamp(cx - sw / 2, 0, W - sw), sy = clamp(cy - sh / 2, 0, H - sh);
  g.imageSmoothingEnabled = z < 1.01; g.drawImage(im, sx, sy, sw, sh, 0, 0, W, H); g.imageSmoothingEnabled = true;
}
const lerpView = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

/* ---------- film grain and vignette for act 1 ---------- */
const grains = [0, 1, 2, 3].map(k => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), d = x.createImageData(256, 256), r = mulberry(k + 9);
  for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 22; } x.putImageData(d, 0, 0); return c; });
function grain(t) { const k = Math.floor(t * 24); g.save(); g.globalCompositeOperation = 'overlay'; g.fillStyle = g.createPattern(grains[k % 4], 'repeat'); g.translate((k * 73) % 256, (k * 151) % 256); g.fillRect(-256, -256, W + 512, H + 512); g.restore();
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.0); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.75)'); g.fillStyle = v; g.fillRect(0, 0, W, H); }

/* ---------- act 1: the words ---------- */
function wordFont(word) { wordFontOn(g, word); }
function drawWord(word, t, u, extraShake) {
  const r = mulberry(Math.floor(t * 30) * 7 + 3);
  const scale = 1 + 0.5 * Math.exp(-u * 26) + 0.025 * u;
  const A = 34 * Math.exp(-u * 8) + extraShake;
  const dx = (r() - 0.5) * 2 * A, dy = (r() - 0.5) * 2 * A;
  g.save(); g.translate(W / 2 + dx, H / 2 + dy); g.scale(scale, scale);
  wordFont(word); g.textAlign = 'center'; g.textBaseline = 'middle';
  const split = 18 * Math.exp(-u * 10) + extraShake * 0.6;
  if (split > 0.8) { g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,40,40,0.9)'; g.fillText(word, -split, 0); g.fillStyle = 'rgba(40,90,255,0.9)'; g.fillText(word, split, 0); g.globalCompositeOperation = 'source-over'; }
  const grd = g.createLinearGradient(0, -150, 0, 150); grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.55, '#e9e6df'); grd.addColorStop(1, '#a9a49a');
  g.shadowColor = 'rgba(255,255,255,0.35)'; g.shadowBlur = 40; g.fillStyle = grd; g.fillText(word, 0, 0);
  g.restore();
  // dust thrown off by the hit
  const pr = mulberry(word.length * 31);
  for (let i = 0; i < 70; i++) { const a = pr() * Math.PI * 2, sp = 300 + pr() * 1400, life = 0.6 + pr() * 0.9; if (u > life) continue;
    const k = 1 - u / life, x = W / 2 + Math.cos(a) * sp * (1 - Math.exp(-u * 3)) / 3 * 2, y = H / 2 + Math.sin(a) * sp * (1 - Math.exp(-u * 3)) / 3 + 120 * u * u;
    g.fillStyle = `rgba(255,245,225,${0.7 * k * k})`; g.fillRect(x, y, 3 + pr() * 4, 3 + pr() * 4); }
  // the flash
  const fl = 0.55 * Math.exp(-u * 16); if (fl > 0.01) { g.fillStyle = `rgba(255,255,255,${fl})`; g.fillRect(0, 0, W, H); }
}

// EVERYTHING. as 8-bit cells: drawn once small, then read back as a grid
let cells = null;
function wordCells(b) {
  const c = document.createElement('canvas'); c.width = W / b; c.height = H / b; const x = c.getContext('2d');
  x.scale(1 / b, 1 / b); x.translate(W / 2, H / 2); x.scale(1.06, 1.06);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
  wordFontOn(x, 'EVERYTHING.'); x.fillText('EVERYTHING.', 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data, out = [];
  for (let y = 0; y < c.height; y++) for (let i = 0; i < c.width; i++) { const a = d[(y * c.width + i) * 4]; if (a > 70) out.push([i, y, a]); }
  return { c, out, b };
}
// as big as fits 1560 px across, and never taller than 470 px type
function wordFontOn(x, word) { x.font = '300px Anton'; x.letterSpacing = '12px'; const w = x.measureText(word).width; const s = Math.min(470 / 300, 1560 / w); x.font = `${Math.round(300 * s)}px Anton`; x.letterSpacing = `${Math.round(12 * s)}px`; }
function crumble(t) {
  const [k0, k1] = E.CRUMBLE, p = (t - k0) / (k1 - k0);
  const steps = [4, 8, 12, 24], b = steps[Math.min(3, Math.floor(p / 0.3 * 4))];
  if (!cells || cells.b !== b) cells = wordCells(b);
  const r = mulberry(5), q = clamp((p - 0.3) / 0.7);
  for (const [i, y, a] of cells.out) {
    const delay = r() * 0.45, v = clamp((q - delay) / (1 - delay)), drop = v * v * (H * 1.1) * (0.7 + r() * 0.6), side = (r() - 0.5) * 200 * v;
    const lum = a / 255; g.fillStyle = p < 0.08 ? `rgba(255,255,255,${lum})` : (i + y) % 7 === 0 ? CYAN : YEL;
    g.globalAlpha = p < 0.08 ? 1 : clamp(1.15 - v); g.fillRect(i * b + side, y * b + drop, b - (b > 6 ? 2 : 0), b - (b > 6 ? 2 : 0));
  }
  g.globalAlpha = 1;
}

// the game's palette: every block of the crumbling frame becomes one of these
const PAL = [[255, 255, 85], [230, 181, 71], [255, 247, 230], [85, 255, 255], [168, 115, 42]];
let frozen = null;
function crumbleHiFi(t) {
  const [k0, k1] = E.CRUMBLE, p = (t - k0) / (k1 - k0);
  if (!frozen) { const src = window.ACT1.render(k0 - 0.001); frozen = document.createElement('canvas'); frozen.width = W; frozen.height = H; frozen.getContext('2d').drawImage(src, 0, 0); }
  const steps = [2, 3, 4, 6, 8, 12, 16, 24], b = steps[Math.min(steps.length - 1, Math.floor(p / 0.32 * steps.length))];
  const c = document.createElement('canvas'); c.width = Math.ceil(W / b); c.height = Math.ceil(H / b);
  const x = c.getContext('2d'); x.drawImage(frozen, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data, r = mulberry(5), q = clamp((p - 0.32) / 0.68);
  // early on the blocks keep a little of the real colour; by the time they fall they are all the game's
  const snap = clamp(p / 0.25);
  for (let y = 0; y < c.height; y++) for (let i = 0; i < c.width; i++) {
    const o = (y * c.width + i) * 4, R = d[o], G = d[o + 1], B = d[o + 2], lum = 0.3 * R + 0.59 * G + 0.11 * B;
    const delay = r() * 0.5, side = r() - 0.5, sp = 0.7 + r() * 0.6;
    if (lum < 60) continue;
    let best = PAL[0], bd = 1e9; for (const P of PAL) { const dd = (P[0] - R) ** 2 + (P[1] - G) ** 2 + (P[2] - B) ** 2; if (dd < bd) { bd = dd; best = P; } }
    const col = best.map((v, k) => Math.round(v * snap + [R, G, B][k] * (1 - snap)));
    const v = clamp((q - delay) / (1 - delay)), drop = v * v * H * 1.1 * sp;
    g.globalAlpha = Math.pow(clamp((lum - 50) / 120), 1.2) * clamp(1.15 - v);        // the letters outshine the haze around them
    g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    const gap = b >= 8 ? 2 : 0; g.fillRect(i * b + side * 220 * v, y * b + drop, b - gap, b - gap);
  }
  g.globalAlpha = 1;
}

/* ---------- the game's font ---------- */
function pixelText(text, x, y, size, fill, outline) {
  g.font = `${size}px 'Jersey 15'`; g.letterSpacing = '0px'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (outline) { const o = Math.round(size * 0.06); g.fillStyle = '#000'; for (const [ax, ay] of [[o, 0], [-o, 0], [0, o], [0, -o], [o, o], [-o, o], [o, -o], [-o, -o]]) g.fillText(text, x + ax, y + ay); }
  g.fillStyle = fill; g.fillText(text, x, y);
}
// pixelate whatever is on the canvas now: blocks of b px
function mosaic(b) {
  if (b <= 1) return;
  const c = document.createElement('canvas'); c.width = Math.ceil(W / b); c.height = Math.ceil(H / b); const x = c.getContext('2d');
  x.imageSmoothingEnabled = true; x.drawImage(cv, 0, 0, c.width, c.height);
  g.imageSmoothingEnabled = false; g.drawImage(c, 0, 0, c.width * b, c.height * b); g.imageSmoothingEnabled = true;
}

async function renderAt(t) {
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  // act 1: the high-fidelity 3D titles (act1.js)
  if (t < E.CRUMBLE[0]) { g.drawImage(window.ACT1.render(t), 0, 0); grain(t); return; }
  // the hinge: the last full-fidelity frame breaks into the game's pixels and falls away
  if (t < E.CRUMBLE[1]) { crumbleHiFi(t); return; }
  if (t < E.JINGLE) return;
  // the title card resolves out of the pixels, a step at a time
  if (t < E.T0) {
    const s = E.SEGMENTS[0]; drawView(await img(frameSrc(s[2], s[3])), s[4][0]);
    const steps = [96, 64, 40, 24, 16, 10, 6, 3], k = Math.min(steps.length - 1, Math.floor((t - E.JINGLE) / (E.T0 - E.JINGLE) * steps.length));
    mosaic(steps[k]); return;
  }
  // act 2: footage
  for (const s of E.SEGMENTS) {
    const [a, b, shot, f0, views] = s; if (t < a || t >= b) continue;
    const f = f0 + Math.floor((t - a) * E.FPS + 1e-6), k = ease(clamp((t - a) / (b - a)));
    drawView(await img(frameSrc(shot, f)), views.length > 1 ? lerpView(views[0], views[1], k) : views[0]);
    if (t - a < 2 / E.FPS && a > E.T0) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 0, W, H); }
    return;
  }
  for (const [a, b, text] of E.CARDS) {
    if (t < a || t >= b) continue;
    const u = t - a, s = u < 0.07 ? 1.25 : u < 0.13 ? 1.1 : 1;
    pixelText(text, W / 2, H / 2, Math.round(150 * s), YEL, false); mosaic(u < 0.05 ? 12 : u < 0.1 ? 6 : 1); return;
  }
  // THIS. CHANGES. EVERYTHING. once more, in the game's font
  if (t < E.END) {
    let i = -1; E.STABS.forEach((s, k) => { if (t >= s) i = k; });
    if (i < 0) return;
    const u = t - E.STABS[i], r = mulberry(Math.floor(t * 30)), A = 18 * Math.exp(-u * 12);
    pixelText(E.WORDS[i], W / 2 + (r() - 0.5) * 2 * A, H / 2 + (r() - 0.5) * 2 * A, Math.round(250 * (u < 0.06 ? 1.3 : 1)), i === 2 ? YEL : '#fff7e6', false);
    if (u < 0.1) mosaic(u < 0.05 ? 16 : 8);
    return;
  }
  // the end card
  const u = t - E.END;
  pixelText('A point-and-click visit', W / 2, 300, 56, CYAN, false);
  pixelText('CASBS Quest', W / 2, 455, 270, YEL, false);
  pixelText('Fifty-four studies. One afternoon.', W / 2, 640, 78, '#fff7e6', false);
  if (u > 1.0) pixelText('ola.cx/semibart', W / 2, 820, 96, CYAN, false);
  const steps = [48, 24, 12, 6, 3]; const k = Math.floor(u / 0.08); if (k < steps.length) mosaic(steps[k]);
  if (u > 1.0 && u < 1.08) mosaic(4);
  const fade = clamp((t - (E.DUR - 0.9)) / 0.8); if (fade > 0) { g.fillStyle = `rgba(0,0,0,${fade})`; g.fillRect(0, 0, W, H); }
}
window.renderAt = renderAt;
