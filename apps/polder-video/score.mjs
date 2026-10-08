// Turns Polder into the score its video is cut to: the arrangement from the
// song script's track.json, the chord filter opening as `p`, and what every
// instrument actually does, measured from its own stem.
//
//   node score.mjs
//
// Renders five stems through the song script (SOLO=jt90 / jb202 / chord-lo,chord-mid,chord-hi /
// bell / jt10, about a minute each, in parallel) and writes score/polder.js as
// `window.SCORE = {...}`:
//   frames  per video frame (25 fps): mix, kick, hats, sub, chord, chordHi, bell, drone — 0..1
//   steps   per 16th note: kick, hats, sub, chord, bell — 0..1
//   sections  [{ bar, bars, kick, hats, sub, chord, bell, drone, name }] (bar is 0-indexed)
//   pKeys     the chord filter opening as keyframes [[bar, p], …], p = (cutoff − 320) / (900 − 320)
//   sub       the riff, one entry per 16th of its two bars: the note name or null
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const dir = path.dirname(fileURLToPath(import.meta.url));
const HILMA = path.resolve(dir, '..', '..');
const SONGS = path.join(HILMA, 'scripts', 'jam', 'songs');
const { readWav } = await import(path.join(HILMA, 'scripts', 'jam', 'song-metrics.mjs'));

const SCRIPT = 'polder.mjs', OUT = 'polder';
const FPS = 25;
const BPM = 122;
const STEP = 60 / BPM / 4;

const run = (cmd, args, env) => new Promise((res, rej) => {
  const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err += d; });
  p.on('close', (code) => (code === 0 ? res() : rej(new Error(`${args.join(' ')} → ${code}\n${err.slice(-800)}`))));
});

function split(x, sr, fLow, fHigh) {
  const aL = 1 - Math.exp(-2 * Math.PI * fLow / sr), aH = Math.exp(-2 * Math.PI * fHigh / sr);
  const low = new Float32Array(x.length), high = new Float32Array(x.length);
  let lp = 0, hp = 0, prev = 0;
  for (let i = 0; i < x.length; i++) {
    lp += aL * (x[i] - lp); low[i] = lp;
    hp = aH * (hp + x[i] - prev); prev = x[i]; high[i] = hp;
  }
  return { low, high };
}
function windows(x, sr, win, count) {
  const out = new Float32Array(count);
  for (let w = 0; w < count; w++) {
    const a = Math.round(w * win * sr), b = Math.min(x.length, Math.round((w + 1) * win * sr));
    let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i];
    out[w] = b > a ? Math.sqrt(s / (b - a)) : 0;
  }
  return out;
}
function norm(arr) {
  const sorted = Array.from(arr).filter((v) => v > 0).sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length * 0.995)] || 1;
  return Array.from(arr, (v) => Math.round(Math.min(1, v / ref) * 1000) / 1000);
}

const tmp = path.join(tmpdir(), 'polder-video-stems');
mkdirSync(tmp, { recursive: true });
const STEMS = { jt90: 'jt90', jb202: 'jb202', chord: 'chord-lo,chord-mid,chord-hi', bell: 'bell', jt10: 'jt10' };
await Promise.all(Object.entries(STEMS).map(([id, solo]) => run('node', [path.join(SONGS, SCRIPT)], { SOLO: solo, OUT: path.join(tmp, id) })));

const mix = readWav(readFileSync(path.join(SONGS, 'out', OUT, 'song.wav')));
const sr = mix.sampleRate;
const duration = mix.mono.length / sr;
const frames = Math.round(duration * FPS);
const steps = Math.floor(duration / STEP);
const stem = (id) => readWav(readFileSync(path.join(tmp, id, 'song.wav'))).mono;

const drums = split(stem('jt90'), sr, 150, 4000);   // kick below 150 Hz, hats and rim above 4 kHz
const sub = stem('jb202');
const chord = stem('chord');
const chordSplit = split(chord, sr, 300, 700);      // brightness: what sits above ~700 Hz (the filter opening)
const bell = stem('bell');
const drone = stem('jt10');

const track = JSON.parse(readFileSync(path.join(SONGS, 'out', OUT, 'track.json'), 'utf8'));
const sections = track.plan.sections.map((s) => {
  const bar = Number(s.range.split('-')[0]) - 1;
  const d = s.patterns.jt90 || '';
  return { bar, bars: s.bars, kick: d.includes('K'), hats: d.includes('H'), rim: d.includes('R'), sub: !!s.patterns.jb202, chord: !!s.patterns['chord-lo'], bell: !!s.patterns.bell, drone: !!s.patterns.jt10, name: s.name, stabs: s.patterns['chord-lo'] };
});

// The chord filter per 8-bar block, from the script's CUT table (start and end Hz).
const src = readFileSync(path.join(SONGS, SCRIPT), 'utf8');
const m = src.match(/const CUT = \{([\s\S]*?)\}\n/);
if (!m) throw new Error('no CUT table in polder.mjs');
const cut = {};
for (const [, b, a, z] of m[1].matchAll(/(\d+): \[(\d+), (\d+)\]/g)) cut[Number(b)] = [Number(a), Number(z)];
const p = (hz) => Math.round(((hz - 320) / (900 - 320)) * 1000) / 1000;
const pKeys = [];
for (const b of Object.keys(cut).map(Number).sort((x, y) => x - y)) { pKeys.push([b, p(cut[b][0])]); pKeys.push([b + 8, p(cut[b][1])]); }
// The stab pattern per block, from the STABS table.
const sm = src.match(/const STABS = \{([\s\S]*?)\}\n/);
const stabs = {};
for (const [, b, kind] of sm[1].matchAll(/(\d+): '(\w+)'/g)) stabs[Number(b)] = kind;
for (const s of sections) s.stabs = stabs[s.bar];
// The riff, one note per 16th over two bars.
const riff = Array(32).fill(null);
for (const [, at, note, len] of src.matchAll(/hold\(riff, (\d+), '(\w+)', (\d+)/g)) for (let k = 0; k < Number(len); k++) riff[Number(at) + k] = note;

const score = {
  act: 'polder', bpm: BPM, fps: FPS, duration, frameCount: frames, stepCount: steps, sections, pKeys, riff,
  frames: {
    mix: norm(windows(mix.mono, sr, 1 / FPS, frames)),
    kick: norm(windows(drums.low, sr, 1 / FPS, frames)),
    hats: norm(windows(drums.high, sr, 1 / FPS, frames)),
    sub: norm(windows(sub, sr, 1 / FPS, frames)),
    chord: norm(windows(chord, sr, 1 / FPS, frames)),
    chordHi: norm(windows(chordSplit.high, sr, 1 / FPS, frames)),
    bell: norm(windows(bell, sr, 1 / FPS, frames)),
    drone: norm(windows(drone, sr, 1 / FPS, frames)),
  },
  steps: {
    kick: norm(windows(drums.low, sr, STEP, steps)),
    hats: norm(windows(drums.high, sr, STEP, steps)),
    sub: norm(windows(sub, sr, STEP, steps)),
    chord: norm(windows(chord, sr, STEP, steps)),
    bell: norm(windows(bell, sr, STEP, steps)),
  },
};
mkdirSync(path.join(dir, 'score'), { recursive: true });
writeFileSync(path.join(dir, 'score', 'polder.js'), `// generated by score.mjs — do not edit\nwindow.SCORE = ${JSON.stringify(score)};\n`);
console.log(`polder: ${duration.toFixed(1)} s, ${frames} frames, ${steps} steps, ${sections.length} sections, p keys ${pKeys.length}, riff ${riff.filter(Boolean).length}/32 steps`);
