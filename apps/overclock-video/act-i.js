// ACT I — SIGNAL.
// A transmission leaves a radio mast in the fog and crosses the city — pylons,
// a substation, a street, cable tunnels, a server hall — looking for a
// receiver. It finds a sleeper (the hats drop out: the city goes quiet, the
// signal keeps rolling), the eye opens at the peak (bar 89: RECEIVED), and the
// path runs backwards to the mast at dawn while the bass leaves and only the
// kick, a heartbeat on a flat line, is left.
//
// The trace across the frame is the bass itself: an oscilloscope line whose
// pitch follows the off-beat line (A, a glide to C, A, a glide to E, a glide
// down to G) and whose harmonics grow as the filter opens.
defineAct({
  id: 'act-i', number: 'I', title: 'SIGNAL',
  stills: { tower: '01-tower', lines: '02-lines', substation: '03-substation', street: '04-street', tunnel: '05-tunnel', servers: '06-servers', scope: '07-scope', window: '08-window', hand: '09-hand', 'eye-closed': '10-eye-closed', 'eye-open': '11-eye-open', dawn: '12-dawn' },
  acid: { onsets: [2, 6, 10, 14], accents: [2, 10] },
  minFloor: 0.3, // pictures stay readable between kicks
  fadeIn: 0.8, fadeOut: [232.5, 240.5],

  shots: [
    { at: 0, still: 'tower', light: 'kick', floor: 0.03, level: 1.05, zoom: [1.0, 1.12], panY: [-0.3, 0.2], ramp: [0.5, 1], trace: { y: 0.66, amp: 0.35 } },
    { at: 8, still: 'lines', light: 'kick', floor: 0.06, zoom: [1.05, 1.18], pan: [0.5, -0.4], flash: { list: ['tower'], prob: 0.22, mode: 'threshold' }, trace: { y: 0.62, amp: 0.4 } },
    { at: 16, still: 'substation', mode: 'raster', light: 'kick', floor: 0.1, zoom: [1.0, 1.14], flash: { list: ['lines', 'tower'], prob: 0.2, frames: 1 }, glitch: 0.15, trace: { y: 0.3 } },
    { at: 24, still: 'street', light: 'kick', floor: 0.12, zoom: [1.12, 1.0], pan: [-0.3, 0.3], flash: { list: ['substation', 'tunnel'], prob: 0.25, mode: 'dither' }, glitch: 0.2, trace: { y: 0.72 } },
    { at: 32, still: 'tunnel', mode: 'dither', light: 'kick', floor: 0.14, zoom: [1.0, 1.45], pan: [0.2, 0.25], flash: { list: ['street', 'servers'], prob: 0.25 }, glitch: 0.25, trace: { y: 0.5, amp: 0.45 } },
    { at: 40, still: 'servers', mode: 'raster', light: 'kick', floor: 0.15, zoom: [1.0, 1.55], flash: { list: ['scope', 'tunnel'], prob: 0.4, on: 'accent', mode: 'threshold' }, glitch: 0.35, trace: { y: 0.5, amp: 0.5 } },
    // Hats out: the city goes quiet; the signal keeps searching.
    { at: 48, still: 'scope', light: 'kick', floor: 0.4, zoom: [1.12, 1.32], contrast: 1.4, glitch: 0.08, trace: { y: 0.46, amp: 0.55, alpha: 1 } },
    { at: 52, still: 'window', light: 'kick', floor: 0.32, zoom: [1.0, 1.12], pan: [-0.2, 0.2], glitch: 0.08, trace: { y: 0.82, amp: 0.3, alpha: 0.6 } },
    { at: 56, still: 'hand', light: 'kick', floor: 0.12, zoom: [1.0, 1.22], flash: { list: ['tunnel', 'servers', 'street'], prob: 0.22, mode: 'dither' }, glitch: 0.3, trace: { y: 0.3, amp: 0.45 } },
    { at: 64, montage: { list: ['eye-closed', 'hand'], every: 'bar' }, mode: 'raster', light: 'kick', floor: 0.15, zoom: [1.0, 1.16], glitch: 0.4, trace: { y: 0.5, amp: 0.55 } },
    // The path again, backwards and fast, one place per beat.
    { at: 72, montage: { list: ['eye-closed', 'window', 'servers', 'tunnel', 'street', 'substation', 'lines', 'tower'], every: 'beat' }, mode: 'threshold', light: 'kick', floor: 0.2, glitch: 0.5, trace: { y: 0.5, amp: 0.65 } },
    { at: 80, still: 'eye-closed', light: 'kick', floor: 0.2, zoom: [1.1, 1.75], pan: [0, 0.15], flash: { list: ['eye-open'], prob: (f) => 0.1 + 0.6 * ((f.bar - 80) / 8), frames: 1, mode: 'threshold' }, glitch: 0.6, trace: { y: 0.5, amp: 0.75 } },
    // The peak: RECEIVED.
    { at: 88, still: 'eye-open', modes: { list: ['photo', 'threshold', 'photo', 'edges'], every: 'beat' }, light: 'kick', floor: 0.3, level: 1.3, zoom: [1.35, 1.0], glitch: 0.8, flash: { list: ['tower', 'servers', 'lines'], prob: 0.3, frames: 1, invert: true }, trace: { n: 5, amp: 0.7 } },
    { at: 96, still: 'window', light: 'kick', floor: 0.15, ramp: [1, 0.3], zoom: [1.0, 1.2], flash: { list: ['eye-open'], prob: 0.16, frames: 1 }, glitch: 0.3, trace: { y: 0.82, amp: 0.5 } },
    { at: 104, montage: { list: ['servers', 'tunnel', 'street', 'substation', 'lines', 'lines', 'tower', 'tower'], every: 'bar' }, mode: 'dither', light: 'kick', floor: 0.1, glitch: 0.2, trace: { y: 0.5, amp: 0.4 } },
    // Bass out: only the heartbeat on a flat line, the mast at dawn.
    { at: 112, still: 'dawn', light: 'kick', floor: 0.35, level: 0.9, zoom: [1.16, 1.05], trace: { mode: 'flat', y: 0.78 } },
    { at: 120, still: 'dawn', light: 'kick', floor: 0.3, level: 0.85, zoom: [1.05, 1.0], ramp: [1, 0.55], trace: { mode: 'flat', y: 0.78, alpha: 0.5 } },
  ],

  text: [
    { from: 0.5, to: 7, str: 'OVERCLOCK', x: 0.045, y: 0.075, size: 18 },
    { from: 1.5, to: 7, str: 'ACT I — SIGNAL', x: 0.045, y: 0.11, size: 18, alpha: 0.75 },
    { from: 16, to: 19, str: 'TRANSMISSION 01', x: 0.045, y: 0.86, size: 20 },
    { from: 32, to: 35, str: 'LINE 7 / 380 KV', x: 0.045, y: 0.86, size: 20 },
    { from: 40, to: 48, str: 'SEARCHING', x: 0.5, y: 0.5, size: 26, align: 'center', type: 'static', blink: 'hat' },
    { from: 48, to: 56, str: 'NO RECEIVER', x: 0.045, y: 0.86, size: 20 },
    { from: 56, to: 60, str: 'RECEIVER FOUND', x: 0.045, y: 0.86, size: 20 },
    { from: 64, to: 68, str: 'HANDSHAKE', x: 0.045, y: 0.86, size: 20 },
    { from: 88, to: 90, str: 'RECEIVED', x: 0.5, y: 0.5, size: 230, font: 'big', align: 'center', type: 'slam' },
    { from: 104, to: 108, str: 'END OF CARRIER', x: 0.045, y: 0.86, size: 20 },
    { from: 121, to: 127.5, str: 'OVERCLOCK (ACT I) — SIGNAL', x: 0.045, y: 0.9, size: 18, alpha: 0.8 },
  ],

  // The oscilloscope trace: the bass line drawn as a band-limited saw.
  under(g, f, shot, H) {
    const tr = { y: 0.5, amp: 0.5, alpha: 0.9, n: 1, mode: 'saw', ...(shot.trace || {}) };
    const { w, h } = H;
    g.save();
    g.globalCompositeOperation = 'lighter';
    if (tr.mode === 'flat') { // the heartbeat: a flat line with a blip on each kick
      const cy = tr.y * h, k = f.kickEnv;
      g.strokeStyle = `rgba(255,255,255,${tr.alpha * (0.35 + 0.65 * k)})`; g.lineWidth = 1.4;
      g.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const d = (x - w * 0.5) / 18, blip = Math.exp(-d * d) * Math.sin(d * 2.4) * 60 * k;
        x ? g.lineTo(x, cy - blip) : g.moveTo(x, cy - blip);
      }
      g.stroke(); g.restore(); return;
    }
    // Pitch: A, glide to C, A, glide to E, glide down to G — the line's own notes.
    const k = f.step % 16, within = f.t / H.STEP - f.step, R = (st) => Math.pow(2, st / 12);
    const held = { 0: R(-2), 1: R(-2), 2: 1, 3: H.lerp(1, R(3), H.ease(within)), 4: R(3), 5: R(3), 6: 1, 7: 1, 8: 1, 9: 1, 10: 1, 11: H.lerp(1, R(7), H.ease(within)), 12: R(7), 13: R(7), 14: 1, 15: H.lerp(1, R(-2), H.ease(within)) };
    const ratio = held[k];
    const env = Math.min(1, f.acid * 1.15 + f.acidEnv * 0.35);
    const K = Math.max(1, Math.round(1 + 22 * Math.pow(f.p, 1.4))); // harmonics open with the filter
    const cycles = 3.2 * ratio;
    for (let n = 0; n < tr.n; n++) {
      const cy = tr.n > 1 ? h * (0.14 + 0.72 * n / (tr.n - 1)) : tr.y * h;
      const A = tr.amp * h * 0.5 * env * (tr.n > 1 ? 0.45 : 1);
      const phase = f.t * 2.1 + n * 1.3;
      for (const [lw, a] of [[5, 0.12], [1.6, 0.95]]) {
        g.strokeStyle = `rgba(255,255,255,${a * tr.alpha})`; g.lineWidth = lw;
        g.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const th = (x / w) * cycles * Math.PI * 2 + phase;
          let s = 0; for (let q = 1; q <= K; q++) s += Math.sin(q * th) / q;
          const y = cy - A * s * 0.64;
          x ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      }
    }
    g.restore();
  },

  // Readout: the carrier is the bass root; the bandwidth is the filter.
  over(o, f, shot, H) {
    if (f.bar >= 2 && f.bar < 112) {
      const bw = Math.round(300 + 2600 * f.p * f.p);
      H.text({ str: `CARRIER 110.0 HZ   BW ${String(bw).padStart(4, ' ')} HZ`, x: 0.045, y: 0.93, size: 16, alpha: 0.6 });
    }
  },

  glitch(f) {
    // The peak: a white flash on each bar's downbeat, the frame held a beat.
    if (f.bar >= 88 && f.bar < 96 && f.kick && f.kick.i % 16 === 0) return { flash: 0.85 * Math.exp(-(f.t - f.kick.t) / 0.06) };
    return {};
  },
});
