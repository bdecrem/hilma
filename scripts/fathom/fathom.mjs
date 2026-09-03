#!/usr/bin/env node
/**
 * FATHOM — dub techno, straight down the middle. 122 BPM, A minor, 208 bars (6:49).
 *
 * Six elements: 909 kick, a sub bass figure, ONE chord voice, 909 hats, a rim,
 * and a sparse bell ping. Two chord vamps (Am9/Fmaj9; Dm9 arrives at bar 113),
 * two stab patterns (A: the "and" of 1 and 3; B: the skank), two bass patterns,
 * swing on the ghost hats, a real dub drop at 81 with a one-bar hole at 88.
 * The chord is heard mostly through its echoes: chorus -> lowpass -> ping-pong
 * 3/16 delay with the lowpass inside the loop. No saturation stage, no pumping
 * compressor; a 2:1 glue and a limiter.
 *
 * Run: node scripts/fathom/fathom.mjs   (FATHOM_ONLY=mix, FATHOM_STEMS=a,b, FATHOM_BARS=32)
 */
import { createHeadless } from '/Users/bart/Documents/code/vibeceo/jambot/headless.js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const OUT = process.env.FATHOM_OUT || '/private/tmp/claude-501/-Users-bart-Documents-code-hilma/0e14b480-fcb1-4623-b2af-57170299d75f/scratchpad/fathom';
mkdirSync(join(OUT, 'stems'), { recursive: true });
const BPM = 122, SR = 44100, BARS = +(process.env.FATHOM_BARS || 208), STEPS = BARS * 16;
const BEAT = 60 / BPM, BAR = 4 * BEAT, STEP = BEAT / 4;
const ONLY = process.env.FATHOM_ONLY, STEMS = process.env.FATHOM_STEMS ? process.env.FATHOM_STEMS.split(',') : null;
const SWING = 26;

// ============================================================ FORM
const SECTIONS = [['intro', 1, 16], ['groove 1', 17, 64], ['hook', 65, 80], ['drop', 81, 88], ['return', 89, 96], ['groove 2', 97, 144], ['groove 3', 145, 176], ['outro', 177, 208]].map(([name, from, to]) => ({ name, from, to }));
const sec = (b) => SECTIONS.find(s => b >= s.from && b <= s.to).name;
const inRange = (b, a, z) => b >= a && b <= z;
const TARGET_RMS = { intro: -22, 'groove 1': -15, hook: -14, drop: -22, return: -14, 'groove 2': -13.5, 'groove 3': -15, outro: -24 };
// chords: 8-bar vamp Am9 (4) / Fmaj9 (4); bars 113-128 vamp Am9 / Dm9
const CHORD = { Am9: { root: 'A3', shape: 'm9', bass: 'A1', bassUp: 'A2', fifth: 'E2' }, Fmaj9: { root: 'F3', shape: 'maj9', bass: 'F1', bassUp: 'F2', fifth: 'C2' }, Dm9: { root: 'D3', shape: 'm9', bass: 'D2', bassUp: 'D2', fifth: 'A2' } };
const SHAPES = { m9: [0, 3, 10, 14], maj9: [0, 4, 11, 14] };
const chordAt = (b) => ((b - 1) % 8) < 4 ? 'Am9' : (inRange(b, 113, 128) ? 'Dm9' : 'Fmaj9');
const stabPattern = (b) => (inRange(b, 65, 80) || inRange(b, 89, 144)) ? 'B' : 'A';     // A: [2,10]  B: skank [2,6,10,14]
const bassPattern = (b) => (inRange(b, 65, 80) || inRange(b, 89, 144)) ? 'B' : 'A';
const KICK_OUT = (b) => inRange(b, 81, 88) || b === 128 || b >= 193 || b === 0;
const HOLE = (b) => b === 88;                                                                // one bar of only the delay tail

// ============================================================ PATTERNS
const dB = (d) => Math.pow(10, d / 20);
const V = (db, accent = false) => ({ velocity: Math.min(1, dB(db)), accent });
const REST = { velocity: 0, accent: false };
const JT90_VOICES = ['kick', 'snare', 'clap', 'rimshot', 'lowtom', 'midtom', 'hitom', 'ch', 'oh', 'crash', 'ride'];
const jt90 = Object.fromEntries(JT90_VOICES.map(v => [v, Array.from({ length: STEPS }, () => ({ ...REST }))]));
const put = (voice, bar, step, v) => { jt90[voice][(bar - 1) * 16 + step] = v; };
const hum = (bar, step, range = 1.5) => ((Math.sin(bar * 12.9898 + step * 78.233) * 43758.5453) % 1) * range - range / 2;
for (let b = 1; b <= BARS; b++) {
  const s = sec(b);
  if (!KICK_OUT(b) && !HOLE(b)) for (const st of [0, 4, 8, 12]) put('kick', b, st, V(st === 0 ? 0 : -0.4, st === 0));
  const hatsOn = b >= 9 && b <= 192 && !HOLE(b); const ghostsOnly = s === 'intro' || s === 'drop' || (s === 'groove 3' && b >= 161);
  if (hatsOn) { if (!ghostsOnly) for (const st of [2, 6, 10, 14]) put('ch', b, st, V((st === 2 || st === 10 ? -7 : -9) + hum(b, st, 1.2)));
    for (const st of [3, 7, 11, 15]) put('ch', b, st, V(-18 + hum(b, st, 2) + (ghostsOnly ? -4 : 0))); }
  const ohEvery = (inRange(b, 33, 64) || inRange(b, 145, 160)) ? 2 : (inRange(b, 65, 80) || inRange(b, 89, 144)) ? 1 : 0;
  if (ohEvery && b % ohEvery === 0 && !HOLE(b)) put('oh', b, 8, V(-12));
  if (b >= 25 && b <= 184 && !inRange(b, 81, 88) && !HOLE(b)) { for (const st of [7, 15]) put('rimshot', b, st, V(-11 + hum(b, st))); if (inRange(b, 113, 144)) put('rimshot', b, 3, V(-14)); }
}
// bass (JB202): held root; pattern B adds the octave bounce and the fifth
const bass = Array.from({ length: STEPS }, () => ({ note: 'A1', gate: false, accent: false, slide: false }));
const N = (b, st, note, len, accent = false) => { for (let k = 0; k < len; k++) bass[(b - 1) * 16 + st + k] = { note, gate: true, accent: accent && k === 0, slide: k > 0 }; };
for (let b = 17; b <= 184; b++) { if (inRange(b, 81, 88) || HOLE(b) || b === 128) continue; const c = CHORD[chordAt(b)];
  N(b, 0, c.bass, 3, true); N(b, 8, c.bass, 2);
  if (bassPattern(b) === 'B') { N(b, 10, c.bassUp, 1); N(b, 14, c.fifth, 1); } }
// chord (JP9000, two voicings): pattern A on the "and" of 1 and 3, pattern B the skank
const chord = Array.from({ length: STEPS }, () => ({ note: 'A3', gate: false, accent: false, velocity: 1 }));
for (let b = 1; b <= BARS; b++) { if (HOLE(b)) continue; const c = CHORD[chordAt(b)]; const steps = stabPattern(b) === 'B' ? [2, 6, 10, 14] : [2, 10];
  for (const st of steps) chord[(b - 1) * 16 + st] = { note: c.root, gate: true, accent: st === 2, velocity: (st === 6 || st === 14) ? 0.7 : 1 }; }
// ping (JP9000 string): a three-note figure on the first bar of Am9 blocks, in the hook and groove 2 only
const ping = Array.from({ length: STEPS }, () => ({ note: 'E5', gate: false, accent: false, velocity: 1 }));
for (const b of [73, 97, 105, 113, 121, 129, 137]) { for (const [st, n] of [[0, 'E5'], [6, 'C5'], [12, 'B4']]) ping[(b - 1) * 16 + st] = { note: n, gate: true, accent: st === 0, velocity: st === 0 ? 0.9 : 0.7 }; }

// ============================================================ LANES (per bar)
const laneBars = (fn) => Array.from({ length: BARS + 2 }, (_, i) => fn(Math.min(BARS, i + 1)));
const lerpIn = (b, from, to, a, z) => a + (z - a) * Math.max(0, Math.min(1, (b - from) / Math.max(1, to - from)));
const kickG = laneBars((b) => ({ intro: lerpIn(b, 1, 16, -9, -2), return: 0.5, 'groove 2': 0.5, outro: -3 }[sec(b)] ?? 0));
const chordDry = laneBars((b) => ({ intro: -60, 'groove 1': lerpIn(b, 25, 32, -14, 0), drop: 1, outro: -60 }[sec(b)] ?? 0));
const chordLP = laneBars((b) => ({ intro: 520, 'groove 1': lerpIn(b, 33, 64, 640, 1100), hook: 1250, drop: lerpIn(b, 81, 88, 1000, 520), return: 1250, 'groove 2': lerpIn(b, 97, 144, 1200, 1500), 'groove 3': lerpIn(b, 145, 176, 1200, 800), outro: 560 }[sec(b)]));
const dlyFb = laneBars((b) => ({ intro: 0.86, 'groove 1': 0.66, hook: 0.7, drop: 0.86, return: 0.62, 'groove 2': 0.7, 'groove 3': 0.72, outro: 0.86 }[sec(b)]));
const dlyLP = laneBars((b) => ({ drop: 1800, outro: 1800, intro: 2200 }[sec(b)] ?? 2800));
const wetG = laneBars((b) => ({ intro: 1, drop: 3, outro: 1 }[sec(b)] ?? -1));
const bassG = laneBars((b) => ({ 'groove 1': lerpIn(b, 17, 24, -8, 0), outro: b <= 184 ? -3 : -60 }[sec(b)] ?? 0));
const percG = laneBars((b) => ({ intro: -6, drop: -5, outro: lerpIn(b, 177, 192, -2, -10) }[sec(b)] ?? 0));
const crackleG = laneBars((b) => dB((sec(b) === 'intro' || sec(b) === 'outro' || sec(b) === 'drop') ? -38 : -48));

// ============================================================ STEMS
const stemPath = (n) => join(OUT, 'stems', `${n}.wav`);
const newSession = async (swing = 0) => { const jb = await createHeadless({ bpm: BPM, outputDir: OUT }); await jb.tool('set_swing', { amount: swing }); return jb; };
async function setupDrums(jb, { kickOnly = false, noKick = false } = {}) {
  await jb.tool('tweak_jt90', { voice: 'kick', tune: 0, decay: 52, attack: 22, sweep: 45, level: 1 });
  await jb.tool('tweak_jt90', { voice: 'ch', tune: 0, decay: 9, tone: 55, level: -10 });
  await jb.tool('tweak_jt90', { voice: 'oh', tune: 0, decay: 20, tone: 50, level: -13 });
  await jb.tool('tweak_jt90', { voice: 'rimshot', tune: -4, decay: 10, level: -8 });
  if (!kickOnly) await jb.tool('add_effect', { target: 'jt90.rimshot', effect: 'reverb', decay: 1.4, damping: 55, mix: 18, predelay: 10, size: 40 });
  jb.session._nodes.jt90.setPattern(Object.fromEntries(JT90_VOICES.map(v => [v, (kickOnly && v !== 'kick') || (noKick && v === 'kick') ? jt90[v].map(() => ({ ...REST })) : jt90[v]])));
}
async function setupBass(jb) { await jb.tool('tweak_jb202', { osc1Waveform: 'sine', osc1Level: 100, osc2Waveform: 'triangle', osc2Octave: 12, osc2Level: 22, filterCutoff: 300, filterResonance: 0, filterEnvAmount: 0, ampAttack: 4, ampDecay: 30, ampSustain: 80, ampRelease: 18, drive: 5 }); jb.session._nodes.jb202.setPattern(bass); await jb.tool('tweak', { path: 'jb202.level', value: -4 }); }
async function setupChord(jb, shape) { await jb.tool('add_jp9000', { preset: 'empty' }); const iv = SHAPES[shape];
  for (const [id, k, det] of [['o1', 0, -6], ['o2', 1, 5], ['o3', 2, -4], ['o4', 3, 7]]) { await jb.tool('add_module', { type: 'osc-saw', id }); if (iv[k]) await jb.tool('tweak_module', { module: id, param: 'octave', value: iv[k] }); await jb.tool('tweak_module', { module: id, param: 'detune', value: det }); }
  for (const [t, id] of [['mixer', 'mx'], ['filter-lp24', 'f'], ['env-adsr', 'e'], ['lfo', 'l'], ['vca', 'v']]) await jb.tool('add_module', { type: t, id });
  for (const [a, b] of [['o1.audio', 'mx.in1'], ['o2.audio', 'mx.in2'], ['o3.audio', 'mx.in3'], ['o4.audio', 'mx.in4'], ['mx.audio', 'f.audio'], ['e.cv', 'f.cutoffCV'], ['l.cv', 'f.cutoffCV'], ['f.audio', 'v.audio'], ['e.cv', 'v.cv']]) await jb.tool('connect_modules', { from: a, to: b });
  await jb.tool('set_jp9000_output', { module: 'v' }); await jb.tool('set_trigger_modules', { modules: ['o1', 'o2', 'o3', 'o4', 'e'] });
  for (const [m, p, v] of [['mx', 'master', 0.5], ['f', 'cutoff', 620], ['f', 'resonance', 14], ['f', 'envAmount', 28], ['e', 'attack', 2], ['e', 'decay', 45], ['e', 'sustain', 25], ['e', 'release', 45], ['v', 'gain', 0.5], ['l', 'rate', 0.11], ['l', 'depth', 25]]) await jb.tool('tweak_module', { module: m, param: p, value: v });
  await jb.tool('add_effect', { target: 'jp9000', effect: 'reverb', decay: 2.6, damping: 60, mix: 12, predelay: 15, size: 65, width: 100 });
  const pat = chord.map((st, i) => (st.gate && CHORD[chordAt(Math.floor(i / 16) + 1)].shape === shape) ? st : { ...st, gate: false });
  await jb.tool('add_jp9000_pattern', { pattern: pat }); if (jb.session._nodes.jp9000._pattern?.length !== STEPS) jb.session._nodes.jp9000._pattern = pat; await jb.tool('tweak', { path: 'jp9000.level', value: -5 }); }
async function setupPing(jb) { await jb.tool('add_jp9000', { preset: 'empty' }); await jb.tool('add_module', { type: 'string', id: 's' }); await jb.tool('set_jp9000_output', { module: 's' }); await jb.tool('set_trigger_modules', { modules: ['s'] });
  for (const [p, v] of [['decay', 55], ['brightness', 42]]) await jb.tool('tweak_module', { module: 's', param: p, value: v });
  await jb.tool('add_effect', { target: 'jp9000', effect: 'delay', mode: 'pingpong', sync: 'dotted8th', feedback: 48, mix: 40, lowcut: 300, highcut: 4500, spread: 90 });
  await jb.tool('add_effect', { target: 'jp9000', effect: 'reverb', decay: 3.2, damping: 50, mix: 22, predelay: 20, size: 70 });
  await jb.tool('add_jp9000_pattern', { pattern: ping }); if (jb.session._nodes.jp9000._pattern?.length !== STEPS) jb.session._nodes.jp9000._pattern = ping; await jb.tool('tweak', { path: 'jp9000.level', value: -8 }); }
const STEM_SETUP = { kick: [(jb) => setupDrums(jb, { kickOnly: true }), SWING], perc: [(jb) => setupDrums(jb, { noKick: true }), SWING], bass: [setupBass, 0], chord_m9: [(jb) => setupChord(jb, 'm9'), 0], chord_maj9: [(jb) => setupChord(jb, 'maj9'), 0], ping: [setupPing, 0] };
async function renderStems() { const t0 = Date.now(); for (const [name, [setup, swing]] of Object.entries(STEM_SETUP)) { if (STEMS && !STEMS.includes(name)) continue; const tt = Date.now(); const jb = await newSession(swing); await setup(jb); await jb.render(stemPath(name), BARS); console.log(`  ${name} stem ${((Date.now() - tt) / 1000).toFixed(1)}s`); } console.log(`stems rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s`); }

// ============================================================ DSP
function readWav(p) { const b = readFileSync(p); let q = 12, fmt = null, off = 0, len = 0; while (q + 8 <= b.length) { const id = b.toString('ascii', q, q + 4), n = b.readUInt32LE(q + 4); if (id === 'fmt ') fmt = { tag: b.readUInt16LE(q + 8), ch: b.readUInt16LE(q + 10), sr: b.readUInt32LE(q + 12), bits: b.readUInt16LE(q + 22) }; if (id === 'data') { off = q + 8; len = Math.min(n, b.length - off); break; } q += 8 + n + (n & 1); }
  const { ch, bits, tag } = fmt, bps = bits / 8, frames = Math.floor(len / (bps * ch)); const L = new Float32Array(frames), R = new Float32Array(frames);
  for (let i = 0; i < frames; i++) { const rd = (c) => { const o = off + (i * ch + c) * bps; return tag === 3 ? b.readFloatLE(o) : bits === 16 ? b.readInt16LE(o) / 32768 : b.readInt32LE(o) / 2147483648; }; L[i] = rd(0); R[i] = ch > 1 ? rd(1) : L[i]; } return { L, R }; }
function writeWav(p, L, R) { const n = L.length; const b = Buffer.alloc(44 + n * 4); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40); for (let i = 0; i < n; i++) { b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4); b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4); } writeFileSync(p, b); }
const laneAt = (lane, i) => { const t = i / SR / BAR; const b = Math.floor(t), f = t - b; const a = lane[Math.min(lane.length - 1, b)], z = lane[Math.min(lane.length - 1, b + 1)]; return a + (z - a) * f; };
function biq(type, f0, Q = 0.707) { const w = 2 * Math.PI * f0 / SR, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * Q), a0 = 1 + al; let b0, b1, b2; if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; } else { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; } return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: -2 * cs / a0, a2: (1 - al) / a0 }; }
function runBiquad(x, coefFn) { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0, c = coefFn(0); for (let i = 0; i < x.length; i++) { if ((i & 63) === 0) c = coefFn(i); const v = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; }
const filtStatic = (x, type, f, Q) => { const c = biq(type, f, Q); return runBiquad(x, () => c); };
const rmsW = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
function duckEnvelope(n) { const env = new Float32Array(n).fill(1); const att = Math.round(0.004 * SR), hold = Math.round(0.04 * SR), rel = Math.round(0.2 * SR), depth = 1 - dB(-8);
  for (let i = 0; i < STEPS; i++) { if (jt90.kick[i].velocity <= 0) continue; const t0 = Math.round(i * STEP * SR); for (let k = 0; k < att + hold + rel && t0 + k < n; k++) { const g = k < att ? 1 - depth * k / att : k < att + hold ? 1 - depth : 1 - depth * (1 - (k - att - hold) / rel); env[t0 + k] = Math.min(env[t0 + k], g); } } return env; }
// chorus: two modulated taps, mono in -> stereo out
function chorus(x) { const n = x.length, maxD = Math.round(0.03 * SR); const buf = new Float32Array(maxD + 2); let w = 0; const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { buf[w] = x[i]; const t = i / SR; const d1 = (0.011 + 0.0018 * Math.sin(2 * Math.PI * 0.21 * t)) * SR, d2 = (0.017 + 0.0016 * Math.sin(2 * Math.PI * 0.29 * t + 1.3)) * SR; const rd = (d) => { const j = Math.floor(d), f = d - j; const p0 = (w - j + maxD * 2) % maxD, p1 = (p0 - 1 + maxD) % maxD; return buf[p0] * (1 - f) + buf[p1] * f; }; L[i] = 0.55 * x[i] + 0.45 * rd(d1); R[i] = 0.55 * x[i] + 0.45 * rd(d2); w = (w + 1) % maxD; } return { L, R }; }
// ping-pong dub delay, 3/16, lowpass + highpass inside the loop, per-bar feedback / filter lanes
function dubDelay(inL, inR) { const n = inL.length, d = Math.round(3 * STEP * SR); const bufA = new Float32Array(d), bufB = new Float32Array(d); let w = 0, lpA = 0, lpB = 0, hpA = 0, hpB = 0, hxA = 0, hxB = 0; const hpAl = Math.exp(-2 * Math.PI * 160 / SR); const oL = new Float32Array(n), oR = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = bufA[w], b = bufB[w]; const fb = laneAt(dlyFb, i), lpk = Math.exp(-2 * Math.PI * laneAt(dlyLP, i) / SR);
    lpA = lpk * lpA + (1 - lpk) * b; lpB = lpk * lpB + (1 - lpk) * a; const hA = hpAl * (hpA + lpA - hxA); hxA = lpA; hpA = hA; const hB = hpAl * (hpB + lpB - hxB); hxB = lpB; hpB = hB;
    const mono = 0.5 * (inL[i] + inR[i]); bufA[w] = mono + Math.tanh(hA * fb * 1.05) / 1.05; bufB[w] = Math.tanh(hB * fb * 1.05) / 1.05; oL[i] = a; oR[i] = b; w = (w + 1) % d; } return { L: oL, R: oR }; }
function glue(L, R, thrDb = -12, ratio = 2, att = 0.03, rel = 0.2) { const n = L.length, aA = Math.exp(-1 / (att * SR)), aR = Math.exp(-1 / (rel * SR)); let env = 0, maxGR = 0; const thr = dB(thrDb); for (let i = 0; i < n; i++) { const x = Math.max(Math.abs(L[i]), Math.abs(R[i])); env = x > env ? aA * env + (1 - aA) * x : aR * env + (1 - aR) * x; let g = 1; if (env > thr) { const over = 20 * Math.log10(env / thr), gr = over - over / ratio; g = dB(-gr); if (gr > maxGR) maxGR = gr; } L[i] *= g; R[i] *= g; } return maxGR; }
function limiter(L, R, ceiling) { const n = L.length, look = 48, rel = Math.exp(-1 / (0.05 * SR)); let g = 1; const oL = new Float32Array(n), oR = new Float32Array(n); for (let i = 0; i < n; i++) { let pk = 0; for (let k = 0; k < look && i + k < n; k++) { const v = Math.max(Math.abs(L[i + k]), Math.abs(R[i + k])); if (v > pk) pk = v; } const want = pk > ceiling ? ceiling / pk : 1; g = want < g ? want : rel * g + (1 - rel) * want; oL[i] = L[i] * g; oR[i] = R[i] * g; } return { L: oL, R: oR }; }
function pinkNoise(n, seed = 7) { let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; }; let b0 = 0, b1 = 0, b2 = 0; const out = new Float32Array(n); for (let i = 0; i < n; i++) { const wn = rnd(); b0 = 0.99765 * b0 + wn * 0.099046; b1 = 0.96300 * b1 + wn * 0.2965164; b2 = 0.57000 * b2 + wn * 1.0526913; out[i] = (b0 + b1 + b2 + wn * 0.1848) * 0.11; } return out; }
function crackle(n, seed = 3) { let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; const out = new Float32Array(n); for (let i = 0; i < n; i++) { if (rnd() < 0.0003) { const a = (rnd() * 2 - 1) * (0.4 + rnd() * 0.6); out[i] += a; if (i + 1 < n) out[i + 1] -= a * 0.6; } } return filtStatic(out, 'hp', 1500); }

// ============================================================ MIX
const REF_OF = { kick: [97, 112], perc: [97, 112], bass: [97, 112], chord: [97, 112], ping: [97, 112] };
const STEM_TARGET = { kick: -14, perc: -21, bass: -15, chord: -15, ping: -27 };
const stemRms = (S, from, to) => { const a = Math.round((from - 1) * BAR * SR), z = Math.min(S.L.length, Math.round(to * BAR * SR)); let e = 0; for (let i = a; i < z; i++) { const m = 0.5 * (S.L[i] + S.R[i]); e += m * m; } return 20 * Math.log10(Math.sqrt(e / (z - a)) + 1e-9); };
function mix() {
  const S = Object.fromEntries(['kick', 'perc', 'bass', 'chord_m9', 'chord_maj9', 'ping'].map(n => [n, readWav(stemPath(n))]));
  const n = Math.min(...Object.values(S).map(s => s.L.length)); { const L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = S.chord_m9.L[i] + S.chord_maj9.L[i]; R[i] = S.chord_m9.R[i] + S.chord_maj9.R[i]; } S.chord = { L, R }; delete S.chord_m9; delete S.chord_maj9; }
  const out = { L: new Float32Array(n), R: new Float32Array(n) }; const trim = {};
  const PEAK_CAP = { kick: -1, bass: -4, chord: -4, perc: -9, ping: -14 };   // dBFS after trim: transient stems must not drive the master normalization
  for (const [name, st] of Object.entries(S)) { const [f, t] = BARS >= 112 ? REF_OF[name] : [Math.max(1, BARS - 8), BARS]; const r = stemRms(st, f, t); let g = r < -90 ? 0 : dB(STEM_TARGET[name] - r); let pk = 0; for (let i = 0; i < st.L.length; i++) pk = Math.max(pk, Math.abs(st.L[i]), Math.abs(st.R[i])); const cap = dB(PEAK_CAP[name]) / (pk * g + 1e-9); if (cap < 1) g *= cap; trim[name] = g; console.log(`  stem ${name.padEnd(6)} ref RMS ${r.toFixed(1)} dBFS, peak ${(20 * Math.log10(pk + 1e-9)).toFixed(1)} -> trim ${(20 * Math.log10(g + 1e-9)).toFixed(1)} dB${cap < 1 ? ' (peak-capped)' : ''}`); }
  const add = (src, g0, lane) => { for (let i = 0; i < n; i++) { const g = g0 * (lane ? dB(laneAt(lane, i)) : 1); out.L[i] += src.L[i] * g; out.R[i] += src.R[i] * g; } };
  const duck = duckEnvelope(n);
  add(S.kick, trim.kick, kickG);
  add({ L: filtStatic(S.perc.L, 'hp', 180), R: filtStatic(S.perc.R, 'hp', 180) }, trim.perc, percG);
  { const m = new Float32Array(n); for (let i = 0; i < n; i++) m[i] = 0.5 * (S.bass.L[i] + S.bass.R[i]) * duck[i]; add({ L: m, R: m }, trim.bass, bassG); }
  { const m = new Float32Array(n); for (let i = 0; i < n; i++) m[i] = 0.5 * (S.chord.L[i] + S.chord.R[i]) * trim.chord; const lp = runBiquad(m, (i) => biq('lp', laneAt(chordLP, i), 0.8)); const ch = chorus(lp);
    for (let i = 0; i < n; i++) { const d = 1 - (1 - duck[i]) * 0.5; ch.L[i] *= d; ch.R[i] *= d; }
    const wet = dubDelay(ch.L, ch.R); add(ch, 1, chordDry); add(wet, 1, wetG); }
  add(S.ping, trim.ping, null);
  { const pk = pinkNoise(n), cr = crackle(n); for (let i = 0; i < n; i++) { const c = laneAt(crackleG, i); out.L[i] += pk[i] * dB(-60) + cr[i] * c; out.R[i] += pk[(i + 977) % n] * dB(-60) + cr[(i + 1301) % n] * c; } }
  const gr = glue(out.L, out.R); let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out.L[i]), Math.abs(out.R[i])); for (let i = 0; i < n; i++) { out.L[i] *= dB(-1) / peak; out.R[i] *= dB(-1) / peak; }
  const lim = limiter(out.L, out.R, dB(-1)); writeWav(join(OUT, 'fathom.wav'), lim.L, lim.R);
  console.log(`mix: ${n / SR / 60 | 0}m${Math.round(n / SR % 60)}s, glue max GR ${gr.toFixed(1)} dB, pre-limiter peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS`); return lim;
}
function measure(M) { const n = M.L.length, rows = [], secStats = {};
  for (let b = 1; b <= BARS; b += 8) { const a = Math.round((b - 1) * BAR * SR), z = Math.min(n, Math.round((b + 7) * BAR * SR)); const seg = new Float32Array(z - a); for (let i = a; i < z; i++) seg[i - a] = 0.5 * (M.L[i] + M.R[i]); const r = (x) => 20 * Math.log10(rmsW(x, 0, x.length) + 1e-9); const st = { rms: r(seg), lo: r(filtStatic(seg, 'lp', 120)), mid: r(filtStatic(filtStatic(seg, 'lp', 2500), 'hp', 300)), hi: r(filtStatic(seg, 'hp', 4000)) }; const s = sec(b); const target = b >= 201 ? -40 : TARGET_RMS[s]; rows.push({ bar: b, section: s, ...Object.fromEntries(Object.entries(st).map(([k, v]) => [k, +v.toFixed(1)])), target }); (secStats[s] ||= []).push(st.rms); }
  console.log('\nbar  section    rms    lo    mid    hi  | target  Δ'); for (const r of rows) console.log(`${String(r.bar).padStart(3)}  ${r.section.padEnd(9)} ${r.rms.toFixed(1).padStart(6)} ${r.lo.toFixed(1).padStart(5)} ${r.mid.toFixed(1).padStart(6)} ${r.hi.toFixed(1).padStart(5)}  | ${String(r.target).padStart(5)}  ${(r.rms - r.target).toFixed(1).padStart(5)}`);
  console.log('section means vs targets:', Object.entries(secStats).map(([s, v]) => `${s} ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}/${TARGET_RMS[s]}`).join('  '));
  writeFileSync(join(OUT, 'fathom-measure.json'), JSON.stringify({ bpm: BPM, bars: BARS, rows }, null, 1)); }
writeFileSync(join(OUT, 'fathom-score.json'), JSON.stringify({ title: 'fathom', bpm: BPM, key: 'A minor', barSeconds: BAR, bars: BARS, sections: SECTIONS, chords: Array.from({ length: BARS }, (_, i) => chordAt(i + 1)) }));
if (ONLY !== 'mix') await renderStems();
const master = mix(); measure(master);
execSync(`ffmpeg -v error -y -i "${join(OUT, 'fathom.wav')}" -c:a aac -b:a 192k -movflags +faststart "${join(OUT, 'fathom.m4a')}"`); console.log('wrote fathom.wav / fathom.m4a');
