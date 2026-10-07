// ACT III — OVERCLOCK.
// A machine pushed past its rating. A clock mechanism and a quartz crystal
// keep time (kick and drone, then hats); the 303 brings the silicon, and the
// clock speed climbs with the filter: heat sinks, the fan at full speed. The
// breakdown is the machine throttling itself (the fan stalls, the clock
// drops — the sweep pulls back). Then the long climb: the coil glows, a moth
// on a bulb, molten metal; the readouts run to their limits, the image
// shimmers with heat, and at the peak (bar 97) it trips: blown white, the
// clock ring flies apart. Smoke, ash, and one ember going out with the drone.
//
// The ring is the clock: sixty ticks, a hand that steps on every kick and
// steps further per kick as the clock speed rises.
const HALT_BAR = 104;

defineAct({
  id: 'act-iii', number: 'III', title: 'OVERCLOCK',
  stills: { gears: '01-gears', crystal: '02-crystal', die: '03-die', fan: '04-fan', heatsink: '05-heatsink', coil: '06-coil', moth: '07-moth', foundry: '08-foundry', thermal: '09-thermal', smoke: '10-smoke', ash: '11-ash', ember: '12-ember' },
  acid: { onsets: [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 14, 15], accents: [0, 3, 6, 8, 11, 14, 15] },
  minFloor: 0.3,
  gain: { ember: 1, ash: 1.3 }, // keep the dark dark where the dark is the picture // pictures stay readable between kicks
  fadeIn: 0.8, fadeOut: [234, 241],

  shots: [
    { at: 0, still: 'gears', light: 'kick', floor: 0.04, zoom: [1.0, 1.12], ramp: [0.45, 1], ring: { alpha: 0.5 } },
    { at: 8, still: 'crystal', mode: 'raster', light: 'kick', floor: 0.1, zoom: [1.0, 1.16], flash: { list: ['gears'], prob: 0.15 }, ring: { alpha: 0.55 } },
    { at: 16, still: 'die', light: 'kick', floor: 0.12, zoom: [1.0, 1.5], pan: [0, 0.2], flash: { list: ['crystal', 'gears'], prob: 0.15, frames: 1, mode: 'threshold' }, glitch: 0.15, ring: { alpha: 0.5 } },
    { at: 24, montage: { list: ['die', 'heatsink'], every: '2bar' }, light: 'kick', floor: 0.15, zoom: [1.05, 1.2], glitch: 0.2, ring: { alpha: 0.5 } },
    { at: 32, still: 'fan', light: 'kick', floor: 0.15, zoom: [1.0, 1.16], pan: [0.3, 0.3], flash: { list: ['heatsink', 'die'], prob: 0.25, on: 'accent' }, glitch: 0.3, ring: { alpha: 0.55 } },
    { at: 40, montage: { list: ['fan', 'die', 'heatsink', 'fan'], every: 'beat' }, mode: 'dither', light: 'kick', floor: 0.15, glitch: 0.35, ring: { alpha: 0.6 } },
    // Breakdown: the machine throttles. The fan stalls; the clock drops.
    { at: 48, still: 'thermal', light: 'steady', level: 0.8, zoom: [1.0, 1.22], glitch: 0.05, ring: { alpha: 0.35, frozen: true } },
    { at: 52, still: 'fan', light: 'steady', level: 0.6, zoom: [1.25, 1.12], pan: [0.3, 0.3], contrast: 1.4, ring: { alpha: 0.3, frozen: true } },
    // The climb.
    { at: 56, still: 'coil', light: 'kick', floor: 0.12, zoom: [1.0, 1.28], flash: { list: ['moth'], prob: 0.2 }, glitch: 0.35, ring: { alpha: 0.5 } },
    { at: 64, montage: { list: ['coil', 'moth'], every: 'bar' }, light: 'kick', floor: 0.15, flash: { list: ['foundry'], prob: 0.25, frames: 1 }, glitch: 0.45, ring: { alpha: 0.55 } },
    { at: 72, still: 'moth', mode: 'raster', light: 'kick', floor: 0.15, zoom: [1.0, 1.4], flash: { list: ['coil', 'die', 'foundry'], prob: 0.3 }, glitch: 0.5, ring: { alpha: 0.6 } },
    { at: 80, still: 'foundry', light: 'kick', floor: 0.18, zoom: [1.0, 1.22], flash: { list: ['coil', 'moth'], prob: 0.35, on: 'accent' }, glitch: 0.6, ring: { alpha: 0.65 } },
    { at: 88, montage: { list: ['foundry', 'coil', 'die', 'moth', 'fan', 'thermal'], every: 'beat' }, modes: { list: ['photo', 'threshold'], every: 'beat' }, light: 'kick', floor: 0.25, level: 1.2, glitch: 0.75, ring: { alpha: 0.75 } },
    // The trip: blown white, the ring flies apart.
    { at: 96, montage: { list: ['coil', 'foundry', 'coil', 'thermal'], every: 'beat' }, modes: { list: ['threshold', 'photo', 'edges', 'threshold'], every: 'beat' }, light: 'kick', floor: 0.55, level: 1.6, glitch: 0.95, ring: { shatter: true } },
    { at: 104, still: 'smoke', light: 'kick', floor: 0.15, level: 0.9, zoom: [1.0, 1.25], ramp: [1, 0.8], glitch: 0.25 },
    { at: 112, still: 'ash', light: 'kick', floor: 0.12, level: 0.8, zoom: [1.2, 1.06], glitch: 0.1 },
    { at: 116, still: 'ash', light: 'kick', floor: 0.08, level: 0.6, zoom: [1.06, 1.0] },
    { at: 120, still: 'ember', light: 'kick', floor: 0.55, level: 1.3, zoom: [1.3, 1.6] },
    { at: 124, still: 'ember', light: 'steady', level: 1.1, zoom: [1.6, 1.8], ramp: [1, 0.2] },
  ],

  text: [
    { from: 0.5, to: 7, str: 'OVERCLOCK', x: 0.045, y: 0.075, size: 18 },
    { from: 1.5, to: 7, str: 'ACT III — OVERCLOCK', x: 0.045, y: 0.11, size: 18, alpha: 0.75 },
    { from: 48, to: 56, str: 'THROTTLE', x: 0.5, y: 0.5, size: 26, align: 'center', type: 'static', blink: 'beat' },
    { from: 88, to: 96, str: 'THERMAL MARGIN 04%', x: 0.5, y: 0.86, size: 22, align: 'center', type: 'static', blink: 'beat' },
    { from: 96, to: 98, str: 'THERMAL TRIP', x: 0.5, y: 0.5, size: 210, font: 'big', align: 'center', type: 'slam' },
    { from: 112, to: 116, str: 'HALT', x: 0.5, y: 0.5, size: 26, align: 'center', type: 'static' },
    { from: 121, to: 127.5, str: 'OVERCLOCK (ACT III) — OVERCLOCK', x: 0.045, y: 0.9, size: 18, alpha: 0.8 },
  ],

  // The clock ring: sixty ticks and a hand; more ticks per kick as the clock rises.
  under(g, f, shot, H) {
    const rg = shot.ring; if (!rg) return;
    const { w, h } = H;
    const cx = w * 0.5, cy = h * 0.5, R = h * 0.36;
    // Cumulative ticks: each kick advances the hand 1 + 7·p ticks (p at that kick).
    let ticks = 0;
    for (const k of H.KICKS) { if (k.t > f.t) break; ticks += 1 + Math.floor(7 * H.pAt(k.t / H.BAR)); }
    const hand = (ticks % 60) / 60 * Math.PI * 2 - Math.PI / 2;
    g.save();
    g.globalCompositeOperation = 'lighter';
    if (rg.shatter) { // ticks fly outward from the moment of the trip
      const u = (f.t - 96 * H.BAR), r = H.rng(5, 6);
      g.strokeStyle = `rgba(255,255,255,${Math.max(0, 0.9 - u * 0.06)})`; g.lineWidth = 2;
      for (let i = 0; i < 60; i++) {
        const a = i / 60 * Math.PI * 2, v = 60 + r() * 260, spin = (r() - 0.5) * 6;
        const rr = R + v * u, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr, len = i % 5 ? 10 : 22;
        g.save(); g.translate(x, y); g.rotate(a + spin * u); g.beginPath(); g.moveTo(-len / 2, 0); g.lineTo(len / 2, 0); g.stroke(); g.restore();
      }
      g.restore(); return;
    }
    const lit = (rg.alpha ?? 0.5) * (0.45 + 0.55 * (f.sec.kick ? f.kickEnv : 0.6));
    g.strokeStyle = `rgba(255,255,255,${lit})`;
    g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * Math.PI * 2, len = i % 5 ? 8 : 20;
      g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.lineTo(cx + Math.cos(a) * (R - len), cy + Math.sin(a) * (R - len));
    }
    g.stroke();
    g.lineWidth = 2.5; g.strokeStyle = `rgba(255,255,255,${Math.min(1, lit * 1.6)})`;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(hand) * (R - 26), cy + Math.sin(hand) * (R - 26)); g.stroke();
    g.restore();
  },

  // The machine's readouts, top left. They follow the sweep: p is the overclock.
  over(o, f, shot, H) {
    if (f.bar < 2 || f.bar >= 124) return;
    const p = f.p, halted = f.bar >= 112, tripped = f.bar >= HALT_BAR;
    const throttled = f.bar >= 48 && f.bar < 56;
    const clk = halted ? 0 : tripped ? 0.8 * p : 3.4 + 6.59 * Math.pow(p, 1.2);
    const temp = halted ? 38 + 30 * Math.max(0, 1 - (f.bar - 112) / 12) : 38 + 66 * Math.pow(p, 1.4);
    const vcore = halted ? 0 : 1.1 + 0.52 * p;
    const fan = throttled ? 'STALL' : halted ? '----' : `${Math.round(1200 + 4800 * p)} RPM`;
    const lines = [
      `CLK    ${clk.toFixed(2)} GHZ${throttled ? '  THROTTLE' : tripped && !halted ? '  SAFE MODE' : ''}`,
      `VCORE  ${vcore.toFixed(3)} V`,
      `TEMP   ${Math.round(temp)} °C`,
      `FAN    ${fan}`,
    ];
    lines.forEach((s, i) => H.text({ str: s, x: 0.045, y: 0.16 + i * 0.034, size: 16, alpha: f.bar >= 96 && f.bar < 104 ? (f.hatEnv > 0.3 ? 0.95 : 0.35) : 0.65 }));
  },

  glitch(f, shot) {
    const fx = {};
    if (f.sec.acid) fx.shimmer = Math.pow(f.p, 2) * (f.bar >= 96 && f.bar < 104 ? 16 : 10); // heat haze grows with the clock
    if (f.bar >= 96 && f.bar < 104 && f.kick && f.kick.i % 16 === 0) fx.flash = 0.9 * Math.exp(-(f.t - f.kick.t) / 0.07);
    return fx;
  },
});
