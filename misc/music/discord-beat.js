#!/usr/bin/env node
/**
 * Quick 10-second beat for Discord
 * 128 BPM, 6 bars (~11s) — drums + acid bass
 */

import { createSession } from '../vibeceo8/Jambot/core/session.js';
import { renderSession } from '../vibeceo8/Jambot/core/render.js';

const session = createSession({ bpm: 128, sampleRate: 44100 });

const VOICES = ['kick','snare','clap','ch','oh','lowtom','hitom','cymbal'];
const BARS = 6;

function emptyBars(n) {
  const p = {};
  for (const v of VOICES) {
    p[v] = Array(16 * n).fill(null).map(() => ({ velocity: 0, accent: false }));
  }
  return p;
}

function hits(pattern, voice, steps, vel = 100, accent = false) {
  for (const s of steps) {
    if (s < pattern[voice].length) {
      pattern[voice][s] = { velocity: vel, accent };
    }
  }
}

// Build drum pattern — 6 bars
const drums = emptyBars(BARS);

for (let bar = 0; bar < BARS; bar++) {
  const o = bar * 16;

  // Kick: four on the floor
  hits(drums, 'kick', [o, o+4, o+8, o+12], 127, true);

  // CH: 16ths with velocity groove
  for (let i = 0; i < 16; i++) {
    const vel = i % 4 === 0 ? 95 : i % 2 === 0 ? 70 : 45;
    drums.ch[o + i] = { velocity: vel, accent: i % 4 === 0 };
  }

  // Clap on 2 and 4
  hits(drums, 'clap', [o+4, o+12], 110, true);

  // OH on &2 and &4
  hits(drums, 'oh', [o+6, o+14], 65);

  // Build energy over bars
  if (bar >= 2) {
    // Offbeat kick for drive
    hits(drums, 'kick', [o+6], 75);
  }
  if (bar >= 3) {
    // Snare ghost notes
    hits(drums, 'snare', [o+3, o+11], 40);
    // Tom fill at end
    hits(drums, 'lowtom', [o+13], 70);
    hits(drums, 'hitom', [o+14], 60);
  }
  if (bar === BARS - 1) {
    // Last bar: fill
    hits(drums, 'snare', [o+13, o+14, o+15], 90, true);
    hits(drums, 'lowtom', [o+10, o+11], 80);
  }
}

session._nodes.jb01.setPattern(drums);

// Kick: punchy, tuned down
session.set('jb01.kick.tune', -3);
session.set('jb01.kick.decay', 65);
session.set('jb01.kick.attack', 55);
session.set('jb01.kick.sweep', 80);
session.set('jb01.kick.level', 0);

// Clap: tight
session.set('jb01.clap.decay', 22);
session.set('jb01.clap.tone', 45);
session.set('jb01.clap.level', -3);

// CH: crispy
session.set('jb01.ch.decay', 10);
session.set('jb01.ch.tone', 50);
session.set('jb01.ch.level', -7);

// OH
session.set('jb01.oh.decay', 35);
session.set('jb01.oh.tone', 40);
session.set('jb01.oh.level', -10);

// Snare
session.set('jb01.snare.tune', -2);
session.set('jb01.snare.decay', 30);
session.set('jb01.snare.tone', 35);
session.set('jb01.snare.snappy', 65);
session.set('jb01.snare.level', -10);

// Toms
session.set('jb01.lowtom.tune', -5);
session.set('jb01.lowtom.decay', 35);
session.set('jb01.lowtom.level', -6);
session.set('jb01.hitom.tune', 2);
session.set('jb01.hitom.decay', 28);
session.set('jb01.hitom.level', -8);

// ============================================================
// JB202 — Acid bass line in A minor
// ============================================================
const bassNotes = [
  // Bar pattern: bouncy acid line
  { note: 'A1', gate: true, accent: true, slide: false },
  { note: 'A1', gate: false, accent: false, slide: false },
  { note: 'A1', gate: true, accent: false, slide: false },
  { note: 'C2', gate: true, accent: false, slide: true },
  { note: 'A1', gate: false, accent: false, slide: false },
  { note: 'A1', gate: true, accent: false, slide: false },
  { note: 'E2', gate: true, accent: true, slide: true },
  { note: 'D2', gate: true, accent: false, slide: false },
  { note: 'A1', gate: true, accent: true, slide: false },
  { note: 'A1', gate: false, accent: false, slide: false },
  { note: 'G1', gate: true, accent: false, slide: true },
  { note: 'A1', gate: true, accent: false, slide: false },
  { note: 'C2', gate: true, accent: true, slide: false },
  { note: 'A1', gate: false, accent: false, slide: false },
  { note: 'A1', gate: true, accent: false, slide: true },
  { note: 'A2', gate: true, accent: true, slide: false },
];

// Repeat the pattern for all bars
const bassPattern = [];
for (let bar = 0; bar < BARS; bar++) {
  bassPattern.push(...bassNotes);
}

session._nodes.jb202.setPattern(bassPattern);

// Acid bass sound
session.set('jb202.osc1Waveform', 'sawtooth');
session.set('jb202.osc1Level', 90);
session.set('jb202.osc2Waveform', 'square');
session.set('jb202.osc2Octave', 0);
session.set('jb202.osc2Detune', 7);
session.set('jb202.osc2Level', 40);

session.set('jb202.filterCutoff', 300);
session.set('jb202.filterResonance', 45);
session.set('jb202.filterEnvAmount', 55);
session.set('jb202.filterDecay', 30);
session.set('jb202.filterSustain', 5);
session.set('jb202.ampDecay', 40);
session.set('jb202.ampSustain', 15);
session.set('jb202.ampRelease', 10);
session.set('jb202.drive', 30);
session.set('jb202.level', 70);

// ============================================================
// RENDER
// ============================================================

const outputFile = '/Users/bartdecrem/Documents/coding2025/hilma/discord-beat.wav';
console.log(`Rendering beat at ${session.bpm} BPM — ${BARS} bars (~10s)...`);

try {
  const result = await renderSession(session, BARS, outputFile);
  console.log(result);
  console.log(`Output: ${outputFile}`);
} catch (err) {
  console.error('Render failed:', err);
  process.exit(1);
}
