// ============================================================================
// PROCESSION — tribal techno, 131 BPM, G minor, 144 bars (~4:24)
//
// Fourth sketch in the Mills-school tribal series (congregation / red clay /
// interceptor) and the first made AFTER the 2026-07-27 jambot repairs. It
// leans on three newly working capabilities:
//   1. REAL 303 slides (glide used to be instantaneous; now duration-true)
//   2. REAL sidechain (used to duck every 16th; now velocity-gated to the kick)
//   3. Honest effects (true-RT60 reverb room on the rim, decaying delay)
//
// CONCEPT — "the switch" (Mills on The Bells: a track everyone knows the
// moment of): an antiphonal hook. Tuned toms (G-Bb-D) ask a three-note
// question every 4 bars from bar 9. The 303 exists only as CLOSED pressure —
// felt, not heard — until bar 89: one bar of near-silence carrying a single
// long 303 slide G1->G2 while the filter opens. From bar 90 the 303 finally
// ANSWERS the toms in full squelch with real portamento. Afro-acid is the
// subgenre's literal DNA (In The Bush = Mory Kante's Afro-Acid mix): drums
// and acid in call-and-response are ONE hook spoken by two voices.
//
// ENGINE NOTES (probed, 2026-07-27): arrangement-mode save_pattern drops ALL
// params (renders engine defaults + automation lanes only), and add_jt90's
// bars: param silently loops at 16 steps. So this script uses SINGLE-PATTERN
// mode with full-length node-level patterns (session._nodes.X.setPattern with
// 144*16-step arrays) — tweaks apply, full-track automation lanes work, and
// effect tails flow across scene boundaries instead of truncating.
//
// Run: cd /Users/bartdecrem/Documents/coding2025/vibeceo/jambot && node <this file>
// ============================================================================

import { createHeadless } from '/Users/bartdecrem/Documents/coding2025/vibeceo/jambot/headless.js';

const OUT = process.argv[2] ||
  '/private/tmp/claude-501/-Users-bartdecrem-Documents-coding2025-hilma/9a88ecd8-cb32-4f5b-a35e-ecd209a3961e/scratchpad/renders/procession';

const BARS = 144;
const STEPS = BARS * 16;

const jb = await createHeadless({ bpm: 131 });
await jb.tool('set_swing', { amount: 0 });   // Mills grid: dead straight; groove lives in velocity lanes

// ---------------------------------------------------------------------------
// LEVEL PLAN (dB) + tuning — single-pattern mode: tweaks verified to apply
// ---------------------------------------------------------------------------
const KICK = -5;
const LT = -8, MT = -9, HT = -10;    // the tom choir (the call)
const RIM = -11;
const CH = -14, OH = -13, CLAP = -11;

await jb.tool('tweak_jt90', { voice: 'kick', tune: -2, decay: 48, level: KICK, attack: 55, sweep: 50 });  // 49 Hz G1 (measured)
await jb.tool('tweak_jt90', { voice: 'lowtom', tune: 5.6, decay: 58, level: LT });   // ~G2 98 Hz
await jb.tool('tweak_jt90', { voice: 'midtom', tune: 4.5, decay: 52, level: MT });   // ~Bb2 116 Hz
await jb.tool('tweak_jt90', { voice: 'hitom', tune: -1.5, decay: 46, level: HT });   // ~D3 147 Hz
await jb.tool('tweak_jt90', { voice: 'rimshot', tune: -4, decay: 14, level: RIM });
await jb.tool('tweak_jt90', { voice: 'ch', decay: 22, tone: 55, level: CH });
await jb.tool('tweak_jt90', { voice: 'oh', decay: 38, tone: 45, level: OH });
await jb.tool('tweak_jt90', { voice: 'clap', decay: 22, tone: 30, level: CLAP });
await jb.tool('tweak_jt90', { voice: 'crash', decay: 65, level: -13 });

// NEWLY UNLOCKED: per-voice reverb with a true RT60 — the rim clock plays
// inside a small dark room. (Per-voice FX no longer break automation.)
await jb.tool('add_effect', { target: 'jt90.rimshot', effect: 'reverb', decay: 0.9, damping: 70, mix: 16, predelay: 8 });

// 303 — G-minor voice; the slides are the featured repair. (level is dB now)
await jb.tool('tweak_jt30', { level: -4, waveform: 'sawtooth', filterCutoff: 300, filterResonance: 74, filterEnvAmount: 32, filterDecay: 42, accentLevel: 82, drive: 28 });
await jb.tool('add_effect', { target: 'jt30', effect: 'delay', mode: 'analog', sync: 'dotted8th', feedback: 40, mix: 20, lowcut: 280, highcut: 5200, saturation: 25 });

// jb202 — G1 sub drone breathing under the kick via the FIXED sidechain.
await jb.tool('tweak', { path: 'jb202.level', value: -9 });
await jb.tool('tweak', { path: 'jb202.osc1Waveform', value: 'sawtooth' });
await jb.tool('tweak', { path: 'jb202.filterCutoff', value: 300 });
await jb.tool('tweak', { path: 'jb202.filterResonance', value: 12 });
await jb.tool('tweak', { path: 'jb202.filterEnvAmount', value: 55 });
await jb.tool('add_sidechain', { target: 'jb202', trigger: 'kick', amount: 0.7 });

// ---------------------------------------------------------------------------
// TIMELINE — scene map (bar-indexed, 1-based inclusive)
// ---------------------------------------------------------------------------
// 1-8    HEAD       kick + rim clock
// 9-24   QUESTION   + offbeat hats + tom call (bar 4 of each 4-bar phrase)
// 25-40  PRESSURE   + sub drone + closed 303 pulse + 16th hats
// 41-56  BUILD      + oh, clap; 303 cutoff rises 160->400
// 57-72  PEAK1      denser tom call; the single teaser bend (bar 68)
// 73-84  STRIP      hats/clap/oh out; kick, rim, toms, closed 303
// 85-88  NOKICK     kick gone — toms and rim alone with the pulse
// 89     SWITCH     near-silence: one long 303 slide G1->G2, filter opening
// 90-105 SLAM       full groove returns (single crash, bar 90); 303 ANSWERS
// 106-121 PAYOFF    antiphony rolls on
// 122-133 GLOW      clap out, hats to offbeats, 303 recedes
// 134-144 TAIL      kick + rim + one last unanswered call
const inBar = (b, from, to) => b >= from && b <= to;

const mk = () => Array.from({ length: STEPS }, () => ({ velocity: 0, accent: false }));
const jt90pat = { kick: mk(), snare: mk(), clap: mk(), rimshot: mk(), lowtom: mk(), midtom: mk(), hitom: mk(), ch: mk(), oh: mk(), crash: mk(), ride: mk() };
// node-level pattern velocity is 0-1 (NOT 0-127 — that renders a clipping wall)
const hit = (voice, bar, step, vel = 100, accent = false) => {
  jt90pat[voice][(bar - 1) * 16 + step] = { velocity: vel / 127, accent };
};

const RIM_CLOCK = [0, 3, 6, 10, 13];
const RIM_VEL = { 0: 110, 3: 78, 6: 88, 10: 78, 13: 108 };     // clock accents baked as velocity
const CH_VEL = [112, 48, 76, 52, 104, 44, 72, 56, 108, 48, 76, 52, 100, 60, 84, 68];

for (let b = 1; b <= BARS; b++) {
  // kick: four-on-floor except NOKICK (85-88) and SWITCH (89)
  if (!inBar(b, 85, 89)) for (const s of [0, 4, 8, 12]) hit('kick', b, s, 118, s === 0);

  // rim clock: everywhere except the switch bar
  if (b !== 89) for (const s of RIM_CLOCK) hit('rimshot', b, s, RIM_VEL[s]);

  // hats
  const hats16 = inBar(b, 25, 72) || inBar(b, 90, 121);
  const hatsOff = inBar(b, 9, 24) || inBar(b, 122, 133);
  if (hats16) for (let s = 0; s < 16; s++) hit('ch', b, s, CH_VEL[s]);
  else if (hatsOff) for (const s of [2, 6, 10, 14]) hit('ch', b, s, CH_VEL[s]);

  // open hat + clap in the full sections
  if (inBar(b, 41, 72) || inBar(b, 90, 121)) {
    for (const s of [2, 10]) hit('oh', b, s, 96);
    for (const s of [4, 12]) hit('clap', b, s, 104);
  }

  // THE QUESTION: tom call in bar 4 of each 4-bar phrase (from bar 9 on,
  // except the switch); denser (every 2 bars) at PEAK1 and PAYOFF
  const phrase4 = (b - 1) % 4 === 3;
  const phrase2 = (b - 1) % 4 === 1;
  const dense = inBar(b, 57, 72) || inBar(b, 90, 121);
  const tomsOn = b >= 9 && b !== 89;
  if (tomsOn && (phrase4 || (dense && phrase2))) {
    hit('lowtom', b, 0, 118, true);     // G
    hit('midtom', b, 3, 106);           // Bb
    hit('hitom', b, 6, 112);            // D
    hit('hitom', b, 7, 84);             // d (ghost double)
    if (dense) hit('lowtom', b, 10, 72);  // rolling ghost in dense sections
  }

  // one crash in the whole track: the slam-back downbeat
  if (b === 90) hit('crash', b, 0, 110);
}
jb.session._nodes.jt90.setPattern(jt90pat);

// hat decay ride: slow 8-bar breathing on the 16th-hat sections (full lane)
const chDecay = Array.from({ length: STEPS }, (_, i) => {
  const b = Math.floor(i / 16) + 1;
  if (!(inBar(b, 25, 72) || inBar(b, 90, 121))) return null;
  const phase = ((b - 1) % 8) / 8;
  return 20 + Math.sin(phase * Math.PI) * 14;
});
await jb.tool('automate', { path: 'jt90.ch.decay', values: chDecay });

// ---------------------------------------------------------------------------
// 303 — full-length pattern + cutoff journey lane
// ---------------------------------------------------------------------------
const A = (note, accent = false, slide = false) => ({ note, gate: true, accent, slide });
const AREST = { note: 'G1', gate: false, accent: false, slide: false };
const acid = Array.from({ length: STEPS }, () => ({ ...AREST }));
const put = (bar, step, s) => { acid[(bar - 1) * 16 + step] = s; };

for (let b = 25; b <= 88; b++) {
  // closed pressure: offbeat 8th pulses, felt not heard
  for (const s of [2, 6, 10, 14]) put(b, s, A('G1'));
}
// the teaser bend — first audible portamento (bar 68)
put(68, 6, A('G1'));
put(68, 7, A('Bb1', false, true));
put(68, 8, A('G1', false, true));

// THE SWITCH (bar 89): one long accented slide G1 -> G2, held
put(89, 0, A('G1', true));
put(89, 2, A('G2', true, true));
for (let s = 3; s < 16; s++) put(89, s, A('G2', false, true));

// THE ANSWER (bars 90-121): 4-bar antiphony — toms call in bar 2 (phrase2 /
// phrase4 grid), 303 answers across bars 3-4 of each phrase
for (let p = 0; p < 8; p++) {
  const base = 90 + p * 4;                    // phrase start bar
  const line = [
    [2, 0, A('G1', true)], [2, 2, A('G1')], [2, 4, A('Bb1', false, true)],
    [2, 6, A('G1', false, true)], [2, 8, A('C2', true)], [2, 10, A('Bb1', false, true)],
    [2, 12, A('G1', false, true)], [2, 14, A('G1')],
    [3, 0, A('G1', true)], [3, 2, A('G2', false, true)], [3, 5, A('D2', false, true)],
    [3, 8, A('Bb1', false, true)], [3, 12, A('G1', false, true)],
  ];
  for (const [barOff, s, st] of line) put(base + barOff, s, st);
}
for (let b = 122; b <= 133; b++) {
  for (const s of [2, 10]) put(b, s, A('G1'));   // receding pulse
}
jb.session._nodes.jt30.setPattern(acid);

// cutoff journey (Hz lane, full length): closed 160 -> rise to 400 (41-56) ->
// 400 hold with teaser -> the switch sweep 200->1800 -> answer at 780 ->
// recede 500->240
const cutoff = Array.from({ length: STEPS }, (_, i) => {
  const b = Math.floor(i / 16) + 1;
  const s = i % 16;
  if (b < 41) return 160;
  if (b <= 56) return 160 + ((b - 41) * 16 + s) / (16 * 16) * 240;   // 160->400
  if (b <= 88) return 400;
  if (b === 89) return 200 + Math.pow(s / 15, 1.6) * 1600;           // the sweep
  if (b <= 121) return 780;
  return 500 - ((b - 122) * 16 + s) / (12 * 16) * 260;               // 500->240
});
await jb.tool('automate', { path: 'jt30.bass.cutoff', values: cutoff });

// ---------------------------------------------------------------------------
// jb202 sub drone — legato G1 (real glide), present bars 25-133
// ---------------------------------------------------------------------------
const sub = Array.from({ length: STEPS }, (_, i) => {
  const b = Math.floor(i / 16) + 1;
  if (b < 25 || b > 133 || b === 89) return { note: 'G1', gate: false, accent: false, slide: false };
  // fresh trigger (slide OFF) at EVERY bar start — jb202 held/slid notes die
  // after ~a bar (env runs out and a slide flag never re-opens a released
  // gate), so the drone re-attacks per bar; the kick sidechain masks it
  const freshStart = i % 16 === 0;
  return { note: 'G1', gate: true, accent: false, slide: !freshStart };
});
jb.session._nodes.jb202.setPattern(sub);

// ---------------------------------------------------------------------------
const msg = await jb.render(OUT, BARS);
console.log(String(msg));
process.exit(0);
