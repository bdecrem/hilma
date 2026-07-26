/**
 * UNDERTOW — submerged circular roller in F minor
 * 125 BPM (judge fix, down from 128) · swing 15 · 112 bars = 7 scenes x 16 bars
 *
 * Two percussion necklaces (12-cycle wood, 5-cycle tick) against the 16 grid,
 * a drone-not-acid 303 pedal on a rotated E(5,16) — onsets {1,4,8,11,14} —
 * and one climax: a single bar of kick absence at bar 80.
 *
 * Run: cd /Users/bartdecrem/Documents/coding2025/vibeceo/jambot && node <this file>
 *
 * Platform notes (verified against jambot source, worked around here):
 * - jt90 offline engine wraps patterns every 16 steps -> all 2-bar figures
 *   (rimshot R1, kick ghost K2) live on jb01, whose engine wraps per track length.
 * - save_pattern snapshots jt90/jt30 params as EMPTY (proxy JSON bug) -> after
 *   each save we patch the snapshot with real engine-unit params from the node.
 * - voice-level FX force renderVoices(), which drops automation -> jt90/jb01
 *   arcs are stepped per 4-bar section via param snapshots; jt30 (instrument-
 *   level FX only) keeps true per-step automation for its long filter arcs.
 * - set_swing mis-scales (clamps 15 -> 1.0 on the clock); session.swing = 0.15
 *   is the correct producer-unit path.
 * - FX params are static for the whole render: the bar-80 delay-feedback bloom
 *   is emulated with a denser/louder echo-fodder pattern in that bar.
 */

import { mkdirSync } from 'fs';
import { createHeadless } from '/Users/bartdecrem/Documents/coding2025/vibeceo/jambot/headless.js';

const OUT = '/private/tmp/claude-501/-Users-bartdecrem-Documents-coding2025-hilma/9a88ecd8-cb32-4f5b-a35e-ecd209a3961e/scratchpad/renders/undertow';
mkdirSync(OUT.slice(0, OUT.lastIndexOf('/')), { recursive: true });

const BPM = 125;
const jb = await createHeadless({ bpm: BPM });
jb.session.swing = 0.15; // 15% swing, producer units (0-1 on the clock)

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const V = (x) => Math.max(0, Math.min(1, x / 127)); // 0-127 velocity -> 0-1
const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

/** Build a drum track of `len` steps from [step0idx, vel0to127, accent?] hits. */
function track(len, hits) {
  const t = Array(len).fill(null).map(() => ({ velocity: 0, accent: false }));
  for (const [s, v, a] of hits) t[s] = { velocity: V(v), accent: !!a };
  return t;
}

// ---------------------------------------------------------------------------
// JT90 patterns — 16-step only (engine wraps at 16)
// ---------------------------------------------------------------------------
// K1: four-on-floor, accented (Total-Accent style ~104)
const K1 = track(16, [[0, 104, true], [4, 104, true], [8, 104, true], [12, 104, true]]);
// H0: flat 16th hats, uniform low
const H0 = track(16, Array.from({ length: 16 }, (_, i) => [i, 40]));
// H2: 16th hats with Detroit accents on the "a" 16ths (1-indexed 4,8,12,16 ->
// 0-idx 3,7,11,15 — even 16ths, so they also carry the swing offset: the roll)
const H2 = track(16, Array.from({ length: 16 }, (_, i) =>
  [3, 7, 11, 15].includes(i) ? [i, 60, true] : [i, 42]));
// O1: open hat on the offbeat 8ths
const O1 = track(16, [[2, 70], [6, 70], [10, 70], [14, 70]]);

// ---------------------------------------------------------------------------
// JB01 figures — 64-step (4-bar) master tracks, sliced for the 3+1 bar split
// ---------------------------------------------------------------------------
// T1 — tick, 5-step cycle rotated to start on 0-idx 2. Judge fix applied:
// on-quarter hits (0-idx 12, 32, 52) dropped to the low rung (38) so the
// necklace audibly avoids the kick even though the grid can't.
const T1_HITS = [[2, 44], [7, 36], [12, 38], [17, 40], [22, 44], [27, 36], [32, 38],
  [37, 40], [42, 44], [47, 36], [52, 38], [57, 40], [62, 46]];

// W1 — wood, E(5,12) tiled through 64 steps, 6th cycle truncated, step 64
// muted (3-step breath at the loop seam). Low velocity on kick quarters,
// accents off the kick. (0-idx step : 0-127 vel)
const W1_HITS = [[0, 52], [3, 76], [5, 62], [8, 48], [10, 68], [12, 50], [15, 78],
  [17, 60], [20, 46], [22, 70], [24, 54], [27, 74], [29, 64], [32, 50], [34, 66],
  [36, 52], [39, 80], [41, 58], [44, 46], [46, 72], [48, 50], [51, 76], [53, 62],
  [56, 48], [58, 64], [60, 56]];

// W2 — W1 rotated right 6 steps, +6 velocity; judge fix: re-apply the
// low-on-quarter rule to the ROTATED onsets (any hit landing on a kick
// quarter is re-voiced down 20) so the bloom never accents wood on the kick.
const W2_HITS = W1_HITS.map(([s, v]) => {
  const r = (s + 6) % 64;
  let vel = v + 6;
  if (r % 4 === 0) vel -= 20;
  return [r, vel];
});

// R1 — rimshot marker on the 2-bar loop: 1-idx step 8 (bar 1) + step 30
// (bar 2 turnaround). Tiled to 64. Lives on jb01.snare (rim-voiced).
const R1_HITS = [[7, 95], [29, 95], [39, 95], [61, 95]];

// D1 — drip: single watery blip, bar 2 only (1-idx 27 -> 0-idx 26). Tiled.
const D1_HITS = [[26, 48], [58, 48]];

// K2 ghost — the pendulum: one unaccented ~45-vel kick ghost on the 16th
// before beat 4 of bar 2 (0-idx 27). Tiled. Lives on jb01.kick, tuned like
// the 909 kick.
const GHOST_HITS = [[27, 45], [59, 45]];

/** Build the jb01 track set for a section. offset/len slice the 64-step phrase
 *  (sections 20/21 split the 4-bar phrase 48+16 without losing phase). */
function jb01Tracks({ offset, len, tick, wood, drip, ghost, bloom }) {
  const inWin = ([s]) => s >= offset && s < offset + len;
  const shift = ([s, v, a]) => [s - offset, v, a];
  const out = {};
  out.snare = track(len, R1_HITS.filter(inWin).map(shift));
  if (tick) {
    let hits = T1_HITS.filter(inWin).map(shift);
    if (bloom) hits = hits.map(([s, v]) => [s, v + 15]); // bar-80 echo bloom
    out.ch = track(len, hits);
  }
  if (wood) {
    const src = wood === 'W2' ? W2_HITS : W1_HITS;
    out.lowtom = track(len, src.filter(inWin).map(shift));
  }
  if (drip || bloom) {
    let hits = D1_HITS.filter(inWin).map(shift);
    if (bloom) hits = [...hits, [2, 56]]; // extra drip feeding the delays
    out.hitom = track(len, hits);
  }
  if (ghost) out.kick = track(len, GHOST_HITS.filter(inWin).map(shift));
  return out;
}

// ---------------------------------------------------------------------------
// JT30 — A1 drone on rotated E(5,16) {1,4,8,11,14} (judge fix: off kiln's
// clave). F1 pedal, accent on onset 3, slide on onset 4 -> 5. Color tone
// alternates Ab1 (bar 1) / Eb2 (bar 2): harmony at half the loop rate.
// ---------------------------------------------------------------------------
function a1Bar(kind) {
  const R = { note: 'F1', gate: false, accent: false, slide: false };
  const bar = Array(16).fill(null).map(() => ({ ...R }));
  const on = (i, note, opt = {}) => { bar[i] = { note, gate: true, accent: !!opt.a, slide: !!opt.s }; };
  const color = kind === 1 ? 'G#1' : 'D#2'; // Ab1 / Eb2
  on(0, 'F1');
  on(3, 'F1');
  on(7, 'F1', { a: true });          // accent, off the kick quarters
  on(10, color);                     // slide source
  on(11, color, { s: true });        // tie
  on(12, color, { s: true });        // tie
  on(13, 'F1', { s: true });         // slide lands back on the pedal
  return bar;
}

/** Tile A1 across a section. Global bar parity keeps the Ab/Eb alternation. */
function jt30Pattern(startBar, bars) {
  const steps = [];
  for (let b = 0; b < bars; b++) steps.push(...a1Bar((startBar + b) % 2 === 1 ? 1 : 2));
  return steps;
}

// --- global per-bar automation arcs (1-indexed bars, linear per spec) ---
const arcCutoff = (b) => b <= 48 ? 240
  : b <= 80 ? lerp(240, 900, (b - 49) / 31)
  : b <= 108 ? lerp(900, 260, (b - 81) / 27) : 260;
const arcRes = (b) => b <= 64 ? 46
  : b <= 80 ? lerp(46, 52, (b - 65) / 15)
  : b <= 96 ? lerp(52, 46, (b - 81) / 15) : 46;
const arcAccent = (b) => b <= 64 ? 55 : b <= 80 ? lerp(55, 70, (b - 65) / 15) : 55;
const arcEnvMod = (b) => b <= 80 ? 28 : b <= 96 ? lerp(28, 18, (b - 81) / 15) : 18;
// spec arc is -12 -> -7 -> -14; shifted +5 dB because the jt30 engine's dB
// scale sits ~11 dB under the jt90 kick's at equal producer values (measured)
const arcLevel = (b) => b <= 56 ? lerp(-7, -2, (b - 49) / 7)
  : b <= 104 ? -2 : lerp(-2, -9, (b - 105) / 7);

/** Per-16th automation array for a section, interpolated between bar values. */
function arcSteps(arc, startBar, bars) {
  const vals = [];
  for (let k = 0; k < bars * 16; k++) {
    const b = startBar + Math.floor(k / 16);
    vals.push(lerp(arc(b), arc(b + 1), (k % 16) / 16));
  }
  return vals;
}

// --- stepped (per-section) arcs for the jt90/jb01 voices ---
const chLevel = (b) => b <= 16 ? lerp(-20, -14, (b - 1) / 15) // audible DJ-intro fade
  : b < 105 ? -14 : lerp(-14, -18, (b - 105) / 7);
const ohLevel = (b) => b <= 32 ? lerp(-13, -11, (b - 17) / 15) : b <= 92 ? -11 : -14;
const ohDecay = (b) => b < 49 ? 38
  : b <= 80 ? lerp(38, 46, (b - 49) / 31)
  : b <= 96 ? lerp(46, 38, (b - 81) / 15) : 38;
const woodLevel = (b) => b <= 44 ? lerp(-14, -9, (b - 33) / 11)
  : b <= 84 ? -9 : lerp(-9, -16, (b - 85) / 7);
const tickLevel = (b) => b <= 24 ? lerp(-16, -13, (b - 17) / 7)
  : b <= 100 ? -13 : -16;

// ---------------------------------------------------------------------------
// EFFECTS — static for the whole render. Judge fix: the 5/16 polymetric
// delay (600 ms at 125) is the PRIMARY glue everywhere; the dotted-8th
// (360 ms) is demoted to a secondary send. Reverb: dark hall, HP 200 / LP low.
// ---------------------------------------------------------------------------
async function setupEffects() {
  const fx = (i) => jb.tool('add_effect', i);
  // 909 kit
  await fx({ target: 'jt90.kick', effect: 'reverb', decay: 4.0, damping: 70, predelay: 20, mix: 5, lowcut: 200, highcut: 2500, size: 70 }); // filtered low-mix kick verb
  await fx({ target: 'jt90.ch', effect: 'delay', time: 600, feedback: 35, mix: 6, lowcut: 300, highcut: 2500, saturation: 15 });
  await fx({ target: 'jt90.oh', effect: 'delay', time: 600, feedback: 35, mix: 12, lowcut: 250, highcut: 2500, saturation: 15 }); // the "drag" on the offbeat oh
  await fx({ target: 'jt90.oh', effect: 'reverb', decay: 4.0, damping: 60, predelay: 20, mix: 8, lowcut: 200, highcut: 6000, size: 70 });
  // jb01 lanes
  await fx({ target: 'jb01.snare', effect: 'reverb', decay: 4.5, damping: 55, predelay: 20, mix: 28, lowcut: 200, highcut: 6000, size: 85 }); // rim = reverb grid marker
  await fx({ target: 'jb01.lowtom', effect: 'delay', time: 600, feedback: 38, mix: 14, lowcut: 250, highcut: 2500, saturation: 20 });
  await fx({ target: 'jb01.lowtom', effect: 'reverb', decay: 4.0, damping: 65, predelay: 20, mix: 10, lowcut: 200, highcut: 5000, size: 70 });
  await fx({ target: 'jb01.ch', effect: 'delay', time: 600, feedback: 38, mix: 16, lowcut: 300, highcut: 3200, saturation: 15 }); // 5-figure x 5/16 delay = 2nd-order off-grid
  await fx({ target: 'jb01.ch', effect: 'delay', time: 360, feedback: 45, mix: 8, lowcut: 300, highcut: 3200, saturation: 15 });
  await fx({ target: 'jb01.hitom', effect: 'delay', time: 600, feedback: 40, mix: 45, lowcut: 250, highcut: 2500, saturation: 20 }); // drip exists mostly as echoes
  await fx({ target: 'jb01.hitom', effect: 'delay', time: 360, feedback: 45, mix: 25, lowcut: 250, highcut: 3200, saturation: 20 });
  // 303 drone
  await fx({ target: 'jt30', effect: 'delay', time: 600, feedback: 35, mix: 15, lowcut: 250, highcut: 2500, saturation: 15 });
  await fx({ target: 'jt30', effect: 'delay', time: 360, feedback: 45, mix: 8, lowcut: 250, highcut: 3200, saturation: 15 });
  await fx({ target: 'jt30', effect: 'reverb', decay: 4.0, damping: 60, predelay: 20, mix: 8, lowcut: 200, highcut: 5000, size: 70 });
}

// ---------------------------------------------------------------------------
// SECTION PLAN — 29 sections, 4-bar grain (scene 5 tail split 3+1 for the
// bar-80 kick mute). Sums to 112 bars. Scene map:
//   S1 surface tension 1-16 | S2 pull 17-32 | S3 first eddy 33-48
//   S4 rotation 49-64 | S5 bloom 65-80 (bar 80 = kick mute)
//   S6 recede 81-96 | S7 dissolve 97-112
// ---------------------------------------------------------------------------
const SECTIONS = [];
{
  let bar = 1;
  const spans = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 1, 4, 4, 4, 4, 4, 4, 4, 4];
  for (const bars of spans) { SECTIONS.push({ start: bar, bars }); bar += bars; }
  if (bar - 1 !== 112) throw new Error(`section plan sums to ${bar - 1}, expected 112`);
}

function sectionSpec({ start, bars }) {
  return {
    start, bars,
    // jt90
    kick: start !== 80,                                       // the only subtraction event
    ch: start < 17 || start >= 105 ? 'H0' : 'H2',             // accents arrive S2, leave at 105
    oh: start >= 17 && start <= 96,
    // jb01
    rim: true,
    tick: start >= 17 && start <= 104,
    wood: start >= 33 && start <= 92 ? (start >= 65 && start <= 80 ? 'W2' : 'W1') : null,
    drip: start >= 57 && start <= 79,
    ghost: start >= 33 && start <= 79,                        // K2 era; gone in S6 (K1, ghosts gone)
    bloom: start === 80,
    // jt30
    jt30: start >= 49,
    // slice of the 64-step jb01 phrase
    offset: start === 80 ? 48 : 0,
    len: bars * 16,
  };
}

// ---------------------------------------------------------------------------
// BUILD
// ---------------------------------------------------------------------------
await setupEffects();

// headroom: first render peaked at 54% — raise all node output gains +4 dB
jb.session._nodes.jt90.setLevel(4);
jb.session._nodes.jb01.setLevel(4);
jb.session._nodes.jt30.setLevel(4);

// constant jt90 voice params (kick is never automated — arc 14).
// tune -4.1 st measured to put the 909 kick fundamental at ~43.7 Hz (F).
await jb.tool('tweak_jt90', { voice: 'kick', level: -4, tune: -4.1, decay: 52 });
await jb.tool('tweak_jt90', { voice: 'ch', tune: -2.5, decay: 18, level: -16 });
await jb.tool('tweak_jt90', { voice: 'oh', tune: -3.0, decay: 38, level: -13 });

// constant jb01 voice character
await jb.tool('tweak_jb01', { voice: 'lowtom', tune: 9.7, decay: 45, level: -14 });  // wood ~175 Hz (F3)
await jb.tool('tweak_jb01', { voice: 'ch', tune: 3, decay: 10, tone: 70, level: -16 }); // tick: short noise sliver
await jb.tool('tweak_jb01', { voice: 'hitom', tune: -3, decay: 25, level: -14 });    // drip: dark blip
await jb.tool('tweak_jb01', { voice: 'kick', tune: -4.1, decay: 45, sweep: 30, level: -4 }); // K2 ghost, 909-matched
await jb.tool('tweak_jb01', { voice: 'snare', tune: 2, decay: 20, tone: 60, snappy: 20, level: -16 }); // rim

// constant jt30 character (drone-not-acid)
await jb.tool('tweak_jt30', {
  waveform: 'sawtooth', filterCutoff: 240, filterResonance: 46,
  filterEnvAmount: 28, filterDecay: 62, accentLevel: 55, drive: 22,
});

const arrangement = [];
for (let i = 0; i < SECTIONS.length; i++) {
  const s = sectionSpec(SECTIONS[i]);
  const mid = s.start + s.bars / 2 - 0.5; // evaluate stepped arcs at section midpoint
  const entry = { bars: s.bars };

  // --- jt90 ---
  await jb.tool('tweak_jt90', { voice: 'ch', level: chLevel(mid) });
  await jb.tool('tweak_jt90', { voice: 'oh', level: ohLevel(mid), decay: ohDecay(mid) });
  const jtIn = { clear: true };
  if (s.kick) jtIn.kick = K1;
  jtIn.ch = s.ch === 'H0' ? H0 : H2;
  if (s.oh) jtIn.oh = O1;
  await jb.tool('add_jt90', jtIn);
  await jb.tool('save_pattern', { instrument: 'jt90', name: `t${i}` });
  // save_pattern snapshots jt90 params as {} — patch with real engine values
  jb.session.patterns.jt90[`t${i}`].params =
    JSON.parse(JSON.stringify(jb.session._nodes.jt90.getAllVoiceParams()));
  entry.jt90 = `t${i}`;

  // --- jb01 ---
  await jb.tool('tweak_jb01', { voice: 'lowtom', level: s.wood ? woodLevel(mid) : -14 });
  await jb.tool('tweak_jb01', { voice: 'ch', level: s.tick ? tickLevel(mid) : -16 });
  const tracks = jb01Tracks(s);
  await jb.tool('add_jb01', { clear: true, bars: s.bars, ...tracks });
  await jb.tool('save_pattern', { instrument: 'jb01', name: `b${i}` });
  entry.jb01 = `b${i}`;

  // --- jt30 ---
  if (s.jt30) {
    jb.session.jt30Pattern = jt30Pattern(s.start, s.bars); // bypass add_jt30's 16-step slice
    await jb.tool('automate', { path: 'jt30.bass.cutoff', values: arcSteps(arcCutoff, s.start, s.bars) });
    await jb.tool('automate', { path: 'jt30.bass.resonance', values: arcSteps(arcRes, s.start, s.bars) });
    await jb.tool('automate', { path: 'jt30.bass.accent', values: arcSteps(arcAccent, s.start, s.bars) });
    await jb.tool('automate', { path: 'jt30.bass.envMod', values: arcSteps(arcEnvMod, s.start, s.bars) });
    await jb.tool('automate', { path: 'jt30.bass.level', values: arcSteps(arcLevel, s.start, s.bars) });
    await jb.tool('save_pattern', { instrument: 'jt30', name: `a${i}` });
    // patch the empty params snapshot with real engine values
    jb.session.patterns.jt30[`a${i}`].params =
      JSON.parse(JSON.stringify(jb.session._nodes.jt30.getEngineParams()));
    await jb.tool('clear_automation', { path: 'jt30' });
    entry.jt30 = `a${i}`;
  }

  arrangement.push(entry);
}

await jb.tool('set_arrangement', { sections: arrangement });
console.log(await jb.tool('show_arrangement', {}));

const msg = await jb.render(OUT, 112);
console.log(msg);
process.exit(0);
