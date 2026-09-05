// Sweep every control the Jam Controls sheet exposes, per instrument, in
// loop mode and song mode. A control passes when moving it from min to max
// changes the rendered audio (waveform difference > -40 dB). Mirrors
// Studio.onParam (tweak + song-mode write-through) and controls.ts.
//
//   cd ../vibeceo/jambot && node ../../hilma/scripts/jam/controls-sweep.mjs
//
// Known non-failures: jt90.kick.attack (subtle click), jt10.lead.subLevel
// (off until subMode >= 1), jt10.lead.lfoRate (needs an LFO amount),
// delay feedback (needs > 1 bar to show).
import { createSession } from '../../../vibeceo/jambot/core/session.js';
import { renderSessionToBuffer } from '../../../vibeceo/jambot/core/render.js';
import { describeSession } from '../../../vibeceo/jambot/core/status.js';
import { initializeTools, executeTool } from '../../../vibeceo/jambot/tools/index.js';

await initializeTools();

const VOICE_PARAMS = ['level', 'decay', 'tune', 'tone', 'snappy', 'attack', 'sweep'];
const KEY_PARAMS = ['cutoff','filtercutoff','frequency','resonance','filterresonance','envmod','filterenvamount','envamount','decay','ampdecay','filterdecay','drive','accent','sublevel','lforate','lfoamount','lfotofilter','osc2octave','osc2detune','detune','mix','feedback','time','damping','predelay','amount','threshold','level'];
const rank = n => { const i = KEY_PARAMS.indexOf(n.toLowerCase()); return i === -1 ? 999 : i; };

function controlsFor(session) {
  const d = describeSession(session);
  const out = [];
  for (const inst of d.instruments) {
    if (!inst.active) continue;
    out.push({ path: `${inst.id}.level`, min: -24, max: 6, inst: inst.id });
    const byPath = new Map(inst.params.map(p => [p.sub, p]));
    if (inst.voices.length) {
      for (const v of inst.voices) { let n = 0; for (const name of VOICE_PARAMS) { const p = byPath.get(`${v}.${name}`); if (!p) continue; if (p.descriptor.unit === 'choice') continue; out.push({ path: p.path, min: p.descriptor.min, max: p.descriptor.max, inst: inst.id }); if (++n >= 4) break; } }
    } else {
      const ranked = inst.params.filter(p => p.sub !== 'level' && p.descriptor.unit !== 'choice').map(p => ({ p, r: rank(p.sub.split('.').pop()) })).filter(x => x.r < 999).sort((a, b) => a.r - b.r).slice(0, 10);
      for (const { p } of ranked) out.push({ path: p.path, min: p.descriptor.min, max: p.descriptor.max, inst: inst.id });
    }
  }
  for (const fx of d.effects) for (const e of fx.chain) {
    const entries = Object.entries(e.descriptors || {}).map(([name, dd]) => ({ name, dd, r: rank(name) })).filter(x => x.r < 999 && x.dd.unit !== 'choice').sort((a, b) => a.r - b.r).slice(0, 6);
    for (const { name, dd } of entries) out.push({ path: `fx.${fx.target}.${e.id}.${name}`, min: dd.min, max: dd.max, inst: 'fx' });
  }
  return out;
}

// Studio.onParam
async function applyParam(session, path, value) {
  const r = await executeTool('tweak', { path, value }, session, {});
  if (/^Error/.test(r)) return r;
  const [inst, ...rest] = path.split('.');
  const saved = session.patterns?.[inst];
  const inSong = Array.isArray(session.arrangement) && session.arrangement.length > 0;
  const nodeLevel = rest.length === 1 && rest[0] === 'level';
  if (inSong && saved && rest.length > 0 && !nodeLevel && inst !== 'fx') {
    const names = Object.keys(saved);
    const current = session.currentPattern?.[inst] || names[names.length - 1];
    for (const name of names) {
      await executeTool('load_pattern', { instrument: inst, name }, session, {});
      await executeTool('tweak', { path, value }, session, {});
      await executeTool('save_pattern', { instrument: inst, name }, session, {});
    }
    if (current) await executeTool('load_pattern', { instrument: inst, name: current }, session, {});
  }
  return r;
}

async function wave(session) {
  const r = await renderSessionToBuffer(session, 1);
  return Float32Array.from(r.buffer.getChannelData(0));   // copy: the native buffer can be freed under us
}
// How different two renders are: RMS of (a-b) relative to RMS of a, in dB.
function diffDb(a, b) {
  let sd = 0, sa = 0; const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { const d = a[i] - b[i]; sd += d * d; sa += a[i] * a[i]; }
  return 20 * Math.log10(Math.sqrt(sd / n) / Math.max(Math.sqrt(sa / n), 1e-9));
}

const mono = (a, b) => Array.from({ length: 16 }, (_, i) => ({ note: i % 8 === 0 ? a : b, gate: i % 2 === 0, accent: i % 4 === 0, slide: false }));

async function setup(song) {
  const s = createSession({ bpm: 128 });
  await executeTool('add_jt90', { kick: [0, 4, 8, 12], ch: [2, 6, 10, 14], oh: [6, 14], ride: [0, 8] }, s, {});
  await executeTool('add_jb01', { snare: [4, 12], clap: [4], ch: [0, 2, 4, 6, 8, 10, 12, 14] }, s, {});
  await executeTool('add_jb202', { pattern: mono('C2', 'G2') }, s, {});
  await executeTool('add_jt30', { pattern: mono('A1', 'A2') }, s, {});
  await executeTool('add_jt10', { pattern: mono('C4', 'E4') }, s, {});
  await executeTool('add_effect', { target: 'jt90.ch', effect: 'delay', mode: 'pingpong', mix: 30 }, s, {});
  await executeTool('add_effect', { target: 'jt10', effect: 'reverb', mix: 30 }, s, {});
  if (song) {
    for (const inst of ['jt90', 'jb01', 'jb202', 'jt30', 'jt10']) await executeTool('save_pattern', { instrument: inst, name: 'A' }, s, {});
    await executeTool('set_arrangement', { sections: [{ bars: 1, jt90: 'A', jb01: 'A', jb202: 'A', jt30: 'A', jt10: 'A' }] }, s, {});
  }
  return s;
}

const failures = [];
let checked = 0;
for (const song of [false, true]) {
  const mode = song ? 'SONG' : 'LOOP';
  const base = await setup(song);
  const controls = controlsFor(base);
  console.log(`\n${mode}: ${controls.length} controls`);
  for (const c of controls) {
    checked++;
    const s1 = await setup(song); const e1 = await applyParam(s1, c.path, c.min); const a = await wave(s1);
    const s2 = await setup(song); const e2 = await applyParam(s2, c.path, c.max); const b = await wave(s2);
    const db = diffDb(a, b);
    const err = /^Error/.test(e1) ? e1 : /^Error/.test(e2) ? e2 : null;
    const ok = !err && db > -40;
    if (!ok) failures.push({ mode, path: c.path, min: c.min, max: c.max, diffDb: db.toFixed(1), err });
    process.stdout.write(`${ok ? '✓' : '✗'} ${mode} ${c.path.padEnd(32)} diff ${db.toFixed(1)} dB${err ? '  ' + err : ''}\n`);
  }
}
console.log(`\n${checked} controls checked, ${failures.length} failed`);
if (failures.length) console.log(JSON.stringify(failures, null, 1));
