#!/usr/bin/env node
/**
 * LATHE — Birmingham-school techno after Surgeon. 134 BPM, A, 224 bars (~6:40).
 *
 * The method is the point (Sound on Sound "Generations": one programmed drum
 * pattern per track, a poly synth's two outputs used as two instruments — one
 * dry as the bass, one delayed a quarter bar with a mid EQ sweep — and the
 * arrangement performed on the desk: fader rides, EQ kills, sends, a compressor
 * across the master doing the shaping, dub reggae as the model). So here:
 *  - ONE drum loop for the whole track (909 + a metallic sampler loop). Nothing
 *    is "written" per section; the sections are mix moves: highpass sweeps,
 *    drive rides, a quarter-bar feedback send that runs away in the breakdown,
 *    bar-level mutes and kick dropouts.
 *  - The Poly-800 trick, literally: one JB202 render split into copy A (dry,
 *    lowpassed, saturated = the bass) and copy B (delayed a quarter bar,
 *    bandpass centre sweeping across each 16-bar phrase, a little feedback).
 *  - Turing-machine mutation (his modern setup): shift-register patterns for
 *    hat accents, the metal loop and the noise ticks mutate with a per-section
 *    flip probability — locked in the plateaus, restless in the transitions.
 *  - Industrial texture: JP9000 noise -> resonant lowpass -> vca "hiss ticks";
 *    Karplus-Strong "clank" hits; an 808 clap layered on the 909 clap.
 *
 * Run: node scripts/lathe/lathe.mjs   (SILT-style flags: LATHE_ONLY=mix, LATHE_STEMS=a,b, LATHE_BARS=32)
 * Out: <out>/lathe.wav / lathe.m4a / lathe-score.json / lathe-measure.json
 */
import { createHeadless } from '/Users/bart/Documents/code/vibeceo/jambot/headless.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const OUT = process.env.LATHE_OUT || '/private/tmp/claude-501/-Users-bart-Documents-code-hilma/0e14b480-fcb1-4623-b2af-57170299d75f/scratchpad/lathe';
mkdirSync(join(OUT, 'stems'), { recursive: true });
const BPM = 134, SR = 44100, BARS = +(process.env.LATHE_BARS || 224), STEPS = BARS * 16;
const BEAT = 60 / BPM, BAR = 4 * BEAT, STEP = BEAT / 4;
const ONLY = process.env.LATHE_ONLY, STEMS = process.env.LATHE_STEMS ? process.env.LATHE_STEMS.split(',') : null;

// ============================================================ FORM (mix moves, not pattern changes)
const SECTIONS = [['intro', 1, 16], ['loop a', 17, 48], ['loop b', 49, 80], ['strip', 81, 96], ['breakdown', 97, 112], ['return', 113, 144], ['plateau', 145, 176], ['subtract', 177, 208], ['outro', 209, 224]].map(([name, from, to]) => ({ name, from, to }));
const TARGET_RMS = { intro: -22, 'loop a': -14, 'loop b': -13, strip: -16, breakdown: -22, return: -12, plateau: -12.5, subtract: -15.5, outro: -23 };
const sec = (b) => SECTIONS.find(s => b >= s.from && b <= s.to).name;
const inRange = (b, a, z) => b >= a && b <= z;
const KICK_DROPOUTS = new Set([160, 176, 208]);          // kick out for one bar; the loop keeps turning
const FLIP_P = { intro: 0, 'loop a': 0.05, 'loop b': 0.12, strip: 0.2, breakdown: 0.3, return: 0.1, plateau: 0.15, subtract: 0.05, outro: 0 };

// ============================================================ TURING MACHINE (seeded, deterministic)
function lcg(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function turing(seed, density) { const rnd = lcg(seed); let reg = Array.from({ length: 16 }, () => rnd() < density ? 1 : 0); const perBar = [];
  for (let b = 1; b <= BARS; b++) { perBar.push(reg.slice()); const p = FLIP_P[sec(b)]; reg = reg.slice(1).concat(reg[0]); if (rnd() < p) reg[(rnd() * 16) | 0] ^= 1; if (rnd() < p * 0.5) reg[(rnd() * 16) | 0] ^= 1; }
  return perBar; }
const T_HAT = turing(11, 0.5), T_METAL = turing(23, 0.3), T_NOISE = turing(37, 0.35), T_CLANK = turing(41, 0.2);

// ============================================================ PATTERNS
const dB = (d) => Math.pow(10, d / 20);
const V = (db, accent = false) => ({ velocity: Math.min(1, dB(db)), accent });
const REST = { velocity: 0, accent: false };
const JT90_VOICES = ['kick', 'snare', 'clap', 'rimshot', 'lowtom', 'midtom', 'hitom', 'ch', 'oh', 'crash', 'ride'];
const mkDrums = (voices) => Object.fromEntries(voices.map(v => [v, Array.from({ length: STEPS }, () => ({ ...REST }))]));
const jt90 = mkDrums(JT90_VOICES);
const put = (pat, voice, bar, step, v) => { pat[voice][(bar - 1) * 16 + step] = v; };
const hum = (bar, step, range = 1.2) => ((Math.sin(bar * 12.9898 + step * 78.233) * 43758.5453) % 1) * range - range / 2;
const jbsAmber = {}, jbs808 = {};       // slot -> [{step, vel}] (absolute steps)
const hit = (kit, slot, bar, step, vel) => { (kit[slot] ||= []).push({ step: (bar - 1) * 16 + step, vel: Math.min(1, vel) }); };

for (let b = 1; b <= BARS; b++) {
  const s = sec(b), th = T_HAT[b - 1], tm = T_METAL[b - 1];
  const kickOn = inRange(b, 1, 220) && !KICK_DROPOUTS.has(b);
  const loopOn = inRange(b, 17, 216);                          // the one drum loop
  if (kickOn) for (const st of [0, 4, 8, 12]) put(jt90, 'kick', b, st, V(st === 0 ? 0 : -0.5, st === 0));
  if (b >= 9 && b <= 220) for (let st = 0; st < 16; st++) put(jt90, 'ch', b, st, V((th[st] ? -5 : -13) + hum(b, st)));                       // 16ths, Turing accents
  if (loopOn && b >= 49) for (const st of [2, 6, 10, 14]) put(jt90, 'oh', b, st, V(-13 + (st === 6 ? 2 : 0)));
  if (loopOn) for (const st of [3, 7, 10, 14]) put(jt90, 'rimshot', b, st, V(-5 + hum(b, st), st === 3));                                    // the metallic tick loop
  if (loopOn && b >= 49 && b % 2 === 1) put(jt90, 'lowtom', b, 15, V(-7, true));                                                                // thud pickup
  if (inRange(b, 113, 208)) for (const st of [4, 12]) put(jt90, 'clap', b, st, V(-3, true));
  if (inRange(b, 145, 192) && b % 8 !== 0) for (const st of [0, 2, 4, 6, 8, 10, 12, 14]) put(jt90, 'ride', b, st, V(st % 4 === 0 ? -13 : -16));
  // metal loop (amber kit): 2-bar cell + Turing-driven Synare hits; muted in the strip/breakdown except the wash
  const metalOn = inRange(b, 17, 80) || inRange(b, 113, 200);
  if (metalOn) { const cell = b % 2 === 1 ? [2, 9] : [6, 13]; for (const st of cell) hit(jbsAmber, 's9', b, st, dB(-3 + hum(b, st, 2)));
    if (b % 4 === 1) hit(jbsAmber, 's10', b, 0, dB(-6)); if (b % 2 === 0) hit(jbsAmber, 's3', b, 11, dB(-9));
    if (b >= 49) for (let st = 1; st < 16; st += 2) if (tm[st]) hit(jbsAmber, 's7', b, st, dB(-10 + hum(b, st, 2))); }
  if (inRange(b, 81, 96) && b % 4 === 1) hit(jbsAmber, 's8', b, 0, dB(-12));
  if (inRange(b, 97, 112) && b % 2 === 1) hit(jbsAmber, 's8', b, 0, dB(-5));
  // 808 kit: cowbell pulse, dry clap layer, a second hat timbre on the offbeat 16ths
  if (inRange(b, 113, 200)) hit(jbs808, 's10', b, 7, dB(-9));
  if (inRange(b, 113, 208)) for (const st of [4, 12]) hit(jbs808, 's3', b, st, dB(-6));
  if (inRange(b, 145, 192)) for (let st = 1; st < 16; st += 2) hit(jbs808, 's4', b, st, dB(-16 + (th[st] ? 4 : 0)));
}
// ---- Poly-800 stand-in: JB202 saw + sub-octave square on A2, held per bar (retrigger on bar starts)
const poly = Array.from({ length: STEPS }, () => ({ note: 'A2', gate: false, accent: false, slide: false }));
for (let b = 1; b <= BARS; b++) { if (!inRange(b, 17, 212)) continue; const note = inRange(b, 145, 176) && Math.floor((b - 145) / 8) % 2 === 1 ? 'G2' : 'A2';   // the one harmonic move: b7 every other 8 bars in the plateau
  for (let st = 0; st < 16; st++) poly[(b - 1) * 16 + st] = { note, gate: true, accent: st === 0, slide: st !== 0 }; }
// ---- JT10 (Nord/101-ish): a two-note pulse motif in the plateau, filtered
const lead = Array.from({ length: STEPS }, () => ({ note: 'A3', gate: false, accent: false, slide: false }));
for (let b = 145; b <= 200; b++) { const motif = [[0, 'A3', true], [3, 'A3', false], [6, 'G3', false], [10, 'A3', false], [13, 'E3', false]]; for (const [st, n, acc] of motif) lead[(b - 1) * 16 + st] = { note: b % 4 === 0 && st === 13 ? 'C4' : n, gate: true, accent: acc, slide: false }; }
// ---- JP9000 noise ticks + clank: Turing-driven 16ths (noise) / sparse (clank)
const noisePat = Array.from({ length: STEPS }, () => ({ note: 'A3', gate: false, accent: false, velocity: 1 }));
const clankPat = Array.from({ length: STEPS }, () => ({ note: 'A4', gate: false, accent: false, velocity: 1 }));
for (let b = 1; b <= BARS; b++) { const tn = T_NOISE[b - 1], tc = T_CLANK[b - 1];
  if (inRange(b, 33, 208)) for (let st = 0; st < 16; st++) if (tn[st]) noisePat[(b - 1) * 16 + st] = { note: 'A3', gate: true, accent: st % 4 === 0, velocity: st % 2 ? 0.55 : 0.9 };
  if (inRange(b, 113, 200)) for (let st = 0; st < 16; st++) if (tc[st] && st % 2 === 0) clankPat[(b - 1) * 16 + st] = { note: (b + st) % 3 === 0 ? 'E5' : 'A4', gate: true, accent: false, velocity: 0.8 }; }

// ============================================================ MIX LANES (per bar) — the desk performance
const laneBars = (fn) => Array.from({ length: BARS + 2 }, (_, i) => fn(Math.min(BARS, i + 1)));
const lerpIn = (b, from, to, a, z) => a + (z - a) * Math.max(0, Math.min(1, (b - from) / Math.max(1, to - from)));
const masterHP = laneBars((b) => ({ intro: lerpIn(b, 1, 16, 220, 40), breakdown: b <= 104 ? lerpIn(b, 97, 104, 60, 480) : lerpIn(b, 105, 112, 480, 60), outro: lerpIn(b, 209, 224, 40, 300) }[sec(b)] ?? 40));
const drive = laneBars((b) => ({ intro: 1.0, 'loop a': lerpIn(b, 17, 48, 1.15, 1.4), 'loop b': lerpIn(b, 49, 80, 1.4, 1.8), strip: 1.5, breakdown: 1.2, return: lerpIn(b, 113, 144, 1.9, 2.3), plateau: 2.4, subtract: lerpIn(b, 177, 208, 2.0, 1.4), outro: 1.1 }[sec(b)]));
const sendDly = laneBars((b) => ({ intro: 0, 'loop a': 0.06, 'loop b': lerpIn(b, 49, 80, 0.12, 0.2), strip: lerpIn(b, 81, 96, 0.3, 0.5), breakdown: 0.7, return: 0.12, plateau: 0.16, subtract: lerpIn(b, 177, 208, 0.2, 0.45), outro: 0.6 }[sec(b)]));
const dlyFb = laneBars((b) => ({ breakdown: lerpIn(b, 97, 112, 0.7, 0.93), strip: 0.6, outro: 0.85 }[sec(b)] ?? 0.45));
const bpCenter = laneBars((b) => { const ph = ((b - 1) % 16) / 16; const tri = ph < 0.5 ? ph * 2 : 2 - ph * 2; return 380 * Math.pow(2600 / 380, tri); });   // 380 -> 2600 -> 380 Hz across each 16 bars, log sweep
const polyA = laneBars((b) => ({ intro: -60, 'loop a': lerpIn(b, 17, 24, -14, 0), strip: lerpIn(b, 81, 88, -3, -60), breakdown: -60, return: lerpIn(b, 113, 114, -60, 0), subtract: b <= 192 ? 0 : -60, outro: -60 }[sec(b)] ?? 0));                                   // the dry bass copy (dB)
const polyB = laneBars((b) => ({ intro: -60, 'loop a': -60, 'loop b': lerpIn(b, 49, 56, -18, -2), strip: 0, breakdown: -8, return: -3, plateau: -2, subtract: -6, outro: -12 }[sec(b)]));      // the delayed, swept copy (dB)
const metalG = laneBars((b) => ({ 'loop a': lerpIn(b, 17, 32, -12, -3), 'loop b': -2, return: -1, plateau: 0, subtract: lerpIn(b, 177, 200, -2, -14) }[sec(b)] ?? -60));
const noiseG = laneBars((b) => ({ 'loop a': lerpIn(b, 33, 48, -20, -8), 'loop b': -6, strip: -4, breakdown: -3, return: -6, plateau: -5, subtract: -9, outro: -60, intro: -60 }[sec(b)]));
const clankG = laneBars((b) => ({ return: -6, plateau: -4, subtract: lerpIn(b, 177, 200, -6, -20) }[sec(b)] ?? -60));
const leadG = laneBars((b) => ({ plateau: lerpIn(b, 145, 152, -16, -6), subtract: lerpIn(b, 177, 200, -8, -22) }[sec(b)] ?? -60));
const drumsG = laneBars((b) => ({ intro: lerpIn(b, 1, 16, -6, -1), strip: -3, breakdown: -4, return: 1.5, plateau: 2, subtract: lerpIn(b, 177, 208, 1, -3), outro: lerpIn(b, 209, 224, -4, -14) }[sec(b)] ?? 0));
const pumpThr = laneBars((b) => ({ return: -11, plateau: -11, 'loop b': -14 }[sec(b)] ?? -13));

// ============================================================ STEMS (one session each)
const stemPath = (n) => join(OUT, 'stems', `${n}.wav`);
const newSession = async () => { const jb = await createHeadless({ bpm: BPM, outputDir: OUT }); await jb.tool('set_swing', { amount: 0 }); return jb; };
const JT90_LEVELS = { kick: 2, rimshot: -4, lowtom: -6, ch: -10, oh: -14, ride: -16, clap: -8 };
async function setupJT90(jb, { kickOnly = false, noKick = false } = {}) {
  await jb.tool('tweak_jt90', { voice: 'kick', tune: 0, decay: 46, attack: 45, sweep: 50, level: JT90_LEVELS.kick });          // A1, hard, short
  await jb.tool('tweak_jt90', { voice: 'rimshot', tune: -3, decay: 14, level: JT90_LEVELS.rimshot });
  await jb.tool('tweak_jt90', { voice: 'lowtom', tune: -4, decay: 30, level: JT90_LEVELS.lowtom });
  await jb.tool('tweak_jt90', { voice: 'ch', tune: 2, decay: 9, tone: 75, level: JT90_LEVELS.ch });
  await jb.tool('tweak_jt90', { voice: 'oh', tune: 1, decay: 14, tone: 60, level: JT90_LEVELS.oh });
  await jb.tool('tweak_jt90', { voice: 'ride', decay: 35, level: JT90_LEVELS.ride });
  await jb.tool('tweak_jt90', { voice: 'clap', decay: 14, tone: 45, level: JT90_LEVELS.clap });
  if (!kickOnly) { await jb.tool('add_effect', { target: 'jt90.clap', effect: 'reverb', decay: 1.3, damping: 35, mix: 28, predelay: 8, size: 45 }); await jb.tool('add_effect', { target: 'jt90.rimshot', effect: 'reverb', decay: 0.7, damping: 60, mix: 12, predelay: 4, size: 25 }); }
  jb.session._nodes.jt90.setPattern(Object.fromEntries(JT90_VOICES.map(v => [v, (kickOnly && v !== 'kick') || (noKick && v === 'kick') ? jt90[v].map(() => ({ ...REST })) : jt90[v]])));
}
async function setupJBS(jb, kit, hits, tweaks) { await jb.tool('load_jbs_kit', { kit }); for (const [slot, t] of Object.entries(tweaks)) await jb.tool('tweak_jbs', { slot, ...t });
  const input = {}; for (const [slot, list] of Object.entries(hits)) input[slot] = list; input.bars = BARS; await jb.tool('add_jbs', input); }
async function setupPoly(jb) { await jb.tool('tweak_jb202', { osc1Waveform: 'sawtooth', osc1Level: 100, osc2Waveform: 'square', osc2Octave: -12, osc2Level: 55, osc2Detune: 4, filterCutoff: 1800, filterResonance: 12, filterEnvAmount: 0, ampAttack: 6, ampDecay: 30, ampSustain: 92, ampRelease: 30, drive: 30 }); jb.session._nodes.jb202.setPattern(poly); await jb.tool('tweak', { path: 'jb202.level', value: -4 }); }
async function setupLead(jb) { await jb.tool('tweak_jt10', { sawLevel: 70, pulseLevel: 60, pulseWidth: 35, subLevel: 0, filterCutoff: 900, filterResonance: 30, filterEnvAmount: 45, ampAttack: 0, ampDecay: 30, ampSustain: 20, ampRelease: 15, filterDecay: 25, glideTime: 0, level: -8 }); await jb.tool('add_effect', { target: 'jt10', effect: 'delay', mode: 'pingpong', sync: '8th', feedback: 45, mix: 30, lowcut: 300, highcut: 5000 }); jb.session._nodes.jt10.setPattern(lead); }
async function setupNoise(jb) { await jb.tool('add_jp9000', { preset: 'empty' }); for (const [t, id] of [['noise', 'n1'], ['filter-lp24', 'f1'], ['env-adsr', 'e1'], ['vca', 'v1']]) await jb.tool('add_module', { type: t, id });
  for (const [a, b] of [['n1.audio', 'f1.audio'], ['e1.cv', 'f1.cutoffCV'], ['f1.audio', 'v1.audio'], ['e1.cv', 'v1.cv']]) await jb.tool('connect_modules', { from: a, to: b });
  await jb.tool('set_jp9000_output', { module: 'v1' }); await jb.tool('set_trigger_modules', { modules: ['e1'] });
  for (const [m, p, v] of [['f1', 'cutoff', 2400], ['f1', 'resonance', 72], ['f1', 'envAmount', 50], ['e1', 'attack', 0], ['e1', 'decay', 12], ['e1', 'sustain', 0], ['e1', 'release', 8], ['v1', 'gain', 0.5]]) await jb.tool('tweak_module', { module: m, param: p, value: v });
  await jb.tool('add_jp9000_pattern', { pattern: noisePat }); if (jb.session._nodes.jp9000._pattern?.length !== STEPS) jb.session._nodes.jp9000._pattern = noisePat; await jb.tool('tweak', { path: 'jp9000.level', value: -4 }); }
async function setupClank(jb) { await jb.tool('add_jp9000', { preset: 'empty' }); for (const [t, id] of [['string', 's1'], ['drive', 'd1']]) await jb.tool('add_module', { type: t, id }); await jb.tool('connect_modules', { from: 's1.audio', to: 'd1.audio' }); await jb.tool('set_jp9000_output', { module: 'd1' }); await jb.tool('set_trigger_modules', { modules: ['s1'] });
  for (const [m, p, v] of [['s1', 'decay', 22], ['s1', 'brightness', 88], ['d1', 'amount', 45], ['d1', 'type', 1]]) await jb.tool('tweak_module', { module: m, param: p, value: v });
  await jb.tool('add_jp9000_pattern', { pattern: clankPat }); if (jb.session._nodes.jp9000._pattern?.length !== STEPS) jb.session._nodes.jp9000._pattern = clankPat; await jb.tool('tweak', { path: 'jp9000.level', value: -6 }); }
const STEM_SETUP = {
  kick: (jb) => setupJT90(jb, { kickOnly: true }), perc909: (jb) => setupJT90(jb, { noKick: true }),
  metal: (jb) => setupJBS(jb, 'amber', jbsAmber, { s9: { decay: 40, tune: -3 }, s10: { decay: 55, tune: -5 }, s3: { decay: 30, tune: -7 }, s7: { decay: 35, tune: -2, filter: 6000 }, s8: { decay: 100, tune: -4 } }),
  eight08: (jb) => setupJBS(jb, '808', jbs808, { s10: { decay: 60, tune: -2 }, s3: { decay: 100 }, s4: { decay: 40 } }),
  poly: setupPoly, lead: setupLead, noise: setupNoise, clank: setupClank,
};
async function renderStems() { const t0 = Date.now(); for (const [name, setup] of Object.entries(STEM_SETUP)) { if (STEMS && !STEMS.includes(name)) continue; const tt = Date.now(); const jb = await newSession(); await setup(jb); await jb.render(stemPath(name), BARS); console.log(`  ${name} stem ${((Date.now() - tt) / 1000).toFixed(1)}s`); } console.log(`stems rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s`); }

// ============================================================ DSP
function readWav(p) { const b = readFileSync(p); let q = 12, fmt = null, off = 0, len = 0; while (q + 8 <= b.length) { const id = b.toString('ascii', q, q + 4), n = b.readUInt32LE(q + 4); if (id === 'fmt ') fmt = { tag: b.readUInt16LE(q + 8), ch: b.readUInt16LE(q + 10), sr: b.readUInt32LE(q + 12), bits: b.readUInt16LE(q + 22) }; if (id === 'data') { off = q + 8; len = Math.min(n, b.length - off); break; } q += 8 + n + (n & 1); }
  const { ch, bits, tag } = fmt, bps = bits / 8, frames = Math.floor(len / (bps * ch)); const L = new Float32Array(frames), R = new Float32Array(frames);
  for (let i = 0; i < frames; i++) { const rd = (c) => { const o = off + (i * ch + c) * bps; return tag === 3 ? b.readFloatLE(o) : bits === 16 ? b.readInt16LE(o) / 32768 : b.readInt32LE(o) / 2147483648; }; L[i] = rd(0); R[i] = ch > 1 ? rd(1) : L[i]; } return { L, R, sr: fmt.sr }; }
function writeWav(p, L, R, sr = SR) { const n = L.length; const b = Buffer.alloc(44 + n * 4); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40); for (let i = 0; i < n; i++) { b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4); b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4); } writeFileSync(p, b); }
const laneAt = (lane, i) => { const t = i / SR / BAR; const b = Math.floor(t); const f = t - b; const a = lane[Math.min(lane.length - 1, b)], z = lane[Math.min(lane.length - 1, b + 1)]; return a + (z - a) * f; };
function biq(type, f0, Q = 0.707) { const w = 2 * Math.PI * f0 / SR, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * Q), a0 = 1 + al; let b0, b1, b2; if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; } else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; } else { b0 = al; b1 = 0; b2 = -al; } return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: -2 * cs / a0, a2: (1 - al) / a0 }; }
function runBiquad(x, coefFn) { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0, c = coefFn(0); for (let i = 0; i < x.length; i++) { if ((i & 63) === 0) c = coefFn(i); const v = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; }
const filtStatic = (x, type, f, Q) => { const c = biq(type, f, Q); return runBiquad(x, () => c); };
const rmsW = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
// quarter-bar feedback delay (dub send), lane-driven feedback, lowpass in the loop
function fbDelay(inL, inR, steps = 4, lp = 2400) { const n = inL.length, d = Math.round(steps * STEP * SR); const bufL = new Float32Array(d), bufR = new Float32Array(d); let w = 0, zl = 0, zr = 0; const a = Math.exp(-2 * Math.PI * lp / SR); const oL = new Float32Array(n), oR = new Float32Array(n);
  for (let i = 0; i < n; i++) { const fb = laneAt(dlyFb, i); const rl = bufL[w], rr = bufR[w]; zl = a * zl + (1 - a) * rl; zr = a * zr + (1 - a) * rr; bufL[w] = inL[i] + Math.tanh(zr * fb * 1.15) / 1.15; bufR[w] = inR[i] + Math.tanh(zl * fb * 1.15) / 1.15; oL[i] = rl; oR[i] = rr; w = (w + 1) % d; } return { L: oL, R: oR }; }
function pump(L, R, thrLane, ratio = 3, att = 0.003, rel = 0.07) { const n = L.length, aA = Math.exp(-1 / (att * SR)), aR = Math.exp(-1 / (rel * SR)); let env = 0, maxGR = 0; for (let i = 0; i < n; i++) { const x = Math.max(Math.abs(L[i]), Math.abs(R[i])); env = x > env ? aA * env + (1 - aA) * x : aR * env + (1 - aR) * x; const thr = dB(laneAt(thrLane, i)); let g = 1; if (env > thr) { const over = 20 * Math.log10(env / thr), gr = over - over / ratio; g = dB(-gr); if (gr > maxGR) maxGR = gr; } L[i] *= g; R[i] *= g; } return maxGR; }
function glue(L, R, thrDb = -11, ratio = 1.7, att = 0.02, rel = 0.15) { const n = L.length, aA = Math.exp(-1 / (att * SR)), aR = Math.exp(-1 / (rel * SR)); let env = 0, maxGR = 0; const thr = dB(thrDb); for (let i = 0; i < n; i++) { const x = Math.max(Math.abs(L[i]), Math.abs(R[i])); env = x > env ? aA * env + (1 - aA) * x : aR * env + (1 - aR) * x; let g = 1; if (env > thr) { const over = 20 * Math.log10(env / thr), gr = over - over / ratio; g = dB(-gr); if (gr > maxGR) maxGR = gr; } L[i] *= g; R[i] *= g; } return maxGR; }
function driveLane(L, R) { for (let i = 0; i < L.length; i++) { const d = laneAt(drive, i), k = Math.tanh(d); L[i] = Math.tanh(L[i] * d) / k; R[i] = Math.tanh(R[i] * d) / k; } }
function limiter(L, R, ceiling = 0.89) { const n = L.length, look = 48; const rel = Math.exp(-1 / (0.05 * SR)); let g = 1; const oL = new Float32Array(n), oR = new Float32Array(n); for (let i = 0; i < n; i++) { let pk = 0; for (let k = 0; k < look && i + k < n; k++) { const v = Math.max(Math.abs(L[i + k]), Math.abs(R[i + k])); if (v > pk) pk = v; } const want = pk > ceiling ? ceiling / pk : 1; g = want < g ? want : rel * g + (1 - rel) * want; oL[i] = L[i] * g; oR[i] = R[i] * g; } return { L: oL, R: oR }; }
function pinkNoise(n, seed = 7) { let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; }; let b0 = 0, b1 = 0, b2 = 0; const out = new Float32Array(n); for (let i = 0; i < n; i++) { const wn = rnd(); b0 = 0.99765 * b0 + wn * 0.099046; b1 = 0.96300 * b1 + wn * 0.2965164; b2 = 0.57000 * b2 + wn * 1.0526913; out[i] = (b0 + b1 + b2 + wn * 0.1848) * 0.11; } return out; }

// ============================================================ MIX (the desk)
// gain-staging reference window per stem: bars where that stem is fully playing
const REF_DEFAULT = BARS >= 136 ? { from: 121, to: 136 } : { from: Math.max(1, BARS - 8), to: BARS };
const REF_OF = { lead: { from: 153, to: 168 }, clank: { from: 121, to: 136 } };
const STEM_TARGET = { kick: -14, perc909: -17, metal: -21, eight08: -24, poly: -13, lead: -22, noise: -27, clank: -25 };
const stemRms = (S, from, to) => { const a = Math.round((from - 1) * BAR * SR), z = Math.min(S.L.length, Math.round(to * BAR * SR)); let e = 0; for (let i = a; i < z; i++) { const m = 0.5 * (S.L[i] + S.R[i]); e += m * m; } return 20 * Math.log10(Math.sqrt(e / (z - a)) + 1e-9); };
function mix() {
  const S = Object.fromEntries(Object.keys(STEM_SETUP).map(n => [n, readWav(stemPath(n))]));
  const n = Math.min(...Object.values(S).map(s => s.L.length)); const out = { L: new Float32Array(n), R: new Float32Array(n) };
  const trim = {}; for (const [name, st] of Object.entries(S)) { const ref = BARS >= 168 ? (REF_OF[name] || REF_DEFAULT) : REF_DEFAULT; const r = stemRms(st, ref.from, ref.to); if (r < -90) { console.log(`  stem ${name.padEnd(8)} is SILENT in bars ${ref.from}-${ref.to} — check its render`); trim[name] = 0; continue; } trim[name] = dB(STEM_TARGET[name] - r); console.log(`  stem ${name.padEnd(8)} ref RMS ${r.toFixed(1)} dBFS -> trim ${(STEM_TARGET[name] - r).toFixed(1)} dB`); }
  const addLane = (src, g0, lane, dst = out) => { for (let i = 0; i < n; i++) { const g = g0 * (lane ? dB(laneAt(lane, i)) : 1); dst.L[i] += src.L[i] * g; dst.R[i] += src.R[i] * g; } };
  // drum bus: kick + 909 + metal + 808, with the quarter-bar send
  const drums = { L: new Float32Array(n), R: new Float32Array(n) };
  addLane(S.kick, trim.kick, null, drums);
  addLane({ L: filtStatic(S.perc909.L, 'hp', 80), R: filtStatic(S.perc909.R, 'hp', 80) }, trim.perc909, null, drums);
  addLane({ L: filtStatic(S.metal.L, 'hp', 120), R: filtStatic(S.metal.R, 'hp', 120) }, trim.metal, metalG, drums);
  addLane({ L: filtStatic(S.eight08.L, 'hp', 150), R: filtStatic(S.eight08.R, 'hp', 150) }, trim.eight08, null, drums);
  addLane({ L: filtStatic(S.noise.L, 'hp', 600), R: filtStatic(S.noise.R, 'hp', 600) }, trim.noise, noiseG, drums);
  addLane(S.clank, trim.clank, clankG, drums);
  // send: everything on the drum bus except the kick's weight goes to the feedback delay
  const sendIn = { L: filtStatic(drums.L, 'hp', 200), R: filtStatic(drums.R, 'hp', 200) }; for (let i = 0; i < n; i++) { const g = laneAt(sendDly, i); sendIn.L[i] *= g; sendIn.R[i] *= g; }
  const wet = fbDelay(sendIn.L, sendIn.R, 4, 2400);
  addLane(drums, 1, drumsG); addLane(wet, dB(-2), drumsG);
  // the Poly-800 trick: copy A = dry bass (lowpassed, saturated, mono); copy B = delayed a quarter bar, bandpass swept, a little feedback
  { const m = new Float32Array(n); for (let i = 0; i < n; i++) m[i] = 0.5 * (S.poly.L[i] + S.poly.R[i]) * trim.poly; const bass = filtStatic(m, 'lp', 340, 0.8); for (let i = 0; i < n; i++) bass[i] = Math.tanh(bass[i] * 2.2) / Math.tanh(2.2);
    addLane({ L: bass, R: bass }, 1, polyA);
    const d = Math.round(4 * STEP * SR); const delayed = new Float32Array(n); for (let i = d; i < n; i++) delayed[i] = m[i - d] + 0.35 * (delayed[i - d] || 0);
    const swept = runBiquad(delayed, (i) => biq('bp', laneAt(bpCenter, i), 2.2)); const sL = new Float32Array(n), sR = new Float32Array(n); const off = Math.round(0.011 * SR); for (let i = 0; i < n; i++) { sL[i] = swept[i] * 2.6; sR[i] = (swept[i - off] || 0) * 2.6; }
    addLane({ L: sL, R: sR }, 1, polyB); }
  addLane(S.lead, trim.lead, leadG);
  { const pk = pinkNoise(n); for (let i = 0; i < n; i++) { out.L[i] += pk[i] * dB(-58); out.R[i] += pk[(i + 977) % n] * dB(-58); } }
  // master: highpass performance, the pumping compressor, the drive ride, glue, limiter
  out.L = runBiquad(out.L, (i) => biq('hp', laneAt(masterHP, i), 0.75)); out.R = runBiquad(out.R, (i) => biq('hp', laneAt(masterHP, i), 0.75));
  const gr1 = pump(out.L, out.R, pumpThr); driveLane(out.L, out.R); const gr2 = glue(out.L, out.R);
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out.L[i]), Math.abs(out.R[i])); for (let i = 0; i < n; i++) { out.L[i] *= dB(-1) / peak; out.R[i] *= dB(-1) / peak; }
  const lim = limiter(out.L, out.R, dB(-1)); writeWav(join(OUT, 'lathe.wav'), lim.L, lim.R);
  console.log(`mix: ${n / SR / 60 | 0}m${Math.round(n / SR % 60)}s, pump max GR ${gr1.toFixed(1)} dB, glue max GR ${gr2.toFixed(1)} dB, pre-limiter peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS`);
  return lim;
}
function measure(M) { const n = M.L.length, rows = []; const secStats = {};
  for (let b = 1; b <= BARS; b += 8) { const a = Math.round((b - 1) * BAR * SR), z = Math.min(n, Math.round((b + 7) * BAR * SR)); const seg = new Float32Array(z - a); for (let i = a; i < z; i++) seg[i - a] = 0.5 * (M.L[i] + M.R[i]); const r = (x) => 20 * Math.log10(rmsW(x, 0, x.length) + 1e-9); const st = { rms: r(seg), lo: r(filtStatic(seg, 'lp', 120)), mid: r(filtStatic(filtStatic(seg, 'lp', 2500), 'hp', 300)), hi: r(filtStatic(seg, 'hp', 4000)) }; const s = sec(b); const target = b >= 217 ? -40 : TARGET_RMS[s]; rows.push({ bar: b, section: s, ...Object.fromEntries(Object.entries(st).map(([k, v]) => [k, +v.toFixed(1)])), target }); (secStats[s] ||= []).push(st.rms); }
  console.log('\nbar  section    rms    lo    mid    hi  | target  Δ'); for (const r of rows) console.log(`${String(r.bar).padStart(3)}  ${r.section.padEnd(9)} ${r.rms.toFixed(1).padStart(6)} ${r.lo.toFixed(1).padStart(5)} ${r.mid.toFixed(1).padStart(6)} ${r.hi.toFixed(1).padStart(5)}  | ${String(r.target).padStart(5)}  ${(r.rms - r.target).toFixed(1).padStart(5)}`);
  console.log('section means vs targets:', Object.entries(secStats).map(([s, v]) => `${s} ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}/${TARGET_RMS[s]}`).join('  '));
  writeFileSync(join(OUT, 'lathe-measure.json'), JSON.stringify({ bpm: BPM, bars: BARS, rows, targets: TARGET_RMS }, null, 1)); }
function writeScore() { writeFileSync(join(OUT, 'lathe-score.json'), JSON.stringify({ title: 'lathe', bpm: BPM, key: 'A', barSeconds: BAR, bars: BARS, sections: SECTIONS, kickDropouts: [...KICK_DROPOUTS], flipP: FLIP_P })); }

if (ONLY !== 'mix') await renderStems();
let tm = Date.now(); const master = mix(); console.log(`mix stage ${((Date.now() - tm) / 1000).toFixed(1)}s`); measure(master); writeScore();
execSync(`ffmpeg -v error -y -i "${join(OUT, 'lathe.wav')}" -c:a aac -b:a 192k -movflags +faststart "${join(OUT, 'lathe.m4a')}"`);
console.log('wrote', join(OUT, 'lathe.wav'), 'and lathe.m4a');
