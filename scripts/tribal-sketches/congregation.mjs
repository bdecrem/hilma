// ============================================================================
// CONGREGATION — tribal techno, 138 BPM, A minor, 152 bars (~4:24)
// Two-movement gospel 909 anthem. Movement 1 (bars 1-88): call-and-response
// bell riff over an overdriven 55 Hz kick whose rumble is the only low end.
// Movement 2 (bars 89-152): the bell dies at 88, a chuffy 16th synth bass
// takes over the hat function. Zero swing, zero fills, zero risers, zero
// crashes — every energy change is a mute, a fader fade, or a decay ride.
//
// Judge fixes applied:
//  - break re-seated on the 8-bar grid: 129-136 is one block (129-132 kick-only
//    dropout, 133-136 BASS+CP in-block return), RD fade moved to 137-138,
//    CP mute moved to 145
//  - bell chromatic planing fixed by DROPPING the third osc (judge option 2 —
//    jb202 gives two oscs: main + perfect 5th below; no +3st osc at all)
//  - BD decay 0.70→0.45 roll moved INTO bar 88 so bar 89 opens on short kick
//  - complete performance script: every gesture is its own arrangement section
//  - OH velocity flattened to 0/0
//  - kick specced by target frequency: A1 = 55.0 Hz = jt90 kick at tune 0
//    (verified: rendered fundamental measures 55.2 Hz)
//
// Implementation notes (jambot arrangement-mode quirks, discovered by test):
//  - jt90/jt10 save_pattern param snapshots serialize to empty objects, so
//    per-scene jt90 voice params are driven ENTIRELY via `automate` arrays
//    (which DO snapshot correctly per pattern), and the jt10 patch is written
//    into its saved pattern directly from the node's live engine params.
//  - any PER-VOICE effect (e.g. 'jt90.clap') switches the whole instrument to
//    renderVoices(), which silently drops automation AND params. So: no
//    per-voice chains anywhere. The kick drive became a jt90 BUS soft clip
//    (doubles as the spec's glue-comp "raw hardware mix" feel), and the CLAP
//    lives on jb01 — its own instrument — so the 3/16 delay + plate can hang
//    on jb01's instrument-level chain without breaking anything.
//  - add_sidechain mis-triggers on jt90 object-step patterns (ducks every
//    16th), so sidechain GR is baked into the level grids instead:
//    RD on-beats -3 dB, bass kick-coincident 16ths -2 dB.
//
// Run: cd /Users/bartdecrem/Documents/coding2025/vibeceo/jambot && node <this file>
// ============================================================================

import { createHeadless } from '/Users/bartdecrem/Documents/coding2025/vibeceo/jambot/headless.js';

const OUT = '/private/tmp/claude-501/-Users-bartdecrem-Documents-coding2025-hilma/9a88ecd8-cb32-4f5b-a35e-ecd209a3961e/scratchpad/renders/congregation';

const jb = await createHeadless({ bpm: 138 });
await jb.tool('set_swing', { amount: 0 }); // dead-straight machine grid, no swing anywhere

// ---------------------------------------------------------------------------
// LEVEL PLAN (absolute dB, calibrated against measured renders)
// ---------------------------------------------------------------------------
const KICK_LVL = -8;               // hot into the bus soft-clip; rumble is M1's bass
const OH_LVL = -3;                 // offbeat 8ths, FLAT velocity per judge fix (0/0)
const RD_TRIM = -9;                // ride offbeat/accent tier (doubles the OH)
const RD_GHOST = RD_TRIM - 14 - 3; // on-beat ghost tier: deepened grid tier + baked -3 sidechain GR
const CP_LVL = -6;                 // the deliberately buried element
const BL_ACC = -2;                 // bell-low accent tier (jb202 per-step level, dB)
const BL_GHO = BL_ACC - 7;         // bell-low ghost answers, -7 dB under accents
const BH_LVL = -8;                 // bell-high node trim (jt10; ghosts ride accent velocity)
const BS_ACC = 0.5;                // bass accent tier: offbeat 8ths = the hat line
const BS_GHO = BS_ACC - 10;        // all other 16ths
const BS_KICK = BS_GHO - 2;        // kick-coincident 16ths: baked 2 dB sidechain GR

// jt90 step grids (0-indexed 16ths; spec steps are 1-indexed)
const KICK_STEPS = [0, 4, 8, 12];             // four-on-the-floor, flat accents
const OH_STEPS = [2, 6, 10, 14];              // offbeat 8ths
const RD_STEPS = [0, 2, 4, 6, 8, 10, 12, 14]; // straight 1/8s
const CP_STEPS = [4, 12];                     // beats 2 and 4

// Ride two-tier level grid (one bar): on-beats ghost tier, offbeats accent tier
const RD_TIER = Array(16).fill(null);
for (const s of [0, 4, 8, 12]) RD_TIER[s] = RD_GHOST;
for (const s of [2, 6, 10, 14]) RD_TIER[s] = RD_TRIM;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const N = (note, accent = false) => ({ note, gate: true, accent, slide: false });
const R = { note: 'C3', gate: false, accent: false, slide: false };
const flat = (v) => [v]; // constant automation lane (wraps every step)

// Ride level array for a scene: tier grid + optional fade-in ramp / dB dip window
function rideLevels(bars, { fadeSteps = 0, dip = null } = {}) {
  const v = [];
  for (let k = 0; k < bars * 16; k++) {
    let x = RD_TIER[k % 16];
    if (x === null) { v.push(null); continue; } // no trigger on this step
    if (k < fadeSteps) x += -40 + 40 * (k / fadeSteps); // manual fader push from silence
    if (dip && k >= dip.from && k < dip.to) x += dip.db;
    v.push(Math.max(-60, x));
  }
  return v;
}

// Bell-low one-bar level grid (accents steps 1,4,7,11; ghost answers 8,12,14)
function bellLowLevels(bars, offsetFn = () => 0) {
  const base = Array(16).fill(null);
  for (const s of [0, 3, 6, 10]) base[s] = BL_ACC;
  for (const s of [7, 11, 13]) base[s] = BL_GHO;
  const v = [];
  for (let k = 0; k < bars * 16; k++) {
    const b = base[k % 16];
    v.push(b === null ? null : Math.max(-60, b + offsetFn(k)));
  }
  return v;
}

// Free-running tape-wow: ±18 cents at ~0.35 Hz. A 26-step sine (26 × 108.7 ms =
// 2.83 s ≈ 0.354 Hz) is non-commensurate with the 16-step bar, so the warble
// drifts against the loop exactly like a free LFO.
const WOW = Array.from({ length: 26 }, (_, k) => 18 * Math.sin((2 * Math.PI * k) / 26));
const WOW2 = WOW.map(v => 7 + v); // osc2 keeps its +7c fatness offset, same motion

// Analog machine jitter on the metal voices (sub-audible, ±6-8 cents): a real
// 909's analog voice tuning wobbles a few cents hit to hit; digitally-perfect
// looping instead turns every hat/ride partial into a razor spectral line.
// Seeded per-scene random tune arrays (128 steps = no repetition inside an
// 8-bar section) restore the hardware behavior and de-comb the spectrum
// without touching level or groove. Deterministic seed = reproducible render.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let jitterSeed = 1381;
const jitter = (center, depth, length = 128) => {
  const rnd = mulberry32(jitterSeed++);
  return Array.from({ length }, () => center + depth * (2 * rnd() - 1));
};
// Bell wow with hardware jitter on top: the spec'd ±18c/0.35 Hz sine plus ±3c
// random per hit, over 416 steps (26 bars) so no section ever repeats it.
const wowJ = (offset) => {
  const rnd = mulberry32(jitterSeed++);
  return Array.from({ length: 416 }, (_, k) =>
    offset + 18 * Math.sin((2 * Math.PI * k) / 26) + 3 * (2 * rnd() - 1));
};

// ---------------------------------------------------------------------------
// PATTERNS — all static one-bar 16-step cells (the arrangement is pure
// mute/fader/decay choreography over unchanging loops)
// ---------------------------------------------------------------------------

// BELL (the hook): A minor pentatonic call-and-response, Amen-cadence shape.
// CALL  (full accents): step 1 A, step 4 C, step 7 E, step 11 D (the suspension)
// ANSWER (ghosts -7dB): step 8 C, step 12 A, step 14 G (b7 tail back to the A)
const BELL_LOW_PAT = [
  N('A3', true), R, R, N('C4', true),   // call: root, minor 3rd
  R, R, N('E4', true), N('C4'),         // call: 5th / ghost answer C
  R, R, N('D4', true), N('A3'),         // call: gospel suspension / ghost answer A
  R, N('G3'), R, R,                     // ghost answer: b7 tail pulls back to step-1 A
];
const BELL_HIGH_PAT = [                 // same grid +12 semitones, short decay;
  N('A4', true), R, R, N('C5', true),   // ghosts = non-accented (engine velocity -3 dB)
  R, R, N('E5', true), N('C5'),
  R, R, N('D5', true), N('A4'),
  R, N('G4'), R, R,
];

// BASS (movement 2): 16th octave gallop, accents on the offbeat 8ths so the
// bass line IS the hat line; pentatonic tail (C, G) quotes the departed riff.
const BASS_PAT = [
  N('A2'), N('A2'), N('A3', true), N('A2'),
  N('A2'), N('A2'), N('A3', true), N('A2'),
  N('A2'), N('A2'), N('A3', true), N('A2'),
  N('A2'), N('C3'), N('A3', true), N('G2'),
];

// Bass tier grid (constant across all of movement 2)
const BASS_LVLS = Array.from({ length: 16 }, (_, s) => {
  if ([2, 6, 10, 14].includes(s)) return BS_ACC;   // offbeat accents = hat function
  if ([0, 4, 8, 12].includes(s)) return BS_KICK;   // baked sidechain duck under kick
  return BS_GHO;
});

// ---------------------------------------------------------------------------
// SCENE BUILDERS
// ---------------------------------------------------------------------------

// Build + save one jt90 scene (kick/OH/ride — the clap lives on jb01).
// All voice params ride automation lanes because tweak_jt90 state does not
// survive save_pattern (empty-proxy snapshot bug).
async function drumScene(name, opts) {
  const { oh = false, ride = false, kickDecay = 70, rideTune = 0,
          rideLvls = null, kickDecayAuto = null } = opts;
  await jb.tool('clear_automation', { path: 'jt90' }).catch(() => {});
  await jb.tool('add_jt90', {
    clear: true,
    kick: KICK_STEPS,
    oh: oh ? OH_STEPS : [],
    ride: ride ? RD_STEPS : [],
  });
  // BD: A1 kick, click full, decay knob per scene (70 = M1 rumble, 45 = M2 tight)
  await jb.tool('automate', { path: 'jt90.kick.level', values: flat(KICK_LVL) });
  await jb.tool('automate', { path: 'jt90.kick.attack', values: flat(100) });
  await jb.tool('automate', { path: 'jt90.kick.decay', values: kickDecayAuto ?? flat(kickDecay) });
  if (oh) { // OH: decay FULL — spills over the beat (identity choice), flat velocity
    await jb.tool('automate', { path: 'jt90.oh.level', values: flat(OH_LVL) });
    await jb.tool('automate', { path: 'jt90.oh.decay', values: flat(100) });
    await jb.tool('automate', { path: 'jt90.oh.tune', values: jitter(0, 0.06) });
  }
  if (ride) { // RD: two-tier grid, long tail bridges mute gaps; tune in SEMITONES here
    await jb.tool('automate', { path: 'jt90.ride.level', values: rideLvls ?? rideLevels(1) });
    await jb.tool('automate', { path: 'jt90.ride.decay', values: flat(65) });
    await jb.tool('automate', { path: 'jt90.ride.tune', values: jitter(rideTune, 0.08) });
  }
  await jb.tool('save_pattern', { instrument: 'jt90', name });
}

// Bell-low patch on jb202 (param snapshots DO work for jb202): main osc +
// perfect 5th below (osc2 -7 st), triangle both, decay-only amp env ≈450 ms.
async function bellLowScene(name, lvls) {
  await jb.tool('clear_automation', { path: 'jb202' }).catch(() => {});
  await jb.tool('add_jb202', { pattern: BELL_LOW_PAT });
  await jb.tool('tweak_jb202', {
    level: BL_ACC,
    osc1Waveform: 'triangle', osc1Octave: 0, osc1Level: 100,
    osc2Waveform: 'triangle', osc2Octave: -7, osc2Level: 85,
    filterCutoff: 2500, filterResonance: 10, filterEnvAmount: 15,
    filterAttack: 0, filterDecay: 40, filterSustain: 0,
    ampAttack: 0, ampDecay: 45, ampSustain: 0, ampRelease: 10, // ≈450 ms measured tail
    drive: 10,
  });
  await jb.tool('automate', { path: 'jb202.bass.level', values: lvls });
  await jb.tool('automate', { path: 'jb202.bass.osc1Detune', values: wowJ(0) }); // ±18c @ ~0.35 Hz free wow + hardware jitter
  await jb.tool('automate', { path: 'jb202.bass.osc2Detune', values: wowJ(7) });
  await jb.tool('save_pattern', { instrument: 'jb202', name });
}

// ---------------------------------------------------------------------------
// GLOBAL FX (persist across the whole render — static, no automation)
// ---------------------------------------------------------------------------

// Drum-bus drive: desk-style soft clip on the whole jt90 bus (analog delay
// @1 ms, 100% wet, feedback 0 = a pure saturator stage; verified it keeps the
// 55 Hz kick fundamental). This carries BOTH the spec's kick drive and the
// glue's "raw one-pass hardware mix" floor-dragging feel. Instrument-level
// only — a per-voice chain would silently disable all jt90 automation.
await jb.tool('add_effect', { target: 'jt90', effect: 'delay', mode: 'analog', sync: 'off', time: 1, feedback: 0, mix: 100, saturation: 40, lowcut: 20, highcut: 20000 });

// CP 3/16 delay (on jb01, the clap's own instrument): dotted-8th sync = 326 ms
// at 138, two audible repeats, tail is ghost percussion. lowcut 400 doubles as
// the spec's 400 Hz highpass on the tail.
await jb.tool('add_effect', { target: 'jb01', effect: 'delay', mode: 'analog', sync: 'dotted8th', feedback: 35, mix: 22, lowcut: 400, highcut: 5000, saturation: 10 });

// Shared plate (the only reverb): fed by CP and BELL-HIGH only, ~10% wet.
await jb.tool('add_effect', { target: 'jb01', effect: 'reverb', decay: 1.8, predelay: 30, damping: 60, mix: 8, size: 60 });
await jb.tool('add_effect', { target: 'jt10', effect: 'reverb', decay: 1.8, predelay: 30, damping: 60, mix: 12, size: 60 });

// -- jb01 clap scene (one pattern reused by every clap section) --
await jb.tool('add_jb01', { clear: true, clap: CP_STEPS });
await jb.tool('automate', { path: 'jb01.clap.level', values: flat(CP_LVL) });
await jb.tool('automate', { path: 'jb01.clap.tone', values: jitter(50, 4) });   // ±4 tone jitter de-combs the repeats
await jb.tool('save_pattern', { instrument: 'jb01', name: 'cp' });
await jb.tool('clear_automation', { path: 'jb01' }).catch(() => {});

// ---------------------------------------------------------------------------
// BUILD ALL SCENES
// ---------------------------------------------------------------------------

// -- jt90 drum scenes --
await drumScene('d01', {});
await drumScene('d01b', {});                                                   // fresh-jitter copies for the bar-64 dropout
await drumScene('d01c', {});                                                   // and the 129-132 break (kills exact-repeat combing)                                                    // bars 1-8: kick only, decay 70 — rumble established (also bar 64 + break 129-132)
await drumScene('d02', { oh: true });
await drumScene('d02b', { oh: true });                                         // fresh-jitter copy for bars 17-24                                          // bars 9-16 (+17-24): kick + OH
await drumScene('d04', { oh: true, ride: true, rideLvls: rideLevels(8, { fadeSteps: 32 }) }); // bars 25-32: ride FADED in over 2 bars, never hard-unmuted
await drumScene('d05', { oh: true, ride: true });                              // bars 33-40: full 5-voice state A (CP joins via jb01)
await drumScene('d06', {});                                                    // bars 41-48: OH + RD hard-muted at bar 41 (CP stays, on jb01)
await drumScene('d07', { oh: true, ride: true, rideLvls: rideLevels(8, { fadeSteps: 16 }) }); // bars 49-56: OH returns on downbeat, RD re-faded over 1 bar
await drumScene('d08', { oh: true, ride: true });                              // bars 57-63: M1 peak steady state
await drumScene('d10', { oh: true, ride: true, rideTune: -3 });                // bars 65-72: RIDE REPITCH -3 st — the track's single pitch event (43% mark)
await drumScene('d11', { ride: true, rideTune: -3 });                          // bars 73-80: OH + CP muted — darker, thinner
await drumScene('d12', {                                                       // bars 81-88: LAST FULL STATEMENT; BD decay knob rolled 70→45 across bar 88
  oh: true, ride: true, rideTune: -3,
  kickDecayAuto: (() => {
    const v = Array(128).fill(70);
    v[112] = 64; v[116] = 58; v[120] = 51; v[124] = 45; // bar 88 beats 1-4
    return v;
  })(),
});
await drumScene('d13', { ride: true, rideTune: -3, kickDecay: 45 });
await drumScene('d13b', { ride: true, rideTune: -3, kickDecay: 45 });          // fresh-jitter copies: bars 121-128
await drumScene('d13c', { ride: true, rideTune: -3, kickDecay: 45 });          // and 145-152 (kills exact-repeat combing)           // bars 89-96 (+121-128, 145-152): M2 core — short kick + repitched ride
await drumScene('d15', { oh: true, ride: true, rideTune: -3, kickDecay: 45 }); // bars 105-112: M2 peak, 5 voices
await drumScene('d16', {                                                       // bars 113-120: OH out; RD fader dipped -3 dB bars 115-116, restored 117
  ride: true, rideTune: -3, kickDecay: 45,
  rideLvls: rideLevels(8, { dip: { from: 32, to: 64, db: -3 } }),
});
await drumScene('d19', { kickDecay: 45 });                                     // bars 133-136: jt90 side of the in-block return (kick only; CP via jb01)
await drumScene('d20', { ride: true, rideTune: -3, kickDecay: 45, rideLvls: rideLevels(8, { fadeSteps: 32 }) }); // bars 137-144: RD faded back in over 137-138 (judge re-seat)

// -- jb202 scenes: bell-low (M1) and bass (M2) on the same mono synth.
// BELL and BASS never coexist, so one synth plays both roles, patch swapped
// per saved pattern — exactly what a live hardware jam would do. --
await bellLowScene('bell', bellLowLevels(1));
await bellLowScene('bellR', bellLowLevels(7, (k) => {                          // bars 57-63: the "almost at random" low-bell fader rides
  if (k >= 24 && k < 32) return -6;   // dip -6 dB at bar 58 beat 3, restore bar 59 beat 1
  if (k >= 80 && k < 96) return -60;  // fader fully down bar 62, back up bar 63 beat 1
  return 0;
}));
await jb.tool('clear_automation', { path: 'jb202' }).catch(() => {});
await jb.tool('add_jb202', { pattern: BASS_PAT });
await jb.tool('tweak_jb202', {                                                 // chuff: LP base 500 Hz, env pops it open,
  level: BS_ACC,                                                               // 60 ms filter / 90 ms amp decay per note
  osc1Waveform: 'sawtooth', osc1Octave: 0, osc1Level: 100,                     // (16th = 108.7 ms — no smear), light drive
  osc2Waveform: 'square', osc2Octave: -12, osc2Level: 60,
  filterCutoff: 500, filterResonance: 15, filterEnvAmount: 55,
  filterAttack: 0, filterDecay: 6, filterSustain: 0,
  ampAttack: 0, ampDecay: 9, ampSustain: 0, ampRelease: 5,
  drive: 25,
});
await jb.tool('automate', { path: 'jb202.bass.level', values: BASS_LVLS });
await jb.tool('automate', { path: 'jb202.bass.osc1Detune', values: jitter(0, 3) });   // ±3c hardware jitter
await jb.tool('automate', { path: 'jb202.bass.osc2Detune', values: jitter(7, 3) });
await jb.tool('save_pattern', { instrument: 'jb202', name: 'bass' });

// -- jt10 scene: bell-high (bars 49-88 only) --
await jb.tool('clear_automation', { path: 'jt10' }).catch(() => {});
await jb.tool('add_jt10', { pattern: BELL_HIGH_PAT });
await jb.tool('tweak_jt10', {
  level: BH_LVL,
  sawLevel: 0, pulseLevel: 75, pulseWidth: 45, subLevel: 0,
  filterCutoff: 3000, filterResonance: 15, filterEnvAmount: 20, keyTrack: 80,
  ampAttack: 0, ampDecay: 7, ampSustain: 0, ampRelease: 3,   // ≈120 ms pluck
  lfoRate: 12, lfoToPitch: 3, glideTime: 0,                  // gentle free-running warble
});
await jb.tool('save_pattern', { instrument: 'jt10', name: 'hi' });
// jt10's snapshot serializes to {} (same bug as jt90) and its node ignores
// automation, so write the live engine params straight into the saved pattern:
jb.session.patterns.jt10.hi.params = JSON.parse(JSON.stringify(jb.session._nodes.jt10.getEngineParams()));

// ---------------------------------------------------------------------------
// ARRANGEMENT — 21 sections, sums to exactly 152 bars.
// Every state change is a section boundary; entrances fade, exits cut dead.
// ---------------------------------------------------------------------------
await jb.tool('set_arrangement', { sections: [
  { bars: 8, jt90: 'd01' },                                    //   1-8   BD only — drum head 1/2, rumble established
  { bars: 8, jt90: 'd02' },                                    //   9-16  BD+OH — drum head 2/2
  { bars: 8, jt90: 'd02b', jb202: 'bell' },                    //  17-24  hook enters HARD (bell-low)
  { bars: 8, jt90: 'd04', jb202: 'bell' },                     //  25-32  +RD faded in over bars 25-26
  { bars: 8, jt90: 'd05', jb01: 'cp', jb202: 'bell' },         //  33-40  +CP — full 5-voice state A
  { bars: 8, jt90: 'd06', jb01: 'cp', jb202: 'bell' },         //  41-48  strip-down: OH+RD hard-muted at 41 (BD+BELL+CP)
  { bars: 8, jt90: 'd07', jb01: 'cp', jb202: 'bell', jt10: 'hi' }, //  49-56  OH unmute + RD 1-bar refade + BELL-HIGH enters — M1 peak begins
  { bars: 7, jt90: 'd08', jb01: 'cp', jb202: 'bellR', jt10: 'hi' }, //  57-63  low-bell fader rides
  { bars: 1, jt90: 'd01b', jb202: 'bell', jt10: 'hi' },        //  64     1-bar full-percussion dropout: BD + BELL only (the breath)
  { bars: 8, jt90: 'd10', jb01: 'cp', jb202: 'bell', jt10: 'hi' }, //  65-72  RIDE REPITCH -3 st on the downbeat; OH/RD/CP all return
  { bars: 8, jt90: 'd11', jb202: 'bell', jt10: 'hi' },         //  73-80  OH+CP muted — darker, thinner
  { bars: 8, jt90: 'd12', jb01: 'cp', jb202: 'bell', jt10: 'hi' }, //  81-88  LAST FULL STATEMENT; BD decay 70→45 across bar 88; bell cut DEAD at 88
  { bars: 8, jt90: 'd13', jb202: 'bass' },                     //  89-96  MOVEMENT 2: bass hard entrance on the short kick
  { bars: 8, jt90: 'd13', jb01: 'cp', jb202: 'bass' },         //  97-104 claps back
  { bars: 8, jt90: 'd15', jb01: 'cp', jb202: 'bass' },         // 105-112 M2 peak, 5 voices
  { bars: 8, jt90: 'd16', jb01: 'cp', jb202: 'bass' },         // 113-120 OH out; RD dip 115-116
  { bars: 8, jt90: 'd13b', jb202: 'bass' },                    // 121-128 CP muted — tunneling
  { bars: 4, jt90: 'd01c' },                                   // 129-132 kick-only break, decay blooms to 70 (in-block dropout)
  { bars: 4, jt90: 'd19', jb01: 'cp', jb202: 'bass' },         // 133-136 BASS+CP in-block return, kick back to 45
  { bars: 8, jt90: 'd20', jb01: 'cp', jb202: 'bass' },         // 137-144 RD faded back in over 137-138 — DJ-tail steady state
  { bars: 8, jt90: 'd13c', jb202: 'bass' },                    // 145-152 CP muted at 145; BD+BASS+RD; hard machine STOP after 152 beat 4
] });

// ---------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------
const msg = await jb.render(OUT, 152);
console.log(msg);
process.exit(0); // required — the audio context keeps the process alive otherwise
