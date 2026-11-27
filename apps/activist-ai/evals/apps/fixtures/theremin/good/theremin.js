// Pocket Theremin — pure instrument logic. No DOM, no audio nodes here:
// just the maths, so it can be checked outside the page.
//
// The scale is always pentatonic. Pitch comes from the vertical position of a
// finger (higher = higher note), brightness from the horizontal position
// (further right = brighter tone).

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// Two pentatonic shapes, as semitone offsets from the root.
const SCALES = {
  minor: [0, 3, 5, 7, 10],   // minor pentatonic
  major: [0, 2, 4, 7, 9]     // major pentatonic
};

const ROOTS = [
  { name: 'A', midi: 57 },   // A3 — a warm low start
  { name: 'C', midi: 48 },
  { name: 'D', midi: 50 },
  { name: 'E', midi: 52 },
  { name: 'G', midi: 55 }
];

// How many octaves (in scale steps) the field spans top to bottom.
const OCTAVES = 3;

// Build the full list of MIDI notes the field can play, low to high.
// octaves: number of octaves above the root to fill.
function buildScale(rootMidi, mode, octaves) {
  const shape = SCALES[mode] || SCALES.minor;
  const span = (octaves == null ? OCTAVES : octaves);
  const notes = [];
  for (let oct = 0; oct <= span; oct++) {
    for (let i = 0; i < shape.length; i++) {
      const step = shape[i] + 12 * oct;
      const note = rootMidi + step;
      // Stop at the top of the span rather than running past it.
      if (step <= 12 * span) notes.push(note);
    }
  }
  return notes;
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function midiToName(midi) {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return name + octave;
}

// Map a vertical position (0 = top of the field, 1 = bottom) onto the scale.
// The top of the field is the highest note. Returns the index into `notes`
// and the MIDI note itself. Always lands on a scale tone.
function yToNote(y, notes) {
  const clamped = Math.min(1, Math.max(0, y));
  const last = notes.length - 1;
  // Flip so top = highest.
  const idx = Math.round((1 - clamped) * last);
  return { index: idx, midi: notes[idx], freq: midiToFreq(notes[idx]), name: midiToName(notes[idx]) };
}

// Where the line for a note sits vertically, for drawing the guide lines.
function noteToY(index, notes) {
  const last = notes.length - 1;
  if (last <= 0) return 0.5;
  return 1 - index / last;
}

// Map a horizontal position (0 = left, 1 = right) onto a filter cutoff in Hz.
// Left is dark and woolly, right is bright and open. Logarithmic, because
// that is how ears hear frequency.
function xToCutoff(x) {
  const clamped = Math.min(1, Math.max(0, x));
  const min = 180, max = 9000;
  return min * Math.pow(max / min, clamped);
}

// Resonance: a touch more peak as it opens up, capped so it never whistles.
function xToResonance(x) {
  const clamped = Math.min(1, Math.max(0, x));
  return 0.8 + clamped * 9; // Q from 0.8 to under 10
}

// Volume envelope target for a voice that is down or up.
function voiceLevel(isDown) {
  return isDown ? 0.85 : 0;
}

// How long a trail segment lives, in seconds, given how long ago it was drawn.
// (Used by the page to fade glow with age; kept here so the curve is tested.)
function trailAlpha(ageSeconds, lifeSeconds) {
  const life = lifeSeconds || 1.6;
  if (ageSeconds <= 0) return 1;
  if (ageSeconds >= life) return 0;
  // Ease out: fade fast at first, then drift away.
  const t = 1 - ageSeconds / life;
  return t * t;
}

// Nearest chord tone check: is this midi note inside the scale? (Always true
// for notes produced by yToNote; used as a guard in tests.)
function isOnScale(midi, notes) {
  return notes.indexOf(midi) !== -1;
}
