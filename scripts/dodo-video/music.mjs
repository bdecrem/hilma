#!/usr/bin/env node
// Background bed for the Dodo overview video: quiet deep house per the
// library recipe (vibeceo/jambot/library.json → deep_house, core tier —
// proven params only). ~65s at 122 BPM, D minor, mixed as a bed, not a
// track: soft round kick, sparse hats, sustained sub-leaning bass.
// Rerun to regenerate music.wav next to this script.
import { JambotHeadless } from '../../../vibeceo/jambot/headless.js';
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const jb = new JambotHeadless({ bpm: 122 });

// Drums — straight from the deep_house library entry (0-100 scaling).
await jb.tool('add_jb01', {
  kick: [0, 4, 8, 12],
  ch: [2, 6, 10, 14],          // offbeat 8ths — "more space"
  oh: [4, 12],
  clap: [4, 12],
});
await jb.tool('tweak', { path: 'jb01.kick.tune', value: -1 });
await jb.tool('tweak', { path: 'jb01.kick.decay', value: 40 });
await jb.tool('tweak', { path: 'jb01.kick.level', value: -3 });
await jb.tool('tweak', { path: 'jb01.ch.decay', value: 25 });
await jb.tool('tweak', { path: 'jb01.ch.level', value: -10 });
await jb.tool('tweak', { path: 'jb01.oh.decay', value: 40 });
await jb.tool('tweak', { path: 'jb01.oh.level', value: -12 });
await jb.tool('tweak', { path: 'jb01.clap.decay', value: 50 });
await jb.tool('tweak', { path: 'jb01.clap.level', value: -9 });

// Bass — JT10, "sustained, pulsing, minimal movement", D minor.
await jb.tool('add_jt10', {
  pattern: [
    { note: 'D1', gate: true },  {}, { note: 'D1', gate: true }, {},
    { note: 'D1', gate: true },  {}, { note: 'F1', gate: true }, {},
    { note: 'D1', gate: true },  {}, { note: 'A1', gate: true }, {},
    { note: 'C2', gate: true },  {}, { note: 'D1', gate: true }, {},
  ],
});
await jb.tool('tweak_jt10', { sawLevel: 45, pulseLevel: 0, subLevel: 80, subMode: 1 });
await jb.tool('tweak_jt10', { cutoff: 300, resonance: 8, envMod: 20, keyTrack: 30 });
await jb.tool('tweak_jt10', { attack: 2, decay: 60, sustain: 45, release: 30 });
await jb.tool('tweak_jt10', { glideTime: 0 });
await jb.tool('tweak', { path: 'jt10.level', value: -8 });

const res = await jb.render('dodo-overview-bed', 33);   // ~65s at 122
console.log(res);

// The render lands in the current working directory.
copyFileSync(join(process.cwd(), 'dodo-overview-bed.wav'), join(here, 'music.wav'));
console.log('music.wav ready');
