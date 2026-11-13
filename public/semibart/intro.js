// The demo intro (ola.cx/semibart/demo.html): the trailer's opening, live, over the real game.
// Black, one line ("Click to begin. Sound on." — browsers play no sound before a click), then
// THIS. / CHANGES. / EVERYTHING. in 3D metal (intro3d.js) with braams, whooshes and glitter; at the
// peak the frame freezes and crumbles into the game's palette in ever bigger blocks that fall away,
// the chord powers down as square waves, and on the jingle the game's own Start runs: the title card
// goes (for anyone signed in), the jingle plays, and the live game steps out of the mosaic. The theme
// (music.js) comes in on the next downbeat and loops. Esc or a click skips to the game.
// The clock is the game's AudioContext, so the picture cannot drift from the sound.
import { createIntro3D } from '/semibart/intro3d.js';

const E = { HITS: [1.2, 3.6, 6.0], WORDS: ['THIS.', 'CHANGES.', 'EVERYTHING.'], WORD_OUT: [3.0, 5.4], RISER: [6.7, 8.4], CRUMBLE: [8.4, 9.05], JINGLE: 9.2, T0: 10.0 };
const q = window.quest;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/* ---------- the overlay ---------- */
const css = document.createElement('style');
css.textContent = `
#qIntro { position: fixed; inset: 0; z-index: 9999; background: #000; cursor: pointer; overflow: hidden; }
#qIntro canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#qIntro .qi-go { position: absolute; inset: 0; display: grid; place-items: center; font-family: var(--font); color: #fff7e6; font-size: max(22px, 2.4vw); letter-spacing: 0.04em; }
#qIntro .qi-go span { animation: qiPulse 1.6s ease-in-out infinite; }
#qIntro .qi-skip { position: absolute; right: 2vw; bottom: 2vh; font-family: var(--font); color: rgba(255, 247, 230, 0.35); font-size: max(14px, 1.2vw); }
@keyframes qiPulse { 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) { #qIntro .qi-go span { animation: none; } }`;
document.head.appendChild(css);
const box = document.createElement('div'); box.id = 'qIntro';
box.innerHTML = '<div class="qi-go"><span>Click to begin. Sound on.</span></div>';
document.body.appendChild(box);
const go = box.querySelector('.qi-go');
const flat = document.createElement('canvas'), fg = flat.getContext('2d');

let W = innerWidth, H = innerHeight;
const DPR = Math.min(devicePixelRatio || 1, 1.5);
let three = null, threeErr = null;
const ready = createIntro3D({ E, fontUrl: '/semibart/intro/Anton.ttf', width: W, height: H, pixelRatio: DPR })
  .then(x => { three = x; three.canvas.style.visibility = 'hidden'; box.insertBefore(three.canvas, go); })
  .catch(e => { threeErr = e; console.error('[intro]', e); });
box.appendChild(flat); flat.style.zIndex = 1; go.style.zIndex = 2;
function size() { W = innerWidth; H = innerHeight; flat.width = W; flat.height = H; if (three) three.setSize(W, H); }
size(); addEventListener('resize', size);

/* ---------- the sound of act 1 (the trailer's score, live) ---------- */
let bus = null;
function scheduleSound(AC, T) {
  bus = AC.createGain(); bus.gain.value = q.isMuted && q.isMuted() ? 0 : 0.9;
  const comp = AC.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
  comp.connect(bus).connect(AC.destination);
  const SR = AC.sampleRate, hall = AC.createConvolver(), irLen = Math.floor(SR * 4.5), ir = AC.createBuffer(2, irLen, SR);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2) * (i < 600 ? i / 600 : 1); }
  hall.buffer = ir; const hallOut = AC.createGain(); hallOut.gain.value = 0.55; hall.connect(hallOut).connect(comp);
  const trailer = AC.createGain(); trailer.connect(comp); const wet = AC.createGain(); wet.gain.value = 0.9; trailer.connect(wet).connect(hall);
  const chip = AC.createGain(); chip.gain.value = 0.85; chip.connect(comp);
  const noiseBuf = AC.createBuffer(1, SR * 2, SR); { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  function tone(freq, dur, type, vol, t, slideTo, to) {
    const o = AC.createOscillator(), gn = AC.createGain(); o.type = type; o.frequency.setValueAtTime(freq, T + t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, T + t + dur);
    gn.gain.setValueAtTime(0.0001, T + t); gn.gain.exponentialRampToValueAtTime(vol, T + t + 0.008); gn.gain.exponentialRampToValueAtTime(0.0001, T + t + dur);
    o.connect(gn).connect(to); o.start(T + t); o.stop(T + t + dur + 0.03);
  }
  function noise(dur, vol, f1, f2, t, qv, ftype, to) {
    const src = AC.createBufferSource(), f = AC.createBiquadFilter(), gn = AC.createGain(); src.buffer = noiseBuf; f.type = ftype; f.Q.value = qv;
    f.frequency.setValueAtTime(f1, T + t); if (f2) f.frequency.exponentialRampToValueAtTime(f2, T + t + dur);
    gn.gain.setValueAtTime(0.0001, T + t); gn.gain.exponentialRampToValueAtTime(vol, T + t + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, T + t + dur);
    src.connect(f).connect(gn).connect(to); src.start(T + t, Math.random() * 0.5); src.stop(T + t + dur + 0.03);
  }
  const shaper = AC.createWaveShaper(); { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) c[i] = Math.tanh((i / 511.5 - 1) * 2.4); shaper.curve = c; }
  shaper.connect(trailer);
  function braam(t, root, big, hold) {
    const len = hold || 3.2, parts = big ? [1, 1.5, 2, 2.4, 3, 4] : [1, 1.5, 2, 3], at = T + t;
    const f = AC.createBiquadFilter(), g = AC.createGain(); f.type = 'lowpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(120, at); f.frequency.exponentialRampToValueAtTime(big ? 3200 : 2200, at + 0.06); f.frequency.exponentialRampToValueAtTime(260, at + len);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(big ? 0.34 : 0.28, at + 0.025); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    f.connect(g).connect(shaper);
    parts.forEach((m, i) => [-9, 0, 9].forEach(c => { const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = root * m * Math.pow(2, c / 1200);
      const og = AC.createGain(); og.gain.value = (i === 0 ? 0.5 : 0.32) / (1 + i * 0.25); o.connect(og).connect(f); o.start(at); o.stop(at + len + 0.05); }));
    tone(root / 2, len * 0.8, 'sine', 0.7, t, root / 2 * 0.72, trailer);
    tone(70, 0.5, 'sine', 0.9, t, 32, trailer);
    noise(0.7, 0.9, 4000, 90, t, 0.7, 'lowpass', trailer);
    if (big) [523, 1187, 1730, 2611].forEach((fr, i) => tone(fr, 2.6 - i * 0.4, 'sine', 0.05, t, fr * 0.985, trailer));
    return g;
  }
  const C2 = 65.41, Ab1 = 51.91, H0 = E.HITS[0];
  { const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o.frequency.value = C2 / 2;
    g.gain.setValueAtTime(0.0001, T); g.gain.exponentialRampToValueAtTime(0.35, T + H0 - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, T + H0 + 0.02);
    o.connect(g).connect(trailer); o.start(T); o.stop(T + H0 + 0.1); }
  for (let t = 0.2; t < H0; t += 0.5) noise(0.03, 0.12, 3200, null, t, 6, 'bandpass', trailer);
  const rs = (k => () => { k = (k * 16807) % 2147483647; return k / 2147483647; })(12345);
  E.HITS.forEach((h, i) => {
    const src = AC.createBufferSource(), f = AC.createBiquadFilter(), gw = AC.createGain(); src.buffer = noiseBuf;
    f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(350, T + h - 0.45); f.frequency.exponentialRampToValueAtTime(6000, T + h);
    gw.gain.setValueAtTime(0.0001, T + h - 0.45); gw.gain.exponentialRampToValueAtTime(0.5, T + h - 0.01); gw.gain.linearRampToValueAtTime(0.0001, T + h + 0.02);
    src.connect(f).connect(gw).connect(trailer); src.start(T + h - 0.45); src.stop(T + h + 0.05);
    for (let k = 0; k < 26 + i * 10; k++) { const w = Math.pow(rs(), 1.7) * 1.8; tone(2400 + rs() * 6000, 0.25 + rs() * 0.5, 'sine', 0.035 * (1 - w / 2), h + 0.04 + w, 0, trailer); }
  });
  for (let t = E.RISER[0]; t < E.RISER[1]; t += 0.06 - 0.04 * (t - E.RISER[0]) / (E.RISER[1] - E.RISER[0])) tone(3000 + rs() * 5000, 0.18, 'sine', 0.02, t, 0, trailer);
  braam(E.HITS[0], C2, false);
  braam(E.HITS[1], Ab1, false);
  const last = braam(E.HITS[2], C2, true, E.CRUMBLE[0] - E.HITS[2] + 1.2);
  const [r0, r1] = E.RISER, cut = AC.createGain(); cut.gain.setValueAtTime(1, T); cut.gain.setValueAtTime(1, T + r1 - 0.004); cut.gain.linearRampToValueAtTime(0, T + r1); cut.connect(trailer);
  last.gain.cancelScheduledValues(T + r1 - 0.01); last.gain.setValueAtTime(0.05, T + r1 - 0.01); last.gain.linearRampToValueAtTime(0, T + r1 + 0.02);
  { const src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); src.buffer = noiseBuf; src.loop = true;
    f.type = 'bandpass'; f.Q.value = 1.8; f.frequency.setValueAtTime(300, T + r0); f.frequency.exponentialRampToValueAtTime(9000, T + r1);
    g.gain.setValueAtTime(0.0001, T + r0); g.gain.exponentialRampToValueAtTime(0.5, T + r1); src.connect(f).connect(g).connect(cut); src.start(T + r0); src.stop(T + r1 + 0.05);
    const o = AC.createOscillator(), og = AC.createGain(), of = AC.createBiquadFilter(); o.type = 'sawtooth'; of.type = 'lowpass'; of.frequency.value = 2500;
    o.frequency.setValueAtTime(C2 * 2, T + r0); o.frequency.exponentialRampToValueAtTime(C2 * 16, T + r1);
    og.gain.setValueAtTime(0.0001, T + r0); og.gain.exponentialRampToValueAtTime(0.16, T + r1); o.connect(of).connect(og).connect(cut); o.start(T + r0); o.stop(T + r1 + 0.05);
    for (let t = r0, gap = 0.3; t < r1; t += gap, gap = Math.max(0.035, gap * 0.86)) { tone(1400, 0.03, 'square', 0.05 + 0.1 * (t - r0) / (r1 - r0), t, 0, cut); tone(70, 0.08, 'sine', 0.001 + 0.3 * (t - r0) / (r1 - r0), t, 45, cut); } }
  const [k0, k1] = E.CRUMBLE;
  [261.63, 311.13, 392.0, 523.25].forEach((fr, i) => tone(fr, k1 - k0, 'square', 0.055, k0 + i * 0.012, fr / 4, chip));
  noise(0.35, 0.3, 3000, 400, k0, 1, 'bandpass', chip);
  for (let i = 0; i < 8; i++) noise(0.04, 0.1, 1200 + i * 300, null, k0 + 0.05 + i * 0.07, 4, 'bandpass', chip);
  // the jingle itself is the game's: start() plays it
}

/* ---------- the crumble and the reveal, on the flat canvas ---------- */
const PAL = [[255, 255, 85], [230, 181, 71], [255, 247, 230], [85, 255, 255], [168, 115, 42]];
let frozen = null, cells = null;
function mosaicFrom(src, sw, sh, b, dx, dy, dw, dh) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(sw / b)); c.height = Math.max(1, Math.ceil(sh / b));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  fg.imageSmoothingEnabled = false; fg.drawImage(c, 0, 0, c.width, c.height, dx, dy, c.width * b * dw / sw, c.height * b * dh / sh); fg.imageSmoothingEnabled = true;
}
function crumble(t) {
  const [k0, k1] = E.CRUMBLE, p = (t - k0) / (k1 - k0), sc = H / 1080;
  if (!frozen) { frozen = document.createElement('canvas'); frozen.width = W; frozen.height = H; if (three) frozen.getContext('2d').drawImage(three.canvas, 0, 0, W, H); if (three) three.canvas.style.visibility = 'hidden'; }
  fg.fillStyle = '#000'; fg.fillRect(0, 0, W, H);
  const steps = [3, 5, 8, 12, 16, 24].map(b => Math.max(2, Math.round(b * sc))), k = Math.min(steps.length - 1, Math.floor(p / 0.32 * steps.length)), b = steps[k];
  if (k < 3) { mosaicFrom(frozen, W, H, b, 0, 0, W, H); return; }
  // from here every block is one of the game's colours, and they fall
  if (!cells || cells.b !== b) {
    const c = document.createElement('canvas'); c.width = Math.ceil(W / b); c.height = Math.ceil(H / b); const x = c.getContext('2d'); x.drawImage(frozen, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data, r = mulberry(5), list = [];
    for (let y = 0; y < c.height; y++) for (let i = 0; i < c.width; i++) {
      const o = (y * c.width + i) * 4, R = d[o], G = d[o + 1], B = d[o + 2], lum = 0.3 * R + 0.59 * G + 0.11 * B;
      const delay = r() * 0.5, side = r() - 0.5, sp = 0.7 + r() * 0.6; if (lum < 60) continue;
      let best = PAL[0], bd = 1e9; for (const P of PAL) { const dd = (P[0] - R) ** 2 + (P[1] - G) ** 2 + (P[2] - B) ** 2; if (dd < bd) { bd = dd; best = P; } }
      list.push([i, y, `rgb(${best[0]},${best[1]},${best[2]})`, clamp((lum - 40) / 80), delay, side, sp]);
    }
    cells = { b, list };
  }
  const qv = clamp((p - 0.32) / 0.68), gap = b >= 8 ? 2 : 0;
  for (const [i, y, col, a, delay, side, sp] of cells.list) {
    const v = clamp((qv - delay) / (1 - delay)); fg.globalAlpha = a * clamp(1.15 - v); fg.fillStyle = col;
    fg.fillRect(i * b + side * 220 * sc * v, y * b + v * v * H * 1.1 * sp, b - gap, b - gap);
  }
  fg.globalAlpha = 1;
}
// the live game, stepping out of the mosaic onto the stage
function reveal(t) {
  fg.fillStyle = '#000'; fg.fillRect(0, 0, W, H);
  const cv = document.getElementById('cv'), r = document.getElementById('stage').getBoundingClientRect();
  const steps = [32, 20, 12, 8, 5, 3, 2], k = Math.min(steps.length - 1, Math.floor((t - E.JINGLE) / (E.T0 - E.JINGLE) * steps.length));
  mosaicFrom(cv, cv.width, cv.height, steps[k], r.left, r.top, r.width, r.height);
}

/* ---------- running it ---------- */
let AC = null, T = 0, started = false, done = false, gameOn = false;
function startGame() {
  if (gameOn) return; gameOn = true;
  if (q.me) q.start();                 // signed in: the title card goes, the jingle plays, the theme follows
}
function finish() {
  if (done) return; done = true;
  startGame();
  box.style.transition = 'opacity 0.25s'; box.style.opacity = '0';
  setTimeout(() => { box.remove(); if (three) three.dispose(); }, 300);
  removeEventListener('keydown', keys, true);
}
function skip() {
  if (bus && AC) bus.gain.setTargetAtTime(0, AC.currentTime, 0.05);
  finish();
}
function frame() {
  if (done) return;
  const t = AC.currentTime - T;
  if (t < E.CRUMBLE[0]) {
    if (three) { three.canvas.style.visibility = 'visible'; three.render(Math.max(0, t)); }
    fg.clearRect(0, 0, W, H);
    if (!three) { fg.fillStyle = '#000'; fg.fillRect(0, 0, W, H); }
  } else if (t < E.CRUMBLE[1]) crumble(t);
  else if (t < E.JINGLE) { fg.fillStyle = '#000'; fg.fillRect(0, 0, W, H); }
  else if (t < E.T0) { startGame(); if (q.me) reveal(t); else { finish(); return; } }
  else { finish(); return; }
  requestAnimationFrame(frame);
}
async function begin() {
  if (started) return; started = true;
  const s = q.sound(); AC = s.ac;                 // inside the click: the browser lets the sound start
  if (!AC) { finish(); return; }
  go.innerHTML = '<span>&nbsp;</span>';
  await ready;
  if (threeErr) { finish(); return; }            // no WebGL: straight into the game
  T = AC.currentTime + 0.2;
  scheduleSound(AC, T);
  const sk = document.createElement('div'); sk.className = 'qi-skip'; sk.textContent = 'Esc to skip'; sk.style.zIndex = 3; box.appendChild(sk);
  requestAnimationFrame(frame);
}
function keys(e) {
  if (done) return;
  e.stopPropagation();
  if (e.key === 'Escape') { e.preventDefault(); if (started) skip(); else { started = true; finish(); } }
  else if (!started && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); begin(); }
}
addEventListener('keydown', keys, true);
box.addEventListener('click', e => { e.stopPropagation(); if (!started) begin(); else skip(); });
