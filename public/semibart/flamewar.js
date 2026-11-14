/* CASBS Quest, the question mic at the seminar (2026-11-13; physical comedy since 2026-11-14).
   Rides on the game through window.quest.
   - A floor mic stands in the Margaret Levi Meeting Room, between the end of the table and the
     presenter. Click it: the mic goes live, the speakers squeal, and a line opens along the bottom.
     Type a comment (it is never a question), or press "Stir up some stuff for me".
   - The server (src/lib/semibart/flamewar.ts, POST /api/semibart/flamewar) writes a short scene in
     one Claude call: a few words and a string of moves from a fixed vocabulary. This file plays it.
     Every move is a body or an object doing something: rise, slam, throw (paper rain), spill (coffee
     along the table), jump (onto the table), storm (out the door), faint (under the table), clap
     (a slow clap the room picks up), spin, music (disco, tango, polka), dance, conga (out the door),
     alarm (sprinklers), lights (a blackout), freeze (a cricket), turkey (it walks in).
   - From the first move on, this file draws the six people itself: S.sem.pose[k] tells the game to
     leave a body alone, S.sem.at[k] says where its lines float. Bodies behind the table go in
     HOOKS.seminarBack (the table hides their legs), bodies on and in front of it in seminarMid.
     Level 9 (2026-11-14, evening): the room stares and the clock ticks while the scene is written
     (no murmurs), the chaos starts after two lines at most, nobody sits back down, and the new moves
     wreck the room: smash (a mug through the window), kick (the trash can across the room), screen
     (torn down, hanging by a corner), storm slam (the clock falls off the wall) or open (the door
     swings), lights (the ceiling light ends up hanging by a wire, flickering).
   - The mess stays. The server keeps every scene's moves (src/lib/semibart/seminar.ts); whoever walks
     in next finds the room empty and wrecked the same way (buildWreck, through HOOKS.seminarEnter and
     seminarWall), and a broom by the screen. Sweeping puts it all back for everyone and brings in
     next week's seminar. Loaded by notes.js. */
(() => {
'use strict';
const q = window.quest;
if (!q || !q.hooks || !q.hooks.seminarMid || !q.hooks.seminarBack || !q.seminar || window.questFlamewar) return;
const G = q.gfx, g = G.g, S = q.S, R = (x, y, w, h, c) => G.rect(g, x, y, w, h, c);
const stage = document.getElementById('stage');
const INK = '#141414', PAPER = '#fff7e6', COFFEE = '#5a3418', COFFEE_HI = '#8a5a30';
const now = () => performance.now() / 1000;
const me = () => (q.me && q.me.character) || '';
const fw = { live: false, busy: false, done: false };
// The show's state. B: the bodies flamewar.js draws, by slug. Reset when you leave the room.
let B = {}, FX = null;
const freshFX = () => ({ papers: [], drops: [], drips: [], spills: [], floorCoffee: [], water: [], steam: [], alarm: 0, dark: 0, disco: 0, tk: null, shake: 0, clapT: 0,
  // the wreck, what lasts: the window, the trash can and its garbage, the screen, the light, the clock, the door
  win: null, shards: [], mugFly: null, wind: 0, can: { x: CAN_X, y: 128, mode: 'stand', rot: 0 }, garbage: [], scr: null, tube: null,
  clock: { mode: 'wall', x: 230, y: 26, vy: 0 }, door: 0, doorSwing: 0, ball: false, prints: [], mugs: [], soggy: false,
  persist: null, sweeping: false, broom: 'wall' });
const CAN_X = 72;
FX = freshFX();

/* ---------- the mic: a floor stand, 13 wide, base on the floor at y 128 ---------- */
const MX = 256;   // the pole
q.hooks.seminarMid.push(t => {
  const calm = G.calm;
  R(MX - 9, 129, 21, 1, 'rgba(20,20,20,0.25)');
  R(MX - 7, 127, 15, 2, INK); R(MX - 6, 127, 13, 1, '#3b3d4a');   // the base
  for (let i = 0; i < 26; i++) R(MX + 8 + i, 128 + (i % 9 < 4 ? 0 : 1), 1, 1, INK);   // the cable, off to the wall
  R(MX, 95, 2, 32, INK); R(MX, 95, 1, 32, '#5a5d6b');   // the pole
  R(MX - 1, 98, 4, 3, INK);   // the clamp
  R(MX - 2, 91, 6, 7, INK); R(MX - 1, 92, 4, 5, '#8a8c99'); R(MX - 1, 92, 4, 1, '#c4c6cf'); R(MX, 94, 1, 1, '#5a5d6b'); R(MX + 2, 95, 1, 1, '#5a5d6b');   // the head
  const on = fw.live && (calm || Math.floor(t * 2.5) % 4 !== 0);
  R(MX, 99, 2, 1, on ? '#ff3b2f' : '#3b1612');
  if (fw.live && !calm) { const k = Math.floor(t * 6) % 3; R(MX + 5 + k * 2, 89 - k, 1, 1, 'rgba(255,255,255,0.7)'); R(MX - 5 - k * 2, 89 - k, 1, 1, 'rgba(255,255,255,0.7)'); }
});
const canCut = () => S.scene === 'room' && S.room === 'seminar' && !fw.busy && !fw.done && !S.sem.wild && !S.sem.gone.size && !panel;
const MIC_ON = { look: () => q.say('you', FX.persist ? 'The question mic. It has done enough.' : 'The question mic. Nobody has asked a question at it since 2009.'), use: () => grabMic(), talk: () => grabMic(), open: () => grabMic() };
q.hooks.seminarSpots.push(() => [
  { name: 'microphone', r: [MX - 11, 82, 23, 52], walk: { x: MX - 12, y: 134 }, def: 'use', interrupt: canCut, on: MIC_ON },
  { name: 'microphone', r: [MX + 12, 124, 26, 9], walk: { x: MX - 12, y: 134 }, def: 'use', interrupt: canCut, on: MIC_ON },
]);

/* ---------- sound: everything on the game's AudioContext, silent when muted ---------- */
function au() { const s = q.sound && q.sound(); return s && s.ac && !(q.isMuted && q.isMuted()) ? s : null; }
function tone(f, dur, type, vol, when, slide, dest) {
  const s = au(); if (!s) return;
  const t = s.ac.currentTime + (when || 0), o = s.ac.createOscillator(), gn = s.ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(vol, t + 0.006); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(gn).connect(dest || s.master); o.start(t); o.stop(t + dur + 0.02);
}
let nbuf = null;
function noise(dur, vol, f1, f2, when, ftype, dest) {
  const s = au(); if (!s) return;
  const ac = s.ac, t = ac.currentTime + (when || 0);
  if (!nbuf) { nbuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const src = ac.createBufferSource(), fl = ac.createBiquadFilter(), gn = ac.createGain();
  src.buffer = nbuf; fl.type = ftype || 'bandpass'; fl.frequency.setValueAtTime(f1, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(vol, t + 0.005); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl).connect(gn).connect(dest || s.master); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
}
const SND = {
  thud() { noise(0.18, 0.6, 300, 80, 0, 'lowpass'); tone(80, 0.18, 'sine', 0.5, 0, 45); },
  scrape() { noise(0.35, 0.12, 900, 300, 0, 'bandpass'); tone(140, 0.3, 'sawtooth', 0.03, 0, 90); },
  flutter() { for (let i = 0; i < 10; i++) noise(0.05, 0.12, 3500, 2000, i * 0.06 + Math.random() * 0.03, 'bandpass'); },
  glug() { [0, 0.13, 0.24, 0.33].forEach((w, i) => tone(320 - i * 40, 0.09, 'sine', 0.18, w, 180)); noise(0.6, 0.08, 1200, 400, 0.1, 'lowpass'); },
  splash() { noise(0.4, 0.25, 2500, 600, 0, 'bandpass'); },
  clap(v) { noise(0.07, v || 0.4, 1600, 900, 0, 'bandpass'); noise(0.03, (v || 0.4) * 0.6, 3000, null, 0.01, 'highpass'); },
  spin() { noise(1.2, 0.12, 400, 2600, 0, 'bandpass'); tone(300, 1.2, 'triangle', 0.04, 0, 900); },
  crash() { noise(0.5, 0.5, 2000, 300, 0, 'bandpass'); noise(0.3, 0.4, 400, 100, 0.15, 'lowpass'); tone(90, 0.2, 'square', 0.1, 0.2, 50); },
  siren() { for (let i = 0; i < 4; i++) { tone(880, 0.25, 'square', 0.05, i * 0.5); tone(660, 0.25, 'square', 0.05, i * 0.5 + 0.25); } },
  fall() { tone(700, 0.9, 'triangle', 0.07, 0, 120); },
  boing() { tone(160, 0.35, 'triangle', 0.25, 0, 700); },
  scratch() { noise(0.12, 0.35, 600, 3500, 0, 'bandpass'); noise(0.16, 0.3, 3000, 500, 0.12, 'bandpass'); },
  glass() { noise(0.5, 0.5, 5000, 2500, 0, 'highpass'); for (let i = 0; i < 14; i++) tone(2400 + Math.random() * 3000, 0.05 + Math.random() * 0.12, 'sine', 0.05, Math.random() * 0.45); },
  clang() { tone(520, 0.4, 'square', 0.07, 0, 470); tone(783, 0.35, 'square', 0.05, 0, 740); noise(0.15, 0.3, 1800, 900, 0, 'bandpass'); },
  wind() { noise(2.6, 0.18, 300, 1100, 0, 'bandpass'); noise(2.0, 0.08, 1500, 600, 0.4, 'bandpass'); },
  tick(v) { noise(0.025, v || 0.25, 4200, null, 0, 'highpass'); tone(1900, 0.02, 'square', 0.03); },
  rumble() { tone(55, 1.6, 'sawtooth', 0.05, 0, 48); },
  zap() { noise(0.06, 0.12, 6000, 2000, 0, 'bandpass'); tone(120, 0.08, 'square', 0.03); },
  tink() { [0, 0.07, 0.15].forEach(w => tone(3200 + Math.random() * 1500, 0.08, 'sine', 0.06, w)); },
  swish() { noise(0.22, 0.14, 1400, 3200, 0, 'bandpass'); },
};

/* ---------- the party music: three styles, scheduled ahead on the game's clock ---------- */
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const STYLES = {
  disco: { bpm: 120, bar(s, t, b, bus) {   // four on the floor, open hats, octave bass, stabs on the off-beats
    const sp = 60 / 120, roots = [45, 50, 43, 48], r = roots[b % 4];
    for (let i = 0; i < 4; i++) {
      const tt = t + i * sp - s.ac.currentTime;
      tone(150, 0.12, 'sine', 0.5, tt, 50, bus); noise(0.07, 0.1, 9000, null, tt + sp / 2, 'highpass', bus);
      if (i % 2) noise(0.1, 0.25, 1800, 900, tt, 'bandpass', bus);
      [0, 0.5].forEach(o => tone(mtof(r + (o ? 12 : 0)), sp / 2 - 0.02, 'square', 0.06, tt + o * sp, null, bus));
      if (i % 2) [12, 15, 19].forEach(n => tone(mtof(r + n + 12), 0.09, 'sawtooth', 0.025, tt + sp * 0.5, null, bus));
    } } },
  tango: { bpm: 112, bar(s, t, b, bus) {   // four marcato chords, the habanera in the bass, a roll at the end of every other bar
    const sp = 60 / 112, roots = [50, 50, 45, 50], r = roots[b % 4], ch = b % 4 === 2 ? [0, 4, 7] : [0, 3, 7];
    [0, 0.75, 1, 1.5, 2, 2.75, 3, 3.5].forEach((p, i) => tone(mtof(r - 12 + (i % 2 ? 7 : 0)), 0.16, 'triangle', 0.18, t + p * sp - s.ac.currentTime, null, bus));
    for (let i = 0; i < 4; i++) ch.forEach(n => tone(mtof(r + 12 + n), 0.08, 'sawtooth', i % 2 ? 0.02 : 0.035, t + i * sp - s.ac.currentTime, null, bus));
    if (b % 2) [3.25, 3.5, 3.75].forEach(p => tone(mtof(r + 24), 0.06, 'square', 0.03, t + p * sp - s.ac.currentTime, null, bus));
  } },
  polka: { bpm: 132, bar(s, t, b, bus) {   // oom-pah, and a cheerful line on top
    const sp = 60 / 132, roots = [53, 48, 53, 48], r = roots[b % 4], mel = [[12, 16, 19, 16], [14, 17, 19, 17], [12, 16, 19, 24], [19, 17, 14, 11]][b % 4];
    for (let i = 0; i < 4; i++) {
      const tt = t + i * sp - s.ac.currentTime;
      tone(mtof(r - 12 + (i % 2 ? 7 : 0)), 0.14, 'triangle', 0.2, tt, null, bus);
      [4, 7, 12].forEach(n => tone(mtof(r + n), 0.08, 'square', 0.02, tt + sp / 2, null, bus));
      tone(mtof(r + mel[i] + 12), sp * 0.8, 'square', 0.035, tt, null, bus);
    } } },
};
const party = { style: null, bpm: 120, t0: 0, timer: 0, next: 0, bar: 0, bus: null };
function startMusic(style) {
  stopMusic(true);
  const st = STYLES[style] || STYLES.disco;
  party.style = style; party.bpm = st.bpm; party.t0 = now(); party.bar = 0;
  if (window.questMusic) window.questMusic.stop();
  const s = q.sound && q.sound(); if (!s || !s.ac) return;
  party.bus = s.ac.createGain(); party.bus.gain.value = 0.9; party.bus.connect(s.master);
  party.next = s.ac.currentTime + 0.05;
  const barLen = 4 * 60 / st.bpm;
  party.timer = setInterval(() => {
    const ss = au(); if (!ss) { party.next = s.ac.currentTime + 0.05; return; }
    while (party.next < ss.ac.currentTime + 0.25) { st.bar(ss, party.next, party.bar++, party.bus); party.next += barLen; }
  }, 50);
}
function stopMusic(quick) {
  if (party.timer) clearInterval(party.timer); party.timer = 0;
  const s = q.sound && q.sound();
  if (party.bus && s && s.ac) { const b = party.bus; b.gain.setTargetAtTime(0, s.ac.currentTime, quick ? 0.03 : 0.4); setTimeout(() => { try { b.disconnect(); } catch (e) {} }, 3000); }
  party.bus = null; party.style = null;
}
// the beat, for everyone who dances: 0..1 through each beat, also when the sound is off
const beat = () => ((now() - party.t0) * party.bpm / 60);

/* ---------- bodies ---------- */
const PRES_F = 128, TABLE_F = 96, SEAT_Y = 66;
const seatX = k => { const a = q.seminar.seats().find(s => s.k === k); return a ? a.x : null; };
function take() {
  B = {};
  const pr = q.seminar.presenter();
  q.seminar.cast().forEach(k => {
    if (k === me() || S.sem.gone.has(k)) return;
    const sx = seatX(k);
    B[k] = sx === null ? { k, mode: 'stand', x: pr.x, F: PRES_F, arms: 'down', pres: true } : { k, mode: 'seat', x: sx, F: PRES_F, lift: 0, arms: 'down', seat: sx, papers: true, mug: 'up' };
    S.sem.pose[k] = true;
  });
}
const present = () => Object.values(B).filter(b => b.mode !== 'gone');
const talking = k => !!(S.line && S.line.who === k && (G.calm || Math.floor(now() * 8) % 2 === 0));
// a whole standing figure, 28 wide, feet at F (the presenter's proportions)
function fig(b, t) {
  const o = q.LOOKS[b.k]; if (!o) return;
  const dancing = b.dance && !G.calm, ph = beat(), on = Math.floor(ph) % 2;
  const bob = dancing ? (Math.floor(ph * 2) % 2) * 2 : 0, x = Math.round(b.x), F = Math.round(b.F) - bob;
  let st = b.walk ? Math.floor(t * 9) % 2 : -1;
  if (dancing) st = on;
  R(x + 6, F - 44, 7, 40 - (st === 0 ? 3 : 0), '#2e3448'); R(x + 4, F - 4 - (st === 0 ? 3 : 0), 10, 4, INK);
  if (b.kick) { R(x + 15, F - 44, 7, 12, '#262b3c'); R(x + 18, F - 36, 20, 7, '#262b3c'); R(x + 36, F - 40, 5, 11, INK); }   // one leg out, mid-kick
  else { R(x + 15, F - 44, 7, 40 - (st === 1 ? 3 : 0), '#262b3c'); R(x + 14, F - 4 - (st === 1 ? 3 : 0), 10, 4, INK); }
  R(x + 2, F - 62, 24, 18, o.shirt); R(x + 2, F - 62, 2, 18, o.shirtD); R(x + 24, F - 62, 2, 18, o.shirtD);
  const look = b.spin ? (Math.floor(t * 12) % 2 ? 1 : -1) : b.look !== undefined ? b.look : Math.sign((S.x || 160) - x - 14);
  G.bust(o, x, F - 90, { talk: talking(b.k), look, blink: !G.calm && (t + x) % 4.3 < 0.12 });
  let arms = b.arms;
  if (dancing) arms = party.style === 'tango' ? (on ? 'left' : 'right') : party.style === 'polka' ? (on ? 'up' : 'down') : (on ? 'left' : 'up');
  if (b.clapping) arms = (b.clapPh || 0) < 0.15 ? 'clap' : 'clapOpen';
  armsOf(o, x, F, arms);
  if (FX.dark) return;
  if (b.wet) for (let i = 0; i < 3; i++) R(x + 4 + i * 9, F - 92 + ((t * 30 + i * 7) % 12), 1, 2, '#8ec8ff');
}
function armsOf(o, x, F, arms) {
  const up = (ax) => { R(ax, F - 80, 4, 18, o.shirt); R(ax, F - 84, 4, 4, o.skin); };
  const down = (ax, h) => { R(ax, F - 60, 4, h || 14, o.shirt); R(ax, F - 46, 4, 3, o.skin); };
  if (arms === 'up') { up(x - 2); up(x + 26); }
  else if (arms === 'left') { up(x - 2); down(x + 26); }
  else if (arms === 'right') { down(x - 2); up(x + 26); }
  else if (arms === 'over') { up(x - 2); up(x + 26); R(x - 4, F - 88, 36, 4, INK); R(x - 3, F - 87, 34, 2, PAPER); }
  else if (arms === 'clap' || arms === 'clapOpen') { const s = arms === 'clap' ? 0 : 3; R(x + 2, F - 58, 6, 4, o.shirt); R(x + 20, F - 58, 6, 4, o.shirt); R(x + 8 - s, F - 59, 4, 5, o.skin); R(x + 16 + s, F - 59, 4, 5, o.skin); }
  else if (arms === 'slam') { down(x - 2); R(x + 26, F - 62, 4, 6, o.shirt); R(x + 26, F - 56, 6, 5, o.skin); }
  else { down(x - 2); down(x + 26); }
}
// a seated bust, drawn where the game would, with the lift and the spin
function seatBust(b, t) {
  const o = q.LOOKS[b.k]; if (!o) return;
  const look = b.spin ? (Math.floor(t * 12) % 2 ? 1 : -1) : Math.sign((S.x || 160) - b.x - 14);
  const jit = b.spin && !G.calm ? (Math.floor(t * 12) % 2 ? 1 : -1) : 0;
  G.bust(o, b.x + jit, SEAT_Y - (b.lift || 0), { talk: talking(b.k), look, blink: !G.calm && (t + b.x) % 4.7 < 0.12 });
  if (b.clapping) { const s = (b.clapPh || 0) < 0.15 ? 0 : 3; R(b.x + 8 - s, SEAT_Y + 18 - (b.lift || 0), 4, 5, o.skin); R(b.x + 16 + s, SEAT_Y + 18 - (b.lift || 0), 4, 5, o.skin); }
}
const headY = b => b.mode === 'seat' ? SEAT_Y - (b.lift || 0) : b.mode === 'under' ? 98 : b.F - 90;
q.hooks.seminarBack.push(t => {
  for (const b of Object.values(B)) {
    S.sem.at[b.k] = b.mode === 'gone' ? undefined : [Math.round(b.x) + 14, headY(b) - 10];
    if (b.mode === 'seat') seatBust(b, t);
    else if (b.mode === 'stand' && !b.pres) fig(b, t);   // behind the table: it hides the legs
  }
});

/* ---------- the wreck: walls, window, ceiling, door (HOOKS.seminarWall, behind everybody) ---------- */
const CEIL = '#d9c9a8', CEIL_S = '#cbb994', GLINT = '#f4fbff';
function line(x0, y0, x1, y1, c, w) { const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))); for (let i = 0; i <= n; i++) R(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), w || 1, w || 1, c); }
// the projector screen as the room has it (index.html, seminarBg), on its own canvas so it can come down
const SCR = (() => { const c = document.createElement('canvas'); c.width = 68; c.height = 50; const m = c.getContext('2d'), r = (x, y, w, h, col) => G.rect(m, x - 248, y - 6, w, h, col);
  r(248, 6, 68, 2, INK); r(250, 8, 64, 46, '#f4f1ea'); r(250, 53, 64, 1, '#c9c3b4'); r(254, 12, 40, 4, '#2b3fff');
  [20, 25, 30, 35].forEach((y, i) => { r(256, y, 2, 2, INK); r(260, y, 30 - i * 5, 1, '#8a8478'); });
  r(296, 30, 4, 12, '#ff5a1f'); r(301, 24, 4, 18, '#2b3fff'); r(306, 34, 4, 8, '#ffd93b'); r(254, 46, 56, 1, '#c9c3b4'); r(300, 48, 10, 3, '#8a8478');
  return c; })();
const bare = (x, y, w, h) => { if (G.seminarBare) g.drawImage(G.seminarBare, x, y, w, h, x, y, w, h); };
// a hole in the glass: a jagged ring of points, and cracks running out to the frame
function makeWin(r, hx, hy) {
  const pts = [], n = 10;
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, rr = 5 + r() * 8; pts.push([Math.max(48, Math.min(118, hx + Math.cos(a) * rr * 1.2)), Math.max(18, Math.min(68, hy + Math.sin(a) * rr))]); }
  const cracks = [];
  for (let i = 0; i < 8; i++) {
    let [x, y] = pts[Math.floor(r() * n)], a = Math.atan2(y - hy, x - hx) + (r() - 0.5) * 0.6; const seg = [[x, y]];
    for (let k = 0; k < 6; k++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * (4 + r() * 6); y += Math.sin(a) * (4 + r() * 6); if (x < 47 || x > 119 || y < 17 || y > 69) break; seg.push([x, y]); }
    cracks.push(seg);
  }
  return { hx, hy, pts, cracks };
}
const tubeOn = t => G.calm || Math.sin(t * 23) + Math.sin(t * 7.3) + Math.sin(t * 1.7) > -1.1;
const doorAmt = () => { let d = FX.door; if (FX.doorSwing) { const a = now() - FX.doorSwing; d -= 0.3 * Math.exp(-a * 0.9) * Math.abs(Math.sin(a * 4)); } return Math.max(0, Math.min(1, d)); };
q.hooks.seminarWall.push(t => {
  if (pendingWreck) { buildWreck(pendingWreck); pendingWreck = null; }
  // the door, open or swinging
  const dv = doorAmt();
  if (dv > 0.01) {
    R(7, 33, 26, 73, '#1e150e'); R(9, 96, 22, 10, '#3a2a1c'); R(9, 35, 22, 2, '#2b1f15');
    const w = Math.max(3, Math.round(26 * (1 - 0.86 * dv)));
    R(7, 33, w, 73, '#b8733f'); R(7 + w - 1, 33, 1, 73, '#7d4a26');
    if (w > 10) { R(10, 37, w - 6, 28, '#a5653a'); R(10, 70, w - 6, 30, '#a5653a'); }
  }
  // the window: a hole, cracks, a turkey that came to look
  if (FX.win) {
    const w = FX.win;
    g.save(); g.beginPath(); g.rect(47, 17, 72, 52); w.pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.clip('evenodd');
    g.fillStyle = 'rgba(225,240,255,0.26)'; g.fillRect(47, 17, 72, 52); g.restore();
    if (FX.persist && !FX.tk && (G.calm || (t % 9) > 5)) { g.save(); g.beginPath(); w.pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.clip(); G.turkey(g, Math.round(w.hx) - 9, Math.round(w.hy) + 4 - (G.calm ? 0 : Math.floor(t * 3) % 2)); g.restore(); }
    w.pts.forEach((p, i) => { const n = w.pts[(i + 1) % w.pts.length]; line(p[0], p[1], n[0], n[1], GLINT); });
    w.cracks.forEach(c => { for (let i = 1; i < c.length; i++) line(c[i - 1][0], c[i - 1][1], c[i][0], c[i][1], 'rgba(244,251,255,0.85)'); });
  }
  // the clock, gone from its nail
  if (FX.clock.mode !== 'wall') { bare(221, 17, 19, 19); R(229, 18, 2, 2, INK); G.oval(g, 230, 26, 7, 7, 'rgba(255,240,200,0.10)'); }
  // the screen, hanging by one end of its rod
  if (FX.scr) {
    bare(247, 5, 71, 50);
    R(248, 6, 2, 2, INK);
    const a = FX.scr.t0 < 0 || G.calm ? FX.scr.a : FX.scr.a * (1 - Math.exp(-(now() - FX.scr.t0) * 5) * Math.cos((now() - FX.scr.t0) * 11));
    g.save(); g.translate(249, 7); g.rotate(a); g.drawImage(SCR, -1, -1); g.restore();
  }
  // the ceiling light, by one chain, flickering
  if (FX.tube) {
    R(140, -12, 22, 5, CEIL); R(160, -12, 3, 5, CEIL_S); R(150, -18, 2, 6, CEIL);
    const age = now() - FX.tube.t0, th = 1.2 + (G.calm ? 0 : Math.sin(age * 2.4) * 0.16 * Math.max(0.25, Math.exp(-age * 0.25))), on = tubeOn(t);
    R(141, -18, 1, 6, '#3b3d4a');
    const ex = 141 + Math.cos(th) * 22, ey = -12 + Math.sin(th) * 22;
    line(161, -18, ex, ey, '#3b3d4a');
    for (let i = 0; i <= 22; i++) { const x = 141 + Math.cos(th) * i, y = -12 + Math.sin(th) * i; R(Math.round(x) - 1, Math.round(y), 3, 2, on ? '#ffd96a' : '#8a8268'); }
    if (!on && !G.calm && Math.random() < 0.5) { R(Math.round(ex) + 1, Math.round(ey) + 1, 1, 1, '#fff3c4'); R(Math.round(ex) - 2, Math.round(ey) + 3, 1, 1, '#ffd93b'); if (fw.busy && Math.random() < 0.04) SND.zap(); }
  }
  // the mirror ball, left behind after the disco
  if (FX.ball && party.style !== 'disco') { R(158, 0, 1, 8, INK); G.disc(g, 158, 12, 5, '#9a9ca6'); R(156, 10, 2, 2, '#c4c6cf'); }
});

/* ---------- the mess, the table, the room ---------- */
function spawnPapers(x, y, n, spread) {
  const cap = G.calm ? 16 : 260;
  for (let i = 0; i < n && FX.papers.length < cap; i++) FX.papers.push({ x: x + (Math.random() - 0.5) * 8, y, vx: (Math.random() - 0.5) * (spread || 120), vy: -70 - Math.random() * 90, ph: Math.random() * 6, land: Math.random() < 0.6 ? 'table' : 'floor', ty: 91 + Math.random() * 6, fy: 126 + Math.random() * 13, rest: false });
}
function stepPapers(dt) {
  FX.papers.forEach(p => {
    if (p.rest) return;
    p.vy = Math.min(p.vy + 150 * dt, 24); p.vx *= 0.985; p.ph += dt * 7;
    p.x += (p.vx + (p.vy > 0 ? Math.sin(p.ph) * 18 : 0)) * dt; p.y += p.vy * dt;
    const onTable = p.x > 74 && p.x < 242 && p.land === 'table';
    const floor = onTable ? (p.ty || 94) : (p.fy || 130 + ((p.x * 7) % 9));
    if (p.vy > 0 && p.y >= floor) { p.y = floor; p.rest = true; }
  });
}
// garbage and glass: little things that fly, fall and stay where they land
function stepBits(arr, dt) {
  arr.forEach(p => { if (p.rest) return; p.vy += 300 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; if (p.x < 2 || p.x > 316) { p.vx = -p.vx * 0.4; p.x = Math.max(2, Math.min(316, p.x)); } if (p.vy > 0 && p.y >= p.fy) { p.y = p.fy; if (p.vy > 90) { p.vy = -p.vy * 0.3; p.vx *= 0.6; } else p.rest = true; } });
}
const JUNK = {
  ball(x, y) { R(x, y, 3, 3, '#f0ece0'); R(x, y, 1, 1, '#c9c2b0'); R(x + 2, y + 2, 1, 1, '#c9c2b0'); },
  peel(x, y) { R(x, y, 5, 2, '#f2cf4a'); R(x + 1, y - 1, 1, 1, '#7a5a1a'); R(x + 4, y + 1, 1, 1, '#d4a92c'); },
  soda(x, y) { R(x, y, 4, 2, '#d6402e'); R(x, y, 1, 2, '#c4c6cf'); },
  core(x, y) { R(x, y, 2, 3, '#e8dcb0'); R(x, y - 1, 1, 1, '#5a3418'); },
  cup(x, y) { R(x, y, 3, 4, '#ffffff'); R(x, y + 1, 3, 1, '#2b3fff'); },
};
function spawnJunk(x, y, n, sp) { const kinds = Object.keys(JUNK); for (let i = 0; i < n; i++) FX.garbage.push({ x, y, vx: (Math.random() - 0.3) * (sp || 220), vy: -60 - Math.random() * 140, fy: 124 + Math.random() * 15, k: kinds[Math.floor(Math.random() * kinds.length)], rest: false }); }
function drawCan(c, t) {
  const x = Math.round(c.x), y = Math.round(c.y), side = c.mode === 'down' || c.mode === 'roll' || (c.mode === 'fly' && Math.floor(c.rot) % 2 === 1);
  G.oval(g, x, y, 7, 1, 'rgba(20,20,20,0.22)');
  if (!side) {
    R(x - 6, y - 17, 13, 2, INK); R(x - 5, y - 15, 11, 15, INK); R(x - 4, y - 15, 9, 14, '#7b8494'); R(x - 4, y - 15, 2, 14, '#9aa3b2');
    R(x - 4, y - 10, 9, 1, '#5f6775'); R(x - 4, y - 5, 9, 1, '#5f6775');
    if (c.mode === 'stand') { R(x - 3, y - 20, 4, 3, PAPER); R(x + 1, y - 21, 3, 4, '#f0ece0'); R(x - 3, y - 20, 4, 1, INK); }
  } else {
    const f = c.face || -1;
    R(x - 9, y - 11, 18, 11, INK); R(x - 8, y - 10, 16, 9, '#7b8494'); R(x - 8, y - 10, 16, 2, '#9aa3b2');
    R(f < 0 ? x - 9 : x + 7, y - 11, 2, 11, '#2a2d33'); R(x - 3, y - 10, 1, 9, '#5f6775'); R(x + 3, y - 10, 1, 9, '#5f6775');
  }
}
function drawPapers() {
  FX.papers.forEach(p => {
    const x = Math.round(p.x), y = Math.round(p.y);
    const pc = FX.soggy ? '#d9e2e6' : PAPER;
    if (p.rest) { R(x - 1, y, 7, 3, INK); R(x, y, 5, 2, pc); return; }
    const w = Math.floor(p.ph) % 2 ? 6 : 2;
    R(x - 1, y - 1, w + 2, 7, INK); R(x, y, w, 5, pc); if (w > 3) R(x + 1, y + 1, w - 2, 1, '#c9c2b0');
  });
}
q.hooks.seminarMid.push(t => {
  const dt = Math.min(0.05, t - (FX.last || t)); FX.last = t;
  // coffee along the table top, and on the floor under it
  FX.spills.forEach(s => {
    const a = Math.min(1, (now() - s.t0) / 1.3), w = Math.round(s.w * a);
    R(Math.max(73, s.x - w), 95, Math.min(245, s.x + w) - Math.max(73, s.x - w), 3, COFFEE); R(Math.max(73, s.x - w) + 2, 95, Math.max(0, Math.min(245, s.x + w) - Math.max(73, s.x - w) - 6), 1, COFFEE_HI);
    if (a < 1 || now() - s.t0 < 4) if (!G.calm && Math.random() < 0.35) FX.drips.push({ x: s.x + (Math.random() - 0.5) * 2 * w, y: 100, vy: 10 });
  });
  FX.drips = FX.drips.filter(d => { d.vy += 200 * dt; d.y += d.vy * dt; if (d.y > 132) { FX.floorCoffee.push([d.x, 132 + Math.random() * 4]); return false; } R(Math.round(d.x), Math.round(d.y), 1, 2, COFFEE); return true; });
  if (FX.floorCoffee.length > 120) FX.floorCoffee.splice(0, FX.floorCoffee.length - 120);
  FX.floorCoffee.forEach(([x, y]) => G.oval(g, x, y, 4, 1, 'rgba(90,52,24,0.75)'));
  FX.water.forEach(([x, y]) => G.oval(g, x, y, 5, 1, 'rgba(142,200,255,0.45)'));
  // what is in front of each seat: the stack of papers and a mug
  for (const b of Object.values(B)) {
    if (b.seat === undefined) continue;
    const o = q.LOOKS[b.k], x = b.seat;
    if (b.papers) { R(x + 6, 92, 16, 3, PAPER); R(x + 6, 92, 16, 1, '#e6dcc4'); if (b.mode === 'seat' && !b.clapping) { R(x + 5, 92, 4, 2, o.skin); R(x + 19, 92, 4, 2, o.skin); } }
    const hop = FX.shake && now() - FX.shake < 0.25 && !G.calm ? 2 : 0;
    if (b.mug === 'up') { R(x + 22, 88 - hop, 6, 7, INK); R(x + 23, 89 - hop, 4, 5, '#e8e2d4'); R(x + 23, 89 - hop, 4, 1, COFFEE); R(x + 28, 90 - hop, 2, 3, INK); }
    else if (b.mug === 'down') { R(x + 20, 91, 8, 5, INK); R(x + 21, 92, 6, 3, '#e8e2d4'); R(x + 19, 93, 2, 2, COFFEE); }
  }
  // what the wreck left on the table and the floor
  FX.prints.forEach(x => { R(x + 4, 93, 4, 1, 'rgba(60,40,24,0.55)'); R(x + 16, 95, 4, 1, 'rgba(60,40,24,0.55)'); R(x + 9, 97, 4, 1, 'rgba(60,40,24,0.45)'); });
  FX.mugs.forEach(x => { R(x, 91, 8, 5, INK); R(x + 1, 92, 6, 3, '#e8e2d4'); R(x - 1, 93, 2, 2, COFFEE); });
  stepBits(FX.shards, dt); FX.shards.forEach(p => { if (p.rest && !G.calm && (Math.floor(t * 2 + p.x) % 7)) { R(Math.round(p.x), Math.round(p.y), 2, 1, 'rgba(200,230,255,0.8)'); return; } R(Math.round(p.x), Math.round(p.y), p.rest ? 2 : 1, p.rest ? 1 : 2, GLINT); });
  stepBits(FX.garbage, dt); FX.garbage.forEach(p => JUNK[p.k](Math.round(p.x), Math.round(p.y)));
  if (FX.clock.mode === 'floor') { const x = Math.round(FX.clock.x), y = Math.round(FX.clock.y); G.oval(g, x, y + 1, 7, 1, 'rgba(20,20,20,0.25)'); G.disc(g, x, y - 6, 7, INK); G.disc(g, x, y - 6, 6, '#fff7e6'); R(x, y - 10, 1, 4, INK); R(x - 3, y - 6, 3, 1, INK); line(x + 2, y - 11, x + 4, y - 5, '#8a8478'); }
  if (FX.can.mode !== 'fly') drawCan(FX.can, t);
  if (FX.persist && FX.broom === 'wall') { line(306, 62, 301, 114, '#e0c48a', 2); R(296, 113, 11, 3, '#c0392b'); R(294, 116, 14, 12, '#d9b45a'); for (let i = 0; i < 6; i++) R(295 + i * 2, 118, 1, 10, '#b8923a'); }
  for (const b of Object.values(B)) {
    if (b.mode === 'table' || b.mode === 'floor' || (b.mode === 'stand' && b.pres)) fig(b, t);
    if (b.mode === 'under' && !G.calm && Math.floor(t * 1.3 + b.x) % 3 === 0) { const o = q.LOOKS[b.k]; R(b.x + 12, 91, 4, 4, o.skin); R(b.x + 12, 89, 1, 2, o.skin); R(b.x + 15, 89, 1, 2, o.skin); }
  }
  // the turkey, when it has walked in
  if (FX.tk) {
    const k = FX.tk, x = Math.round(k.x), y = Math.round(k.F - 20 - (party.style && !G.calm ? (Math.floor(beat() * 2) % 2) * 3 : 0));
    g.save(); g.translate(x, y); g.scale(2, 2); G.turkey(g, 0, 0); g.restore();
    S.sem.at.turkey = [x + 20, y - 8];
  }
  stepPapers(dt);
  drawPapers();
});
q.hooks.seminarFront.push(t => {
  // steam off whoever is cross
  for (const b of Object.values(B)) if (b.steam && b.mode !== 'gone' && !G.calm && Math.random() < 0.4) FX.steam.push({ x: b.x + (Math.random() < 0.5 ? 1 : 25), y: headY(b) + 4, t0: t });
  FX.steam = FX.steam.filter(p => t - p.t0 < 1.1);
  FX.steam.forEach(p => { const a = t - p.t0, s = 2 + Math.floor(a * 4), al = (0.85 * (1 - a / 1.1)).toFixed(2); R(p.x + Math.round(Math.sin(a * 5 + p.x) * 2), p.y - Math.round(a * 20), s, s, `rgba(255,255,255,${al})`); });
  const dt = Math.min(0.05, t - (FX.lastF || t)); FX.lastF = t;
  // a mug on its way to the window
  if (FX.mugFly) { const m = FX.mugFly, a = Math.min(1, (now() - m.t0) / m.dur), x = Math.round(m.x0 + (m.x1 - m.x0) * a), y = Math.round(m.y0 + (m.y1 - m.y0) * a - Math.sin(a * Math.PI) * 18); R(x - 2, y - 2, 5, 5, INK); R(x - 1, y - 1, 3, 3, Math.floor(a * 12) % 2 ? '#e8e2d4' : COFFEE); }
  // the trash can in the air: across the room, off the wall, bounce, roll
  const c = FX.can;
  if (c.mode === 'fly' || c.mode === 'roll') {
    if (c.mode === 'fly') {
      c.vy += 420 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += dt * 14;
      if (c.junkT > 0) { c.junkT -= dt; if (Math.random() < 0.5) spawnJunk(c.x, c.y - 6, 1, 120); }
      if (c.x > 306 && c.vx > 0) { c.x = 306; c.vx = -c.vx * 0.5; SND.clang(); shake(2); spawnJunk(c.x, c.y - 6, 4, 160); }
      if (c.y >= 128 && c.vy > 0) { c.y = 128; c.vy = -c.vy * 0.42; c.vx *= 0.75; SND.clang(); if (Math.abs(c.vy) < 50) { c.mode = 'roll'; c.vy = 0; c.face = c.vx < 0 ? 1 : -1; } }
    } else { c.x += c.vx * dt; c.vx *= Math.pow(0.12, dt); if (Math.abs(c.vx) < 4) { c.mode = 'down'; c.vx = 0; } }
    if (c.mode === 'fly') drawCan(c, t);
  }
  // the clock, off its nail
  if (FX.clock.mode === 'fall') { const k = FX.clock; k.vy += 420 * dt; k.y += k.vy * dt; k.x += 6 * dt; if (k.y >= 128) { k.y = 128; if (k.vy > 120) { k.vy = -k.vy * 0.3; SND.thud(); } else { k.mode = 'floor'; SND.tink(); } } else { const x = Math.round(k.x), y = Math.round(k.y); G.disc(g, x, y - 6, 7, INK); G.disc(g, x, y - 6, 6, '#fff7e6'); R(x, y - 10, 1, 4, INK); R(x, y - 6, 3, 1, INK); } }
  // the wind through the broken window
  if (FX.win && FX.wind && !G.calm) { const a = now() - FX.wind, n = a < 3 ? 3 : (Math.random() < 0.2 ? 1 : 0); for (let i = 0; i < n; i++) FX.streaks = (FX.streaks || []).concat([{ x: FX.win.hx, y: FX.win.hy + (Math.random() - 0.5) * 20, v: 120 + Math.random() * 120 }]); }
  if (FX.streaks) { FX.streaks = FX.streaks.filter(p => { p.x += p.v * dt; p.y += p.v * 0.25 * dt; if (p.x > 330) return false; R(Math.round(p.x), Math.round(p.y), 5, 1, 'rgba(255,255,255,0.45)'); return true; }); }
  // the broom, in your hands
  if (FX.broom === 'held') { const sw = G.calm ? 0 : Math.sin(t * 14) * 5, x = S.x, y = S.y; line(x + 6, y - 42, x - 2 + sw, y - 6, '#e0c48a', 2); R(x - 7 + sw, y - 6, 12, 7, '#d9b45a'); R(x - 6 + sw, y - 8, 10, 2, '#c0392b'); if (!G.calm && Math.random() < 0.3) FX.steam.push({ x: x - 4 + sw, y: y - 2, t0: t }); }
  // a hanging light only lights half the room
  if (FX.tube) R(0, -G.OY, G.W, G.FH, tubeOn(t) ? 'rgba(14,12,30,0.16)' : 'rgba(14,12,30,0.34)');
  // the fire alarm: a red light, the sprinklers
  if (FX.alarm) {
    const on = Math.floor((now() - FX.alarm) * 2) % 2 === 0;
    R(156, 2, 9, 5, INK); R(157, 3, 7, 3, on ? '#ff3b2f' : '#5a1612');
    if (on) R(0, 0, G.W, 140, 'rgba(255,40,30,0.07)');
    if (FX.alarmOn) { for (let i = 0; i < (G.calm ? 2 : 9); i++) FX.drops.push({ x: Math.random() * G.W, y: Math.random() * 10, vy: 120 + Math.random() * 60 }); }
    FX.drops = FX.drops.filter(d => { d.y += d.vy / 60; if (d.y > 128 + (d.x % 10)) { if (Math.random() < 0.03 && FX.water.length < 60) FX.water.push([d.x, 131 + Math.random() * 6]); return false; } R(Math.round(d.x), Math.round(d.y), 1, 3, 'rgba(142,200,255,0.85)'); return true; });
  }
  // the disco
  if (party.style === 'disco') {
    const ph = beat();
    R(158, 0, 1, 8, INK); G.disc(g, 158, 12, 5, '#c4c6cf'); R(156, 10, 2, 2, '#ffffff');
    if (!G.calm) ['rgba(255,80,160,0.16)', 'rgba(80,200,255,0.16)', 'rgba(255,220,60,0.16)', 'rgba(140,255,120,0.14)'].forEach((c, i) => {
      const x = ((ph * 18 + i * 83) % (G.W + 40)) - 20, y = 18 + ((i * 37 + Math.floor(ph) * 11) % 70);
      G.oval(g, x, y, 12, 7, c);
    });
  }
  // the blackout: only eyes
  if (FX.dark) {
    R(0, -G.OY, G.W, G.FH, 'rgba(5,5,8,0.95)');
    for (const b of present()) { if (b.mode === 'under') continue; const y = headY(b) + 9, x = Math.round(b.x); if (Math.floor(t * 1.7 + x) % 5) { R(x + 10, y, 2, 2, '#ffffff'); R(x + 16, y, 2, 2, '#ffffff'); } }
  }
});
function shake(power) {
  FX.shake = now();
  if (G.calm) return;
  const cv = G.cv; let n = 0;
  const id = setInterval(() => { n++; if (n > 6) { clearInterval(id); cv.style.transform = ''; return; } cv.style.transform = `translate(${(n % 2 ? 1 : -1) * power}px, ${(n % 3 - 1) * power}px)`; }, 40);
}

/* ---------- the moves ---------- */
const wait = s => q.wait(s);
async function tween(sec, fn) { const t0 = now(); for (;;) { const a = Math.min(1, (now() - t0) / (G.calm ? sec / 3 : sec)); fn(a); if (a >= 1) return; await wait(0.016); } }
async function standUp(b) {
  if (b.mode === 'stand' || b.mode === 'table' || b.mode === 'floor') return;
  SND.scrape();
  b.mode = 'stand'; b.F = PRES_F + 8;
  await tween(0.2, a => { b.F = PRES_F + 8 - 8 * a; });
}
async function toFloorBehind(b) {   // off the table, back down behind it
  if (b.mode !== 'table') { await standUp(b); return; }
  const x0 = b.x; SND.boing();
  await tween(0.4, a => { b.F = TABLE_F + (PRES_F - TABLE_F) * a - Math.sin(a * Math.PI) * 18; b.x = x0; });
  b.mode = 'stand'; b.F = PRES_F;
}
const MOVE = {
  async rise(b) { b.steam = true; if (b.mode === 'seat') { b.lift = 0; await tween(0.12, a => { b.lift = 10 * a; }); } await standUp(b); b.arms = 'down'; await wait(0.25); },
  async slam(b) {
    b.steam = true;
    if (b.mode === 'seat') { await tween(0.12, a => { b.lift = 6 * a; }); b.lift = 0; }
    else { b.arms = 'up'; await wait(0.15); b.arms = 'slam'; }
    SND.thud(); shake(2);
    for (const o of Object.values(B)) if (o.seat !== undefined && o.papers && !G.calm) spawnPapers(o.seat + 14, 92, 1, 30);
    await wait(0.45); b.arms = 'down';
  },
  async throw(b) {
    await standUp(b);
    b.arms = 'down'; await wait(0.15); b.arms = 'up'; b.papers = false;
    q.SFX.swoosh && q.SFX.swoosh(); SND.flutter();
    spawnPapers(b.x + 14, b.F - 88, G.calm ? 8 : 34, 170);
    await wait(0.9); b.arms = 'down';
  },
  async spill(b) {
    const sx = b.seat !== undefined ? b.seat : 214;   // the presenter's mug is at the end of the table
    b.mug = 'down'; SND.glug();
    FX.spills.push({ x: sx + 22, w: 34 + Math.random() * 20, t0: now() });
    await wait(0.6);
    // the neighbors leap up
    const near = Object.values(B).filter(o => o !== b && o.mode === 'seat' && Math.abs(o.seat - sx) <= 40);
    SND.splash();
    await Promise.all(near.map(async o => { await tween(0.15, a => { o.lift = 14 * a; }); await standUp(o); o.arms = 'up'; await wait(0.5); o.arms = 'down'; }));
    await wait(0.3);
  },
  async jump(b) {
    await standUp(b);
    const x0 = b.x, x1 = Math.max(76, Math.min(214, b.x)); b.mode = 'table'; SND.boing();
    await tween(0.45, a => { b.x = x0 + (x1 - x0) * a; b.F = PRES_F + (TABLE_F - PRES_F) * a - Math.sin(a * Math.PI) * 26; });
    b.F = TABLE_F; SND.thud(); shake(2); b.arms = 'up'; await wait(0.4); b.arms = 'down';
  },
  async storm(b, it) {
    b.steam = true;
    await toFloorBehind(b);
    b.walk = true; b.look = -1; b.arms = 'down'; b.dance = false;
    let lastStep = 0, opened = false; const sx = b.x;
    await tween(Math.max(0.6, (sx - 6) / 120), a => {
      b.x = sx - (sx - 6) * a; if (now() - lastStep > 0.16) { lastStep = now(); q.SFX.step && q.SFX.step(); }
      if (!opened && b.x < 44) { opened = true; FX.doorSwing = 0; q.SFX.creak && q.SFX.creak(); tween(0.15, d => { FX.door = Math.max(FX.door, d); }); }
    });
    b.mode = 'gone'; b.walk = false; S.sem.gone.add(b.k); S.sem.at[b.k] = undefined;
    await wait(0.25);
    if (it && it.style === 'open') { FX.door = 1; FX.doorSwing = now(); q.SFX.creak && q.SFX.creak(); await wait(0.6); return; }
    // the slam: the door, the room, the clock
    FX.door = 0; FX.doorSwing = 0; q.SFX.slam && q.SFX.slam(); SND.thud(); shake(5);
    for (const p of FX.papers) if (p.rest && p.land === 'table' && Math.random() < 0.5) { p.rest = false; p.vy = -40 - Math.random() * 40; p.vx = (Math.random() - 0.5) * 40; }
    if (FX.clock.mode === 'wall') { await wait(0.25); FX.clock = { mode: 'fall', x: 230, y: 26, vy: -30 }; SND.scrape(); }
    await wait(0.5);
  },
  async faint(b) {
    SND.fall();
    if (b.mode === 'seat') await tween(1.1, a => { b.lift = -40 * a; });
    else { await toFloorBehind(b); await tween(0.5, a => { b.F = PRES_F + 60 * a; }); }
    b.mode = 'under'; b.dance = false; b.steam = false; SND.thud();
    await wait(0.4);
  },
  async clap(b) {
    await standUp(b);
    const clapOnce = async (o, v) => { o.clapping = true; o.clapPh = 0; SND.clap(v); await wait(0.08); o.clapPh = 1; };
    for (let i = 0; i < 4; i++) { await clapOnce(b, 0.3); await wait(0.85 - i * 0.12); }
    const all = present().filter(o => o.mode !== 'under');
    await Promise.all(all.filter(o => o !== b && !o.pres).map(o => standUp(o)));
    for (let i = 0; i < 14; i++) { all.forEach(o => { o.clapping = true; o.clapPh = 0; }); SND.clap(0.5); await wait(0.07); all.forEach(o => { o.clapPh = 1; }); await wait(Math.max(0.08, 0.32 - i * 0.02)); }
    all.forEach(o => { o.clapping = false; });
  },
  async spin(b) { b.spin = true; SND.spin(); await wait(1.4); b.spin = false; },
  async music(b, it) { SND.scratch(); startMusic(it.style); if (it.style === 'disco') FX.ball = true; await wait(0.6); },
  async dance() {
    if (!party.style) startMusic('disco');
    const all = present().filter(o => o.mode !== 'under');
    await Promise.all(all.filter(o => o.mode === 'seat').map(o => standUp(o)));
    all.forEach(o => { o.dance = true; o.steam = false; });
    await wait(2.4);
  },
  async conga() {
    if (!party.style) startMusic('polka');
    const all = present().filter(o => o.mode !== 'under');
    await Promise.all(all.map(o => toFloorBehind(o)));
    all.forEach(o => { o.dance = true; o.walk = false; o.look = -1; o._sx = o.x; });
    FX.door = 1; FX.doorSwing = 0; q.SFX.creak && q.SFX.creak();
    const speed = 46, t0 = now(), far = Math.max(...all.map(o => o.x));
    for (;;) {
      const d = (now() - t0) * speed * (G.calm ? 3 : 1);
      let left = 0;
      for (const o of all) {
        if (o.mode === 'gone') continue;
        o.x = o._sx - d;
        if (o.x < 6) { o.mode = 'gone'; S.sem.gone.add(o.k); S.sem.at[o.k] = undefined; q.SFX.creak && q.SFX.creak(); } else left++;
      }
      if (FX.tk) FX.tk.x = Math.max(4, FX.tk.x - speed * 0.016);
      if (!left || d > far + 40) break;
      await wait(0.016);
    }
    q.SFX.slam && q.SFX.slam(); shake(2);
    await wait(0.8);
  },
  async alarm() {
    FX.alarm = now(); FX.alarmOn = true; SND.siren();
    const sirenId = setInterval(() => { if (FX.alarmOn) SND.siren(); else clearInterval(sirenId); }, 2000);
    const all = present().filter(o => o.mode !== 'under');
    await Promise.all(all.map(async o => { await standUp(o); o.arms = 'over'; o.wet = true; o.dance = false; }));
    await wait(1.6);
  },
  async lights(b) {
    FX.dark = now(); SND.crash();
    await wait(0.5); SND.crash(); spawnPapers(160, 60, G.calm ? 6 : 40, 300);
    if (b) { b.mode = 'table'; b.x = Math.max(76, Math.min(214, b.x)); b.F = TABLE_F; b.arms = 'up'; b.papers = false; }
    for (const o of present()) if (o !== b && o.mode === 'seat' && Math.random() < 0.5) { o.mode = 'stand'; o.F = PRES_F; }
    await wait(0.7); SND.thud(); SND.glass();
    await wait(0.4); FX.dark = 0; FX.tube = { t0: now() }; SND.zap();
    await wait(0.5); if (b) b.arms = 'down';
  },
  async freeze() {
    for (const o of present()) { o.dance = false; o.steam = false; }
    await wait(0.4); q.SFX.chirp && q.SFX.chirp(); await wait(0.9); q.SFX.chirp && q.SFX.chirp(); await wait(0.7);
  },
  async smash(b) {
    await standUp(b);
    b.arms = 'up'; b.steam = true; if (b.seat !== undefined) b.mug = null;
    const w = makeWin(Math.random, 66 + Math.random() * 34, 30 + Math.random() * 18);
    FX.mugFly = { x0: b.x + 14, y0: headY(b) - 4, x1: w.hx, y1: w.hy, t0: now(), dur: G.calm ? 0.1 : 0.38 };
    q.SFX.swoosh && q.SFX.swoosh();
    await wait(G.calm ? 0.1 : 0.38); FX.mugFly = null;
    FX.win = w; SND.glass(); shake(3);
    for (let i = 0; i < (G.calm ? 6 : 34); i++) FX.shards.push({ x: w.hx, y: w.hy, vx: (Math.random() - 0.3) * 160, vy: -30 - Math.random() * 90, fy: 108 + Math.random() * 30, rest: false });
    await wait(0.35);
    // the wind comes in: the paper on the table takes off
    FX.wind = now(); SND.wind();
    for (const p of FX.papers) if (p.rest && Math.random() < 0.6) { p.rest = false; p.vx = 60 + Math.random() * 120; p.vy = -50 - Math.random() * 70; p.land = Math.random() < 0.4 ? 'table' : 'floor'; }
    for (const o of Object.values(B)) if (o.seat !== undefined && o.papers && Math.random() < 0.5 && !G.calm) { spawnPapers(o.seat + 14, 90, 4, 40); FX.papers.slice(-4).forEach(p => { p.vx = 80 + Math.random() * 100; }); }
    b.arms = 'down'; await wait(0.6);
  },
  async kick(b) {
    const home = FX.can.mode === 'stand' ? FX.can.x : null;
    if (home === null) { await MOVE.slam(b); return; }   // the can is already down: a fist on the table instead
    if (b.mode === 'table') await toFloorBehind(b); else await standUp(b);
    b.walk = true; b.look = -1; b.steam = true;
    const sx = b.x, tx = home - 34;
    await tween(Math.max(0.3, Math.abs(sx - tx) / 150), a => { b.x = sx + (tx - sx) * a; });
    b.walk = false; b.look = 1;
    await wait(0.15); b.kick = true; SND.thud(); SND.clang(); shake(3);
    Object.assign(FX.can, { mode: 'fly', vx: 300, vy: -190, rot: 0, junkT: 0.5 });
    spawnJunk(home, 112, G.calm ? 4 : 14, 260);
    await wait(0.45); b.kick = false;
    await wait(1.2);
  },
  async screen(b) {
    if (FX.scr) { await MOVE.slam(b); return; }
    await standUp(b);
    b.arms = b.pres ? 'right' : 'up'; await wait(0.2);
    SND.scrape(); FX.scr = { a: 0.92, t0: now() };
    await wait(0.25); SND.crash(); shake(3);
    await wait(0.6); b.arms = 'down';
  },
  async turkey() {
    FX.tk = { x: -20, F: 136 };
    q.SFX.creak && q.SFX.creak();
    await tween(2.2, a => { FX.tk.x = -20 + 130 * a; });
    q.SFX.gobble && q.SFX.gobble();
    await wait(0.6);
  },
};

/* ---------- the line along the bottom: a comment, or stir it up ---------- */
const css = document.createElement('style');
css.textContent = `
.fw-panel { --h: max(36px, 4.4cqw); position: absolute; left: 0; right: 0; bottom: 0; height: var(--h); z-index: 6; background: rgba(8, 7, 5, 0.92); border-top: 0.3cqw solid #ff3b2f; color: #fff7e6; }
.fw-panel form { display: flex; align-items: stretch; height: 100%; }
.fw-gt { flex: none; display: grid; place-items: center; width: var(--h); color: #ff3b2f; font-size: 2.4cqw; line-height: 1; }
.fw-panel input { flex: 1; min-width: 0; font: inherit; font-size: max(16px, 2.8cqw); padding: 0; background: none; color: #fff7e6; border: 0; outline: none; border-radius: 0; caret-color: #ff3b2f; }
.fw-panel input::placeholder { color: #7d766a; }
.fw-stir { flex: none; margin: 0.5cqw 0; padding: 0 1.6cqw; background: var(--hot); color: #000; font-size: max(13px, 2.1cqw); letter-spacing: 0.06em; text-transform: uppercase; box-shadow: 0.3cqw 0.3cqw 0 #8a7a1e; }
.fw-stir:hover, .fw-stir:focus-visible { background: #fff; outline: none; }
.fw-x { flex: none; padding: 0 1.6cqw; color: #7d766a; font-size: max(13px, 2.1cqw); letter-spacing: 0.08em; }
.fw-x:hover, .fw-x:focus-visible { color: var(--hot); outline: none; }
`;
document.head.appendChild(css);
// What the empty line suggests, one each time it opens.
const TRY = ['the book is dead', 'nobody reads past the abstract', 'peer review is hazing', 'all of this is just economics', 'tenure is a vibe', 'the footnotes are the real book', 'pickleball is a cult'];
let tries = Math.floor(Math.random() * TRY.length), panel = null, panelDone = null;
function closePanel(v) {
  if (!panel) return;
  panel.remove(); panel = null;
  const d = panelDone; panelDone = null; if (d) d(v || null);
  const cv = document.getElementById('cv'); cv.focus && cv.focus();
}
function askComment() {
  panel = document.createElement('div'); panel.className = 'fw-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'The question mic');
  panel.innerHTML = '<form><span class="fw-gt" aria-hidden="true">&#9679;</span><input type="text" maxlength="280" autocomplete="off" spellcheck="false" aria-label="Your comment. It is not a question."><button class="fw-stir" type="button">Stir up some stuff for me</button><button class="fw-x" type="button" aria-label="Put the mic down">esc</button></form>';
  stage.appendChild(panel);
  ['pointerdown', 'pointerup', 'click', 'contextmenu', 'keyup', 'wheel', 'mousemove'].forEach(ev => panel.addEventListener(ev, e => e.stopPropagation()));
  const inp = panel.querySelector('input');
  inp.placeholder = TRY[tries++ % TRY.length];
  panel.querySelector('form').addEventListener('submit', e => { e.preventDefault(); const v = inp.value.trim(); if (v) closePanel({ comment: v }); });
  panel.querySelector('.fw-stir').addEventListener('click', () => closePanel({ comment: '' }));
  panel.querySelector('.fw-x').addEventListener('click', () => closePanel(null));
  panel.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closePanel(null); });
  setTimeout(() => inp.focus(), 30);
  return new Promise(res => { panelDone = res; });
}
q.hooks.keyBlock.push(e => { if (!panel) return false; if (e.key === 'Escape') closePanel(null); return true; });
setInterval(() => { if (panel && (S.scene !== 'room' || S.room !== 'seminar')) closePanel(null); }, 300);
// Leaving the room puts everything back for next week's seminar (index.html clears S.sem's side).
function reset() {
  stopMusic(true); FX.alarmOn = false;
  B = {}; FX = freshFX(); fw.done = false; fw.live = false; S.sem.pose = {}; S.sem.at = {};
  if (G.cv) G.cv.style.transform = '';
  if (window.questMusic && !window.questMusic.playing() && q.S.started) window.questMusic.play();
}
setInterval(() => { if ((S.scene !== 'room' || S.room !== 'seminar') && (fw.done || Object.keys(B).length || FX.papers.length || party.style || FX.persist || FX.win || FX.scr || FX.tube || FX.can.mode !== 'stand') && !fw.busy) reset(); }, 500);

/* ---------- the room as the last grab of the mic left it ---------- */
// The server keeps the moves of the last scene (src/lib/semibart/seminar.ts) until someone sweeps.
// Walking in, you find the room empty and wrecked the way those moves wreck it, with a broom.
let pendingWreck = null;
const SEATS = [80, 112, 144, 176, 208];
const hash = k => { let h = 7; for (const ch of String(k)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
function buildWreck(w) {
  FX = freshFX(); FX.persist = w; B = {};
  const r = G.rng((Date.parse(w.at) || 7) % 99991), sx = k => SEATS[hash(k) % SEATS.length];
  const paper = (n, share) => { for (let i = 0; i < n; i++) { const table = r() < share, x = table ? 76 + r() * 164 : 14 + r() * 290; FX.papers.push({ x, y: table ? 91 + r() * 6 : 126 + r() * 13, vx: 0, vy: 0, ph: 0, land: table ? 'table' : 'floor', rest: true }); } };
  for (const m of w.moves || []) {
    if (m.act === 'throw') paper(34, 0.6);
    else if (m.act === 'lights') { paper(22, 0.5); FX.tube = { t0: now() - 30 }; }
    else if (m.act === 'slam') paper(3, 0.8);
    else if (m.act === 'alarm') { FX.soggy = true; for (let i = 0; i < 40; i++) FX.water.push([10 + r() * 300, 131 + r() * 8]); }
    else if (m.act === 'spill') { const x = sx(m.who) + 22; FX.spills.push({ x, w: 34 + r() * 20, t0: -1000 }); FX.mugs.push(x - 2); for (let i = 0; i < 22; i++) FX.floorCoffee.push([x + (r() - 0.5) * 70, 132 + r() * 4]); }
    else if (m.act === 'smash' && !FX.win) { FX.win = makeWin(r, 66 + r() * 34, 30 + r() * 18); for (let i = 0; i < 26; i++) FX.shards.push({ x: 40 + r() * 90, y: 110 + r() * 26, fy: 0, rest: true }); paper(10, 0.1); }
    else if (m.act === 'kick') { Object.assign(FX.can, { x: 180 + r() * 60, y: 128, mode: 'down', face: 1 }); const kinds = Object.keys(JUNK); for (let i = 0; i < 18; i++) FX.garbage.push({ x: 60 + r() * 245, y: 124 + r() * 15, k: kinds[Math.floor(r() * kinds.length)], rest: true }); }
    else if (m.act === 'screen') FX.scr = { a: 0.92, t0: -1 };
    else if (m.act === 'storm') { if (m.style === 'open') FX.door = 1; else if (FX.clock.mode === 'wall') FX.clock = { mode: 'floor', x: 226 + r() * 14, y: 128, vy: 0 }; }
    else if (m.act === 'conga') FX.door = 1;
    else if (m.act === 'turkey') FX.tk = { x: 100 + r() * 70, F: 136 };
    else if (m.act === 'music' && m.style === 'disco') FX.ball = true;
    else if (m.act === 'jump') FX.prints.push(sx(m.who));
  }
  // everybody fled
  for (const k of q.seminar.cast()) { S.sem.gone.add(k); S.sem.pose[k] = true; }
  S.sem.wild = true;
}
const agoOf = at => { const m = Math.max(1, Math.round((Date.now() - Date.parse(at)) / 60000)); return m < 60 ? `${m} minute${m === 1 ? '' : 's'} ago` : m < 60 * 36 ? `${Math.round(m / 60)} hour${Math.round(m / 60) === 1 ? '' : 's'} ago` : `${Math.round(m / 1440)} days ago`; };
async function entrance() {
  const w = FX.persist; if (!w) return;
  if (w.by === me()) { await q.say('you', 'Nobody cleaned up.'); await q.say('you', 'In fairness, it was a very good comment.'); return; }
  await q.say('you', 'Where is everybody?');
  if (FX.tk) await q.say('turkey', 'Gobble.');
  await q.say('you', `${w.name} had a comment, I hear.`);
  await q.say('you', 'There is a broom. Of course there is.');
}
q.hooks.seminarEnter.push(() => {
  if (!q.me) return null;
  return fetch('/api/semibart/seminar', { credentials: 'same-origin' }).then(r => r.json()).then(d => {
    if (!d || !d.wreck) return null;
    pendingWreck = d.wreck;
    return entrance;
  }).catch(() => null);
});
async function sweep() {
  const w = FX.persist; if (!w || FX.sweeping) return;
  FX.sweeping = true;
  await q.say('you', w.by === me() ? 'Fine. My mess.' : 'Fine. I will do it.');
  FX.broom = 'held';
  await q.walkTo([{ x: 44, y: 134 }]);
  // the mess goes where the broom has been
  const swish = setInterval(() => SND.swish(), 280);
  const clean = setInterval(() => {
    const x = S.x + 8;
    FX.papers = FX.papers.filter(p => p.x > x); FX.garbage = FX.garbage.filter(p => p.x > x); FX.shards = FX.shards.filter(p => p.x > x);
    FX.floorCoffee = FX.floorCoffee.filter(p => p[0] > x); FX.water = FX.water.filter(p => p[0] > x); FX.spills = FX.spills.filter(p => p.x > x + 20); FX.mugs = FX.mugs.filter(m => m > x); FX.prints = FX.prints.filter(m => m > x);
  }, 40);
  await q.walkTo([{ x: 296, y: 134 }]);
  clearInterval(swish); clearInterval(clean);
  FX.papers = []; FX.garbage = []; FX.shards = []; FX.floorCoffee = []; FX.water = []; FX.spills = []; FX.mugs = []; FX.prints = []; FX.soggy = false;
  // and everything else snaps back, one thing at a time
  const back = [
    FX.can.mode !== 'stand' && (() => { Object.assign(FX.can, { x: CAN_X, y: 128, mode: 'stand' }); SND.boing(); }),
    FX.scr && (() => { FX.scr = null; SND.scrape(); }),
    FX.clock.mode !== 'wall' && (() => { FX.clock = { mode: 'wall', x: 230, y: 26, vy: 0 }; SND.boing(); }),
    FX.tube && (() => { FX.tube = null; SND.thud(); }),
    FX.win && (() => { FX.win = null; FX.wind = 0; FX.streaks = []; SND.tink(); }),
    FX.door && (() => { FX.door = 0; FX.doorSwing = 0; q.SFX.slam && q.SFX.slam(); }),
    FX.ball && (() => { FX.ball = false; }),
    FX.tk && (async () => { const k = FX.tk; q.SFX.gobble && q.SFX.gobble(); await tween(0.9, a => { k.x = k.x - (k.x + 30) * a; }); FX.tk = null; }),
  ].filter(Boolean);
  for (const f of back) { await f(); await wait(0.35); }
  FX.broom = 'gone';
  fetch('/api/semibart/seminar', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
  await q.say('you', 'Good as new.');
  await q.say('you', 'Mostly.');
  // next week's seminar has been waiting outside
  FX.dark = now(); q.SFX.creak && q.SFX.creak(); await wait(0.5);
  FX = freshFX(); B = {}; S.sem.gone.clear(); S.sem.pose = {}; S.sem.at = {}; S.sem.lift = {}; S.sem.wild = false; S.sem.v++;
  await wait(0.2);
  const pr = q.seminar.presenter();
  if (pr.k !== me()) await q.say(pr.k, 'Thanks for coming. So. Slide one.');
}
q.hooks.seminarSpots.push(() => {
  const out = [], w = FX.persist;
  if (w && FX.broom === 'wall') out.push({ name: 'broom', r: [292, 60, 18, 70], walk: { x: 286, y: 134 }, def: 'use', on: { look: 'A broom. Someone has to.', use: sweep, pick: sweep, push: sweep } });
  if (w) out.push({ name: 'the mess', r: [72, 86, 174, 14], walk: { x: 160, y: 134 }, def: 'look', on: { look: () => q.say('you', `${w.name}'s comment, ${agoOf(w.at)}. The room has not recovered.`) } });
  if (FX.win) out.push({ name: 'window', r: [44, 14, 78, 58], walk: { x: 84, y: 134 }, def: 'look', on: { look: w ? 'A mug went through it. The hills are closer now.' : 'A mug went through it. On purpose.' } });
  if (FX.clock.mode === 'floor') out.push({ name: 'clock', r: [Math.round(FX.clock.x) - 8, 114, 16, 16], walk: { x: Math.round(FX.clock.x), y: 134 }, def: 'look', on: { look: 'Still ten past four. Now on the floor.' } });
  if (FX.scr) out.push({ name: 'screen', r: [250, 8, 66, 60], walk: { x: 270, y: 134 }, def: 'look', on: { look: 'Slide two. Sideways.' } });
  if (FX.tk && w) out.push({ name: 'turkey', r: [Math.round(FX.tk.x) - 4, 100, 34, 36], walk: { x: Math.round(FX.tk.x) + 14, y: 134 }, def: 'talk', on: { look: 'The turkey stayed. It has tenure now.', talk: [['turkey', 'Gobble.']] } });
  out.push({ name: 'trash can', r: FX.can.mode === 'stand' ? [CAN_X - 6, 108, 13, 21] : [Math.round(FX.can.x) - 10, 116, 20, 13], walk: { x: Math.round(FX.can.x), y: 134 }, def: 'look', on: { look: FX.can.mode === 'stand' ? 'The trash can. Full of drafts.' : 'The trash can. It has been through a lot.' } });
  return out;
});

/* ---------- the show ---------- */
// While the scene is written nobody says a word: every head turns to you, the clock gets loud,
// the presenter starts to steam, a mug rattles, somebody half rises. One thing per tick.
async function brew(isDone) {
  const t0 = performance.now(), pr = Object.values(B).find(b => b.pres), sat = Object.values(B).filter(b => b.mode === 'seat').sort(() => Math.random() - 0.5);
  const beats = [
    () => SND.rumble(),
    () => { if (pr) pr.steam = true; },
    () => { FX.shake = now(); SND.tick(0.4); },
    () => { if (sat[0]) sat[0].lift = 4; SND.scrape(); },
    () => { if (sat[1]) sat[1].steam = true; },
    () => q.SFX.chirp && q.SFX.chirp(),
    () => { FX.shake = now(); if (sat[2]) sat[2].lift = 3; },
    () => { if (pr) pr.arms = 'slam'; SND.rumble(); },
    () => { sat.forEach(b => { b.steam = true; }); },
  ];
  for (let i = 0; !isDone() && performance.now() - t0 < 120000; i++) {
    SND.tick(0.2 + Math.min(0.3, i * 0.02));
    if (beats[i % 2 === 0 ? i / 2 : -1]) beats[i / 2]();
    await Promise.race([new Promise(r => { const id = setInterval(() => { if (isDone()) { clearInterval(id); r(); } }, 30); setTimeout(() => { clearInterval(id); r(); }, 3000); }), wait(Math.max(0.22, 0.55 - i * 0.015))]);
  }
  if (pr && pr.arms === 'slam') pr.arms = 'down';
}
async function play(script) {
  for (const it of script) {
    if (it.act) {
      const b = it.who ? B[it.who === me() ? '' : it.who] : null;
      if (it.who && (!b || b.mode === 'gone')) continue;
      const fn = MOVE[it.act]; if (!fn) continue;
      await fn(b, it);
      continue;
    }
    const who = it.who === me() ? 'you' : it.who;
    if (who !== 'you' && who !== 'turkey' && (!B[who] || B[who].mode === 'gone')) continue;
    if (who === 'turkey' && !FX.tk) continue;
    await q.say(who, it.text);
  }
}
async function grabMic() {
  if (fw.busy) return;
  if (FX.persist) { await q.say('you', 'Not in this mess. Somebody has to sweep up first.'); return; }
  if (S.sem.wild || S.sem.gone.size || fw.done) { await q.say('you', "I think I've done enough for one seminar."); return; }
  if (!q.me) { await q.say('you', 'I should sign in before I start anything.'); return; }
  fw.busy = true;
  try {
    S.face = -1;
    fw.live = true; q.SFX.squeal && q.SFX.squeal();
    const pr = q.seminar.presenter();
    if (pr.k !== me()) await q.say(pr.k, 'Questions at the end, please.');
    const ask = await askComment();
    if (!ask) { fw.live = false; await q.say('you', 'Never mind.'); return; }
    const cast = q.seminar.cast();
    await q.say('you', "It's more of a comment than a question.");
    let res = null;
    const call = fetch('/api/semibart/flamewar', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comment: ask.comment, cast, topic: q.seminar.topic() }) })
      .then(r => r.json().catch(() => ({ ok: false }))).catch(() => ({ ok: false })).then(d => { res = d; });
    // the room goes quiet and stares while the scene is written
    take();
    await brew(() => !!res);
    if (!res || !res.ok || !Array.isArray(res.script)) {
      fw.live = false; B = {}; S.sem.pose = {}; S.sem.at = {};
      await q.say('you', (res && typeof res.say === 'string' && res.say) || 'The mic cut out. Everyone looks relieved.');
      return;
    }
    S.sem.wild = true;
    await q.say('you', res.comment);
    await play(res.script);
    fw.live = false; fw.done = true;
    // nobody sits back down: the music fades, the dancing stops, everyone stays where the chaos left them
    await wait(2.6);
    stopMusic(); FX.alarmOn = false;
    for (const b of present()) { b.dance = false; b.clapping = false; b.spin = false; b.wet = false; if (b.arms === 'over') b.arms = 'down'; }
    if (window.questMusic && !window.questMusic.playing()) window.questMusic.play();
    if (window.questTicker && window.questTicker.poll) setTimeout(window.questTicker.poll, 400);
  } finally {
    fw.busy = false; fw.live = false;
    if (panel) closePanel(null);
  }
}

window.questFlamewar = { grabMic, fw, play, take, B: () => B, FX: () => FX, MOVE, startMusic, stopMusic, buildWreck, sweep };
})();
