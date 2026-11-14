// The trailer's soundtrack, rendered offline (OfflineAudioContext) in one pass: act 1's braams,
// riser and power-down, the game's start jingle as the hinge, the chiptune theme, and the game's
// own sounds where the footage makes them. tone(), noise(), SFX and garble() are the game's
// (public/semibart/index.html), with the start time passed in instead of read from the clock.
// renderScore(cfg) → base64 WAV. cfg: the constants of edit.mjs plus `events` (render.mjs).
/* global OfflineAudioContext */
async function renderScore(cfg) {
  const SR = 48000, AC = new OfflineAudioContext(2, Math.ceil(cfg.DUR * SR), SR);
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
  const out = AC.createGain(); out.gain.value = 0.9; comp.connect(out).connect(AC.destination);
  // a hall for the braams: noise with an exponential tail
  const hall = AC.createConvolver(), irLen = SR * 4.5, ir = AC.createBuffer(2, irLen, SR);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2) * (i < 600 ? i / 600 : 1); }
  hall.buffer = ir; const hallOut = AC.createGain(); hallOut.gain.value = 0.55; hall.connect(hallOut).connect(comp);
  const bus = (vol, wet) => { const g = AC.createGain(); g.gain.value = vol; g.connect(comp); if (wet) { const s = AC.createGain(); s.gain.value = wet; g.connect(s).connect(hall); } return g; };
  const trailer = bus(1, 0.9), chip = bus(0.85, 0.06), game = bus(0.55, 0.02);   // the game's master is 0.55

  /* ---------- the game's synth ---------- */
  let dest = game;
  function tone(freq, dur, type, vol, t, slideTo, to) {
    const o = AC.createOscillator(), gn = AC.createGain();
    if (type && typeof type === 'object') o.setPeriodicWave(type); else o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.008); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(to || dest); o.start(t); o.stop(t + dur + 0.03);
    return o;
  }
  const noiseBuf = AC.createBuffer(1, SR * 2, SR); { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  function noise(dur, vol, f1, f2, t, q, ftype, to) {
    const src = AC.createBufferSource(), f = AC.createBiquadFilter(), gn = AC.createGain();
    src.buffer = noiseBuf; f.type = ftype || 'bandpass'; f.Q.value = q || 1;
    f.frequency.setValueAtTime(f1, t); if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(vol, t + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(gn).connect(to || dest); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.03);
  }
  const SFX = {
    step(t, soft) { noise(0.05, soft ? 0.05 : 0.14, 900, 300, t, 1.2); },
    key(t) { tone(1700 + Math.random() * 900, 0.025, 'square', 0.025, t); },
    knock(t) { [0, 0.22].forEach(w => { noise(0.09, 0.5, 260, 120, t + w, 2, 'lowpass'); tone(95, 0.1, 'sine', 0.35, t + w, 70); }); },
    creak(t) { tone(170, 0.6, 'sawtooth', 0.04, t, 260); noise(0.5, 0.05, 600, 1400, t, 6); },
    sparkle(t) { [1047, 1319, 1568, 2093, 2637].forEach((f, i) => tone(f, 0.18, 'sine', 0.09, t + i * 0.06)); },
    swoosh(t) { noise(0.45, 0.18, 400, 2400, t, 1.4); },
    pick(t) { tone(660, 0.05, 'square', 0.06, t); tone(990, 0.07, 'square', 0.06, t + 0.05); },
    flush(t) { noise(1.1, 0.22, 2400, 180, t, 0.8); noise(0.7, 0.12, 500, 120, t + 0.5, 4, 'lowpass'); [0.9, 1.05, 1.22, 1.42].forEach((w, i) => tone(300 - i * 40, 0.09, 'sine', 0.07, t + w, 180 - i * 20)); },
    chirp(t) { tone(2600, 0.05, 'sine', 0.035, t, 3500); tone(2900, 0.05, 'sine', 0.03, t + 0.1, 3700); tone(2700, 0.04, 'sine', 0.025, t + 0.32, 3400); },
    jingle(t, to) { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.07, t + i * 0.11, 0, to)); tone(1568, 0.4, 'triangle', 0.06, t + 0.44, 0, to); },
    gobble(t) { for (let i = 0; i < 9; i++) tone(560 + (i % 2) * 260 + Math.random() * 40, 0.06, 'square', 0.1, t + i * 0.058, 420); },
  };
  const VOICES = {
    you: { base: 300, steps: [0, 2, 4, 5, 7, 9], type: 'square', gap: 0.072, len: 0.06, vowels: [700, 1100, 1500, 500] },
    bart: { base: 165, steps: [0, 3, 5, 7, 10, 12], type: 'sawtooth', gap: 0.085, len: 0.07, vowels: [500, 800, 1100, 650] },
  };
  function hashK(k) { let h = 7; for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
  function autoVoice(k) {
    const h = hashK(k), base = [150, 175, 200, 230, 260, 300, 330][h % 7];
    return (VOICES[k] = { base, steps: [[0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 2, 5, 7, 12]][h % 3], type: ['square', 'triangle', 'sawtooth'][(h >> 3) % 3], gap: 0.066 + (h % 5) * 0.004, len: 0.06, vowels: [600, 950, 1300, 480] });
  }
  // garble, cut off where the shot ends
  function garble(who, text, t0, until) {
    if (who === 'turkey') return SFX.gobble(t0);
    const v = VOICES[who] || autoVoice(who);
    let t = t0 + 0.02, chunk = 0;
    const end = Math.min(until, t + Math.min(4.5, text.length * 0.05));
    for (let i = 0; i < text.length && t < end; i++) {
      const ch = text[i];
      if (ch === ' ') { t += v.gap * 0.6; chunk = 0; continue; }
      if ('.,!?:;'.includes(ch)) { t += v.gap * 2.2; chunk = 0; continue; }
      if (++chunk % 2 === 0) continue;
      const semi = v.steps[Math.floor(Math.random() * v.steps.length)] + (ch === ch.toUpperCase() && /[A-Z]/.test(ch) ? 3 : 0);
      const f = v.base * Math.pow(2, semi / 12), len = v.len * (0.8 + Math.random() * 0.5);
      const o = AC.createOscillator(), bp = AC.createBiquadFilter(), lp = AC.createBiquadFilter(), gn = AC.createGain();
      o.type = v.type; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (0.88 + Math.random() * 0.3), t + len);
      bp.type = 'bandpass'; bp.frequency.value = v.vowels[Math.floor(Math.random() * v.vowels.length)]; bp.Q.value = 1.6;
      lp.type = 'lowpass'; lp.frequency.value = 2400;
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.32, t + 0.012); gn.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(bp).connect(lp).connect(gn).connect(game); o.start(t); o.stop(t + len + 0.02);
      t += v.gap * (0.85 + Math.random() * 0.35);
    }
  }

  /* ---------- act 1: the trailer ---------- */
  const shaper = AC.createWaveShaper(); { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; c[i] = Math.tanh(x * 2.4); } shaper.curve = c; }
  shaper.connect(trailer);
  // a braam: a brass cluster of detuned saws through a filter that opens and closes, a sub drop and an impact
  function braam(t, root, big, hold) {
    const len = hold || 3.2, parts = big ? [1, 1.5, 2, 2.4, 3, 4] : [1, 1.5, 2, 3];
    const f = AC.createBiquadFilter(), g = AC.createGain();
    f.type = 'lowpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(120, t); f.frequency.exponentialRampToValueAtTime(big ? 3200 : 2200, t + 0.06); f.frequency.exponentialRampToValueAtTime(260, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(big ? 0.34 : 0.28, t + 0.025); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    f.connect(g).connect(shaper);
    parts.forEach((m, i) => [-9, 0, 9].forEach(c => {
      const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = root * m * Math.pow(2, c / 1200);
      const og = AC.createGain(); og.gain.value = (i === 0 ? 0.5 : 0.32) / (1 + i * 0.25); o.connect(og).connect(f); o.start(t); o.stop(t + len + 0.05);
    }));
    tone(root / 2, len * 0.8, 'sine', 0.7, t, root / 2 * 0.72, trailer);                     // sub drop
    tone(70, 0.5, 'sine', 0.9, t, 32, trailer);                                              // the hit itself
    noise(0.7, 0.9, 4000, 90, t, 0.7, 'lowpass', trailer);                                    // impact
    if (big) [523, 1187, 1730, 2611].forEach((fr, i) => tone(fr, 2.6 - i * 0.4, 'sine', 0.05, t, fr * 0.985, trailer));   // metal
    return g;
  }
  const C2 = 65.41, Ab1 = 51.91;
  // before the first hit: a low swell and a slow clock
  { const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o.frequency.value = C2 / 2;
    g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.35, cfg.HITS[0] - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, cfg.HITS[0] + 0.02);
    o.connect(g).connect(trailer); o.start(0); o.stop(cfg.HITS[0] + 0.1); }
  for (let t = 0.2; t < cfg.HITS[0]; t += 0.5) noise(0.03, 0.12, 3200, null, t, 6, 'bandpass', trailer);
  // hi-fi detail: a whoosh into every hit (the word flying in) and a shimmer of glitter after it
  const rs = (k => () => { k = (k * 16807) % 2147483647; return k / 2147483647; })(12345);
  cfg.HITS.forEach((h, i) => {
    const src = AC.createBufferSource(), f = AC.createBiquadFilter(), gw = AC.createGain(); src.buffer = noiseBuf;
    f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(350, h - 0.45); f.frequency.exponentialRampToValueAtTime(6000, h);
    gw.gain.setValueAtTime(0.0001, h - 0.45); gw.gain.exponentialRampToValueAtTime(0.5, h - 0.01); gw.gain.linearRampToValueAtTime(0.0001, h + 0.02);
    src.connect(f).connect(gw).connect(trailer); src.start(h - 0.45); src.stop(h + 0.05);
    for (let k = 0; k < 26 + i * 10; k++) { const w = Math.pow(rs(), 1.7) * 1.8; tone(2400 + rs() * 6000, 0.25 + rs() * 0.5, 'sine', 0.035 * (1 - w / 2), h + 0.04 + w, 0, trailer); }
  });
  for (let t = cfg.RISER[0]; t < cfg.RISER[1]; t += 0.06 - 0.04 * (t - cfg.RISER[0]) / (cfg.RISER[1] - cfg.RISER[0])) tone(3000 + rs() * 5000, 0.18, 'sine', 0.02, t, 0, trailer);
  braam(cfg.HITS[0], C2, false);
  braam(cfg.HITS[1], Ab1, false);
  const last = braam(cfg.HITS[2], C2, true, cfg.CRUMBLE[0] - cfg.HITS[2] + 1.2);
  // the hot line crossing CHANGES.: a sear that climbs as it goes, a growl under it, crackle off the sparks (as in intro.js)
  { const h0 = cfg.HITS[1] + cfg.HEAT[0], d = cfg.HEAT[1], src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(), rc = (k => () => { k = (k * 16807) % 2147483647; return k / 2147483647; })(777); src.buffer = noiseBuf; src.loop = true;
    f.type = 'bandpass'; f.Q.value = 2.2; f.frequency.setValueAtTime(900, h0); f.frequency.exponentialRampToValueAtTime(5600, h0 + d);
    g.gain.setValueAtTime(0.0001, h0); g.gain.exponentialRampToValueAtTime(0.42, h0 + 0.14); g.gain.setValueAtTime(0.42, h0 + d - 0.08); g.gain.exponentialRampToValueAtTime(0.0001, h0 + d + 0.22);
    src.connect(f).connect(g).connect(trailer); src.start(h0); src.stop(h0 + d + 0.3);
    tone(150, d, 'sawtooth', 0.045, h0, 620, trailer);
    for (let k = 0; k < 26; k++) noise(0.018, 0.16 + rc() * 0.12, 4500 + rc() * 5000, null, h0 + 0.05 + rc() * (d + 0.15), 9, 'bandpass', trailer); }
  // the riser: rushing noise, a rising saw and a clock that speeds up, all cut dead at the crumble
  const [r0, r1] = cfg.RISER, cut = AC.createGain(); cut.gain.setValueAtTime(1, 0); cut.gain.setValueAtTime(1, r1 - 0.004); cut.gain.linearRampToValueAtTime(0, r1); cut.connect(trailer);
  last.gain.cancelScheduledValues(r1 - 0.01); last.gain.setValueAtTime(0.05, r1 - 0.01); last.gain.linearRampToValueAtTime(0, r1 + 0.02);
  { const src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); src.buffer = noiseBuf; src.loop = true;
    f.type = 'bandpass'; f.Q.value = 1.8; f.frequency.setValueAtTime(300, r0); f.frequency.exponentialRampToValueAtTime(9000, r1);
    g.gain.setValueAtTime(0.0001, r0); g.gain.exponentialRampToValueAtTime(0.5, r1); src.connect(f).connect(g).connect(cut); src.start(r0); src.stop(r1 + 0.05);
    const o = AC.createOscillator(), og = AC.createGain(), of = AC.createBiquadFilter(); o.type = 'sawtooth'; of.type = 'lowpass'; of.frequency.value = 2500;
    o.frequency.setValueAtTime(C2 * 2, r0); o.frequency.exponentialRampToValueAtTime(C2 * 16, r1);
    og.gain.setValueAtTime(0.0001, r0); og.gain.exponentialRampToValueAtTime(0.16, r1); o.connect(of).connect(og).connect(cut); o.start(r0); o.stop(r1 + 0.05);
    for (let t = r0, gap = 0.3; t < r1; t += gap, gap = Math.max(0.035, gap * 0.86)) { tone(1400, 0.03, 'square', 0.05 + 0.1 * (t - r0) / (r1 - r0), t, 0, cut); tone(70, 0.08, 'sine', 0.3 * (t - r0) / (r1 - r0), t, 45, cut); } }

  /* ---------- the hinge: the chord powers down as square waves, then the game's jingle ---------- */
  const [k0, k1] = cfg.CRUMBLE;
  [261.63, 311.13, 392.0, 523.25].forEach((fr, i) => tone(fr, k1 - k0, 'square', 0.055, k0 + i * 0.012, fr / 4, chip));
  noise(0.35, 0.3, 3000, 400, k0, 1, 'bandpass', chip);
  for (let i = 0; i < 8; i++) noise(0.04, 0.1, 1200 + i * 300, null, k0 + 0.05 + i * 0.07, 4, 'bandpass', chip);    // pixels landing
  SFX.jingle(cfg.JINGLE, chip);

  /* ---------- act 2: the theme, 120 BPM ---------- */
  const E = cfg.BAR / 8, T0 = cfg.T0, mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const pulse = d => { const n = 48, re = new Float32Array(n), im = new Float32Array(n); for (let i = 1; i < n; i++) re[i] = 2 / (i * Math.PI) * Math.sin(i * Math.PI * d); return AC.createPeriodicWave(re, im); };
  const P25 = pulse(0.25), P125 = pulse(0.125), P50 = pulse(0.5);
  function note(m, t, len, wave, vol, to) {
    const o = AC.createOscillator(), g = AC.createGain(); if (typeof wave === 'string') o.type = wave; else o.setPeriodicWave(wave);
    o.frequency.value = mtof(m);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.setValueAtTime(vol, t + 0.03); g.gain.linearRampToValueAtTime(vol * 0.62, t + Math.min(len, 0.2)); g.gain.setValueAtTime(vol * 0.62, t + len - 0.02); g.gain.linearRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(to || chip); o.start(t); o.stop(t + len + 0.02);
  }
  const CH = { C: [48, [60, 64, 67]], Am: [45, [57, 60, 64]], F: [41, [53, 57, 60]], G: [43, [55, 59, 62]], Em: [40, [52, 55, 59]] };
  const BARS = ['C', 'C', 'C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G', 'F', 'G', 'Em', 'Am', 'F', 'G'];
  const MEL = [
    '. . . . . . . .', '. . . . . . . .',
    '72 76 79 84 - 79 76 79', '81 - 79 76 - 72 74 76', '77 - 81 77 72 - 77 79', '79 - - 74 71 74 79 -',
    '72 76 79 84 - 86 84 79', '81 - 84 81 79 76 72 76', '77 81 84 - 81 79 77 76', '74 - 79 - 83 - 86 -',
    '84 - 81 - 77 - 81 84', '86 - 83 - 79 - 83 86', '88 - 83 - 79 - 76 79', '81 - - - 84 - 88 -', '89 - 88 - 84 - 81 -',
    '79 . 83 . 86 - - .',
  ];
  // the melody, with a quieter echo an eighth behind on a thinner pulse
  const mel = MEL.join(' ').split(' ');
  for (let i = 0; i < mel.length; i++) {
    if (!/^\d+$/.test(mel[i])) continue;
    let n = 1; while (mel[i + n] === '-') n++;
    const t = T0 + i * E, len = n * E - 0.02;
    note(+mel[i], t, len, P25, 0.13);
    note(+mel[i], t + E * 0.75, Math.min(len, E * 1.5), P125, 0.04);
  }
  BARS.forEach((c, b) => {
    const t = T0 + b * cfg.BAR, [root, tones] = CH[c], stabBar = b === BARS.length - 1;
    // bass: eighths, root and octave, triangle like the NES
    for (let i = 0; i < 8; i++) { if (stabBar && (i % 2 || i > 4)) continue; note(root + 12 + (i % 2 ? 12 : 0), t + i * E, stabBar ? E * 1.6 : E * 0.9, 'triangle', 0.13); }
    // arpeggio in sixteenths: from the start, quiet; louder in the B section
    if (!stabBar) for (let i = 0; i < 16; i++) note(tones[i % 3] + 12 + (i % 6 > 2 ? 12 : 0), t + i * E / 2, E / 2 - 0.01, P50, b >= 10 ? 0.026 : b < 2 ? 0.03 : 0.018);
    else [0, 1, 2].forEach(k => tones.forEach(m => note(m + 12, cfg.STABS[k], 0.3, P50, 0.035)));
    // drums from bar 2: kick on 1 and 3, snare on 2 and 4, hats on the eighths, a fill before the melody
    if (b >= 1) for (let i = 0; i < 8; i++) {
      const tt = t + i * E;
      if (stabBar) { if (i % 2 === 0 && i <= 4) { tone(150, 0.14, 'triangle', 0.32, tt, 55, chip); noise(0.18, 0.4, 2000, 900, tt, 0.9, 'bandpass', chip); } continue; }
      if (i === 0 || i === 4 || (b % 2 && i === 7)) tone(160, 0.1, 'triangle', 0.26, tt, 60, chip);
      if (i === 2 || i === 6) noise(0.12, 0.3, 1900, 1100, tt, 0.9, 'bandpass', chip);
      noise(0.025, i % 2 ? 0.06 : 0.09, 8000, null, tt, 1, 'highpass', chip);
      if (b === 1 && i >= 4) [0, 0.5].forEach(h => noise(0.08, 0.22, 1600 + i * 120, 900, tt + h * E, 1, 'bandpass', chip));
    }
  });
  // the end card: the big C, the jingle once more, the chord ringing out
  const tE = cfg.END;
  tone(150, 0.2, 'triangle', 0.3, tE, 55, chip); noise(1.6, 0.25, 9000, 2000, tE, 0.6, 'highpass', chip);
  [60, 64, 67, 72].forEach(m => note(m + 12, tE, 3.6, P25, 0.06));
  note(48, tE, 3.8, 'triangle', 0.1);
  SFX.jingle(tE + 0.5, chip);
  note(84, tE + 1.0, 2.6, P125, 0.04);

  /* ---------- the game's own sounds, where the footage makes them ---------- */
  for (const e of cfg.events) if (e.say && e.say !== 'turkey') {
    const a = e.t, b = Math.min(e.until, e.t + Math.min(4.5, e.text.length * 0.05) + 0.1);
    chip.gain.setTargetAtTime(0.5, a, 0.03); chip.gain.setTargetAtTime(0.85, b, 0.08);
  }
  for (const e of cfg.events) {
    if (e.sfx && SFX[e.sfx] && !cfg.MUTE_SFX.includes(e.sfx)) SFX[e.sfx](e.t, ...(e.args || []).slice(0, 1).filter(a => typeof a === 'boolean'));
    if (e.say) garble(e.say, e.text, e.t, e.until);
  }

  const buf = await AC.startRendering();
  // 16-bit WAV
  const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, wav = new DataView(new ArrayBuffer(44 + n * 4));
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) wav.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); wav.setUint32(4, 36 + n * 4, true); ws(8, 'WAVE'); ws(12, 'fmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 2, true);
  wav.setUint32(24, SR, true); wav.setUint32(28, SR * 4, true); wav.setUint16(32, 4, true); wav.setUint16(34, 16, true); ws(36, 'data'); wav.setUint32(40, n * 4, true);
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const k = peak > 0.98 ? 0.98 / peak : 1;
  for (let i = 0; i < n; i++) { wav.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] * k)) * 32767, true); wav.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] * k)) * 32767, true); }
  const bytes = new Uint8Array(wav.buffer); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { wav: btoa(s), peak };
}
