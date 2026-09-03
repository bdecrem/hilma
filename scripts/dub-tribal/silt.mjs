#!/usr/bin/env node
/**
 * SILT — dub techno with tribal percussion. 126 BPM, G minor, 256 bars (~8:10).
 *
 * Basic Channel / Rhythm & Sound signal flow (a short minor-7th stab into a long
 * delay with a lowpass INSIDE the feedback loop, so every repeat is darker) over
 * a Mills-school tribal engine (3-2 cascara on the rim, a tumbao cell on a 909
 * tom choir tuned in fourths G2-C3-F3, a 5-cycle shaker and a 7-cycle ghost
 * layer phasing against the 4/4). Two basses in conversation: a JB202 sub on the
 * chord root (score-keyed sidechain) and a JT30 that answers the toms with real
 * slides from bar 129.
 *
 * The arrangement is DATA (sections, chord rotation, per-bar patterns, lanes),
 * rendered as separate stems through the jambot headless API, then mixed here:
 * ping-pong dub delay with per-bar feedback/filter lanes and a 3/16 -> 5/16 time
 * change at bar 177, kick-keyed ducking, noise bed + crackle, glue comp, tape
 * saturation, limiter. Every 8 bars is measured against an energy target.
 *
 * Run:  node scripts/dub-tribal/silt.mjs            (from hilma)
 *       SILT_OUT=/some/dir  to redirect output       (default: scratchpad)
 * Out:  <out>/silt.wav, silt.m4a, silt-score.json, silt-measure.json, stems/
 *
 * Engine facts this relies on (verified 2026-09-02 on vibeceo b67cc9d02):
 *  - node-level full-length patterns (session._nodes.X.setPattern, 4096 steps,
 *    velocity 0-1) — the only path where tweaks + lanes all apply
 *  - jt90 kick tune -2 = 48.7 Hz (G1); LT/MT/HT tune 3.5/1.5/1.5 = G2/C3/F3
 *  - JP9000 4 saws at 0/+3/+7/+10 semitones -> mixer -> lp24 -> vca = Gm7 stab
 *  - jb202 held notes die after a bar: retrigger (slide=false) on bar starts
 *  - effect params are static per render, so the dub delay lives in the mix stage
 */
import { createHeadless } from '/Users/bart/Documents/code/vibeceo/jambot/headless.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const OUT = process.env.SILT_OUT || '/private/tmp/claude-501/-Users-bart-Documents-code-hilma/0e14b480-fcb1-4623-b2af-57170299d75f/scratchpad/silt';
mkdirSync(join(OUT, 'stems'), { recursive: true });
const BPM = 126, SR = 44100, BARS = +(process.env.SILT_BARS || 256), STEPS = BARS * 16;   // SILT_BARS=16 for quick timing runs
const BEAT = 60 / BPM, BAR = 4 * BEAT, STEP = BEAT / 4;
const ONLY = process.env.SILT_ONLY;   // e.g. "mix" to skip rendering
const STEMS = process.env.SILT_STEMS ? process.env.SILT_STEMS.split(',') : null;   // e.g. "jb01,jb202" to render a subset

// ============================================================ FORM
const SECTIONS = [
  ['fog', 1, 16], ['build', 17, 32], ['assemble', 33, 64], ['plateau', 65, 96], ['subtract', 97, 112],
  ['breakdown', 113, 128], ['payoff', 129, 160], ['plateau2', 161, 192], ['outro', 193, 224], ['fogout', 225, 256],
].map(([name, from, to]) => ({ name, from, to }));
const TARGET_RMS = { fog: -26, build: -19, assemble: -15.5, plateau: -13.5, subtract: -14.5, breakdown: -24, payoff: -12.5, plateau2: -13, outro: -18, fogout: -31 };
const sec = (b) => SECTIONS.find(s => b >= s.from && b <= s.to).name;
const inRange = (b, a, z) => b >= a && b <= z;
// Chord plan: i / i(add9) / VI / iv over a 32-bar cycle; the breakdown lifts to VI,
// the drop lands back on i. Three voicings = three JP9000 renders summed in the mix.
const CHORD_CYCLE = ['Gm7', 'Gm9', 'Ebmaj7', 'Cm7'];
const CHORD = { Gm7: { root: 'G3', shape: 'm7' }, Gm9: { root: 'G3', shape: 'm9' }, Ebmaj7: { root: 'D#3', shape: 'maj7' }, Cm7: { root: 'C3', shape: 'm7' } };
const SHAPES = { m7: [0, 3, 7, 10], m9: [0, 3, 10, 14], maj7: [0, 4, 7, 11] };
const SUB_OF = { Gm7: 'G1', Gm9: 'G1', Ebmaj7: 'D#2', Cm7: 'C2' };
const ACID_ROOT = { Gm7: 'G1', Gm9: 'G1', Ebmaj7: 'D#2', Cm7: 'C2' };
const chordAt = (b) => (b <= 16 || b >= 225) ? 'Gm7' : inRange(b, 113, 128) ? 'Ebmaj7' : b >= 129 ? CHORD_CYCLE[Math.floor((b - 129) / 8) % 4] : CHORD_CYCLE[Math.floor((b - 17) / 8) % 4];
const chordRoot = (b) => CHORD[chordAt(b)].root;
const DROPOUT_BARS = new Set([128, 168, 184]);       // kick + sub silent, tails ring

// ============================================================ PATTERN BUILDERS
const dB = (d) => Math.pow(10, d / 20);
const V = (db, accent = false) => ({ velocity: Math.min(1, dB(db)), accent });
const REST = { velocity: 0, accent: false };
const JT90_VOICES = ['kick', 'snare', 'clap', 'rimshot', 'lowtom', 'midtom', 'hitom', 'ch', 'oh', 'crash', 'ride'];
const JB01_VOICES = ['kick', 'snare', 'clap', 'ch', 'oh', 'lowtom', 'hitom', 'cymbal'];
const mkDrums = (voices) => Object.fromEntries(voices.map(v => [v, Array.from({ length: STEPS }, () => ({ ...REST }))]));
const jt90 = mkDrums(JT90_VOICES), jb01 = mkDrums(JB01_VOICES);
const put = (pat, voice, bar, step, v) => { pat[voice][(bar - 1) * 16 + step] = v; };

// 3-2 cascara (two bars): X.X.XX.X | .XX.X.XX  — accents on the downbeat and the "and of 3"
const CAS_A = { 0: -1, 2: -9, 4: -3, 5: -11, 7: -8 }, CAS_B = { 1: -10, 2: -7, 4: -2, 6: -9, 7: -6 };
// tumbao cell on the tom choir (from red clay, re-voiced): MT heel/tip, HT slap on 2, LT open on the tail
const CON_MT = { 0: -11, 2: -8, 6: -11, 8: -11, 10: -8, 15: -15 }, CON_HT = { 4: -1 }, CON_LT = { 12: -2, 14: 0 };
const cascaraStepMap = (bar) => (bar % 2 === 1 ? CAS_A : CAS_B);
// tiny deterministic humanization (no Math.random: the render must be reproducible)
const hum = (bar, step, range = 1.5) => ((Math.sin(bar * 12.9898 + step * 78.233) * 43758.5453) % 1) * range - range / 2;

for (let b = 1; b <= BARS; b++) {
  const s = sec(b);
  const drop = DROPOUT_BARS.has(b);
  const kickOn = (inRange(b, 17, 112) || inRange(b, 129, 216)) && !drop;
  const hatOn = (inRange(b, 21, 112) || inRange(b, 129, 208)) && !drop;
  const rimOn = (inRange(b, 41, 96) || inRange(b, 129, 160) || (inRange(b, 161, 192) && Math.floor((b - 161) / 8) % 2 === 0)) && !drop;
  const tomsFull = (inRange(b, 65, 96) || inRange(b, 129, 192)) && !drop;
  const tomsLT = inRange(b, 57, 64) || inRange(b, 193, 200);
  const rideOn = inRange(b, 137, 160);
  const clapOn = inRange(b, 129, 160) && b % 2 === 0;
  const shakerOn = inRange(b, 41, 128) || inRange(b, 129, 208);
  const ghost7 = inRange(b, 161, 192) ? -4 : null;
  const ohEvery = (s === 'plateau' || s === 'subtract' || s === 'plateau2') ? 4 : s === 'breakdown' ? 2 : 0;

  if (kickOn) for (const st of [0, 4, 8, 12]) put(jt90, 'kick', b, st, V(st === 0 ? 0 : -0.6, st === 0));
  if (hatOn) for (const st of [2, 6, 10, 14]) put(jt90, 'ch', b, st, V(-7 + (st === 6 || st === 14 ? 1.5 : 0) + hum(b, st, 2)));
  if (ohEvery && b % ohEvery === 0 && !drop) put(jt90, 'oh', b, 8, V(s === 'breakdown' ? -14 : -9));
  if (rimOn && !(b % 8 === 0 && s !== 'payoff')) {            // whole-voice rest on every 8th bar (mixer-mute grammar)
    const m = cascaraStepMap(b);
    for (const st of Object.keys(m)) put(jt90, 'rimshot', b, +st, V(m[st] + hum(b, +st), m[st] >= -3));
  }
  if (tomsFull) {
    for (const st of Object.keys(CON_MT)) put(jt90, 'midtom', b, +st, V(CON_MT[st] + hum(b, +st)));
    for (const st of Object.keys(CON_HT)) put(jt90, 'hitom', b, +st, V(CON_HT[st], true));
    for (const st of Object.keys(CON_LT)) put(jt90, 'lowtom', b, +st, V(CON_LT[st] + hum(b, +st, 1), st === '14'));
  } else if (tomsLT) {
    for (const st of Object.keys(CON_LT)) put(jt90, 'lowtom', b, +st, V(CON_LT[st] - 2));
  }
  if (rideOn && !drop) for (const st of [0, 2, 4, 6, 8, 10, 12, 14]) put(jt90, 'ride', b, st, V(st % 4 === 0 ? -9 : -13));
  if (clapOn && !drop) for (const st of [4, 12]) put(jt90, 'clap', b, st, V(-3, true));
  // JB01: shaker 16ths with a 5-step accent cycle (phases against the bar every 5 bars)
  if (shakerOn) for (let st = 0; st < 16; st++) { const i = (b - 1) * 16 + st; const acc = i % 5 === 0; put(jb01, 'ch', b, st, V((acc ? -1 : -9) + (st % 2 ? -2 : 0) + hum(b, st, 1.5) + (s === 'breakdown' ? -5 : 0))); }
  // JB01 toms as a 7-cycle ghost layer (different timbre from the 909 choir)
  if (ghost7 !== null) for (let st = 0; st < 16; st++) { const i = (b - 1) * 16 + st; if (i % 7 === 0) put(jb01, 'lowtom', b, st, V(ghost7)); if (i % 7 === 3) put(jb01, 'hitom', b, st, V(ghost7 - 4)); }
}

// ---- JB202 sub: chord root, retriggered every bar, held with slides inside the bar
const subPat = Array.from({ length: STEPS }, () => ({ note: 'G1', gate: false, accent: false, slide: false }));
for (let b = 1; b <= BARS; b++) {
  const on = (inRange(b, 9, 127) || inRange(b, 129, 215)) && !DROPOUT_BARS.has(b);
  if (!on) continue;
  const note = SUB_OF[chordAt(b)];   // chord-name keyed
  for (let st = 0; st < 16; st++) subPat[(b - 1) * 16 + st] = { note, gate: true, accent: st === 0, slide: st !== 0 };
}
// ---- JT30 acid: closed "pressure" notes from 65, real answers to the toms from 129
const acid = Array.from({ length: STEPS }, () => ({ note: 'G1', gate: false, accent: false, slide: false }));
const A = (b, st, note, accent = false, slide = false) => { acid[(b - 1) * 16 + st] = { note, gate: true, accent, slide }; };
const up = (n, semis) => { const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']; const m = n.match(/^([A-G]#?)(\d)$/); const i = names.indexOf(m[1]) + 12 * +m[2] + semis; return names[i % 12] + Math.floor(i / 12); };
for (let b = 1; b <= BARS; b++) {
  const s = sec(b), root = ACID_ROOT[chordAt(b)];
  const phrase = (b - 129) % 4;                                                                     // payoff / plateau2 4-bar phrases
  const answers = inRange(b, 129, 160) || (inRange(b, 161, 192) && Math.floor((b - 161) / 4) % 2 === 0);
  if (answers && phrase === 2) { A(b, 0, root, true); A(b, 2, root, false, true); A(b, 4, up(root, 3)); A(b, 8, up(root, 7), true); A(b, 10, up(root, 7), false, true); A(b, 12, up(root, 5)); A(b, 14, root); }
  if (answers && phrase === 3) { A(b, 6, root, true, false); A(b, 7, root, false, true); A(b, 8, up(root, 12), true, true); A(b, 9, up(root, 12), false, true); A(b, 10, up(root, 12), false, true); }
  if (inRange(b, 193, 208) && b % 4 === 1) { A(b, 6, root); A(b, 7, root, false, true); A(b, 8, up(root, 7), false, true); }
}
// ---- JP9000 chord stab: offbeat placements per section
const STAB_STEPS = { fog: (b) => b % 4 === 1 ? [6] : [], build: (b) => b % 2 === 1 ? [6] : [], assemble: () => [6], plateau: (b) => b % 4 === 3 ? [6, 14] : [6], subtract: (b) => b % 2 === 1 ? [6] : [], breakdown: (b) => b % 2 === 1 ? [6] : [], payoff: () => [6, 14], plateau2: (b) => b % 2 === 1 ? [2, 6, 14] : [6, 14], outro: (b) => b <= 208 ? (b % 2 === 1 ? [6] : []) : (b % 4 === 1 ? [6] : []), fogout: (b) => (b % 4 === 1 && b <= 241) ? [6] : [] };
const chordPat = Array.from({ length: STEPS }, () => ({ note: 'G3', gate: false, accent: false, velocity: 1 }));
for (let b = 1; b <= BARS; b++) {
  const s = sec(b); if (DROPOUT_BARS.has(b) && s !== 'breakdown') continue;
  for (const st of STAB_STEPS[s](b)) chordPat[(b - 1) * 16 + st] = { note: chordRoot(b), gate: true, accent: st === 6, velocity: s === 'fog' || s === 'fogout' ? 0.75 : s === 'breakdown' ? 0.85 : 1 };
}

// ---- engine automation lanes (per step)
const laneByBar = (fn) => Array.from({ length: STEPS }, (_, i) => fn(Math.floor(i / 16) + 1, i % 16));
const hatDecay = laneByBar((b) => { const s = sec(b); const base = { fog: 4, build: 6, assemble: 8, plateau: 12, subtract: 16, breakdown: 10, payoff: 12, plateau2: 14, outro: 8, fogout: 4 }[s]; return Math.round(base + 3 * Math.sin((b - 1) / 8 * Math.PI)); });
const acidCutoff = laneByBar((b) => { const s = sec(b); if (s === 'plateau' || s === 'subtract') return 220; if (s === 'payoff') return Math.round(400 + 1000 * (b - 129) / 31); if (s === 'plateau2') return 900 - (((b - 161) % 8) < 2 ? 350 : 0); if (s === 'outro') return 300; return 200; });

// ============================================================ MIX-STAGE LANES (per bar)
const laneBars = (fn) => Array.from({ length: BARS + 2 }, (_, i) => fn(Math.min(BARS, i + 1)));
const lerpIn = (b, from, to, a, z) => a + (z - a) * Math.max(0, Math.min(1, (b - from) / Math.max(1, to - from)));
const chordLP = laneBars((b) => ({ fog: 600, build: 700, assemble: 900, plateau: lerpIn(b, 65, 96, 1300, 2100), subtract: 1100, breakdown: lerpIn(b, 113, 128, 1600, 420), payoff: 2200, plateau2: lerpIn(b, 161, 192, 2100, 2500), outro: lerpIn(b, 193, 224, 1200, 520), fogout: 700 }[sec(b)]));
const dlyFb = laneBars((b) => ({ fog: 0.86, build: 0.72, assemble: 0.66, plateau: lerpIn(b, 65, 96, 0.62, 0.72), subtract: 0.8, breakdown: 0.9, payoff: 0.66, plateau2: 0.7, outro: lerpIn(b, 193, 224, 0.82, 0.9), fogout: 0.9 }[sec(b)]));
const dlyLP = laneBars((b) => ({ fog: 2200, build: 2600, assemble: 2800, plateau: 3000, subtract: 2400, breakdown: 1600, payoff: 3000, plateau2: 3200, outro: 2000, fogout: 1400 }[sec(b)]));
const dlyTimeSteps = laneBars((b) => inRange(b, 177, 192) ? 5 : 3);          // 3/16 dub time; 5/16 for the plateau-2 move
const chordGain = laneBars((b) => ({ fog: 1.0, build: 0.95, breakdown: 1.0, fogout: 1.0 }[sec(b)] ?? 1));
// per-stem section gain lanes (dB) — the arc is shaped here, on top of the pattern gating
const kickGain = laneBars((b) => ({ build: lerpIn(b, 17, 32, -9, -2), assemble: lerpIn(b, 33, 64, -2.5, -0.5), payoff: 1, outro: lerpIn(b, 193, 216, -3, -12) }[sec(b)] ?? 0));
const subGain = laneBars((b) => ({ fog: lerpIn(b, 9, 16, -18, -10), build: lerpIn(b, 17, 32, -12, -4), assemble: lerpIn(b, 33, 64, -3, -0.5), breakdown: b <= 120 ? -9 : lerpIn(b, 121, 127, -12, -30), outro: b <= 208 ? -4 : lerpIn(b, 209, 215, -8, -18) }[sec(b)] ?? 0));
const percGain = laneBars((b) => ({ assemble: lerpIn(b, 33, 64, -4, -1), subtract: -2, payoff: 1, outro: lerpIn(b, 193, 224, -1, -10) }[sec(b)] ?? 0));
const acidGain = laneBars((b) => ({ payoff: 0, plateau2: -1, outro: lerpIn(b, 193, 208, -4, -16) }[sec(b)] ?? 0));
const pinkGain = laneBars((b) => dB((sec(b) === 'fog' || sec(b) === 'fogout' || sec(b) === 'breakdown') ? -46 : -56));
const crackleGain = laneBars((b) => (sec(b) === 'fog' || sec(b) === 'fogout' || sec(b) === 'breakdown') ? dB(-36) : dB(-48));
const duckDb = laneBars((b) => (sec(b) === 'payoff' || sec(b) === 'plateau2') ? 10 : 8);

// ============================================================ RENDER STEMS
const stemPath = (n) => join(OUT, 'stems', `${n}.wav`);
const LEVELS = { jt90: 0, jb01: 6, jb202: -5, jt30: -9, jp9000: -6 };
const JT90_VOICE_LEVELS = { kick: 2, rimshot: -5, lowtom: -4, midtom: -8, hitom: -6, ch: -11, oh: -14, ride: -17, clap: -12 };
const newSession = async () => { const jb = await createHeadless({ bpm: BPM, outputDir: OUT }); await jb.tool('set_swing', { amount: 0 }); return jb; };
// Each stem gets its OWN session with only that instrument set up: an instrument that
// is merely turned down still renders, and JB01's render cost grows with the square
// of its hit count (512 hits = 75 s), so a shared session made every stem pay for it.
async function setupJT90(jb, { kickOnly = false, noKick = false } = {}) {
  await jb.tool('tweak_jt90', { voice: 'kick', tune: -2, decay: 56, attack: 28, sweep: 42, level: JT90_VOICE_LEVELS.kick });
  await jb.tool('tweak_jt90', { voice: 'rimshot', tune: -6, decay: 12, level: JT90_VOICE_LEVELS.rimshot });
  await jb.tool('tweak_jt90', { voice: 'lowtom', tune: 3.5, decay: 70, level: JT90_VOICE_LEVELS.lowtom });
  await jb.tool('tweak_jt90', { voice: 'midtom', tune: 1.5, decay: 28, level: JT90_VOICE_LEVELS.midtom });
  await jb.tool('tweak_jt90', { voice: 'hitom', tune: 1.5, decay: 18, level: JT90_VOICE_LEVELS.hitom });
  await jb.tool('tweak_jt90', { voice: 'ch', tune: 1, decay: 8, tone: 55, level: JT90_VOICE_LEVELS.ch });
  await jb.tool('tweak_jt90', { voice: 'oh', tune: 0, decay: 18, tone: 50, level: JT90_VOICE_LEVELS.oh });
  await jb.tool('tweak_jt90', { voice: 'ride', decay: 40, level: JT90_VOICE_LEVELS.ride });
  await jb.tool('tweak_jt90', { voice: 'clap', decay: 6, tone: 30, level: JT90_VOICE_LEVELS.clap });
  if (!kickOnly) {
    await jb.tool('add_effect', { target: 'jt90.rimshot', effect: 'reverb', decay: 1.1, damping: 65, mix: 14, predelay: 12, size: 35 });
    await jb.tool('add_effect', { target: 'jt90.clap', effect: 'reverb', decay: 1.6, damping: 55, mix: 22, predelay: 20, size: 55 });
    await jb.tool('add_effect', { target: 'jt90.lowtom', effect: 'reverb', decay: 0.9, damping: 70, mix: 10, predelay: 5, size: 30 });
    if (!process.env.SILT_NOAUTO) await jb.tool('automate', { path: 'jt90.ch.decay', values: hatDecay });
  }
  const pat = Object.fromEntries(JT90_VOICES.map(v => [v, (kickOnly && v !== 'kick') || (noKick && v === 'kick') ? jt90[v].map(() => ({ ...REST })) : jt90[v]]));
  jb.session._nodes.jt90.setPattern(pat);
  await jb.tool('tweak', { path: 'jt90.level', value: LEVELS.jt90 });
}
async function setupJB01(jb, pattern = jb01) {
  await jb.tool('tweak', { path: 'jb01.ch.decay', value: 22 }); await jb.tool('tweak', { path: 'jb01.ch.tone', value: 70 });
  await jb.tool('tweak', { path: 'jb01.lowtom.tune', value: -4 }); await jb.tool('tweak', { path: 'jb01.lowtom.decay', value: 35 });
  await jb.tool('tweak', { path: 'jb01.hitom.tune', value: -1 }); await jb.tool('tweak', { path: 'jb01.hitom.decay', value: 25 });
  await jb.tool('add_effect', { target: 'jb01.ch', effect: 'eq', highpass: 900, highGain: -2 });
  jb.session._nodes.jb01.setPattern(pattern);
  await jb.tool('tweak', { path: 'jb01.level', value: LEVELS.jb01 });
}
// JB01 renders through a Web Audio graph whose cost grows with the square of the
// hit count (512 hits = 75 s), so render it in 16-bar chunks padded with 2 empty
// bars for the tails, and overlap-add the chunks at their absolute positions.
async function renderJB01Chunked() {
  const CH = 4, PAD = 1; const total = Math.ceil((BARS * BAR + 2) * SR); const LAT = Math.round(0.0087 * SR);   // JB01 schedules 8.7 ms late (measured)
  const accL = new Float32Array(total), accR = new Float32Array(total);
  for (let c = 0; c < BARS; c += CH) {
    const bars = Math.min(CH, BARS - c);
    const chunk = Object.fromEntries(JB01_VOICES.map(v => [v, [...jb01[v].slice(c * 16, (c + bars) * 16), ...Array.from({ length: PAD * 16 }, () => ({ ...REST }))]]));
    if (!Object.values(chunk).some(arr => arr.some(st => st.velocity > 0))) continue;   // silent chunk: nothing to add
    const jb = await newSession(); await setupJB01(jb, chunk);
    const tmp = join(OUT, 'stems', `_jb01_chunk.wav`); await jb.render(tmp, bars + PAD);
    const w = readWav(tmp); const off = Math.round(c * BAR * SR) - LAT;
    for (let i = Math.max(0, -off); i < w.L.length && off + i < total; i++) { accL[off + i] += w.L[i]; accR[off + i] += w.R[i]; }
  }
  writeWav(stemPath('jb01'), accL, accR);
}
async function setupJB202(jb) {
  await jb.tool('tweak_jb202', { osc1Waveform: 'sine', osc1Level: 100, osc2Waveform: 'sine', osc2Octave: 12, osc2Level: 18, filterCutoff: 260, filterResonance: 0, filterEnvAmount: 0, ampAttack: 3, ampDecay: 40, ampSustain: 85, ampRelease: 25, drive: 8 });
  jb.session._nodes.jb202.setPattern(subPat);
  await jb.tool('tweak', { path: 'jb202.level', value: LEVELS.jb202 });
}
async function setupJT30(jb) {
  await jb.tool('tweak_jt30', { waveform: 'sawtooth', filterCutoff: 300, filterResonance: 48, filterEnvAmount: 42, filterDecay: 48, accentLevel: 70, drive: 18 });
  if (!process.env.SILT_NOAUTO) await jb.tool('automate', { path: 'jt30.bass.cutoff', values: acidCutoff });
  await jb.tool('add_effect', { target: 'jt30', effect: 'delay', mode: 'analog', sync: 'dotted8th', feedback: 35, mix: 18, lowcut: 250, highcut: 4200, saturation: 25 });
  jb.session._nodes.jt30.setPattern(acid);
  await jb.tool('tweak', { path: 'jt30.level', value: LEVELS.jt30 });
}
async function setupJP9000(jb, shape = 'm7') {
  await jb.tool('add_jp9000', { preset: 'empty' });
  const iv = SHAPES[shape];
  for (const [id, semi] of [['osc1', iv[0]], ['osc2', iv[1]], ['osc3', iv[2]], ['osc4', iv[3]]]) { await jb.tool('add_module', { type: 'osc-saw', id }); if (semi) await jb.tool('tweak_module', { module: id, param: 'octave', value: semi }); await jb.tool('tweak_module', { module: id, param: 'detune', value: (semi % 2 ? 6 : -5) }); }
  for (const id of ['mix1:mixer', 'flt1:filter-lp24', 'env1:env-adsr', 'vca1:vca']) { const [i, t] = id.split(':'); await jb.tool('add_module', { type: t, id: i }); }
  for (const [a, b] of [['osc1.audio', 'mix1.in1'], ['osc2.audio', 'mix1.in2'], ['osc3.audio', 'mix1.in3'], ['osc4.audio', 'mix1.in4'], ['mix1.audio', 'flt1.audio'], ['env1.cv', 'flt1.cutoffCV'], ['flt1.audio', 'vca1.audio'], ['env1.cv', 'vca1.cv']]) await jb.tool('connect_modules', { from: a, to: b });
  await jb.tool('set_jp9000_output', { module: 'vca1' });
  await jb.tool('set_trigger_modules', { modules: ['osc1', 'osc2', 'osc3', 'osc4', 'env1'] });
  for (const [m, p, v] of [['mix1', 'master', 0.6], ['flt1', 'cutoff', 1400], ['flt1', 'resonance', 34], ['flt1', 'envAmount', 40], ['env1', 'attack', 0], ['env1', 'decay', 40], ['env1', 'sustain', 0], ['env1', 'release', 25], ['vca1', 'gain', 0.5]]) await jb.tool('tweak_module', { module: m, param: p, value: v });
  await jb.tool('add_effect', { target: 'jp9000', effect: 'reverb', decay: 3.6, damping: 62, mix: 16, predelay: 18, size: 72, width: 100 });
  const pat = chordPat.map((st, i) => (st.gate && CHORD[chordAt(Math.floor(i / 16) + 1)].shape === shape) ? st : { ...st, gate: false });
  await jb.tool('add_jp9000_pattern', { pattern: pat });
  if (jb.session._nodes.jp9000._pattern?.length !== STEPS) jb.session._nodes.jp9000._pattern = pat;
  await jb.tool('tweak', { path: 'jp9000.level', value: LEVELS.jp9000 });
}
const STEM_SETUP = {
  kick: (jb) => setupJT90(jb, { kickOnly: true }),
  perc909: (jb) => setupJT90(jb, { noKick: true }),
  jb01: null, jb202: setupJB202, jt30: setupJT30,   // jb01 is chunked (see renderJB01Chunked)
  jp_m7: (jb) => setupJP9000(jb, 'm7'), jp_m9: (jb) => setupJP9000(jb, 'm9'), jp_maj7: (jb) => setupJP9000(jb, 'maj7'),
};
async function renderStems() {
  const t0 = Date.now();
  for (const [name, setup] of Object.entries(STEM_SETUP)) {
    if (STEMS && !STEMS.includes(name)) continue;
    const tt = Date.now();
    if (name === 'jb01') await renderJB01Chunked(); else { const jb = await newSession(); await setup(jb); await jb.render(stemPath(name), BARS); }
    console.log(`  ${name} stem ${((Date.now() - tt) / 1000).toFixed(1)}s`);
  }
  console.log(`stems rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ============================================================ DSP (mix stage)
function readWav(p) { const b = readFileSync(p); let q = 12, fmt = null, off = 0, len = 0; while (q + 8 <= b.length) { const id = b.toString('ascii', q, q + 4), n = b.readUInt32LE(q + 4); if (id === 'fmt ') fmt = { tag: b.readUInt16LE(q + 8), ch: b.readUInt16LE(q + 10), sr: b.readUInt32LE(q + 12), bits: b.readUInt16LE(q + 22) }; if (id === 'data') { off = q + 8; len = Math.min(n, b.length - off); break; } q += 8 + n + (n & 1); }
  const { ch, bits, tag } = fmt, bps = bits / 8, frames = Math.floor(len / (bps * ch)); const L = new Float32Array(frames), R = new Float32Array(frames);
  for (let i = 0; i < frames; i++) { const rd = (c) => { const o = off + (i * ch + c) * bps; return tag === 3 ? b.readFloatLE(o) : bits === 16 ? b.readInt16LE(o) / 32768 : b.readInt32LE(o) / 2147483648; }; L[i] = rd(0); R[i] = ch > 1 ? rd(1) : L[i]; } return { L, R, sr: fmt.sr }; }
function writeWav(p, L, R, sr = SR) { const n = L.length; const b = Buffer.alloc(44 + n * 4); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40); for (let i = 0; i < n; i++) { b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4); b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4); } writeFileSync(p, b); }
const barOfSample = (i) => Math.min(BARS, Math.floor(i / SR / BAR) + 1);
const laneAt = (lane, i) => { const t = i / SR / BAR; const b = Math.floor(t); const f = t - b; const a = lane[Math.min(lane.length - 1, b)], z = lane[Math.min(lane.length - 1, b + 1)]; return a + (z - a) * f; };
function biquadLP(f0, Q = 0.8) { const w = 2 * Math.PI * f0 / SR, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * Q), a0 = 1 + al; return { b0: (1 - cs) / 2 / a0, b1: (1 - cs) / a0, b2: (1 - cs) / 2 / a0, a1: -2 * cs / a0, a2: (1 - al) / a0 }; }
function biquadHP(f0, Q = 0.707) { const w = 2 * Math.PI * f0 / SR, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * Q), a0 = 1 + al; return { b0: (1 + cs) / 2 / a0, b1: -(1 + cs) / a0, b2: (1 + cs) / 2 / a0, a1: -2 * cs / a0, a2: (1 - al) / a0 }; }
function runBiquad(x, coefFn) { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0, c = coefFn(0); for (let i = 0; i < x.length; i++) { if ((i & 63) === 0) c = coefFn(i); const v = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; }
const hpStatic = (x, f) => { const c = biquadHP(f); return runBiquad(x, () => c); };
function gain(L, R, g) { for (let i = 0; i < L.length; i++) { L[i] *= g; R[i] *= g; } }
// score-keyed ducking: exact kick step times from the pattern
function duckEnvelope(n) { const env = new Float32Array(n).fill(1); const att = Math.round(0.004 * SR), hold = Math.round(0.03 * SR), rel = Math.round(0.22 * SR);
  for (let i = 0; i < STEPS; i++) { if (jt90.kick[i].velocity <= 0) continue; const t0 = Math.round(i * STEP * SR); const depth = 1 - dB(-duckDb[Math.floor(i / 16)]);
    for (let k = 0; k < att + hold + rel && t0 + k < n; k++) { const g = k < att ? 1 - depth * k / att : k < att + hold ? 1 - depth : 1 - depth * (1 - (k - att - hold) / rel); env[t0 + k] = Math.min(env[t0 + k], g); } } return env; }
// ping-pong dub delay with a lowpass + highpass inside the feedback loop, per-bar lanes, crossfaded time change
function dubDelay(inL, inR) { const n = inL.length; const maxD = Math.round(6 * STEP * SR) + 2; const bufA = new Float32Array(maxD), bufB = new Float32Array(maxD); let w = 0; const outL = new Float32Array(n), outR = new Float32Array(n);
  let lpA = 0, lpB = 0, hpA = 0, hpB = 0, hpxA = 0, hpxB = 0; const hpAlpha = Math.exp(-2 * Math.PI * 180 / SR);
  let curT = dlyTimeSteps[0] * STEP * SR, prevT = curT, xfade = 1; const XF = Math.round(0.04 * SR);
  for (let i = 0; i < n; i++) {
    const bar = Math.floor(i / SR / BAR); const wantT = dlyTimeSteps[Math.min(dlyTimeSteps.length - 1, bar)] * STEP * SR;
    if (wantT !== curT) { prevT = curT; curT = wantT; xfade = 0; }
    const rd = (buf, d) => { const j = Math.floor(d); const f = d - j; const p0 = (w - j + maxD * 2) % maxD, p1 = (p0 - 1 + maxD) % maxD; return buf[p0] * (1 - f) + buf[p1] * f; };
    let a = rd(bufA, curT), b = rd(bufB, curT);
    if (xfade < 1) { const g = xfade; a = a * g + rd(bufA, prevT) * (1 - g); b = b * g + rd(bufB, prevT) * (1 - g); xfade += 1 / XF; }
    const fb = laneAt(dlyFb, i), lpA_a = Math.exp(-2 * Math.PI * laneAt(dlyLP, i) / SR);
    // loop filters: one-pole lowpass (darkens every repeat) + one-pole highpass (no mud)
    lpA = lpA_a * lpA + (1 - lpA_a) * b; lpB = lpA_a * lpB + (1 - lpA_a) * a;
    const hA = hpAlpha * (hpA + lpA - hpxA); hpxA = lpA; hpA = hA; const hB = hpAlpha * (hpB + lpB - hpxB); hpxB = lpB; hpB = hB;
    const mono = 0.5 * (inL[i] + inR[i]);
    bufA[w] = mono + Math.tanh(hA * fb * 1.1) / 1.1;      // soft-saturated feedback, first echo lands left
    bufB[w] = Math.tanh(hB * fb * 1.1) / 1.1;              // ...then bounces right
    outL[i] = a; outR[i] = b; w = (w + 1) % maxD; }
  return { L: outL, R: outR }; }
function pinkNoise(n, seed = 7) { let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; }; let b0 = 0, b1 = 0, b2 = 0; const out = new Float32Array(n); for (let i = 0; i < n; i++) { const wn = rnd(); b0 = 0.99765 * b0 + wn * 0.099046; b1 = 0.96300 * b1 + wn * 0.2965164; b2 = 0.57000 * b2 + wn * 1.0526913; out[i] = (b0 + b1 + b2 + wn * 0.1848) * 0.11; } return out; }
function crackle(n, seed = 3) { let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; const out = new Float32Array(n); for (let i = 0; i < n; i++) { if (rnd() < 0.00035) { const a = (rnd() * 2 - 1) * (0.4 + rnd() * 0.6); out[i] += a; if (i + 1 < n) out[i + 1] -= a * 0.6; } } return hpStatic(out, 1200); }
function glueComp(L, R, thrDb = -12, ratio = 1.8, att = 0.02, rel = 0.12) { const n = L.length; const aA = Math.exp(-1 / (att * SR)), aR = Math.exp(-1 / (rel * SR)); let env = 0; const thr = dB(thrDb); let maxGR = 0;
  for (let i = 0; i < n; i++) { const x = Math.max(Math.abs(L[i]), Math.abs(R[i])); env = x > env ? aA * env + (1 - aA) * x : aR * env + (1 - aR) * x; let g = 1; if (env > thr) { const over = 20 * Math.log10(env / thr); const gr = over - over / ratio; g = dB(-gr); if (gr > maxGR) maxGR = gr; } L[i] *= g; R[i] *= g; } return maxGR; }
function tape(L, R, drive = 1.18) { const k = Math.tanh(drive); for (let i = 0; i < L.length; i++) { L[i] = Math.tanh(L[i] * drive) / k; R[i] = Math.tanh(R[i] * drive) / k; } }
function limiter(L, R, ceiling = 0.89) { const n = L.length, look = 48; const rel = Math.exp(-1 / (0.05 * SR)); let g = 1; const oL = new Float32Array(n), oR = new Float32Array(n);
  for (let i = 0; i < n; i++) { let pk = 0; for (let k = 0; k < look && i + k < n; k++) { const v = Math.max(Math.abs(L[i + k]), Math.abs(R[i + k])); if (v > pk) pk = v; } const want = pk > ceiling ? ceiling / pk : 1; g = want < g ? want : rel * g + (1 - rel) * want; oL[i] = L[i] * g; oR[i] = R[i] * g; } return { L: oL, R: oR }; }

// ============================================================ MIX
// reference window for gain staging: everything is playing here
const REF = { from: 137, to: 152 };
const STEM_TARGET_RMS = { kick: -14, perc909: -17.5, jb01: -32, jb202: -14.5, jt30: -20, jp9000: -19 };
function stemRms(S, from = REF.from, to = REF.to) { const a = Math.round((from - 1) * BAR * SR), z = Math.min(S.L.length, Math.round(to * BAR * SR)); let e = 0; for (let i = a; i < z; i++) { const m = 0.5 * (S.L[i] + S.R[i]); e += m * m; } return 20 * Math.log10(Math.sqrt(e / (z - a)) + 1e-9); }
function mix() {
  const S = Object.fromEntries(['kick', 'perc909', 'jb01', 'jb202', 'jt30', 'jp_m7', 'jp_m9', 'jp_maj7'].map(n => [n, readWav(stemPath(n))]));
  { const n0 = Math.min(S.jp_m7.L.length, S.jp_m9.L.length, S.jp_maj7.L.length); const L = new Float32Array(n0), R = new Float32Array(n0); for (let i = 0; i < n0; i++) { L[i] = S.jp_m7.L[i] + S.jp_m9.L[i] + S.jp_maj7.L[i]; R[i] = S.jp_m7.R[i] + S.jp_m9.R[i] + S.jp_maj7.R[i]; } S.jp9000 = { L, R, sr: SR }; delete S.jp_m7; delete S.jp_m9; delete S.jp_maj7; }
  const n = Math.min(...Object.values(S).map(s => s.L.length)); const out = { L: new Float32Array(n), R: new Float32Array(n) };
  // gain staging by measurement: each stem normalized to its target RMS over the reference bars
  const trim = {}; for (const [name, st] of Object.entries(S)) { const r = stemRms(st); trim[name] = dB(STEM_TARGET_RMS[name] - r); console.log(`  stem ${name.padEnd(8)} ref RMS ${r.toFixed(1)} dBFS -> trim ${(STEM_TARGET_RMS[name] - r).toFixed(1)} dB`); }
  const addLane = (src, g0, lane, gL = 1, gR = 1) => { for (let i = 0; i < n; i++) { const g = g0 * (lane ? dB(laneAt(lane, i)) : 1); out.L[i] += src.L[i] * g * gL; out.R[i] += src.R[i] * g * gR; } };
  const duck = duckEnvelope(n);
  addLane(S.kick, trim.kick, kickGain);
  { const p = { L: hpStatic(S.perc909.L, 90), R: hpStatic(S.perc909.R, 90) }; addLane(p, trim.perc909, percGain); }
  { const p = { L: hpStatic(S.jb01.L, 300), R: hpStatic(S.jb01.R, 300) }; for (let i = 0; i < n; i++) { const d = 1 - (1 - duck[i]) * 0.35; p.L[i] *= d; p.R[i] *= d; } addLane(p, trim.jb01, percGain); }
  { const m = new Float32Array(n); for (let i = 0; i < n; i++) m[i] = 0.5 * (S.jb202.L[i] + S.jb202.R[i]) * duck[i]; addLane({ L: m, R: m }, trim.jb202, subGain); }
  { const p = { L: new Float32Array(n), R: new Float32Array(n) }; for (let i = 0; i < n; i++) { const d = 1 - (1 - duck[i]) * 0.5; p.L[i] = S.jt30.L[i] * d; p.R[i] = S.jt30.R[i] * d; } addLane(p, trim.jt30, acidGain); }
  { const lp = { L: runBiquad(S.jp9000.L, (i) => biquadLP(laneAt(chordLP, i), 0.9)), R: runBiquad(S.jp9000.R, (i) => biquadLP(laneAt(chordLP, i), 0.9)) };
    for (let i = 0; i < n; i++) { const g = laneAt(chordGain, i) * (1 - (1 - duck[i]) * 0.6) * trim.jp9000; lp.L[i] *= g; lp.R[i] *= g; }
    const wet = dubDelay(lp.L, lp.R);
    addLane(lp, dB(-1), null); addLane(wet, dB(-3.5), null); }
  { const pk = pinkNoise(n), cr = crackle(n); for (let i = 0; i < n; i++) { const c = laneAt(crackleGain, i), g = laneAt(pinkGain, i); out.L[i] += pk[i] * g + cr[i] * c; out.R[i] += pk[(i + 977) % n] * g + cr[(i + 1301) % n] * c; } }
  const gr = glueComp(out.L, out.R); tape(out.L, out.R);
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out.L[i]), Math.abs(out.R[i]));
  gain(out.L, out.R, dB(-1.0) / peak);
  const lim = limiter(out.L, out.R, dB(-1.0));
  writeWav(join(OUT, 'silt.wav'), lim.L, lim.R);
  console.log(`mix: ${n / SR / 60 | 0}m${Math.round(n / SR % 60)}s, glue max GR ${gr.toFixed(1)} dB, pre-limiter peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS`);
  return lim;
}

// ============================================================ MEASURE
function measure(M) {
  const n = M.L.length; const rows = []; const bandsOf = (a, b) => { const seg = new Float32Array(b - a); for (let i = a; i < b; i++) seg[i - a] = 0.5 * (M.L[i] + M.R[i]); const rms = (x) => { let s = 0; for (const v of x) s += v * v; return 20 * Math.log10(Math.sqrt(s / x.length) + 1e-9); }; const lo = runBiquad(seg, () => biquadLP(120)), hi = hpStatic(seg, 4000), mid = hpStatic(runBiquad(seg, () => biquadLP(2500)), 300); return { rms: rms(seg), lo: rms(lo), mid: rms(mid), hi: rms(hi) }; };
  const secStats = {};
  for (let b = 1; b <= BARS; b += 8) { const a = Math.round((b - 1) * BAR * SR), z = Math.min(n, Math.round((b + 7) * BAR * SR)); const st = bandsOf(a, z); const s = sec(b); const target = b >= 249 ? -45 : TARGET_RMS[s]; rows.push({ bar: b, section: s, ...Object.fromEntries(Object.entries(st).map(([k, v]) => [k, +v.toFixed(1)])), target }); (secStats[s] ||= []).push(st.rms); }
  console.log('\nbar  section    rms    lo    mid    hi  | target  Δ'); for (const r of rows) console.log(`${String(r.bar).padStart(3)}  ${r.section.padEnd(9)} ${r.rms.toFixed(1).padStart(6)} ${r.lo.toFixed(1).padStart(5)} ${r.mid.toFixed(1).padStart(6)} ${r.hi.toFixed(1).padStart(5)}  | ${String(r.target).padStart(5)}  ${(r.rms - r.target).toFixed(1).padStart(5)}`);
  const arc = Object.entries(secStats).map(([s, v]) => `${s} ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}/${TARGET_RMS[s]}`).join('  ');
  console.log('section means vs targets:', arc);
  writeFileSync(join(OUT, 'silt-measure.json'), JSON.stringify({ bpm: BPM, bars: BARS, rows, targets: TARGET_RMS }, null, 1));
}
function writeScore() {
  const bars = Array.from({ length: BARS }, (_, i) => { const b = i + 1; return { bar: b, section: sec(b), chord: chordAt(b), stabs: STAB_STEPS[sec(b)](b), kick: [0, 4, 8, 12].filter(st => jt90.kick[i * 16 + st].velocity > 0), toms: [12, 14].filter(st => jt90.lowtom[i * 16 + st].velocity > 0).length > 0, rim: Object.keys(cascaraStepMap(b)).filter(st => jt90.rimshot[i * 16 + +st].velocity > 0).map(Number), acid: acid.slice(i * 16, i * 16 + 16).map((s, st) => s.gate ? st : -1).filter(x => x >= 0), lanes: { chordLP: Math.round(chordLP[i]), fb: +dlyFb[i].toFixed(2), dlyLP: dlyLP[i], dlySteps: dlyTimeSteps[i], duckDb: duckDb[i] } }; });
  writeFileSync(join(OUT, 'silt-score.json'), JSON.stringify({ title: 'silt', version: 2, bpm: BPM, key: 'G minor', barSeconds: BAR, sections: SECTIONS, bars: bars }, null, 0));
}

// ============================================================ MAIN
if (ONLY !== 'mix') await renderStems();
let tm = Date.now(); const master = mix(); console.log(`mix stage ${((Date.now()-tm)/1000).toFixed(1)}s`); tm = Date.now(); measure(master); console.log(`measure ${((Date.now()-tm)/1000).toFixed(1)}s`); writeScore();
execSync(`ffmpeg -v error -y -i "${join(OUT, 'silt.wav')}" -c:a aac -b:a 192k -movflags +faststart "${join(OUT, 'silt.m4a')}"`);
console.log('wrote', join(OUT, 'silt.wav'), 'and silt.m4a');
