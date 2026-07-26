/**
 * "one percent" — 129 BPM, swing 54, 112 bars, key G (Hawtin-corner percussive minimal)
 *
 * Run:  cd /Users/bartdecrem/Documents/coding2025/vibeceo/jambot && node <this file>
 *
 * Implementation notes (engine realities discovered by probing, not spec changes):
 * - The jt90 engine wraps patterns at 16 steps, so the whole arrangement is built
 *   from 112 one-bar sections; every bar gets its own saved jt90/jb01/jt30 pattern
 *   with per-bar params and per-step (16-value) automation. Long arcs (cutoff creeps,
 *   sine tune rides, level fades) are computed per bar from global-bar phase, so
 *   they are continuous across the whole track.
 * - save_pattern snapshots empty params for jt90/jt30 (Proxy/JSON bug), so saves are
 *   constructed manually in the exact {pattern, params, automation} shape the
 *   arrangement renderer consumes. Params are engine units; automation is producer
 *   units (dB / semitones / 0-100 / Hz) which the nodes convert per step.
 * - Swing is set directly on the clock (0-1). Engine swing shifts the odd 16ths
 *   (1-indexed even 16ths); kick sits on 0-indexed 0/4/8/12 and stays rigid.
 * - The 303's dotted-8th delay is a SEND BUS (processed over the full track), so
 *   its tails ring across section boundaries and past the 303's exit at bar 92.
 * - Rim reverb bursts + the bar-112 dissolve live on a jb01 "burst click" voice
 *   (hitom, tuned to a dry knock) with a voice-level dark plate; jb01 section
 *   buffers are cut at the bar boundary, which implements the spec's
 *   "snapped to 0 on the next downbeat" for free.
 * - Dense full-16th CH (scenes 3-6) is deliberate — the Spastik-corner exception to
 *   the offbeat-hat convention, paid back by deletion in P-ACID (steps 2,10 removed)
 *   and P-PEAK (hats deleted entirely). Do not "correct" it to offbeats.
 * - Ride pitch-drop: engine tune automation is sampled at trigger time, so the
 *   spec's fallback is used: two pre-tuned hits (+200c at step 57, -200c at step 61).
 *
 * Judge fixes applied:
 * - BPM stays 129 (undertow takes its 125-126 fix; batch spread 125/129/132).
 * - Transposed A -> G: kick fundamental 49 Hz (G1 = 909 kick base 55 Hz - 200c),
 *   ACID-A now G-centered (G2 root, G3 octaves, Bb2/C3 color) with the second half
 *   varied: step-11 octave and step-13 low neighbor swapped.
 * - Bar 112: rim fires at step 8 only (the pattern-step-32 rim hit is gated);
 *   kick lane is empty in bars 109-112.
 * - 303 exit: fade ends at bar 92, pattern plays through 92, delay tails ring on.
 */
import { createHeadless } from '/Users/bartdecrem/Documents/coding2025/vibeceo/jambot/headless.js';

const OUT = '/private/tmp/claude-501/-Users-bartdecrem-Documents-coding2025-hilma/9a88ecd8-cb32-4f5b-a35e-ecd209a3961e/scratchpad/renders/one-percent';

const BPM = 129;
const jb = await createHeadless({ bpm: BPM });
const s = jb.session;

// Global swing 54 (clock stores 0-1; set_swing tool would clamp 54 -> 1.0, so set directly)
s.swing = 0.54;
s._nodes.jt90.setLevel(0);
s._nodes.jb01.setLevel(0);
s._nodes.jt30.setLevel(0);

// ---------- unit converters (mirror params/converters.js toEngine) ----------
const MAXLIN = Math.pow(10, 6 / 20); // +6 dB = engine 1.0
const dB = (v) => Math.min(1, Math.pow(10, Math.max(-60, v) / 20) / MAXLIN);
const st = (v) => v * 100;           // semitones -> engine cents
const k = (v) => v / 100;            // 0-100 knob -> engine 0-1

// Deterministic RNG for velocity humanization (reproducible renders)
let seed = 20260726;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const jitter = (v, amt) => Math.max(1, Math.min(127, v + Math.round((rnd() * 2 - 1) * amt)));

const lane16 = () => Array(16).fill(null).map(() => ({ velocity: 0, accent: false }));
function hits(lane, idxs, vel = 1, accent = false) {
  for (const i of idxs) lane[i] = { velocity: vel, accent };
  return lane;
}

const deep = (o) => JSON.parse(JSON.stringify(o));

// ---------- step sets (0-indexed within a bar) ----------
const KICK4 = [0, 4, 8, 12];
const OFFBEATS = [2, 6, 10, 14];
const ALL16 = Array.from({ length: 16 }, (_, i) => i);
const ACID_CH = ALL16.filter((i) => i !== 1 && i !== 9); // CH minus 1-idx steps 2,10 — pays for the 303
const CH_ACC = [3, 7, 11, 15];                            // Detroit 'a' accent scheme, constant all track
const PARA = [0, 2, 3, 5, 8, 10, 11, 13];                 // snare-A R-hand paradiddle bar
const PARA_ROLL = [0, 2, 3, 5, 8, 10, 12, 14];            // 4th bar: half paradiddle + 8th-note roll
const B_PLAIN_IDX = [1, 4, 6, 7, 9, 12, 14, 15];          // snare-B L-hand bar
const B_PLAIN_VEL = [95, 105, 90, 96, 94, 106, 90, 96];
const B_ROLL_HEAD_IDX = [1, 4, 6, 7];
const B_ROLL_HEAD_VEL = [95, 105, 90, 96];
const B_ROLL_TAIL_VEL = [60, 68, 76, 85, 95, 105, 116, 127]; // built-in 16th-roll velocity ramp
const GHOST_IDX = [1, 5, 9, 13];                          // even 16ths (1-indexed) — swung late vs rigid kick
const GHOST_VEL = [30, 28, 32, 29];
const BURST_BARS = new Set([4, 8, 23, 39, 55, 87]);       // one-bar rim reverb blooms

// ---------- ACID-A: G-centered, second half varied (11<->13 swap) ----------
// idx:      0     1     2     3     4     5     6     7      8     9    10    11    12    13    14    15
// note:     G2    G2    G3    G2    G2    F2    G2    Bb2    G2    G2   F2    G2    G3    G2    C3    G3
// accent:   x                       x                                          x
// slide into idx7 (spec step 7->8) and into idx15 (spec step 15->16)
const ACID_A = [
  { note: 'G2', gate: true, accent: true,  slide: false },
  { note: 'G2', gate: true, accent: false, slide: false },
  { note: 'G3', gate: true, accent: false, slide: false },
  { note: 'G2', gate: true, accent: false, slide: false },
  { note: 'G2', gate: true, accent: true,  slide: false },
  { note: 'F2', gate: true, accent: false, slide: false },
  { note: 'G2', gate: true, accent: false, slide: false },
  { note: 'Bb2', gate: true, accent: false, slide: true },
  { note: 'G2', gate: true, accent: false, slide: false },
  { note: 'G2', gate: true, accent: false, slide: false },
  { note: 'F2', gate: true, accent: false, slide: false },  // was octave — swapped
  { note: 'G2', gate: true, accent: true,  slide: false },
  { note: 'G3', gate: true, accent: false, slide: false },  // was low neighbor — swapped
  { note: 'G2', gate: true, accent: false, slide: false },
  { note: 'C3', gate: true, accent: false, slide: false },
  { note: 'G3', gate: true, accent: false, slide: true },
];

// ---------- per-scene parameter curves ----------
function kickParams(b) {
  // intro choked "HP'd" voicing -> full 49 Hz G1 at the bar-33 drop (909 kick base = 55 Hz)
  if (b <= 8) return { level: -8, tune: 5, decay: 18, attack: 35, sweep: 25 };
  if (b <= 32) return { level: -8, tune: 5, decay: 20, attack: 35, sweep: 25 }; // micro b9: decay 18->20
  const decay = b >= 105 ? 24 : b >= 97 ? 30 : 36; // micro b97: 36->30, b105: 30->24
  return { level: -3.5, tune: -2, decay, attack: 55, sweep: 50 };
}

function chLevel(b) {
  if (b >= 9 && b <= 16) return -18 + 4 * (b - 9) / 7;    // enter -18 -> -14
  if (b >= 17 && b <= 24) return -14 + 5 * (b - 17) / 7;  // -14 -> -9 (full 16ths arrive)
  if (b >= 25 && b <= 72) return -9;
  if (b >= 81 && b <= 100) return -12;                    // returns varied: offbeats only
  if (b >= 101 && b <= 104) return -12 - 28 * (b - 101) / 3; // unravel fade -12 -> -40
  return -60;
}

function snareALevel(b) {
  if (b >= 25 && b <= 32) return -13 + 5 * (b - 25) / 7;  // enter -13 -> -8
  if (b === 33) return -7.2;
  if (b >= 34 && b <= 96) return -6.5;
  if (b >= 97 && b <= 100) return [-6.5, -18, -29, -40][b - 97]; // unravel fade
  return -60;
}

function clapLevel(b) { // snare-B (the left hand) lives on the 909 clap — Spastik idiom
  if (b >= 25 && b <= 32) return -14 + 5.5 * (b - 25) / 7; // enter -14 -> -8.5
  if (b === 33) return -8;
  if (b >= 34 && b <= 48) return -7;
  if (b >= 73 && b <= 88) return -7;                       // returns at full after 24 bars away
  if (b >= 89 && b <= 92) return [-7, -13, -25, -40][b - 89]; // unravel fade (first out)
  return -60;
}

// snare-A tune ride: +-150c sine, 4-bar (64-step) period, phase-locked from bar 33.
// center +300c, micro at b41 -> +250c. Phrase-end pushes add +300c across 2 bars.
const PUSH_PAIRS = [39, 43, 79, 87]; // pairs (39-40), (43-44), (79-80), (87-88)
function snareTuneAt(b, i) {
  const g = (b - 33) * 16 + i;
  const center = b < 41 ? 3.0 : 2.5;
  let push = 0;
  for (const p of PUSH_PAIRS) {
    if (b === p || b === p + 1) push = 3.0 * ((b - p) * 16 + i) / 32;
  }
  return center + 1.5 * Math.sin(2 * Math.PI * g / 64) + push;
}
// snare-A decay wanders 25 -> 45 -> 25 per 8 bars (128-step cosine), from bar 33
const snareDecayAt = (b, i) => 35 - 10 * Math.cos(2 * Math.PI * ((b - 33) * 16 + i) / 128);

// 303 cutoff journey (Hz, per step for smooth intra-bar motion)
function acidCutoffAt(b, i) {
  if (b <= 64) return 240 + 180 * ((b - 49) * 16 + i) / 256;              // buried creep 240->420 (16 bars)
  // Reveal: spec says 420->1400 exp; the engine's filter envelope (envMod+accent) sits on
  // top of base cutoff and compresses the perceived sweep, so the top is extended to
  // 2200 Hz to land the intended brightness. Snaps shut at 71 regardless.
  if (b <= 70) return 420 * Math.pow(2200 / 420, ((b - 65) * 16 + i) / 96);
  if (b === 71) return 200;                                                // SNAP shut
  if (b <= 90) return 260;                                                 // re-buried for the peak
  if (b === 91) return 200 - 60 * i / 16;                                  // exit: filter closes...
  return 140 - 70 * i / 16;                                                // ...and chokes out at 92
}
const acidEnvModAt = (b, i) => (b >= 65 && b <= 70) ? 20 + 25 * ((b - 65) * 16 + i) / 96 : 20;
const ACID_DB = -8; // 303 base level (producer dB -> engine); buried by cutoff, not volume
function acidLevel(b) {
  // The spec's reveal smear comes from delay feedback 55->70%; the send's feedback is
  // fixed for the whole render, so the growing wash density is emulated with a +4 dB
  // level swell across bars 65-70, snapping back with the bar-71 shutdown.
  if (b >= 65 && b <= 70) return ACID_DB + 4 * (b - 65) / 5;
  if (b === 91) return ACID_DB - 8;
  if (b === 92) return ACID_DB - 18;
  return ACID_DB;
}

// ============================================================================
// Build one saved pattern set per bar (112 sections of 1 bar each)
// ============================================================================
const sections = [];

for (let b = 1; b <= 112; b++) {
  const even = b % 2 === 0;

  // ---------------- jt90 ----------------
  const p90 = {};
  for (const v of ['kick', 'snare', 'clap', 'rimshot', 'lowtom', 'midtom', 'hitom', 'ch', 'oh', 'crash', 'ride']) p90[v] = lane16();

  // KICK: 4-on-floor; bar 32 = the one-bar pre-drop mute; bar 72 = ghost-bar gate; gone from bar 109
  if (b !== 32 && b !== 72 && b <= 108) hits(p90.kick, KICK4, 1);

  // RIM clock: odd bars step 8, even bars steps 8+16 — except the bar-112 endgame (step 8 only)
  if (b === 112) hits(p90.rimshot, [7], 1);
  else if (b !== 72) hits(p90.rimshot, even ? [7, 15] : [7], 1);
  else hits(p90.rimshot, [7], 1); // ghost bar 72: beat-4 rim gated for total silence on beat 4

  // CH
  let chSet = null;
  if (b >= 9 && b <= 16) chSet = OFFBEATS;
  else if (b >= 17 && b <= 48) chSet = ALL16;             // full 16ths — the Spastik exception
  else if (b >= 49 && b <= 71) chSet = ACID_CH;           // minus steps 2,10 — the 303's entry fee
  else if (b >= 81 && b <= 104) chSet = OFFBEATS;         // returns transformed
  if (chSet) {
    for (const i of chSet) {
      const acc = chSet === ALL16 || chSet === ACID_CH ? CH_ACC.includes(i) : false;
      p90.ch[i] = { velocity: acc ? 1.0 : 0.72, accent: acc };
    }
  }

  // OH exhale: last 16th of every hat-era bar (17-71); deleted at the peak
  if (b >= 17 && b <= 71) hits(p90.oh, [15], 1);

  // SNARE-A (right hand)
  const inRollScene = (b >= 25 && b <= 48) || (b >= 73 && b <= 88);
  const rollBar = inRollScene && ((b >= 25 && b <= 48) ? (b - 25) % 4 === 3 : (b - 73) % 4 === 3);
  let aSet = null;
  if (inRollScene) aSet = rollBar ? PARA_ROLL : PARA;
  else if (b >= 49 && b <= 71) aSet = PARA;               // skeleton only under the acid
  else if (b >= 89 && b <= 100) aSet = PARA;              // plain — the rolls are over
  if (aSet && b !== 72) {
    for (const i of aSet) {
      const acc = i === 0 || i === 8;
      p90.snare[i] = { velocity: acc ? 1.0 : 0.8, accent: acc };
    }
  }

  // SNARE-B / clap (left hand): roll scenes + unravel exit
  const clapOn = (b >= 25 && b <= 48) || (b >= 73 && b <= 92);
  if (clapOn) {
    const cRoll = ((b >= 25 && b <= 48) && (b - 25) % 4 === 3) || ((b >= 73 && b <= 88) && (b - 73) % 4 === 3);
    if (cRoll) {
      B_ROLL_HEAD_IDX.forEach((i, n) => { p90.clap[i] = { velocity: jitter(B_ROLL_HEAD_VEL[n], 8) / 127, accent: false }; });
      for (let n = 0; n < 8; n++) p90.clap[8 + n] = { velocity: jitter(B_ROLL_TAIL_VEL[n], 8) / 127, accent: false };
    } else {
      B_PLAIN_IDX.forEach((i, n) => { p90.clap[i] = { velocity: jitter(B_PLAIN_VEL[n], 8) / 127, accent: false }; });
    }
  }

  // RIDE: the track's single gesture — two pre-tuned hits, +200c then -200c (bar 48, beat 3)
  if (b === 48) { hits(p90.ride, [8], 1); hits(p90.ride, [12], 0.9); }

  const kp = kickParams(b);
  const params90 = {
    kick:    { level: dB(kp.level), tune: st(kp.tune), decay: k(kp.decay), attack: k(kp.attack), sweep: k(kp.sweep) },
    snare:   { level: dB(snareALevel(b)), tune: st(3), decay: k(30), tone: k(55), snappy: k(65) },
    clap:    { level: dB(clapLevel(b)), decay: k(40), tone: k(30) },
    rimshot: { level: dB(b >= 57 ? -10.5 : -11), tune: st(0), decay: k(20) },
    ch:      { level: dB(chLevel(b)), tune: st(1.5), decay: k(12), tone: k(100) },
    oh:      { level: dB(-14), tune: st(0), decay: k(35), tone: k(85) },
    ride:    { level: dB(-9), tune: st(2), decay: k(55) }, // -13 dB spec was masked by full-16th CH
  };

  const auto90 = {};
  if (b >= 33 && b <= 96) {
    auto90['snare.tune'] = ALL16.map((i) => snareTuneAt(b, i));
    auto90['snare.decay'] = ALL16.map((i) => snareDecayAt(b, i));
  }
  if (b === 48) auto90['ride.tune'] = ALL16.map((i) => (i >= 12 ? -2 : 2));

  const n90 = `d${b}`;
  s.patterns.jt90[n90] = { pattern: p90, params: deep(params90), automation: Object.keys(auto90).length ? auto90 : undefined };

  // ---------------- jb01: ghost clicks + burst clicks ----------------
  const p01 = {};
  for (const v of ['kick', 'snare', 'clap', 'ch', 'oh', 'lowtom', 'hitom', 'cymbal']) p01[v] = lane16();

  if (b >= 9) {
    let gIdx = GHOST_IDX;
    if (b === 72) gIdx = [1, 5, 9];      // ghost bar: steps 2,6,10 only, gated from step 13
    if (b === 112) gIdx = [1, 5];        // endgame: jb01 gated after step 8
    const fade = b >= 105 ? 1 - 0.4 * (b - 105) / 7 : 1; // outro ghosts 30 -> 18
    gIdx.forEach((i, n) => { p01.ch[i] = { velocity: jitter(Math.round(GHOST_VEL[n] * fade), 4) / 127, accent: false }; });
  }
  if (BURST_BARS.has(b)) hits(p01.hitom, [7], 0.9);  // rim bloom, rides the plate for one bar
  if (b === 112) hits(p01.hitom, [7], 1.0);          // the final dry click dissolving into the tail

  const params01 = {
    ch:    { level: dB(-15), tune: st(2), decay: k(15), tone: k(60) },
    hitom: { level: dB(-12), tune: st(8), decay: k(12) },
  };
  const n01 = `g${b}`;
  s.patterns.jb01[n01] = { pattern: p01, params: deep(params01) };

  // ---------------- jt30: buried acid, bars 49-71 + 73-92 ----------------
  let n30 = null;
  if ((b >= 49 && b <= 71) || (b >= 73 && b <= 92)) {
    n30 = `a${b}`;
    const params30 = {
      waveform: 'sawtooth',
      cutoff: 0.3,                        // overridden per-step by automation
      resonance: k(b >= 65 && b <= 70 ? 78 + 8 * (b - 65) / 5 : 78), // reveal squelch ramp
      envMod: k(20),
      decay: k(b >= 57 ? 44 : 40),        // micro b57: decay 40->44
      accent: k(85),
      drive: k(20),
      level: dB(acidLevel(b)),
    };
    const auto30 = {
      cutoff: ALL16.map((i) => acidCutoffAt(b, i)),
      envMod: ALL16.map((i) => acidEnvModAt(b, i)),
    };
    s.patterns.jt30[n30] = { pattern: deep(ACID_A), params: params30, automation: auto30 };
  }

  const sec = { bars: 1, jt90: n90, jb01: n01 };
  if (n30) sec.jt30 = n30;
  sections.push(sec);
}

// ============================================================================
// Space: dotted-8th delay send for the 303, dark plate insert for the bursts
// ============================================================================
await jb.tool('add_send', { id: 'dly', effect: 'delay' });
const dly = s.routing.getSend('dly').effectNode;
dly.setParam('sync', 'dotted8th');   // 349 ms at 129 BPM
dly.setParam('feedback', 55);
dly.setParam('lowcut', 150);
dly.setParam('highcut', 5500);       // dark repeats
dly.setParam('saturation', 25);
await jb.tool('route', { track: 'jt30', send: 'dly', level: 0.35 });

// dark plate on the burst-click voice only (percussion stays bone dry)
await jb.tool('add_effect', {
  target: 'jb01.hitom', effect: 'reverb',
  decay: 3.2, predelay: 20, damping: 70, mix: 60, lowcut: 200, highcut: 5000,
});

// ============================================================================
// Arrangement + render
// ============================================================================
const arr = await jb.tool('set_arrangement', { sections });
console.log(arr);
const t0 = Date.now();
const msg = await jb.render(OUT);
console.log(msg, `(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
process.exit(0);
