#!/usr/bin/env node
/**
 * Plastikman / Richie Hawtin — Clinical Minimal Techno
 *
 * From library.json:
 * "The magic is in the filter movement, not the notes."
 * "Subtraction is addition — don't add a new sound, delete two notes."
 * "Ghost notes are the soul."
 *
 * 126 BPM, swing on hats, dry kick, offbeat CH, rimshot accents,
 * ghost percussion, 303-style acid bass with resonant filter.
 *
 * Arrangement (8 bars):
 *   1-2: Foundation — kick + rimshot only (maximum space)
 *   3-4: Ghost Groove — add offbeat CH + ghost percussion
 *   5-6: Acid enters — bass pattern, filter barely open
 *   7:   Full groove — everything locked
 *   8:   Ghost Bar — kick drops out, just hats and ghosts
 */

import { createSession } from '../vibeceo8/Jambot/core/session.js';
import { renderSession } from '../vibeceo8/Jambot/core/render.js';

const session = createSession({ bpm: 126, sampleRate: 44100 });

const VOICES = ['kick','snare','clap','ch','oh','lowtom','hitom','cymbal'];
const BARS = 8;

function emptyBars(n) {
  const p = {};
  for (const v of VOICES) {
    p[v] = Array(16 * n).fill(null).map(() => ({ velocity: 0, accent: false }));
  }
  return p;
}

const drums = emptyBars(BARS);

for (let bar = 0; bar < BARS; bar++) {
  const o = bar * 16;

  // ---- KICK ----
  // Bars 1-7: four on the floor. Bar 8: ghost bar (no kick)
  if (bar < 7) {
    for (const beat of [0, 4, 8, 12]) {
      drums.kick[o + beat] = { velocity: 115, accent: false };
    }
  }

  // ---- RIMSHOT (using snare as rimshot proxy) ----
  // All bars: rimshot on &2 and &4 (steps 7, 15)
  drums.snare[o + 7] = { velocity: 60, accent: false };
  drums.snare[o + 15] = { velocity: 55, accent: false };

  // ---- CLOSED HATS ----
  // Bars 3+: offbeat CH pattern (2, 6, 10, 14) — NOT every 16th
  if (bar >= 2) {
    // Velocity slowly increases across bars (Plastikman style)
    const baseVel = 35 + (bar - 2) * 8; // 35 → 75
    drums.ch[o + 2] = { velocity: baseVel, accent: false };
    drums.ch[o + 6] = { velocity: baseVel - 5, accent: false };
    drums.ch[o + 10] = { velocity: baseVel, accent: false };
    drums.ch[o + 14] = { velocity: baseVel - 5, accent: false };
  }

  // ---- GHOST PERCUSSION (using clap at very low velocity) ----
  // Bars 3+: ghost hits on steps 1, 5, 9, 13 — barely audible
  if (bar >= 2) {
    const ghostVel = 20 + (bar - 2) * 3; // very quiet
    drums.clap[o + 1] = { velocity: ghostVel, accent: false };
    drums.clap[o + 5] = { velocity: ghostVel - 5, accent: false };
    drums.clap[o + 9] = { velocity: ghostVel, accent: false };
    drums.clap[o + 13] = { velocity: ghostVel - 5, accent: false };
  }

  // ---- GHOST BAR (bar 8): sparse atmosphere ----
  if (bar === 7) {
    // Just hats and ghost perc — feel the absence of kick
    drums.ch[o + 2] = { velocity: 50, accent: false };
    drums.ch[o + 6] = { velocity: 45, accent: false };
    drums.ch[o + 10] = { velocity: 50, accent: false };
    drums.ch[o + 14] = { velocity: 45, accent: false };
    // Quiet cymbal wash on beat 1
    drums.cymbal[o] = { velocity: 25, accent: false };
  }
}

session._nodes.jb01.setPattern(drums);

// ---- DRUM TUNING — dry, clinical, Plastikman ----

// Kick: short decay, tuned low, dry
session.set('jb01.kick.tune', -2);
session.set('jb01.kick.decay', 20);  // very short — more click than thump
session.set('jb01.kick.attack', 65);
session.set('jb01.kick.sweep', 50);
session.set('jb01.kick.level', -2);

// Snare (as rimshot): short, dry, clicky
session.set('jb01.snare.tune', 4);   // tuned up for rimshot character
session.set('jb01.snare.decay', 10);
session.set('jb01.snare.tone', 70);  // bright, clicky
session.set('jb01.snare.snappy', 20); // minimal snare wire
session.set('jb01.snare.level', -6);

// Clap (as ghost percussion): very short, quiet
session.set('jb01.clap.decay', 8);
session.set('jb01.clap.tone', 50);
session.set('jb01.clap.level', -18); // ghost level

// CH: tight, dark, offbeat
session.set('jb01.ch.decay', 15);
session.set('jb01.ch.tone', 35);
session.set('jb01.ch.level', -8);

// Cymbal: dark wash for ghost bar
session.set('jb01.cymbal.tune', -4);
session.set('jb01.cymbal.decay', 45);
session.set('jb01.cymbal.level', -20);

// ============================================================
// JB202 — 303-style acid (Plastikman style)
// "The filter IS the instrument"
// Single saw osc, high resonance, slow filter
// Enters bar 5, hypnotic G1 root pulse
// ============================================================

const bassPattern = [];
// Acid pattern from library: G1 G1 G2 G1 Bb1 G1 C2 G1 (8 notes over 16 steps)
const acidNotes = ['G1','G1','G2','G1','Bb1','G1','C2','G1'];
const acidAccents = [0, 4, 11]; // accent positions from library
const acidSlides = [6]; // slide from step 6→7

for (let bar = 0; bar < BARS; bar++) {
  for (let step = 0; step < 16; step++) {
    if (bar < 4) {
      // Bars 1-4: bass silent
      bassPattern.push({ note: 'G1', gate: false, accent: false, slide: false });
    } else {
      // Bars 5-8: acid pattern enters
      const noteIdx = step % 8;
      const note = acidNotes[noteIdx];
      const isAccent = acidAccents.includes(step);
      const isSlide = acidSlides.includes(step);
      // Every other step is a note, alternating with rests for that sparse feel
      const isGate = step % 2 === 0;
      bassPattern.push({ note, gate: isGate, accent: isAccent && isGate, slide: isSlide && isGate });
    }
  }
}

session._nodes.jb202.setPattern(bassPattern);

// 303-style acid: sawtooth, high resonance, filter nearly closed
session.set('jb202.osc1Waveform', 'sawtooth');
session.set('jb202.osc1Level', 85);
session.set('jb202.osc2Waveform', 'sawtooth');
session.set('jb202.osc2Octave', 0);
session.set('jb202.osc2Detune', 3);
session.set('jb202.osc2Level', 20);

// "Cutoff starts at 15%, resonance 75-80%" — the liquid sound
session.set('jb202.filterCutoff', 180);   // low — barely open
session.set('jb202.filterResonance', 75);  // high res — the squelch
session.set('jb202.filterEnvAmount', 35);  // env opens filter on accents
session.set('jb202.filterDecay', 40);
session.set('jb202.filterSustain', 0);     // env snaps shut
session.set('jb202.ampDecay', 35);
session.set('jb202.ampSustain', 10);
session.set('jb202.ampRelease', 15);
session.set('jb202.drive', 20);
session.set('jb202.level', 55);  // sits behind the drums

// ============================================================
// RENDER
// ============================================================

const outputFile = '/Users/bartdecrem/Documents/coding2025/hilma/plastikman-groove.wav';
console.log(`Plastikman — clinical minimal techno — ${session.bpm} BPM`);
console.log(`${BARS} bars — Foundation → Ghost Groove → Acid → Ghost Bar`);

try {
  const result = await renderSession(session, BARS, outputFile);
  console.log(result);
  console.log(`Output: ${outputFile}`);
} catch (err) {
  console.error('Render failed:', err);
  process.exit(1);
}
