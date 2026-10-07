// ACT II — THE FLOOR.
// One figure in an empty power-station hall at midnight (the 303 alone, lit by
// its own accents). The kick brings feet on concrete; the hats bring a
// stairwell and a door with light behind it; then the crowd, bodies,
// hands — a count of bodies climbing in the corner and the clock running
// through the night. The floor cracks. At bar 81 the kick drops out and the
// floor gives way: weightless, water, birds. The kick's return at 89 is the
// one peak — the count reads 1, everyone one body. Then dawn in the high
// windows, people leaving by the stairs, and the figure alone again,
// walking toward a doorway of light as the voice fades.
//
// The grid is the floor: a perspective plane that pulses with the kick,
// cracks, falls away at 81, and slams back at 89.
const CLOCK = [[0, 23 * 60 + 58], [16, 24 * 60 + 9], [48, 25 * 60 + 40], [80, 27 * 60 + 55], [88, 28 * 60 + 33], [112, 30 * 60 + 49], [128, 31 * 60 + 41]]; // bar → minutes since midnight-1
const BODIES = [[0, 1], [16, 1], [32, 9], [48, 64], [64, 212], [80, 412], [96, 412], [112, 38], [120, 1], [128, 1]];
const interp = (K, bar) => { for (let i = 1; i < K.length; i++) if (bar <= K[i][0]) return K[i - 1][1] + (K[i][1] - K[i - 1][1]) * (bar - K[i - 1][0]) / (K[i][0] - K[i - 1][0]); return K[K.length - 1][1]; };

defineAct({
  id: 'act-ii', number: 'II', title: 'THE FLOOR',
  stills: { hall: '01-hall', feet: '02-feet', stairs: '03-stairs', door: '04-door', crowd: '05-crowd', back: '06-back', hands: '07-hands', crack: '08-crack', water: '09-water', birds: '10-birds', beam: '11-beam', morning: '12-morning' },
  acid: { onsets: [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14, 15], accents: [0, 3, 6, 9, 12] },
  minFloor: 0.28, // pictures stay readable between kicks
  fadeIn: 1.5, fadeOut: [233, 240.5],

  shots: [
    // The voice alone: the hall, lit by the 303's accents, a slow push toward the figure.
    { at: 0, still: 'hall', light: 'acid', floor: 0.06, level: 0.95, zoom: [1.0, 1.4], pan: [0, 0.12], panY: [0, 0.3], contrast: 1.3, grid: { alpha: 0.18 } },
    { at: 16, still: 'feet', light: 'kick', floor: 0.1, zoom: [1.12, 1.0], grid: { alpha: 0.5 }, flash: { list: ['hall'], prob: 0.15 } },
    { at: 20, still: 'hall', light: 'kick', floor: 0.1, zoom: [1.4, 1.5], pan: [0.12, 0.14], panY: [0.3, 0.35], grid: { alpha: 0.45 } },
    { at: 24, still: 'stairs', mode: 'raster', light: 'kick', floor: 0.12, zoom: [1.0, 1.22], flash: { list: ['crowd'], prob: 0.12, frames: 1 }, grid: { alpha: 0.3 } },
    { at: 28, still: 'door', light: 'kick', floor: 0.12, zoom: [1.0, 1.35], pan: [0, 0.25], panY: [0, -0.2], flash: { list: ['crowd', 'hands'], prob: 0.22, frames: 1 }, glitch: 0.15, grid: { alpha: 0.3 } },
    // Inside: the crowd.
    { at: 32, still: 'crowd', light: 'kick', floor: 0.14, zoom: [1.0, 1.14], flash: { list: ['back', 'hands'], prob: 0.25 }, glitch: 0.25, grid: { alpha: 0.4 } },
    { at: 40, still: 'back', mode: 'raster', light: 'kick', floor: 0.12, zoom: [1.1, 1.28], flash: { list: ['crowd', 'hands'], prob: 0.3 }, glitch: 0.3, grid: { alpha: 0.35 } },
    { at: 48, montage: { list: ['crowd', 'back'], every: 'half' }, modes: { list: ['photo', 'raster'], every: 'bar' }, light: 'kick', floor: 0.15, glitch: 0.35, grid: { alpha: 0.4 } },
    { at: 56, montage: { list: ['hands', 'crowd', 'back'], every: 'beat' }, mode: 'threshold', light: 'kick', floor: 0.2, glitch: 0.45, grid: { alpha: 0.45 } },
    { at: 64, montage: { list: ['crowd', 'hands', 'back', 'feet'], every: 'beat' }, modes: { list: ['photo', 'dither'], every: '2bar' }, light: 'kick', floor: 0.18, flash: { list: ['crack'], prob: 0.25, mode: 'threshold' }, glitch: 0.5, grid: { alpha: 0.5, crack: 0.4 } },
    { at: 72, montage: { list: ['crack', 'crowd', 'crack', 'hands'], every: 'bar' }, light: 'kick', floor: 0.2, zoom: [1.0, 1.2], glitch: 0.6, grid: { alpha: 0.55, crack: 1, shake: 1 } },
    // The floor gives way.
    { at: 80, still: 'water', light: 'steady', level: 0.95, zoom: [1.0, 1.18], contrast: 1.15, grid: { fall: true } },
    { at: 84, still: 'birds', light: 'steady', level: 1.0, zoom: [1.0, 1.12], panY: [0.2, -0.2], contrast: 1.1 },
    { at: 86, still: 'water', mode: 'dither', light: 'steady', level: 0.9, zoom: [1.3, 1.0] },
    // It comes back: one body.
    { at: 88, montage: { list: ['crowd', 'hands', 'back', 'crowd'], every: 'beat' }, modes: { list: ['threshold', 'photo'], every: 'beat' }, light: 'kick', floor: 0.3, level: 1.3, glitch: 0.85, grid: { alpha: 0.8, slam: true } },
    { at: 96, still: 'beam', light: 'kick', floor: 0.2, zoom: [1.0, 1.18], flash: { list: ['crowd', 'hands'], prob: (f) => 0.3 * (1 - (f.bar - 96) / 8), frames: 1 }, glitch: 0.2, grid: { alpha: 0.3 } },
    { at: 104, still: 'morning', light: 'kick', floor: 0.25, zoom: [1.0, 1.15], glitch: 0.1, grid: { alpha: 0.25 } },
    { at: 112, still: 'stairs', mode: 'raster', light: 'kick', floor: 0.15, zoom: [1.22, 1.0], grid: { alpha: 0.2 } },
    { at: 116, still: 'door', light: 'kick', floor: 0.15, zoom: [1.35, 1.0], grid: { alpha: 0.2 } },
    // The voice alone again: the figure leaves toward the light.
    { at: 120, still: 'morning', light: 'acid', floor: 0.12, level: 0.95, zoom: [1.15, 1.45], pan: [0, 0.45], panY: [0, 0.2], grid: { alpha: 0.12 } },
  ],

  text: [
    { from: 0.5, to: 7, str: 'OVERCLOCK', x: 0.045, y: 0.075, size: 18 },
    { from: 1.5, to: 7, str: 'ACT II — THE FLOOR', x: 0.045, y: 0.11, size: 18, alpha: 0.75 },
    { from: 80, to: 81.2, str: 'THE FLOOR', x: 0.5, y: 0.5, size: 240, font: 'big', align: 'center', type: 'slam' },
    { from: 121, to: 127.5, str: 'OVERCLOCK (ACT II) — THE FLOOR', x: 0.045, y: 0.9, size: 18, alpha: 0.8 },
  ],

  // The floor: a perspective grid under everything.
  under(g, f, shot, H) {
    const gr = shot.grid; if (!gr) return;
    const { w, h } = H;
    let alpha = gr.alpha ?? 0.4;
    let drop = 0, tilt = 0;
    if (gr.fall) { const u = (f.bar - 80) / 6; drop = h * 1.6 * u * u; tilt = 0.25 * u; alpha = 0.6 * Math.max(0, 1 - u * 0.9); }
    if (gr.slam) alpha *= 0.4 + 0.6 * Math.exp(-((f.bar - 88) * H.BAR) / 0.4) + 0.4 * f.kickEnv;
    const lit = f.sec.kick ? 0.35 + 0.65 * f.kickEnv : 0.5 + 0.5 * Math.min(1, f.acid);
    const shake = gr.shake ? (f.rnd(5) - 0.5) * 14 * f.kickEnv : 0;
    const hy = h * 0.6, vx = w * 0.5;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.translate(vx + shake, hy + drop); g.rotate(tilt); g.translate(-vx, -hy);
    g.strokeStyle = `rgba(255,255,255,${alpha * lit})`; g.lineWidth = 1.2;
    const crack = gr.crack || 0, rng = H.rng(Math.floor(f.beat), 21);
    g.beginPath();
    for (let i = -14; i <= 14; i++) { // lines running to the vanishing point
      const xb = vx + i * w * 0.11;
      if (crack && rng() < crack * 0.35) { const m = 0.3 + rng() * 0.5, off = (rng() - 0.5) * 30 * crack; g.moveTo(vx, hy); g.lineTo(vx + (xb - vx) * m, hy + (h - hy) * m); g.moveTo(vx + (xb - vx) * m + off, hy + (h - hy) * m + 6); g.lineTo(xb + off, h + 6); }
      else { g.moveTo(vx, hy); g.lineTo(xb, h); }
    }
    const scroll = (f.t * 0.35) % 1;
    for (let k = 0; k < 14; k++) { // cross lines, drifting toward the viewer
      const z = 1 + (k + 1 - scroll) * 0.9, y = hy + (h - hy) / z;
      if (crack && rng() < crack * 0.3) { const xs = rng() * w; g.moveTo(0, y); g.lineTo(xs, y); g.moveTo(xs, y + 4 * crack); g.lineTo(w, y + 4 * crack); }
      else { g.moveTo(0, y); g.lineTo(w, y); }
    }
    g.stroke();
    g.restore();
  },

  // The night as two readouts: a clock and a count of bodies.
  over(o, f, shot, H) {
    if (f.bar < 2) return;
    const lost = f.bar >= 80 && f.bar < 88;
    const m = Math.floor(interp(CLOCK, f.bar)) % (24 * 60);
    const clock = lost ? (Math.floor(f.beat) % 2 ? '--:--' : '  :  ') : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    H.text({ str: clock, x: 0.955, y: 0.93, size: 30, align: 'right', alpha: 0.8 });
    const one = f.bar >= 88 && f.bar < 96;
    const n = Math.round(interp(BODIES, f.bar));
    const bodies = lost ? 'BODIES ---' : one ? 'BODIES 1' : `BODIES ${String(n).padStart(3, '0')}`;
    if (!one || f.kickEnv > 0.2) H.text({ str: bodies, x: 0.045, y: 0.93, size: 16, alpha: 0.6 });
  },

  glitch(f) {
    if (f.bar >= 88 && f.bar < 88.6) return { flash: Math.max(0, 1 - (f.bar - 88) * H_BAR() / 0.5) };
    if (f.bar >= 88 && f.bar < 96 && f.kick && f.kick.i % 16 === 0) return { flash: 0.7 * Math.exp(-(f.t - f.kick.t) / 0.06) };
    return {};
  },
});
function H_BAR() { return 60 / 128 * 4; }
