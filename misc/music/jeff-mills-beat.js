#!/usr/bin/env node
/**
 * Jeff Mills 909 Session — JB01 only
 *
 * Based on library.json: raw, hypnotic, minimal Detroit techno.
 * "Tension through subtraction and addition."
 *
 * Patterns from library:
 *   A: Stripped Pulse — kick + hats only (hypnosis)
 *   B: Driving Lock — full groove, snare, 16th hats, OH
 *   C: Stripped Tension — single kick on beat 3, driving hats + ride
 *   D: Tribal Build — syncopated kick, toms, rimshot
 *
 * Arrangement (8 bars): A A B B C C B D
 * ~15s at 133 BPM — enough to feel the build/strip
 */

import { createSession } from '../vibeceo8/Jambot/core/session.js';
import { renderSession } from '../vibeceo8/Jambot/core/render.js';

const session = createSession({ bpm: 133, sampleRate: 44100 });

const VOICES = ['kick','snare','clap','ch','oh','lowtom','hitom','cymbal'];
const BARS = 8;

function emptyBar() {
  const p = {};
  for (const v of VOICES) {
    p[v] = Array(16).fill(null).map(() => ({ velocity: 0, accent: false }));
  }
  return p;
}

function hits(p, voice, steps, vel = 100, accent = false) {
  for (const s of steps) {
    p[voice][s] = { velocity: vel, accent };
  }
}

// ============================================================
// PATTERN A — Stripped Pulse (kick + 8th hats — the hypnosis)
// ============================================================
function patternA() {
  const p = emptyBar();
  hits(p, 'kick', [0, 4, 8, 12], 127, true);
  // 8th note hats with velocity variation (Mills style: 85-127)
  hits(p, 'ch', [0, 2, 4, 6, 8, 10, 12, 14], 95);
  // Subtle accent pattern — every other 8th varies
  p.ch[2] = { velocity: 115, accent: true };
  p.ch[10] = { velocity: 115, accent: true };
  p.ch[6] = { velocity: 85, accent: false };
  p.ch[14] = { velocity: 85, accent: false };
  return p;
}

// ============================================================
// PATTERN B — Driving Lock (full groove, 16th hats, snare, OH)
// ============================================================
function patternB() {
  const p = emptyBar();
  hits(p, 'kick', [0, 4, 8, 12], 127, true);
  hits(p, 'snare', [4, 12], 95, false);
  // 16th hats — the relentless Mills pulse
  for (let i = 0; i < 16; i++) {
    const vel = i % 4 === 0 ? 110 : i % 2 === 0 ? 90 : 70;
    p.ch[i] = { velocity: vel, accent: i % 4 === 0 };
  }
  // OH on &2 and &4
  hits(p, 'oh', [6, 14], 55);
  return p;
}

// ============================================================
// PATTERN C — Stripped Tension (kick drops to beat 3 only, hats + ride)
// ============================================================
function patternC() {
  const p = emptyBar();
  // Single kick on beat 3 — feel the absence
  hits(p, 'kick', [8], 120, true);
  // 16th hats keep driving
  for (let i = 0; i < 16; i++) {
    p.ch[i] = { velocity: i % 2 === 0 ? 95 : 65, accent: false };
  }
  // Ride on 8ths — metallic texture
  // Using cymbal as ride proxy
  hits(p, 'cymbal', [0, 2, 4, 6, 8, 10, 12, 14], 45);
  return p;
}

// ============================================================
// PATTERN D — Tribal Build (syncopated kick, toms, rimshot via snare)
// ============================================================
function patternD() {
  const p = emptyBar();
  // Syncopated kick — polyrhythmic feel
  hits(p, 'kick', [0, 3, 6, 8, 12], 120, true);
  // Toms
  hits(p, 'lowtom', [2, 10], 80);
  hits(p, 'hitom', [5, 13], 70);
  // Rimshot-style snare hits (syncopated accents)
  hits(p, 'snare', [1, 4, 7, 9, 12, 15], 60);
  // Sparse hats
  hits(p, 'ch', [0, 4, 8, 12], 80);
  return p;
}

// ============================================================
// TUNING — Jeff Mills style from library.json
// ============================================================

// Kick: decay 0.35, tune 0, level 0.9
session.set('jb01.kick.tune', 0);
session.set('jb01.kick.decay', 35);
session.set('jb01.kick.attack', 50);
session.set('jb01.kick.sweep', 70);
session.set('jb01.kick.level', -1);

// Snare: decay 0.25, level 0.7 — ghost notes, tight
session.set('jb01.snare.tune', -1);
session.set('jb01.snare.decay', 25);
session.set('jb01.snare.tone', 40);
session.set('jb01.snare.snappy', 60);
session.set('jb01.snare.level', -3);

// Clap: decay 0.3, level 0.6
session.set('jb01.clap.decay', 30);
session.set('jb01.clap.tone', 35);
session.set('jb01.clap.level', -4);

// CH: decay 0.15, level 0.5 — tight, driving
session.set('jb01.ch.decay', 15);
session.set('jb01.ch.tone', 40);
session.set('jb01.ch.level', -6);

// OH: decay 0.25, level 0.4 — sparse
session.set('jb01.oh.decay', 25);
session.set('jb01.oh.tone', 35);
session.set('jb01.oh.level', -8);

// Toms — tuned apart for tribal texture
session.set('jb01.lowtom.tune', -5);
session.set('jb01.lowtom.decay', 30);
session.set('jb01.lowtom.level', -5);
session.set('jb01.hitom.tune', 3);
session.set('jb01.hitom.decay', 25);
session.set('jb01.hitom.level', -7);

// Cymbal — dark metallic ride
session.set('jb01.cymbal.tune', -3);
session.set('jb01.cymbal.decay', 30);
session.set('jb01.cymbal.level', -14);

// ============================================================
// ARRANGEMENT — A A B B C C B D
// "Tension through subtraction and addition"
// Stripped → Build → Strip → Build → Tribal payoff
// ============================================================

const patterns = {
  A: patternA(),
  B: patternB(),
  C: patternC(),
  D: patternD(),
};

const arrangement = ['A', 'A', 'B', 'B', 'C', 'C', 'B', 'D'];

const fullPattern = {};
for (const v of VOICES) {
  fullPattern[v] = [];
}
for (const section of arrangement) {
  const p = patterns[section];
  for (const v of VOICES) {
    fullPattern[v].push(...p[v]);
  }
}

session._nodes.jb01.setPattern(fullPattern);

// ============================================================
// RENDER
// ============================================================

const outputFile = '/Users/bartdecrem/Documents/coding2025/hilma/jeff-mills-beat.wav';
console.log(`Jeff Mills 909 Session — ${session.bpm} BPM`);
console.log(`Arrangement: ${arrangement.join(' ')}`);
console.log(`${BARS} bars`);

try {
  const result = await renderSession(session, BARS, outputFile);
  console.log(result);
  console.log(`Output: ${outputFile}`);
} catch (err) {
  console.error('Render failed:', err);
  process.exit(1);
}
