// CASBS Quest's theme, as the game's background music: the chiptune from the trailer
// (apps/semibart-trailer/score.js), built on the start jingle. 120 BPM, a bar is 2 s, a 16-bar loop
// of 32 s: two bars of bass, arpeggio and drums, eight of the tune (C Am F G twice), six of the
// bridge (F G Em Am F G). Pulse lead with an echo, triangle bass, noise drums, on the game's own
// AudioContext and master gain (quest.sound()), so the sound switch in your menu silences it.
// It sits under the sound effects, dips while someone is talking, and goes quiet in a hidden tab.
// index.html's start() calls questMusic.play(when) so the theme comes in after the jingle.
(() => {
  'use strict';
  const BAR = 2, E = BAR / 8, AHEAD = 0.35, VOL = 0.42, DUCK = 0.2;
  const CH = { C: [48, [60, 64, 67]], Am: [45, [57, 60, 64]], F: [41, [53, 57, 60]], G: [43, [55, 59, 62]], Em: [40, [52, 55, 59]] };
  const BARS = ['C', 'C', 'C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G', 'F', 'G', 'Em', 'Am', 'F', 'G'];
  const MEL = [
    '. . . . . . . .', '. . . . . . . .',
    '72 76 79 84 - 79 76 79', '81 - 79 76 - 72 74 76', '77 - 81 77 72 - 77 79', '79 - - 74 71 74 79 -',
    '72 76 79 84 - 86 84 79', '81 - 84 81 79 76 72 76', '77 81 84 - 81 79 77 76', '74 - 79 - 83 - 86 -',
    '84 - 81 - 77 - 81 84', '86 - 83 - 79 - 83 86', '88 - 83 - 79 - 76 79', '81 - - - 84 - 88 -', '89 - 88 - 84 - 81 -', '74 - 79 - 83 - 86 -',
  ].map(b => b.split(' '));
  let ac = null, bus = null, waves = null, noiseBuf = null, t0 = 0, next = 0, timer = null;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function setup() {
    const s = window.quest && window.quest.sound && window.quest.sound();
    if (!s || !s.ac || !s.master) return false;
    if (ac === s.ac) return true;
    ac = s.ac; bus = ac.createGain(); bus.gain.value = 0; bus.connect(s.master);
    const pulse = d => { const n = 48, re = new Float32Array(n), im = new Float32Array(n); for (let i = 1; i < n; i++) re[i] = 2 / (i * Math.PI) * Math.sin(i * Math.PI * d); return ac.createPeriodicWave(re, im); };
    waves = { p25: pulse(0.25), p125: pulse(0.125), p50: pulse(0.5) };
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  function note(m, t, len, wave, vol) {
    const o = ac.createOscillator(), g = ac.createGain();
    if (typeof wave === 'string') o.type = wave; else o.setPeriodicWave(wave);
    o.frequency.value = mtof(m);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.linearRampToValueAtTime(vol * 0.62, t + Math.min(len * 0.8, 0.2)); g.gain.linearRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(bus); o.start(t); o.stop(t + len + 0.02);
  }
  function kick(t, v) { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.1);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1); o.connect(g).connect(bus); o.start(t); o.stop(t + 0.13); }
  function hiss(t, dur, v, f, type) { const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = noiseBuf; fl.type = type; fl.frequency.value = f; fl.Q.value = 0.9;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(fl).connect(g).connect(bus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02); }

  // everything in bar b of the loop, starting at time t
  function bar(b, t) {
    const [root, tones] = CH[BARS[b]], mel = MEL[b];
    for (let i = 0; i < 8; i++) {
      if (/^\d+$/.test(mel[i])) { let n = 1; while (mel[i + n] === '-') n++; const len = n * E - 0.02; note(+mel[i], t + i * E, len, waves.p25, 0.13); note(+mel[i], t + (i + 0.75) * E, Math.min(len, E * 1.5), waves.p125, 0.04); }
      note(root + 12 + (i % 2 ? 12 : 0), t + i * E, E * 0.9, 'triangle', 0.13);
      if (b >= 1) {
        const tt = t + i * E;
        if (i === 0 || i === 4 || (b % 2 && i === 7)) kick(tt, 0.26);
        if (i === 2 || i === 6) hiss(tt, 0.12, 0.28, 1900, 'bandpass');
        hiss(tt, 0.025, i % 2 ? 0.05 : 0.08, 8000, 'highpass');
      }
    }
    for (let i = 0; i < 16; i++) note(tones[i % 3] + 12 + (i % 6 > 2 ? 12 : 0), t + i * E / 2, E / 2 - 0.01, waves.p50, b >= 10 ? 0.026 : b < 2 ? 0.03 : 0.018);
  }

  function tick() {
    if (!ac) return;
    const q = window.quest, now = ac.currentTime;
    // the level: off when muted or hidden, lower while someone talks
    const target = (q && q.isMuted && q.isMuted()) || document.hidden ? 0 : q && q.S && q.S.line ? DUCK : VOL;
    bus.gain.setTargetAtTime(target, now, 0.12);
    while (next < now + AHEAD) {
      const k = Math.round((next - t0) / BAR);
      if (next > now - 0.05) bar(((k % 16) + 16) % 16, next);   // a bar whose start has passed (a throttled tab) is skipped
      next += BAR;
    }
  }

  window.questMusic = {
    // start the loop at `when` (an AudioContext time); a second call does nothing
    play(when) {
      if (timer || !setup()) return;
      t0 = next = Math.max(when || 0, ac.currentTime + 0.05);
      bus.gain.setValueAtTime(VOL, t0);
      timer = setInterval(tick, 50); tick();
    },
    stop() { if (timer) clearInterval(timer); timer = null; if (bus && ac) bus.gain.setTargetAtTime(0, ac.currentTime, 0.1); },
    playing: () => !!timer,
  };
})();
