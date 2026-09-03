#!/usr/bin/env node
/**
 * Bake the page data for silt: 30 fps band envelopes + onset frames from the
 * final mix (like DK019), PLUS the score itself (sections, chord per bar, exact
 * kick/stab/rim/tom/acid step events, delay lanes) so the visualizer can
 * anticipate the music instead of only reacting to it.
 *   node scripts/dub-tribal/bake.mjs <dir with silt.wav + silt-score.json>
 * Writes <dir>/silt-page-data.json
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
const D = process.argv[2] || '/private/tmp/claude-501/-Users-bart-Documents-code-hilma/0e14b480-fcb1-4623-b2af-57170299d75f/scratchpad/silt';
const score = JSON.parse(readFileSync(join(D, 'silt-score.json')));
// --- mono samples
const b = readFileSync(join(D, 'silt.wav')); let p = 12, sr = 44100, ch = 2, off = 0, len = 0;
while (p + 8 <= b.length) { const id = b.toString('ascii', p, p + 4), n = b.readUInt32LE(p + 4); if (id === 'fmt ') { ch = b.readUInt16LE(p + 10); sr = b.readUInt32LE(p + 12); } if (id === 'data') { off = p + 8; len = Math.min(n, b.length - off); break; } p += 8 + n + (n & 1); }
const frames = Math.floor(len / (2 * ch)); const x = new Float32Array(frames);
for (let i = 0; i < frames; i++) { let s = 0; for (let c = 0; c < ch; c++) s += b.readInt16LE(off + (i * ch + c) * 2); x[i] = s / ch / 32768; }
// --- band filters (RBJ biquads, 2 passes)
function bq(type, f0, Q = 0.707) { const w = 2 * Math.PI * f0 / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * Q), a0 = 1 + al; let b0, b1, b2; if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; } else { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; } return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: -2 * cs / a0, a2: (1 - al) / a0 }; }
function filt(src, c, passes = 2) { let y = src; for (let q = 0; q < passes; q++) { const o = new Float32Array(y.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < y.length; i++) { const v = c.b0 * y[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2; x2 = x1; x1 = y[i]; y2 = y1; y1 = v; o[i] = v; } y = o; } return y; }
const bands = { kick: filt(x, bq('lp', 110)), low: filt(filt(x, bq('hp', 90)), bq('lp', 260)), mid: filt(filt(x, bq('hp', 300)), bq('lp', 2600)), high: filt(x, bq('hp', 4000)) };
const FPS = 30, hop = sr / FPS, NF = Math.floor(frames / hop);
const env = {}; const peakOf = {};
for (const [k, y] of Object.entries(bands)) { const e = new Float32Array(NF); for (let f = 0; f < NF; f++) { let s = 0; const a = Math.floor(f * hop), z = Math.floor((f + 1) * hop); for (let i = a; i < z; i++) s += y[i] * y[i]; e[f] = Math.sqrt(s / (z - a)); } let pk = 0; for (const v of e) pk = Math.max(pk, v); peakOf[k] = pk; env[k] = Buffer.from(Uint8Array.from(e, v => Math.min(255, Math.round(255 * Math.pow(v / pk, 0.6))))).toString('base64'); }
// --- score events in seconds (exact): kicks, stabs, rims, toms, acid, plus delay repeats predicted from the lanes
const BAR = score.barSeconds, STEP = BAR / 16;
const ev = { kick: [], stab: [], rim: [], tom: [], acid: [] };
for (const bar of score.bars) { const t0 = (bar.bar - 1) * BAR; for (const st of bar.kick) ev.kick.push(+(t0 + st * STEP).toFixed(3)); for (const st of bar.stabs) ev.stab.push(+(t0 + st * STEP).toFixed(3)); for (const st of bar.rim) ev.rim.push(+(t0 + st * STEP).toFixed(3)); if (bar.toms) for (const st of [12, 14]) ev.tom.push(+(t0 + st * STEP).toFixed(3)); for (const st of bar.acid) ev.acid.push(+(t0 + st * STEP).toFixed(3)); }
const out = { title: score.title, bpm: score.bpm, key: score.key, bars: score.bars.length, barSeconds: BAR, fps: FPS, frames: NF, duration: +(frames / sr).toFixed(3), sections: score.sections, env, events: ev,
  lanes: score.bars.map(bb => [bb.lanes.chordLP, bb.lanes.fb, bb.lanes.dlySteps]), chords: score.bars.map(bb => bb.chord), sectionOfBar: score.bars.map(bb => bb.section) };
writeFileSync(join(D, 'silt-page-data.json'), JSON.stringify(out));
console.log(`baked ${NF} frames @${FPS}fps, events: ${Object.entries(ev).map(([k, v]) => k + ' ' + v.length).join(', ')}, json ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
