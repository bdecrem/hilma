/**
 * INTERCEPTOR — tribal techno, 145 BPM, C minor, 176 bars (~4:53)
 *
 * Spec: 53s-drone-into-siege Mills/Utopia hybrid, with all judge-required fixes applied:
 *   - head split: 16-bar drone (bars 1-16) -> 16-bar drum-only head (17-32) -> stab enters 33
 *   - bar-41 stagger: CL in at 41 (4 voices), RD fade-in at 49 (5 voices)
 *   - drum tail: stab hard-exits after bar 151; bar 152 = kick alone; 153-176 = kick/OH/shaker thin-out
 *   - shaker ghosts quantized to two values (-9 / -12), 12 dB total accent spread
 *   - rotation break: bars 129-136 slot sits EMPTY (4 voices) instead of a third 303 block
 *
 * Run:  cd /Users/bartdecrem/Documents/coding2025/vibeceo/jambot && node interceptor.mjs
 * Output: <scratchpad>/renders/interceptor.wav  (mastered; -raw.wav is the pre-master render)
 *
 * Engine notes (empirically verified against this jambot checkout):
 *   - save_pattern serializes jt90/jt10/jt30 params through a Proxy with no ownKeys trap ->
 *     saved params come out EMPTY in arrangement mode. fixParams() below re-writes the saved
 *     slot with the node's live engine params. Script-side workaround only; jambot untouched.
 *   - jt90 tune is SEMITONES (params.json), not cents: kick +3 st -> 64.9 Hz C2 (measured).
 *   - jt90 OH is a 590 ms sample; decay knob maps 0-100 -> 0.05-5.0 s, so only 0..11 is
 *     audible. Spec's 30%..100% decay ride is remapped to producer 0.5..11 (75 ms..full ring).
 *   - jt90 CH (shaker duty) is a 192 ms sample; decay 2.5 -> ~60 ms dusty tick.
 *   - SidechainNode triggers on every step (object-pattern format quirk), so per-channel
 *     sidechain is NOT used; the kick-driven pump comes from the in-script bus compressor.
 *   - No noise/compressor/overdrive effect types exist in jambot -> the -54 dBFS pink-noise
 *     bed, bus compressor (30/80 ms) and tape-sat soft clip are done in-script post-render.
 */
import { createHeadless } from '/Users/bartdecrem/Documents/coding2025/vibeceo/jambot/headless.js';
import { readFileSync, writeFileSync } from 'fs';

const OUT_DIR = '/private/tmp/claude-501/-Users-bartdecrem-Documents-coding2025-hilma/9a88ecd8-cb32-4f5b-a35e-ecd209a3961e/scratchpad/renders';
const RAW = `${OUT_DIR}/interceptor-raw`;
const FINAL = `${OUT_DIR}/interceptor.wav`;

const jb = await createHeadless({ bpm: 145 });
await jb.tool('set_swing', { amount: 0 }); // dead on grid — no swing, no nudges anywhere

// ---------- helpers ----------
// save_pattern loses jt90/jt10/jt30 params (proxy has no ownKeys); re-snapshot from live node
function fixParams(inst, name) {
  const node = jb.session._nodes[inst];
  const p = inst === 'jt90' ? node.getAllVoiceParams() : node.getEngineParams();
  jb.session.patterns[inst][name].params = JSON.parse(JSON.stringify(p));
}
async function saveJT90(name) {
  await jb.tool('save_pattern', { instrument: 'jt90', name });
  fixParams('jt90', name);
  await jb.tool('clear_automation', { path: 'jt90' });
}
const ramp = (n, a, b) => Array(n).fill(null).map((_, i) => a + (b - a) * (n === 1 ? 0 : i / (n - 1)));
const flat = (n, v) => Array(n).fill(v);

// OH decay ride: spec % -> audible producer range (30% -> 0.5 = 75ms choke, 100% -> 11 = full 590ms ring)
const ohd = (pct) => 0.5 + (pct - 30) * (10.5 / 70);

// Shaker lattice velocity grammar (dB rel to shaker level; STATIC cell, judge-fix ghosts at -9/-12):
// accents on 8th positions (spec tier), ghosts: e-positions -12, a-positions -9
const CH_GRID = [-3, -12, 0, -9, -2, -12, -1, -9, -3, -12, 0, -9, -2, -12, -1, -9];
const CH_BASE = -10; // lane dB that puts the strongest accent ~12 dB under the kick peak (measured)
const chLane16 = CH_GRID.map(g => CH_BASE + g);

// Ride grid: on-beats -8 rel, offbeats 0 rel; lane base -12 dB (measured vs kick)
const RIDE_ON = -21, RIDE_OFF = -13;
const rideLane16 = Array(16).fill(null).map((_, i) => (i % 4 === 0 ? RIDE_ON : RIDE_OFF));

// lane builders (arrays wrap by their own length inside a section)
function rideLaneFade(bars) { // fader fade-in across bar 1 (-42 dB -> grid), then grid
  const lane = [];
  for (let s = 0; s < bars * 16; s++) {
    const g = rideLane16[s % 16];
    lane.push(s < 16 ? g - 42 * (1 - s / 16) : g);
  }
  return lane;
}
function chLaneFadeIn(bars) { // shaker fade-in across 2 bars
  const lane = [];
  for (let s = 0; s < bars * 16; s++) {
    const g = chLane16[s % 16];
    lane.push(s < 32 ? g - 45 * (1 - s / 32) : g);
  }
  return lane;
}
function chLaneFadeOut(bars) { // shaker fade-out across 2 bars, then silent
  const lane = [];
  for (let s = 0; s < bars * 16; s++) {
    const g = chLane16[s % 16];
    lane.push(s < 32 ? g - 45 * (s / 32) : -60);
  }
  return lane;
}

const ALL16 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const KICK4 = [0, 4, 8, 12];
const OFF8 = [2, 6, 10, 14];
const EIGHTHS = [0, 2, 4, 6, 8, 10, 12, 14];

// ---------- JT90 voice params (once; every scene snapshot captures them) ----------
// kick: THE ONLY BASS. +3 st -> 64.9 Hz C2 sustained fundamental (measured), decay 75 -> ~800 ms rumble
await jb.tool('tweak_jt90', { voice: 'kick', tune: 3, decay: 75, attack: 60, level: -3 });
await jb.tool('tweak_jt90', { voice: 'oh', tune: 0, level: -7.5 });          // decay via lanes
await jb.tool('tweak_jt90', { voice: 'ch', tune: -2, decay: 2.5, level: -15 }); // -200 cents dusty tick; level via lanes
await jb.tool('tweak_jt90', { voice: 'ride', tune: 0, decay: 100, level: -16 }); // level via lanes

// ================= JT90 SCENES =================
// -- head (bars 17-32): judge-fix drum-only head — kick + OH(choked) + shaker lattice, hard cut in
await jb.tool('add_jt90', { clear: true, kick: KICK4, oh: OFF8, ch: ALL16 });
await jb.tool('automate', { path: 'jt90.oh.decay', values: [ohd(30)] });
await jb.tool('automate', { path: 'jt90.ch.level', values: chLane16 });
await saveJT90('head');

// -- a (33-40): K + OH — stab slams in on jt10; OH holds 30%
await jb.tool('add_jt90', { clear: true, kick: KICK4, oh: OFF8 });
await jb.tool('automate', { path: 'jt90.oh.decay', values: [ohd(30)] });
await saveJT90('a');

// -- b (41-48): + clap on jb01 (judge-fix stagger: 4 voices); OH 30->40
await jb.tool('add_jt90', { clear: true, kick: KICK4, oh: OFF8 });
await jb.tool('automate', { path: 'jt90.oh.decay', values: ramp(128, ohd(30), ohd(40)) });
await saveJT90('b');

// -- c7 (49-55): ride fades in across bar 49 (judge-fix: RD arrives at 49, block's 5th voice); OH 40->53
await jb.tool('add_jt90', { clear: true, kick: KICK4, oh: OFF8, ride: EIGHTHS });
await jb.tool('automate', { path: 'jt90.oh.decay', values: ramp(112, ohd(40), ohd(40 + 15 * 7 / 8)) });
await jb.tool('automate', { path: 'jt90.ride.level', values: rideLaneFade(7) });
await saveJT90('c7');

// -- kick1: 1-bar kick-only cell (bar 56 perc dropout, bars 103-104 emptiness, bar 152 kick alone)
await jb.tool('add_jt90', { clear: true, kick: KICK4 });
await saveJT90('kick1');

// -- d (57-64): CL out, shaker fades in across 57-58; ride continues; OH 55->65
await jb.tool('add_jt90', { clear: true, kick: KICK4, oh: OFF8, ride: EIGHTHS, ch: ALL16 });
await jb.tool('automate', { path: 'jt90.oh.decay', values: ramp(128, ohd(55), ohd(65)) });
await jb.tool('automate', { path: 'jt90.ride.level', values: rideLane16 });
await jb.tool('automate', { path: 'jt90.ch.level', values: chLaneFadeIn(8) });
await saveJT90('d');

// -- e7 (65-71): RD out, CL in (jb01); OH 65->78
await jb.tool('add_jt90', { clear: true, kick: KICK4, oh: OFF8, ch: ALL16 });
await jb.tool('automate', { path: 'jt90.oh.decay', values: ramp(112, ohd(65), ohd(65 + 15 * 7 / 8)) });
await jb.tool('automate', { path: 'jt90.ch.level', values: chLane16 });
await saveJT90('e7');

// -- stop1 (bar 72): live 909 stop on beats 3-4 — ALL drums silent steps 8-15, stab rings alone
await jb.tool('add_jt90', { clear: true, kick: [0, 4], oh: [2, 6], ch: [0, 1, 2, 3, 4, 5, 6, 7] });
await jb.tool('automate', { path: 'jt90.oh.decay', values: [ohd(79)] });
await jb.tool('automate', { path: 'jt90.ch.level', values: chLane16 });
await saveJT90('stop1');

// -- f (73-80): hard restart; CL out, RD fades back in; OH 80->100 (ride ends parked full)
await jb.tool('add_jt90', { clear: true, kick: KICK4, oh: OFF8, ride: EIGHTHS, ch: ALL16 });
await jb.tool('automate', { path: 'jt90.oh.decay', values: ramp(128, ohd(80), ohd(100)) });
await jb.tool('automate', { path: 'jt90.ride.level', values: rideLaneFade(8) });
await jb.tool('automate', { path: 'jt90.ch.level', values: chLane16 });
await saveJT90('f');

// -- g: siege core K+OH(full)+SH — used for every 303/CL/empty rotation block and the 153-160 strip
await jb.tool('add_jt90', { clear: true, kick: KICK4, oh: OFF8, ch: ALL16 });
await jb.tool('automate', { path: 'jt90.oh.decay', values: [ohd(100)] });
await jb.tool('automate', { path: 'jt90.ch.level', values: chLane16 });
await saveJT90('g');

// -- i6 (97-102): ride fade-in block cut short by the 103-104 emptiness
await jb.tool('add_jt90', { clear: true, kick: KICK4, oh: OFF8, ride: EIGHTHS, ch: ALL16 });
await jb.tool('automate', { path: 'jt90.oh.decay', values: [ohd(100)] });
await jb.tool('automate', { path: 'jt90.ride.level', values: rideLaneFade(6) });
await jb.tool('automate', { path: 'jt90.ch.level', values: chLane16 });
await saveJT90('i6');

// -- r8 (121-128): ride fade-in block at full OH (the transposition block)
await jb.tool('add_jt90', { clear: true, kick: KICK4, oh: OFF8, ride: EIGHTHS, ch: ALL16 });
await jb.tool('automate', { path: 'jt90.oh.decay', values: [ohd(100)] });
await jb.tool('automate', { path: 'jt90.ride.level', values: rideLaneFade(8) });
await jb.tool('automate', { path: 'jt90.ch.level', values: chLane16 });
await saveJT90('r8');

// -- i7 (145-151): ride fade-in block cut short by the bar-152 kick-alone dropout
await jb.tool('add_jt90', { clear: true, kick: KICK4, oh: OFF8, ride: EIGHTHS, ch: ALL16 });
await jb.tool('automate', { path: 'jt90.oh.decay', values: [ohd(100)] });
await jb.tool('automate', { path: 'jt90.ride.level', values: rideLaneFade(7) });
await jb.tool('automate', { path: 'jt90.ch.level', values: chLane16 });
await saveJT90('i7');

// -- k (161-168): shaker fades OUT across 161-162, then K+OH only
await jb.tool('add_jt90', { clear: true, kick: KICK4, oh: OFF8, ch: ALL16 });
await jb.tool('automate', { path: 'jt90.oh.decay', values: [ohd(100)] });
await jb.tool('automate', { path: 'jt90.ch.level', values: chLaneFadeOut(8) });
await saveJT90('k');

// -- l (169-176): OH out — kick rumble alone to the final bar
await jb.tool('add_jt90', { clear: true, kick: KICK4 });
await saveJT90('l');

// ================= JT10 SCENES (whistle bars 1-16, then the siren stab) =================
// -- whistle: Eb6 near-sine hover (pulse into closed ladder filter), slow pitch drift LFO.
//    16-bar tied drone; quiet via pulseLevel (jt10 node level is global and calibrated for the stab).
{
  const steps = 16 * 16;
  const pat = Array(steps).fill(null).map((_, i) => ({ note: 'D#6', gate: true, slide: i > 0 }));
  await jb.tool('add_jt10', { pattern: pat, bars: 16 });
  await jb.tool('tweak_jt10', {
    level: -8, sawLevel: 0, pulseLevel: 10, pulseWidth: 50, subLevel: 0,
    filterCutoff: 1500, filterResonance: 0, filterEnvAmount: 0, keyTrack: 0, // keyTrack 0: kill upper pulse harmonics (11 kHz spike)
    ampAttack: 40, ampDecay: 50, ampSustain: 100, ampRelease: 50,
    lfoRate: 8, lfoWaveform: 'triangle', lfoToPitch: 8, lfoToFilter: 0, glideTime: 5,
  });
  await jb.tool('save_pattern', { instrument: 'jt10', name: 'whistle' });
  fixParams('jt10', 'whistle');
}
// -- siren stab: square, offbeat 8ths, C5 full (accent = +3 dB engine boost) / Eb5 pulled.
//    NO filter automation ever — it is a drum. 1 ms attack, ~130 ms decay, sustain 0.
function stabPattern(root, third) {
  const pat = Array(16).fill(null).map(() => ({ note: root, gate: false }));
  pat[2] = { note: root, gate: true, accent: true };
  pat[6] = { note: third, gate: true, accent: false };
  pat[10] = { note: root, gate: true, accent: true };
  pat[14] = { note: third, gate: true, accent: false };
  return pat;
}
await jb.tool('add_jt10', { pattern: stabPattern('C5', 'D#5') });
await jb.tool('tweak_jt10', {
  level: -8, sawLevel: 0, pulseLevel: 100, pulseWidth: 50, subLevel: 0,
  filterCutoff: 2200, filterResonance: 0, filterEnvAmount: 0, keyTrack: 50, // scream lives at 2k (H3); ladder shaves H5+ lines that trip the narrow-peak guard
  ampAttack: 0, ampDecay: 32, ampSustain: 0, ampRelease: 5,
  lfoRate: 0, lfoToPitch: 0, lfoToFilter: 0,
});
await jb.tool('save_pattern', { instrument: 'jt10', name: 'stabC' });
fixParams('jt10', 'stabC');
// ONE-TIME PITCH EVENT at bar 121: whole riff up a fourth (+5 st), permanent -> F5/Ab5
await jb.tool('add_jt10', { pattern: stabPattern('F5', 'G#5') });
await jb.tool('save_pattern', { instrument: 'jt10', name: 'stabF' });
fixParams('jt10', 'stabF');
// stab channel voicing: upper-mid scream +4 dB @ 2 kHz, HPF 300 (never touches the low end),
// plus the shared room (1.6 s / 25 ms predelay, light) — stab and clap are the only room feeds
await jb.tool('add_effect', { target: 'jt10', effect: 'eq', highpass: 300, midFreq: 2000, midGain: 3.5, midQ: 1.4 });
await jb.tool('add_effect', { target: 'jt10', effect: 'filter', mode: 'lowpass', cutoff: 3400, resonance: 0 }); // extra shave on H5 spectral lines
await jb.tool('add_effect', { target: 'jt10', effect: 'reverb', decay: 1.6, predelay: 25, mix: 7, size: 40 });

// ================= JT30 — the one permitted 303, buried tick =================
// steps 3 + 11 only, C3 static (does NOT transpose at 121 — the riff owns the pitch event)
{
  const pat = Array(16).fill(null).map(() => ({ note: 'C3', gate: false, accent: false, slide: false }));
  pat[3] = { note: 'C3', gate: true, accent: false, slide: false };
  pat[11] = { note: 'C3', gate: true, accent: false, slide: false };
  await jb.tool('add_jt30', { pattern: pat });
  await jb.tool('tweak_jt30', {
    level: -23, waveform: 'sawtooth', filterCutoff: 380, filterResonance: 80,
    filterEnvAmount: 40, filterDecay: 30, accentLevel: 0, drive: 0,
  });
  await jb.tool('save_pattern', { instrument: 'jt30', name: 'tick' });
  fixParams('jt30', 'tick');
  await jb.tool('add_effect', { target: 'jt30', effect: 'filter', mode: 'highpass', cutoff: 150 }); // never a bassline
}

// ================= JB01 — clap (its own machine so the delay chain never touches the 909 bus) =================
await jb.tool('add_jb01', { clear: true, clap: [4, 12] });
await jb.tool('tweak_jb01', { voice: 'clap', level: 2 }); // ~-14 dBFS dry peak = spec -8 rel kick (measured)
await jb.tool('save_pattern', { instrument: 'jb01', name: 'clap' });
await jb.tool('add_jb01', { clear: true, clap: [4] }); // bar-72 stop: beat 2 clap only, beats 3-4 silent
await jb.tool('save_pattern', { instrument: 'jb01', name: 'clapstop' });
// 3/16 delay (dotted8th @145 = 310 ms), fb 35% -> 2 audible ghost repeats; + light shared-room feed
await jb.tool('add_effect', { target: 'jb01', effect: 'delay', mode: 'analog', sync: 'dotted8th', feedback: 35, mix: 30, lowcut: 250, highcut: 6000 });
await jb.tool('add_effect', { target: 'jb01', effect: 'reverb', decay: 1.6, predelay: 25, mix: 8, size: 40 });

// ================= JB202 — intro pad (bars 1-16 only, then gone forever) =================
// two saws C3 + C4 detuned ±12 cents; LPF drifts 800 -> 1400 -> 900 Hz (drift, not a riser);
// 4 s hall at 40% wet on the channel. Beatless. Killed dead by the bar-17 hard cut.
{
  const steps = 16 * 16;
  const pat = Array(steps).fill(null).map((_, i) => ({ note: 'C3', gate: true, accent: false, slide: i > 0 }));
  // NOTE: the freeverb hall has ~+16 dB steady-state comb gain on a continuous drone, so the
  // channel level sits far below the spec's -8: level -14 + mix 25 lands the intro at the
  // spec's intended loudness (clearly below the siege). Disclosed as a deviation.
  await jb.tool('add_jb202', { pattern: pat, bars: 16 });
  await jb.tool('tweak_jb202', {
    level: -14,
    osc1Waveform: 'sawtooth', osc1Octave: 0, osc1Detune: -12, osc1Level: 70,
    osc2Waveform: 'sawtooth', osc2Octave: 12, osc2Detune: 12, osc2Level: 55,
    filterCutoff: 800, filterResonance: 5, filterEnvAmount: 0,
    ampAttack: 25, ampDecay: 50, ampSustain: 100, ampRelease: 40, drive: 10,
  });
  // LPF drift across the 16 bars: 800 -> 1400 (bars 1-10) -> 900 (bars 11-16); ends lower than its peak
  const lane = [...ramp(160, 800, 1400), ...ramp(96, 1400, 900)];
  await jb.tool('automate', { path: 'jb202.bass.filterCutoff', values: lane });
  await jb.tool('save_pattern', { instrument: 'jb202', name: 'pad' });
  await jb.tool('clear_automation', { path: 'jb202' });
  await jb.tool('add_effect', { target: 'jb202', effect: 'reverb', decay: 4.0, predelay: 20, mix: 25, size: 70 });
}

// ================= ARRANGEMENT — 24 sections, 176 bars exactly =================
// every 8-bar boundary swaps exactly one slot; dropouts/stop are the documented fill substitutes
await jb.tool('set_arrangement', { sections: [
  { bars: 16, jb202: 'pad', jt10: 'whistle' },              //   1-16  beatless C-minor hover
  { bars: 16, jt90: 'head' },                               //  17-32  HARD CUT: drum-only head (K/OH/SH)
  { bars: 8,  jt90: 'a',    jt10: 'stabC' },                //  33-40  stab hard entrance (SH out: slot swap)
  { bars: 8,  jt90: 'b',    jt10: 'stabC', jb01: 'clap' },  //  41-48  +CL (stagger fix), OH 30->40
  { bars: 7,  jt90: 'c7',   jt10: 'stabC', jb01: 'clap' },  //  49-55  +RD fade-in bar 49, OH 40->53
  { bars: 1,  jt90: 'kick1', jt10: 'stabC' },               //  56     1-bar perc dropout: kick + stab alone
  { bars: 8,  jt90: 'd',    jt10: 'stabC' },                //  57-64  CL out, SH fades in 57-58, OH 55->65
  { bars: 7,  jt90: 'e7',   jt10: 'stabC', jb01: 'clap' },  //  65-71  RD out, CL in, OH 65->78
  { bars: 1,  jt90: 'stop1', jt10: 'stabC', jb01: 'clapstop' }, // 72  909 stop beats 3-4; stab rings alone
  { bars: 8,  jt90: 'f',    jt10: 'stabC' },                //  73-80  hard restart; CL out, RD fade; OH 80->100
  { bars: 8,  jt90: 'g',    jt10: 'stabC', jt30: 'tick' },  //  81-88  RD out, 303 in — siege v1, OH parked full
  { bars: 8,  jt90: 'g',    jt10: 'stabC', jb01: 'clap' },  //  89-96  303 out, CL in
  { bars: 6,  jt90: 'i6',   jt10: 'stabC' },                //  97-102 CL out, RD fade-in
  { bars: 2,  jt90: 'kick1', jt10: 'stabC' },               // 103-104 2-bar emptiness: kick + stab
  { bars: 8,  jt90: 'g',    jt10: 'stabC', jt30: 'tick' },  // 105-112 RD out, 303 in
  { bars: 8,  jt90: 'g',    jt10: 'stabC', jb01: 'clap' },  // 113-120 303 out, CL in — last block in C
  { bars: 8,  jt90: 'r8',   jt10: 'stabF' },                // 121-128 TRANSPOSITION +5 st in full flight; RD fade
  { bars: 8,  jt90: 'g',    jt10: 'stabF' },                // 129-136 rotation break: slot sits EMPTY (4 voices)
  { bars: 8,  jt90: 'g',    jt10: 'stabF', jb01: 'clap' },  // 137-144 CL in
  { bars: 7,  jt90: 'i7',   jt10: 'stabF' },                // 145-151 CL out, RD fade-in; LAST stab hit bar 151
  { bars: 1,  jt90: 'kick1' },                              // 152     dropout = kick ALONE (stab hard exit)
  { bars: 8,  jt90: 'g' },                                  // 153-160 drum tail begins: K/OH/SH
  { bars: 8,  jt90: 'k' },                                  // 161-168 SH fades out 161-162
  { bars: 8,  jt90: 'l' },                                  // 169-176 OH out — kick rumble to the final bar
] });

console.log(await jb.tool('show_arrangement', {}));
console.log(await jb.render(RAW, 176));

// ================= MIX BUS (in-script: hiss bed -> compressor -> tape sat) =================
function readWav(path) {
  const buf = readFileSync(path);
  const sr = buf.readUInt32LE(24);
  const ch = buf.readUInt16LE(22);
  // find data chunk
  let off = 12;
  while (off < buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'data') { off += 8; return { sr, ch, data: buf, off, size }; }
    off += 8 + size;
  }
  throw new Error('no data chunk');
}
const { sr, ch, data, off, size } = readWav(`${RAW}.wav`);
const n = Math.floor(size / 2 / ch);
const L = new Float64Array(n), R = new Float64Array(n);
for (let i = 0; i < n; i++) {
  L[i] = data.readInt16LE(off + i * 2 * ch) / 32768;
  R[i] = ch > 1 ? data.readInt16LE(off + i * 2 * ch + 2) / 32768 : L[i];
}

// 1) constant pink-noise hiss bed at -54 dBFS feeding the bus (Paul Kellett approximation).
//    xorshift32 PRNG — an LCG here leaves audible-to-FFT lattice lines near 10 kHz.
function addPink(x, seed) {
  let b0 = 0, b1 = 0, b2 = 0, s = seed >>> 0;
  const g = Math.pow(10, -54 / 20) / 0.35; // Kellett pink peaks ~0.35 rms-normalized-ish
  for (let i = 0; i < x.length; i++) {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    const w = s / 0x80000000 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    x[i] += (b0 + b1 + b2 + w * 0.1848) * g * 0.2;
  }
}
addPink(L, 0x2545f491); addPink(R, 0x9e3779b9);

// 2) bus compressor: 30 ms attack / 80 ms release, threshold set so the kick peaks pull 3-4 dB
//    of GR (the pump); no makeup here — final level is set by the adaptive trim below so the
//    loud-section RMS stays in the 0.10-0.17 window
const aAtk = Math.exp(-1 / (0.030 * sr)), aRel = Math.exp(-1 / (0.080 * sr));
const THRESH_DB = -13, RATIO = 3; // 30ms attack lets the kick transient through, then ducks the wash — the pump
let env = 0, grSum = 0, grN = 0, grMax = 0;
for (let i = 0; i < n; i++) {
  const inAbs = Math.max(Math.abs(L[i]), Math.abs(R[i]));
  env = inAbs > env ? aAtk * env + (1 - aAtk) * inAbs : aRel * env + (1 - aRel) * inAbs;
  const envDb = 20 * Math.log10(env + 1e-9);
  const over = envDb - THRESH_DB;
  const grDb = over > 0 ? over * (1 - 1 / RATIO) : 0;
  if (grDb > 0) { grSum += grDb; grN++; if (grDb > grMax) grMax = grDb; }
  const gain = Math.pow(10, -grDb / 20);
  L[i] *= gain; R[i] *= gain;
}
console.log(`bus comp: avg GR ${(grSum / Math.max(grN, 1)).toFixed(2)} dB over ${(100 * grN / n).toFixed(0)}% of samples, max GR ${grMax.toFixed(2)} dB`);

// 3) mild tape saturation (soft clip)
const DRV = 1.05, dn = Math.tanh(DRV);
for (let i = 0; i < n; i++) { L[i] = Math.tanh(DRV * L[i]) / dn; R[i] = Math.tanh(DRV * R[i]) / dn; }

// 4) adaptive trim: peak <= 0.90 AND loudest 8-bar RMS ~<= 0.155
let pk = 0;
for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
const barSamp = (60 / 145) * 4 * sr;
let maxRms = 0;
for (let b = 16; b + 8 <= 176; b += 4) { // scan drum sections in 8-bar windows
  const s0 = Math.floor(b * barSamp), s1 = Math.min(Math.floor((b + 8) * barSamp), n);
  let acc = 0;
  for (let i = s0; i < s1; i++) acc += (L[i] * L[i] + R[i] * R[i]) / 2;
  maxRms = Math.max(maxRms, Math.sqrt(acc / (s1 - s0)));
}
const trim = Math.min(0.90 / pk, 0.165 / maxRms);
console.log(`pre-trim peak ${pk.toFixed(3)}, max 8-bar rms ${maxRms.toFixed(3)}, trim ${(20 * Math.log10(trim)).toFixed(2)} dB -> final peak ${(pk * trim * 100).toFixed(0)}%`);

// write final WAV (16-bit stereo)
const out = Buffer.alloc(44 + n * 4);
out.write('RIFF', 0); out.writeUInt32LE(36 + n * 4, 4); out.write('WAVE', 8);
out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
out.writeUInt32LE(sr, 24); out.writeUInt32LE(sr * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34);
out.write('data', 36); out.writeUInt32LE(n * 4, 40);
for (let i = 0; i < n; i++) {
  out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * trim * 32767))), 44 + i * 4);
  out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * trim * 32767))), 44 + i * 4 + 2);
}
writeFileSync(FINAL, out);
console.log(`wrote ${FINAL} (${(n / sr).toFixed(1)} s)`);

// ================= built-in analysis on the mastered file =================
console.log(await jb.tool('detect_resonance', { filename: FINAL, minProminence: 12 }));
console.log(await jb.tool('analyze_render', { filename: FINAL }));

process.exit(0);
