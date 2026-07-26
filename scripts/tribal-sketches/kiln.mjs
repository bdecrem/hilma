/**
 * KILN — 132 BPM, swing 0, 112 bars, A minor (~3:24)
 *
 * Peak-time Purpose Maker-corner tribal jam. Rimshot programmed first (the clock),
 * three 909 toms tuned root/fourth/fifth (A2/D3/E3), no bassline — the long-decay
 * kick (fundamental ~55 Hz = A1) owns the bass register. One dark 303 stab figure
 * (A1 + a single C2 answer) enters at the halfway payoff, used strictly as percussion.
 *
 * Run: cd /Users/bartdecrem/Documents/coding2025/vibeceo/jambot && node <this file>
 *
 * Engine notes (verified by probing):
 * - jt90 offline engine wraps patterns at 16 steps, so every 2-/4-bar phrase
 *   (K2, R2, T-LOW, T-FULL) is decomposed into per-bar 16-step patterns and the
 *   arrangement alternates 1-bar sections. Accents = per-step velocity (linear amp).
 * - jt90/jt30 save_pattern captures EMPTY params (proxy serialization); we patch
 *   each saved slot with the real engine-unit params from the node.
 * - jt90 tweak tune is SEMITONES. Measured: kick tune 0 -> 55.2 Hz (A1);
 *   lowtom +5.5 -> 109.7 (A2), midtom +3.5 -> 146.7 (D3), hitom +0.5 -> 164.9 (E3).
 * - Clap + crash live on jb01 (clap / cymbal voices) so their delay/reverb sends
 *   (voice-level chains) don't force jt90 into the per-voice render path, which
 *   would lose the CH->OH choke. jb01 shaker (ch voice) stays dry.
 * - All fades ("linear per-bar interpolation" per spec) are per-step velocity ramps.
 */
import { createHeadless } from '/Users/bartdecrem/Documents/coding2025/vibeceo/jambot/headless.js';

const OUT = '/private/tmp/claude-501/-Users-bartdecrem-Documents-coding2025-hilma/9a88ecd8-cb32-4f5b-a35e-ecd209a3961e/scratchpad/renders/kiln';

const jb = await createHeadless({ bpm: 132 });
await jb.tool('set_swing', { amount: 0 }); // dead straight — feel comes from accents + shaker ladder

// ---------------------------------------------------------------- voice params
// jt90 (constant for the whole take — mute-and-fade grammar, no knob rides)
await jb.tool('tweak_jt90', { voice: 'kick',   level: -3,  tune: 0,   decay: 62 }); // ~55 Hz A1 — this IS the bass
await jb.tool('tweak_jt90', { voice: 'rimshot',level: -7,             decay: 50 }); // the clave/clock, bone dry
await jb.tool('tweak_jt90', { voice: 'ch',     level: -12,            decay: 20 });
await jb.tool('tweak_jt90', { voice: 'oh',     level: -10,            decay: 90 }); // spills to next CH choke
await jb.tool('tweak_jt90', { voice: 'ride',   level: -16,            decay: 80 });
await jb.tool('tweak_jt90', { voice: 'lowtom', level: -8,  tune: 5.5, decay: 45 }); // A2 (root)
await jb.tool('tweak_jt90', { voice: 'midtom', level: -9,  tune: 3.5, decay: 40 }); // D3 (fourth)
await jb.tool('tweak_jt90', { voice: 'hitom',  level: -10, tune: 0.5, decay: 38 }); // E3 (fifth)

// jb01: shaker (ch), clap, crash (cymbal)
// NOTE on levels: jb01's synth voices render ~14-16 dB quieter than jt90's at the same
// dB setting (measured: ch at -14 dB peaks 0.023 vs jt90 kick at -3 dB peaking 0.50).
// The spec's mix targets are RELATIVE to the kick, so these values are calibrated by
// measured output to land the spec's balance: shaker ~-11 dB, clap ~-9 dB, crash ~-7 dB
// below the kick — i.e. the spec's -14 / -12 / -10 vs kick -3.
await jb.tool('tweak_jb01', { voice: 'ch',     level: 1.0 });             // SH1 humanized layer (== spec -14)
await jb.tool('tweak_jb01', { voice: 'clap',   level: -4, decay: 45 });  // pushed back via sends (== spec -12)
await jb.tool('tweak_jb01', { voice: 'cymbal', level: 3,  decay: 85 });  // single crash, bar 57 (== spec -10)

// jt30 — dark 303 stab, percussion not melody
await jb.tool('tweak_jt30', {
  level: -8, filterCutoff: 420, filterResonance: 58,
  filterEnvAmount: 38, filterDecay: 28, accentLevel: 72, drive: 40,
});

// ---------------------------------------------------------------- effects (persist whole render)
// DELAY: dotted-8th = 341 ms at 132. Sends: clap 35%, 303 18%. Nothing else.
await jb.tool('add_effect', { target: 'jt30',      effect: 'delay',  mode: 'analog', sync: 'dotted8th', feedback: 32, mix: 18, lowcut: 200, highcut: 6000 });
await jb.tool('add_effect', { target: 'jb01.clap', effect: 'delay',  mode: 'analog', sync: 'dotted8th', feedback: 32, mix: 35, lowcut: 200, highcut: 6000 });
// REVERB: small dark room ~0.9 s. Sends: clap 20%, crash 25%. Everything else dry.
await jb.tool('add_effect', { target: 'jb01.clap',   effect: 'reverb', decay: 0.9, damping: 70, mix: 20 });
await jb.tool('add_effect', { target: 'jb01.cymbal', effect: 'reverb', decay: 0.9, damping: 70, mix: 25 });

// ---------------------------------------------------------------- pattern helpers
const VEL_HI = 1.0, VEL_LO = 0.6, VEL_CH = 0.56, VEL_CLUSTER = 0.4;
const vp = (map) => Array(16).fill(0).map((_, i) =>
  map[i] !== undefined ? { velocity: map[i], accent: false } : { velocity: 0, accent: false });
const merge = (...maps) => Object.assign({}, ...maps);

// --- jt90 building blocks (0-indexed steps; spec is 1-indexed) ---
const K1   = { 0: VEL_HI, 4: 0.62, 8: VEL_HI, 12: 0.62 };                       // kick: 1,5,9,13; accents 1,9
const K2b  = { 0: VEL_HI, 4: VEL_HI, 5: VEL_CLUSTER, 6: VEL_CLUSTER, 8: VEL_HI, 12: VEL_HI }; // K2 bar 2 (judge fix: clusters 22/23 only)
const R1   = { 0: 1, 3: 1, 6: 1, 10: 1, 13: 1 };                                // rim clock: 1,4,7,11,14 — uniform
const R1T  = { 0: 1, 3: 1, 6: 1, 10: 1, 13: 1, 15: 1 };                         // R2 bar-4 turnaround (+step 16)
const H1   = Object.fromEntries(Array(16).fill(0).map((_, i) => [i, (i % 4 === 3) ? VEL_HI : VEL_CH])); // all 16, accents on the 'a's
const H2   = Object.fromEntries([0,1,3,4,5,7,8,9,11,12,13,15].map(i => [i, (i % 4 === 3) ? VEL_HI : VEL_CH])); // choke form (holes at OH offbeats)
const O1   = { 2: 1, 6: 1, 10: 1, 14: 1 };                                      // open hats: 3,7,11,15
// T-LOW (2-bar answer seed): LT 8,16 | 24,30 — accents 16,30
const TL1  = { lowtom: { 7: VEL_LO, 15: VEL_HI } };
const TL2  = { lowtom: { 7: VEL_LO, 13: VEL_HI } };
// T-FULL (2-bar quasi-melody): bar1 A(8) D(12) E(15) A(16); bar2 run A(24) E(27) D(28) A(30) D(31) — accents 15,16,27
const TF1  = { lowtom: { 7: VEL_LO, 15: VEL_HI }, midtom: { 11: VEL_LO },              hitom: { 14: VEL_HI } };
const TF2  = { lowtom: { 7: VEL_LO, 13: VEL_LO }, midtom: { 11: VEL_LO, 14: VEL_LO },  hitom: { 10: VEL_HI } };
// RD1 straight 8ths; fade handled by per-step velocity ramp (-24 dB -> 0 dB rel. over 4 bars)
const rideFadeBar = (barIdx) => Object.fromEntries([0,2,4,6,8,10,12,14].map(i => {
  const idx = barIdx * 16 + i;
  return [i, Math.pow(10, (-24 + 24 * idx / 63) / 20)];
}));
const RD_FULL = Object.fromEntries([0,2,4,6,8,10,12,14].map(i => [i, 1]));

// jt90 pattern saver — patches the params slot (save_pattern stores empty proxies)
async function saveJT90(name, voices) {
  await jb.tool('add_jt90', { clear: true, ...Object.fromEntries(Object.entries(voices).map(([v, m]) => [v, vp(m)])) });
  await jb.tool('save_pattern', { instrument: 'jt90', name });
  jb.session.patterns.jt90[name].params = JSON.parse(JSON.stringify(jb.session._nodes.jt90.getAllVoiceParams()));
}

// jb01 pattern saver (params capture natively)
async function saveJB01(name, voices) {
  await jb.tool('add_jb01', { clear: true, ...Object.fromEntries(Object.entries(voices).map(([v, m]) => [v, vp(m)])) });
  await jb.tool('save_pattern', { instrument: 'jb01', name });
}

// jt30 pattern saver — per-bar cutoff stepping (spec arcs are "linear per-bar interpolation")
const A1a = { 3: { note: 'A1', accent: true }, 10: { note: 'A1', accent: false } };                             // A1 bar 1: steps 4, 11
const A1b = { 3: { note: 'A1', accent: true }, 10: { note: 'A1', accent: false }, 13: { note: 'C2', accent: false } }; // bar 2: 20, 27 + C2 at 30
async function saveJT30(name, half, cutoffHz) {
  await jb.tool('tweak_jt30', { filterCutoff: cutoffHz });
  const pat = Array(16).fill(0).map((_, i) => half[i]
    ? { note: half[i].note, gate: true, accent: half[i].accent, slide: false }
    : { note: 'A1', gate: false, accent: false, slide: false });
  await jb.tool('add_jt30', { pattern: pat });
  await jb.tool('save_pattern', { instrument: 'jt30', name });
  jb.session.patterns.jt30[name].params = JSON.parse(JSON.stringify(jb.session._nodes.jt30.getEngineParams()));
}

// ---------------------------------------------------------------- jt90 scene patterns
// Scene 1 RIM CLOCK (1-8) + Scene 2 AIR (9-16)
await saveJT90('S1',  { kick: K1, rimshot: R1, ch: H1 });
await saveJT90('S2',  { kick: K1, rimshot: R1, ch: H2, oh: O1 });
// Scene 3 TOM ASCENT (17-32)
await saveJT90('S3a', { kick: K1, rimshot: R1, ch: H2, oh: O1, ...TL1 });
await saveJT90('S3b', { kick: K1, rimshot: R1, ch: H2, oh: O1, ...TL2 });
await saveJT90('S4a', { kick: K1, rimshot: R1, ch: H2, oh: O1, ...TF1 });
await saveJT90('S4b', { kick: K1, rimshot: R1, ch: H2, oh: O1, ...TF2 });
// Scene 4 GLUE (33-40): +ride (faded in 33-36) +clap; rim -> R2 (turnaround bars 36/40, judge fix: R2 starts here)
await saveJT90('S5a', { kick: K1, rimshot: R1,  ch: H2, oh: O1, ...TF1, ride: rideFadeBar(0) });
await saveJT90('S5b', { kick: K1, rimshot: R1,  ch: H2, oh: O1, ...TF2, ride: rideFadeBar(1) });
await saveJT90('S5c', { kick: K1, rimshot: R1,  ch: H2, oh: O1, ...TF1, ride: rideFadeBar(2) });
await saveJT90('S5d', { kick: K1, rimshot: R1T, ch: H2, oh: O1, ...TF2, ride: rideFadeBar(3) });
await saveJT90('S5e', { kick: K1, rimshot: R1,  ch: H2, oh: O1, ...TF1, ride: RD_FULL });
await saveJT90('S5f', { kick: K1, rimshot: R1,  ch: H2, oh: O1, ...TF2, ride: RD_FULL });
await saveJT90('S5g', { kick: K1, rimshot: R1T, ch: H2, oh: O1, ...TF2, ride: RD_FULL });
// Scene 5 SWAP (41-48): CH out (shaker fades in on jb01), clap out (judge fix), rim stays R2
await saveJT90('S6a', { kick: K1, rimshot: R1,  oh: O1, ...TF1, ride: RD_FULL });
await saveJT90('S6b', { kick: K1, rimshot: R1,  oh: O1, ...TF2, ride: RD_FULL });
await saveJT90('S6c', { kick: K1, rimshot: R1T, oh: O1, ...TF2, ride: RD_FULL });
// Scene 6 KICK DROP (49-56): kick+ride out, rim back to R1
await saveJT90('S7a', { rimshot: R1, oh: O1, ...TF1 });
await saveJT90('S7b', { rimshot: R1, oh: O1, ...TF2 });
// Scene 7 PAYOFF (57-72): slam back — kick returns, OH out, toms thin to T-LOW (57-64); T-FULL + OH back (65-72)
await saveJT90('S8a', { kick: K1, rimshot: R1, ...TL1 });
await saveJT90('S8b', { kick: K1, rimshot: R1, ...TL2 });
await saveJT90('S9a', { kick: K1, rimshot: R1, oh: O1, ...TF1 });
await saveJT90('S9b', { kick: K1, rimshot: R1, oh: O1, ...TF2 });
// Scene 8 PEAK (73-88): K2 clusters in alternate bars, rim R2, ride fades in again (73-76)
await saveJT90('S10a', { kick: K1,  rimshot: R1,  oh: O1, ...TF1, ride: rideFadeBar(0) });
await saveJT90('S10b', { kick: K2b, rimshot: R1,  oh: O1, ...TF2, ride: rideFadeBar(1) });
await saveJT90('S10c', { kick: K1,  rimshot: R1,  oh: O1, ...TF1, ride: rideFadeBar(2) });
await saveJT90('S10d', { kick: K2b, rimshot: R1T, oh: O1, ...TF2, ride: rideFadeBar(3) });
await saveJT90('S10e', { kick: K1,  rimshot: R1,  oh: O1, ...TF1, ride: RD_FULL });
await saveJT90('S10f', { kick: K2b, rimshot: R1,  oh: O1, ...TF2, ride: RD_FULL });
await saveJT90('S10g', { kick: K2b, rimshot: R1T, oh: O1, ...TF2, ride: RD_FULL });
// Scene 9 REDUCTION (89-104): 89-96 reuse S9a/S9b (kick/rim/OH/T-FULL); 97-104 thin to T-LOW
await saveJT90('S12a', { kick: K1, rimshot: R1, oh: O1, ...TL1 });
await saveJT90('S12b', { kick: K1, rimshot: R1, oh: O1, ...TL2 });
// Scene 10 OUT (105-112): mirror of the intro; H1 from bar 109 (judge fix) — hard stop after 112
await saveJT90('S13', { kick: K1, rimshot: R1, ch: H2, oh: O1 });
await saveJT90('S14', { kick: K1, rimshot: R1, ch: H1 });

// ---------------------------------------------------------------- jb01 scene patterns
// SH1 velocity ladder — offbeat-weighted, rising into each downbeat (fixed ladder, no RNG in engine)
const LAD = [72, 38, 96, 52, 70, 41, 99, 55, 74, 36, 102, 50, 68, 44, 108, 60].map(v => v / 127);
const shakerBar = (fadeFn) => Object.fromEntries(LAD.map((v, i) => [i, Math.min(1, v * (fadeFn ? fadeFn(i) : 1))]));
await saveJB01('CP', { clap: { 4: 1, 12: 1 } });                                  // CP1: 5, 13 — heard via the 341 ms tail
await saveJB01('SH', { ch: shakerBar() });                                        // steady ladder at -14 dB
for (let k = 0; k < 4; k++)                                                       // fade-in 41-44: -34 -> -14 dB
  await saveJB01(`SF${k + 1}`, { ch: shakerBar(i => Math.pow(10, (-20 + 20 * (k * 16 + i) / 63) / 20)) });
await saveJB01('SHC', { ch: shakerBar(), cymbal: { 0: 1 } });                     // bar 57: the single crash
for (let k = 0; k < 8; k++)                                                       // fade-out 97-104: -14 -> -40 dB
  await saveJB01(`SO${k + 1}`, { ch: shakerBar(i => Math.pow(10, (-26 * (k * 16 + i) / 127) / 20)) });

// ---------------------------------------------------------------- jt30 scene patterns
// A1 figure alternates bars (a = odd bars from 57, b = even bars w/ the C2 answer).
// Cutoff arc, stepped per bar: 57-64 hold 420; 65-80 open 420->880; 81-87 choke 880->300; silent from 88.
const cutoffAt = (bar) =>
  bar <= 64 ? 420 :
  bar <= 80 ? 420 + 460 * (bar - 65) / 15 :
              880 - 580 * (bar - 81) / 6;
for (let bar = 57; bar <= 87; bar++) {
  await saveJT30(`B${bar}`, (bar % 2 === 1) ? A1a : A1b, cutoffAt(bar));
}

// ---------------------------------------------------------------- arrangement (112 bars)
const secs = [];
const bar1 = (jt90, extra = {}) => secs.push({ bars: 1, jt90, ...extra });
secs.push({ bars: 8, jt90: 'S1' });                                               //   1-8   RIM CLOCK
secs.push({ bars: 8, jt90: 'S2' });                                               //   9-16  AIR
for (let i = 0; i < 4; i++) { bar1('S3a'); bar1('S3b'); }                         //  17-24  TOM ASCENT (T-LOW)
for (let i = 0; i < 4; i++) { bar1('S4a'); bar1('S4b'); }                         //  25-32  TOM ASCENT (T-FULL)
for (const p of ['S5a','S5b','S5c','S5d','S5e','S5f','S5e','S5g'])                //  33-40  GLUE (+ride fade, +clap)
  bar1(p, { jb01: 'CP' });
['SF1','SF2','SF3','SF4'].forEach((sf, i) =>                                      //  41-44  SWAP (shaker fade-in)
  bar1(['S6a','S6b','S6a','S6c'][i], { jb01: sf }));
['S6a','S6b','S6a','S6c'].forEach(p => bar1(p, { jb01: 'SH' }));                  //  45-48  SWAP (hold)
for (let i = 0; i < 4; i++) { bar1('S7a', { jb01: 'SH' }); bar1('S7b', { jb01: 'SH' }); } //  49-56  KICK DROP
for (let bar = 57; bar <= 64; bar++)                                              //  57-64  PAYOFF (crash bar 57, 303 in, T-LOW)
  bar1(bar % 2 === 1 ? 'S8a' : 'S8b', { jb01: bar === 57 ? 'SHC' : 'SH', jt30: `B${bar}` });
for (let bar = 65; bar <= 72; bar++)                                              //  65-72  PAYOFF (T-FULL + OH back, filter opens)
  bar1(bar % 2 === 1 ? 'S9a' : 'S9b', { jb01: 'SH', jt30: `B${bar}` });
const peak = ['S10a','S10b','S10c','S10d','S10e','S10f','S10e','S10g','S10e','S10f','S10e','S10g','S10e','S10f','S10e','S10g'];
for (let i = 0; i < 16; i++) {                                                    //  73-88  PEAK (K2, ride fade 2, choke 81-87)
  const bar = 73 + i;
  bar1(peak[i], { jb01: 'SH', ...(bar <= 87 ? { jt30: `B${bar}` } : {}) });       //  bar 88: only the 303 is yanked (judge fix)
}
for (let i = 0; i < 4; i++) { bar1('S9a', { jb01: 'SH' }); bar1('S9b', { jb01: 'SH' }); }   //  89-96  REDUCTION (ride+303 out)
for (let i = 0; i < 8; i++)                                                       //  97-104 REDUCTION (T-LOW, shaker fades out)
  bar1(i % 2 === 0 ? 'S12a' : 'S12b', { jb01: `SO${i + 1}` });
secs.push({ bars: 4, jt90: 'S13' });                                              // 105-108 OUT (H2 + OH)
secs.push({ bars: 4, jt90: 'S14' });                                              // 109-112 OUT (H1, judge fix) — hard stop

const total = secs.reduce((s, x) => s + x.bars, 0);
console.log(`sections: ${secs.length}, total bars: ${total}`);
if (total !== 112) throw new Error(`bar count ${total} !== 112`);
console.log(await jb.tool('set_arrangement', { sections: secs }));

// ---------------------------------------------------------------- render
console.log(await jb.render(OUT, total));
process.exit(0);
