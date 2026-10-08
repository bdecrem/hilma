// ACT I — SIGNAL.
// A transmission leaves a radio mast in the fog and crosses the city — pylons,
// a substation, a street, cable tunnels, a server hall — looking for a
// receiver. It finds a sleeper (the hats drop out: the city goes quiet, the
// signal keeps rolling), the eye opens at the peak (bar 89: RECEIVED), and the
// path runs backwards to the mast at dawn while the bass leaves and only the
// kick, a heartbeat, is left.
//
// The signal is a dot on a hairline route across the bottom of the frame, one
// tick per place it passes. It pulses with the bass, crosses to the far end by
// the peak, sends out a ring on every kick while it is received, travels back
// during the close and blinks with the kick at the mast. On the right edge a TV
// test band slips and tears on the bass accents. (Replaced the oscilloscope
// trace of the bass line, which read too literally — 2026-10-08.)
defineAct({
  id: 'act-i', number: 'I', title: 'SIGNAL',
  stills: { tower: '01-tower', lines: '02-lines', substation: '03-substation', street: '04-street', tunnel: '05-tunnel', servers: '06-servers', scope: '07-scope', window: '08-window', hand: '09-hand', 'eye-closed': '10-eye-closed', 'eye-open': '11-eye-open', dawn: '12-dawn' },
  acid: { onsets: [2, 6, 10, 14], accents: [2, 10] },
  minFloor: 0.3, // pictures stay readable between kicks
  fadeIn: 0.8, fadeOut: [232.5, 240.5],

  shots: [
    { at: 0, still: 'tower', light: 'kick', floor: 0.03, level: 1.05, zoom: [1.0, 1.12], panY: [-0.3, 0.2], ramp: [0.5, 1] },
    { at: 8, still: 'lines', light: 'kick', floor: 0.06, zoom: [1.05, 1.18], pan: [0.5, -0.4], flash: { list: ['tower'], prob: 0.22, mode: 'threshold' } },
    { at: 16, still: 'substation', mode: 'raster', light: 'kick', floor: 0.1, zoom: [1.0, 1.14], flash: { list: ['lines', 'tower'], prob: 0.2, frames: 1 }, glitch: 0.15 },
    { at: 24, still: 'street', light: 'kick', floor: 0.12, zoom: [1.12, 1.0], pan: [-0.3, 0.3], flash: { list: ['substation', 'tunnel'], prob: 0.25, mode: 'dither' }, glitch: 0.2 },
    { at: 32, still: 'tunnel', mode: 'dither', light: 'kick', floor: 0.14, zoom: [1.0, 1.45], pan: [0.2, 0.25], flash: { list: ['street', 'servers'], prob: 0.25 }, glitch: 0.25 },
    { at: 40, still: 'servers', mode: 'raster', light: 'kick', floor: 0.15, zoom: [1.0, 1.55], flash: { list: ['scope', 'tunnel'], prob: 0.4, on: 'accent', mode: 'threshold' }, glitch: 0.35 },
    // Hats out: the city goes quiet; the signal keeps searching.
    { at: 48, still: 'scope', light: 'kick', floor: 0.4, zoom: [1.12, 1.32], contrast: 1.4, glitch: 0.08 },
    { at: 52, still: 'window', light: 'kick', floor: 0.32, zoom: [1.0, 1.12], pan: [-0.2, 0.2], glitch: 0.08 },
    { at: 56, still: 'hand', light: 'kick', floor: 0.12, zoom: [1.0, 1.22], flash: { list: ['tunnel', 'servers', 'street'], prob: 0.22, mode: 'dither' }, glitch: 0.3 },
    { at: 64, montage: { list: ['eye-closed', 'hand'], every: 'bar' }, mode: 'raster', light: 'kick', floor: 0.15, zoom: [1.0, 1.16], glitch: 0.4 },
    // The path again, backwards and fast, one place per beat.
    { at: 72, montage: { list: ['eye-closed', 'window', 'servers', 'tunnel', 'street', 'substation', 'lines', 'tower'], every: 'beat' }, mode: 'threshold', light: 'kick', floor: 0.2, glitch: 0.5 },
    { at: 80, still: 'eye-closed', light: 'kick', floor: 0.2, zoom: [1.1, 1.75], pan: [0, 0.15], flash: { list: ['eye-open'], prob: (f) => 0.1 + 0.6 * ((f.bar - 80) / 8), frames: 1, mode: 'threshold' }, glitch: 0.6 },
    // The peak: RECEIVED.
    { at: 88, still: 'eye-open', modes: { list: ['photo', 'threshold', 'photo', 'edges'], every: 'beat' }, light: 'kick', floor: 0.3, level: 1.3, zoom: [1.35, 1.0], glitch: 0.8, flash: { list: ['tower', 'servers', 'lines'], prob: 0.3, frames: 1, invert: true } },
    { at: 96, still: 'window', light: 'kick', floor: 0.15, ramp: [1, 0.3], zoom: [1.0, 1.2], flash: { list: ['eye-open'], prob: 0.16, frames: 1 }, glitch: 0.3 },
    { at: 104, montage: { list: ['servers', 'tunnel', 'street', 'substation', 'lines', 'lines', 'tower', 'tower'], every: 'bar' }, mode: 'dither', light: 'kick', floor: 0.1, glitch: 0.2 },
    // Bass out: only the heartbeat on a flat line, the mast at dawn.
    { at: 112, still: 'dawn', light: 'kick', floor: 0.35, level: 0.9, zoom: [1.16, 1.05] },
    { at: 120, still: 'dawn', light: 'kick', floor: 0.3, level: 0.85, zoom: [1.05, 1.0], ramp: [1, 0.55] },
  ],

  text: [
    { from: 0.5, to: 7, str: 'OVERCLOCK', x: 0.045, y: 0.075, size: 18 },
    { from: 1.5, to: 7, str: 'ACT I — SIGNAL', x: 0.045, y: 0.11, size: 18, alpha: 0.75 },
    { from: 16, to: 19, str: 'TRANSMISSION 01', x: 0.045, y: 0.8, size: 20 },
    { from: 32, to: 35, str: 'LINE 7 / 380 KV', x: 0.045, y: 0.8, size: 20 },
    { from: 40, to: 48, str: 'SEARCHING', x: 0.5, y: 0.5, size: 26, align: 'center', type: 'static', blink: 'hat' },
    { from: 48, to: 56, str: 'NO RECEIVER', x: 0.045, y: 0.8, size: 20 },
    { from: 56, to: 60, str: 'RECEIVER FOUND', x: 0.045, y: 0.8, size: 20 },
    { from: 64, to: 68, str: 'HANDSHAKE', x: 0.045, y: 0.8, size: 20 },
    { from: 88, to: 90, str: 'RECEIVED', x: 0.5, y: 0.5, size: 230, font: 'big', align: 'center', type: 'slam' },
    { from: 104, to: 108, str: 'END OF CARRIER', x: 0.045, y: 0.8, size: 20 },
    { from: 121, to: 127.5, str: 'OVERCLOCK (ACT I) — SIGNAL', x: 0.045, y: 0.9, size: 18, alpha: 0.8 },
  ],

  // The signal: a dot on its route, and a test band on the side.
  under(g, f, shot, H) {
    const { w, h } = H;
    const x0 = w * 0.08, x1 = w * 0.92, y = h * 0.86;
    // Where the signal is: out to the receiver by the peak, held there while
    // it is received, back to the mast during the close, home after.
    const smooth = (u) => u * u * (3 - 2 * u);
    let u, moving = true;
    if (f.bar < 88) u = f.bar / 88;
    else if (f.bar < 96) { u = 1; moving = false; }
    else if (f.bar < 112) u = 1 - smooth((f.bar - 96) / 16);
    else { u = 0; moving = false; }
    const x = x0 + (x1 - x0) * u;
    const home = f.bar >= 112;
    g.save();
    g.globalCompositeOperation = 'lighter';

    // The route: a hairline with one tick per place on the way.
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.fillRect(x0, y, x1 - x0, 1);
    const STOPS = 8;
    for (let i = 0; i < STOPS; i++) {
      const tx = x0 + (x1 - x0) * (i / (STOPS - 1));
      g.fillStyle = `rgba(255,255,255,${tx <= x + 0.5 ? 0.55 : 0.22})`;
      g.fillRect(Math.round(tx), y - 4, 1, 9);
    }

    // The dot: pulses with each bass note, trails when it travels; at home it
    // only shows on the kick, a heartbeat.
    const pulse = Math.min(1, f.acidEnv * 1.2 + (f.sec.acid ? 0 : 0.2 * f.kickEnv));
    const alpha = home ? Math.pow(f.kickEnv, 0.7) : 1;
    if (moving && !home) {
      const dir = f.bar >= 96 ? 1 : -1; // the trail points back along the way it came
      for (let k = 1; k <= 12; k++) {
        g.fillStyle = `rgba(255,255,255,${0.35 * (1 - k / 13)})`;
        g.fillRect(x + dir * k * 3 - 1, y - 1, 2, 2);
      }
    }
    const r = 2.6 + 3.4 * pulse;
    const glow = g.createRadialGradient(x, y, 0, x, y, 6 + 18 * pulse);
    glow.addColorStop(0, `rgba(255,255,255,${0.5 * alpha})`);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow;
    g.fillRect(x - 30, y - 30, 60, 60);
    g.fillStyle = `rgba(255,255,255,${alpha})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    // On an accent the dot tears into a second, offset copy.
    if (f.accEnv > 0.45 && !home) {
      g.fillStyle = `rgba(255,255,255,${0.45 * f.accEnv})`;
      g.beginPath(); g.arc(x + (f.rnd(31) - 0.5) * 18, y + (f.rnd(32) < 0.5 ? -7 : 7), r * 0.8, 0, Math.PI * 2); g.fill();
    }
    // Received: a ring goes out on every kick.
    if (f.bar >= 88 && f.bar < 96 && f.kick) {
      const age = f.t - f.kick.t;
      if (age < 0.5) {
        g.strokeStyle = `rgba(255,255,255,${0.7 * (1 - age / 0.5)})`;
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(x, y, 6 + age * 170, 0, Math.PI * 2); g.stroke();
      }
    }

    // The test band: grey bars stacked down the right edge, slipping and
    // tearing on the accents; full strength at the peak, gone at home.
    const bandA = f.bar < 8 ? (f.bar / 8) * 0.55 : f.bar >= 112 ? Math.max(0, 0.55 * (1 - (f.bar - 112) / 4)) : f.bar >= 88 && f.bar < 96 ? 0.95 : 0.55;
    if (bandA > 0.01) {
      const bx = w - 34, bw = 18, top = h * 0.2, bh = h * 0.6, BARS = 8;
      const tear = f.accEnv > 0.35 ? f.accEnv : 0;
      const r2 = H.rng(f.accent ? f.accent.n : 0, 77);
      for (let i = 0; i < BARS; i++) {
        let v = 235 - i * 30;
        let dx = 0, dy = 0;
        if (tear && r2() < 0.45) { dx = Math.round((r2() - 0.5) * 26 * tear); dy = Math.round((r2() - 0.5) * 10 * tear); if (r2() < 0.3) v = 255 - v; }
        g.fillStyle = `rgba(${v},${v},${v},${bandA})`;
        g.fillRect(bx + dx, top + i * (bh / BARS) + dy, bw, bh / BARS - 1);
      }
      // A thin torn copy beside it when an accent hits hard.
      if (tear > 0.7) {
        g.fillStyle = `rgba(255,255,255,${0.25 * tear})`;
        g.fillRect(bx - 10 - Math.round(r2() * 8), top + Math.round(r2() * bh * 0.8), 3, Math.round(bh * (0.1 + r2() * 0.2)));
      }
    }
    g.restore();
  },

  glitch(f) {
    // The peak: a white flash on each bar's downbeat, the frame held a beat.
    if (f.bar >= 88 && f.bar < 96 && f.kick && f.kick.i % 16 === 0) return { flash: 0.85 * Math.exp(-(f.t - f.kick.t) / 0.06) };
    return {};
  },
});
