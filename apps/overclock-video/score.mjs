// Turns each track into the score its video is cut to: the arrangement from the
// song script's track.json, the filter sweep `p` from the script itself, and
// what every instrument actually does, measured from its own stem.
//
//   node score.mjs [act-i act-ii act-iii]
//
// Renders three stems per act through the song script (SOLO=jt90 / jt30 /
// jb202, about a minute each, in parallel across acts) and writes
// score/<act>.js as `window.SCORE = {...}` (a script, not JSON, so the page
// works from file:// too):
//   frames  per video frame (25 fps): mix, kick, hats, acid, acidHi, drone — 0..1
//   steps   per 16th note: kick, hats, acid — 0..1 (an acid accent reads ~1, a rest 0)
//   sections  [{ bar, bars, kick, hats, acid, drone, name }] (bar is 0-indexed)
//   pKeys     the sweep's keyframes [[bar, p], …]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const dir = path.dirname(fileURLToPath(import.meta.url));
const HILMA = path.resolve(dir, '..', '..');
const SONGS = path.join(HILMA, 'scripts', 'jam', 'songs');
const { readWav } = await import(path.join(HILMA, 'scripts', 'jam', 'song-metrics.mjs'));

export const ACTS = {
  'act-i': { script: 'overclock-i.mjs', out: 'overclock-i' },
  'act-ii': { script: 'overclock-ii.mjs', out: 'overclock-ii' },
  'act-iii': { script: 'overclock.mjs', out: 'overclock' },
};
const FPS = 25;
const BPM = 128;
const STEP = 60 / BPM / 4;

const run = (cmd, args, env) => new Promise((res, rej) => {
  const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err += d; });
  p.on('close', (code) => (code === 0 ? res() : rej(new Error(`${args.join(' ')} → ${code}\n${err.slice(-800)}`))));
});

/** One-pole low/high split of a mono signal → { low, high } arrays. */
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
/** RMS over consecutive windows of `win` seconds. */
function windows(x, sr, win, count) {
  const out = new Float32Array(count);
  for (let w = 0; w < count; w++) {
    const a = Math.round(w * win * sr), b = Math.min(x.length, Math.round((w + 1) * win * sr));
    let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i];
    out[w] = b > a ? Math.sqrt(s / (b - a)) : 0;
  }
  return out;
}
/** Scale to 0..1 by the 99.5th percentile (one loud outlier must not flatten the rest). */
function norm(arr) {
  const sorted = Array.from(arr).filter((v) => v > 0).sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length * 0.995)] || 1;
  return Array.from(arr, (v) => Math.round(Math.min(1, v / ref) * 1000) / 1000);
}

async function scoreAct(act) {
  const { script, out } = ACTS[act];
  const tmp = path.join(tmpdir(), 'overclock-video-stems', act);
  mkdirSync(tmp, { recursive: true });
  for (const solo of ['jt90', 'jt30', 'jb202']) {
    await run('node', [path.join(SONGS, script)], { SOLO: solo, OUT: path.join(tmp, solo) });
  }
  const mix = readWav(readFileSync(path.join(SONGS, 'out', out, 'song.wav')));
  const sr = mix.sampleRate;
  const duration = mix.mono.length / sr;
  const frames = Math.round(duration * FPS);
  const steps = Math.floor(duration / STEP);
  const stem = (id) => readWav(readFileSync(path.join(tmp, id, 'song.wav'))).mono;

  const drums = split(stem('jt90'), sr, 150, 4000);   // kick below 150 Hz, closed hat above 4 kHz
  const acid = stem('jt30');
  const acidSplit = split(acid, sr, 400, 900);        // brightness: what sits above ~900 Hz
  const drone = stem('jb202');

  const track = JSON.parse(readFileSync(path.join(SONGS, 'out', out, 'track.json'), 'utf8'));
  const sections = track.plan.sections.map((s) => {
    const bar = Number(s.range.split('-')[0]) - 1;
    const d = s.patterns.jt90 || '';
    return { bar, bars: s.bars, kick: d.includes('K'), hats: d.includes('H'), acid: !!s.patterns.jt30, drone: !!s.patterns.jb202, name: s.name };
  });

  const src = readFileSync(path.join(SONGS, script), 'utf8');
  const m = src.match(/const P_KEYS = (\[[^\n]*\])/);
  if (!m) throw new Error(`no P_KEYS in ${script}`);
  const pKeys = JSON.parse(m[1].replace(/([[,\s])\.(\d)/g, '$10.$2'));

  const score = {
    act, bpm: BPM, fps: FPS, duration, frameCount: frames, stepCount: steps, sections, pKeys,
    frames: {
      mix: norm(windows(mix.mono, sr, 1 / FPS, frames)),
      kick: norm(windows(drums.low, sr, 1 / FPS, frames)),
      hats: norm(windows(drums.high, sr, 1 / FPS, frames)),
      acid: norm(windows(acid, sr, 1 / FPS, frames)),
      acidHi: norm(windows(acidSplit.high, sr, 1 / FPS, frames)),
      drone: norm(windows(drone, sr, 1 / FPS, frames)),
    },
    steps: {
      kick: norm(windows(drums.low, sr, STEP, steps)),
      hats: norm(windows(drums.high, sr, STEP, steps)),
      acid: norm(windows(acid, sr, STEP, steps)),
    },
  };
  mkdirSync(path.join(dir, 'score'), { recursive: true });
  writeFileSync(path.join(dir, 'score', `${act}.js`), `// generated by score.mjs — do not edit\nwindow.SCORE = ${JSON.stringify(score)};\n`);
  console.log(`${act}: ${duration.toFixed(1)} s, ${frames} frames, ${steps} steps, ${sections.length} sections, p keys ${JSON.stringify(pKeys)}`);
}

const acts = process.argv.slice(2).filter((a) => ACTS[a]);
await Promise.all((acts.length ? acts : Object.keys(ACTS)).map(scoreAct));
