// Step-sequencer data model: pure functions over Jambot pattern objects.
//
// Every edit returns a NEW pattern (deep copy with the change) so a render
// that is reading the old array is never disturbed. Nothing in here touches
// the session; Sequencer.tsx does the read/write.
//
//   drums (jt90, jb01): { [voice]: Array<{ velocity, accent }> }, dense, 16 × bars
//   mono  (jb202, jt30, jt10): Array<{ note, gate, accent, slide }>, dense

export type DrumStep = { velocity: number; accent: boolean }
export type MonoStep = { note: string; gate: boolean; accent: boolean; slide: boolean }
export type DrumPattern = Record<string, DrumStep[]>
export type MonoPattern = MonoStep[]
export type SeqKind = 'drums' | 'mono'

/** What the studio renders: the whole arrangement or one section of it. */
export type RenderScope = { kind: 'song' } | { kind: 'section'; index: number }

export function sameScope(a: RenderScope, b: RenderScope) {
  return a.kind === b.kind && (a.kind !== 'section' || b.kind !== 'section' || a.index === b.index)
}

// Canonical voice order per drum machine (matches the engines' VOICES).
export const DRUM_VOICES: Record<string, string[]> = {
  jt90: ['kick', 'snare', 'clap', 'rimshot', 'lowtom', 'midtom', 'hitom', 'ch', 'oh', 'crash', 'ride'],
  jb01: ['kick', 'snare', 'clap', 'ch', 'oh', 'lowtom', 'hitom', 'cymbal'],
}

export const VOICE_SHORT: Record<string, string> = {
  kick: 'BD', snare: 'SD', clap: 'CP', rimshot: 'RS', lowtom: 'LT', midtom: 'MT', hitom: 'HT',
  ch: 'CH', oh: 'OH', crash: 'CR', ride: 'RD', cymbal: 'CY',
}

const MONO_TYPES = new Set(['jb202', 'jt30', 'jt10'])

export function kindOf(type: string): SeqKind | null {
  if (DRUM_VOICES[type]) return 'drums'
  if (MONO_TYPES.has(type)) return 'mono'
  return null
}

// ---- notes ------------------------------------------------------------------
// Sharps only on output ('C#2'); flats are accepted on input because the
// engines' parser takes them and older patterns may carry them.

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const NOTE_MAP: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11, 'B#': 0,
}

/** Editing range: C0–C7 (MIDI 12–96). */
export const NOTE_MIN = 12
export const NOTE_MAX = 96

/** Pitch-bar range per synth type, in MIDI: the span a melody is drawn against. */
export const PITCH_RANGE: Record<string, [number, number]> = {
  jb202: [24, 60], // C1–C4
  jt30: [24, 60],  // C1–C4
  jt10: [36, 84],  // C2–C6
}

export function noteToMidi(name: string): number | null {
  const m = /^([A-Ga-g][#b]?)(-?\d+)$/.exec(String(name || '').trim())
  if (!m) return null
  const letter = m[1].charAt(0).toUpperCase() + m[1].slice(1)
  const semi = NOTE_MAP[letter]
  if (semi === undefined) return null
  return (parseInt(m[2], 10) + 1) * 12 + semi
}

export function midiToNote(midi: number): string {
  const m = Math.round(midi)
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`
}

/** Normalise any accepted spelling to sharps ('Bb1' → 'A#1'); unknown → 'C2'. */
export function canonicalNote(name: string): string {
  const m = noteToMidi(name)
  return m === null ? 'C2' : midiToNote(m)
}

/** Move a note by semitones, clamped to C0–C7. */
export function shiftNote(name: string, semitones: number): string {
  const m = noteToMidi(name) ?? 36
  return midiToNote(Math.max(NOTE_MIN, Math.min(NOTE_MAX, m + semitones)))
}

/** 0..1 position of a note inside the synth's pitch range (clamped). */
export function pitchFrac(name: string, type: string): number {
  const [lo, hi] = PITCH_RANGE[type] || [24, 60]
  const m = noteToMidi(name)
  if (m === null) return 0
  return Math.max(0, Math.min(1, (m - lo) / (hi - lo)))
}

// ---- shape ------------------------------------------------------------------

export const emptyDrumStep = (): DrumStep => ({ velocity: 0, accent: false })
export const emptyMonoStep = (note = 'C2'): MonoStep => ({ note, gate: false, accent: false, slide: false })

/** Drum pattern length = longest voice array (16 when empty). */
export function drumLength(p: unknown): number {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return 16
  let n = 0
  for (const v of Object.values(p as Record<string, unknown>)) if (Array.isArray(v) && v.length > n) n = v.length
  return n || 16
}

export function monoLength(p: unknown): number {
  return Array.isArray(p) && p.length ? p.length : 16
}

export function patternLength(p: unknown, kind: SeqKind): number {
  return kind === 'drums' ? drumLength(p) : monoLength(p)
}

/**
 * Dense copy of a drum pattern with every canonical voice present at `len`
 * steps (pads with silence, truncates extras). Voices outside the canonical
 * list are kept too so nothing the agent wrote is lost.
 */
export function normalizeDrums(p: unknown, voices: string[], len = drumLength(p)): DrumPattern {
  const src = (p && typeof p === 'object' && !Array.isArray(p) ? p : {}) as Record<string, unknown>
  const out: DrumPattern = {}
  for (const voice of [...voices, ...Object.keys(src).filter((v) => !voices.includes(v))]) {
    const arr = Array.isArray(src[voice]) ? (src[voice] as Partial<DrumStep>[]) : []
    out[voice] = Array.from({ length: len }, (_, i) => {
      const s = arr[i]
      const vel = typeof s?.velocity === 'number' && isFinite(s.velocity) ? s.velocity : 0
      return { velocity: vel > 0 ? vel : 0, accent: !!s?.accent && vel > 0 }
    })
  }
  return out
}

/** Dense copy of a mono pattern at `len` steps; new steps rest on the last note. */
export function normalizeMono(p: unknown, len = monoLength(p)): MonoPattern {
  const arr = Array.isArray(p) ? (p as Partial<MonoStep>[]) : []
  let last = 'C2'
  for (const s of arr) if (s?.note) last = canonicalNote(s.note)
  return Array.from({ length: len }, (_, i) => {
    const s = arr[i]
    const note = s?.note ? canonicalNote(s.note) : last
    return { note, gate: !!s?.gate, accent: !!s?.accent, slide: !!s?.slide }
  })
}

// ---- drum edits -------------------------------------------------------------

export type DrumState = 'off' | 'hit' | 'accent'

export function drumStepState(s: Partial<DrumStep> | null | undefined): DrumState {
  if (!s || !(typeof s.velocity === 'number' && s.velocity > 0)) return 'off'
  return s.accent ? 'accent' : 'hit'
}

/** Tap cycle: off → hit → accent → off. Returns the new pattern and state. */
export function cycleDrumStep(p: unknown, voices: string[], voice: string, i: number): { pattern: DrumPattern; state: DrumState } {
  const next = normalizeDrums(p, voices)
  if (!next[voice]) next[voice] = Array.from({ length: drumLength(next) }, emptyDrumStep)
  const cur = next[voice][i]
  const state = drumStepState(cur)
  let s: DrumStep
  let to: DrumState
  if (state === 'off') { s = { velocity: 1, accent: false }; to = 'hit' }
  else if (state === 'hit') { s = { velocity: cur.velocity > 0 ? cur.velocity : 1, accent: true }; to = 'accent' }
  else { s = { velocity: 0, accent: false }; to = 'off' }
  next[voice][i] = s
  return { pattern: next, state: to }
}

export function resizeDrums(p: unknown, voices: string[], steps: number): DrumPattern {
  return normalizeDrums(p, voices, steps)
}

export function clearDrums(p: unknown, voices: string[]): DrumPattern {
  const next = normalizeDrums(p, voices)
  for (const v of Object.keys(next)) next[v] = next[v].map(emptyDrumStep)
  return next
}

export function voiceHasHits(p: unknown, voice: string): boolean {
  const arr = (p as Record<string, Partial<DrumStep>[]> | null)?.[voice]
  return Array.isArray(arr) && arr.some((s) => drumStepState(s) !== 'off')
}

// ---- mono edits -------------------------------------------------------------

export function toggleGate(p: unknown, i: number): MonoPattern {
  const next = normalizeMono(p)
  next[i] = { ...next[i], gate: !next[i].gate }
  return next
}

export function setGate(p: unknown, i: number, gate: boolean): MonoPattern {
  const next = normalizeMono(p)
  next[i] = { ...next[i], gate }
  return next
}

/** Set the note of a step (gate unchanged — an ungated step can carry a note). */
export function setNote(p: unknown, i: number, note: string): MonoPattern {
  const next = normalizeMono(p)
  next[i] = { ...next[i], note: canonicalNote(note) }
  return next
}

export function toggleAccent(p: unknown, i: number): MonoPattern {
  const next = normalizeMono(p)
  next[i] = { ...next[i], accent: !next[i].accent }
  return next
}

export function toggleSlide(p: unknown, i: number): MonoPattern {
  const next = normalizeMono(p)
  next[i] = { ...next[i], slide: !next[i].slide }
  return next
}

/** Resize; new steps carry the last step's note (or C2) with the gate off. */
export function resizeMono(p: unknown, steps: number): MonoPattern {
  const cur = normalizeMono(p)
  if (steps <= cur.length) return cur.slice(0, steps)
  const last = cur.length ? cur[cur.length - 1].note : 'C2'
  return [...cur, ...Array.from({ length: steps - cur.length }, () => emptyMonoStep(last))]
}

/** Gates off everywhere; notes and length kept. */
export function clearMono(p: unknown): MonoPattern {
  return normalizeMono(p).map((s) => ({ ...s, gate: false, accent: false, slide: false }))
}

// ---- views ------------------------------------------------------------------

/** One boolean per step: any voice hit (drums) / gate (mono). */
export function hitRow(p: unknown, kind: SeqKind): boolean[] {
  const len = patternLength(p, kind)
  if (kind === 'mono') {
    const arr = Array.isArray(p) ? (p as Partial<MonoStep>[]) : []
    return Array.from({ length: len }, (_, i) => !!arr[i]?.gate)
  }
  const src = (p && typeof p === 'object' ? p : {}) as Record<string, Partial<DrumStep>[]>
  const rows = Object.values(src).filter(Array.isArray)
  return Array.from({ length: len }, (_, i) => rows.some((r) => drumStepState(r[i]) !== 'off'))
}

export const PAGE = 8

export function pageCount(len: number) {
  return Math.max(1, Math.ceil(len / PAGE))
}

/** "BAR 2 · STEPS 9–16" for a page of `per` steps. */
export function pageLabel(page: number, len: number, per = PAGE) {
  const first = page * per
  const last = Math.min(len, first + per)
  const bar = Math.floor(first / 16) + 1
  const a = (first % 16) + 1
  const b = a + (last - first) - 1
  return `BAR ${bar} · STEPS ${a}–${b}`
}

// ---- arrangement helpers ---------------------------------------------------

export type Section = { bars: number; patterns: Record<string, string> }

/** 1-based section numbers that play `name` on `inst`. */
export function sectionsUsing(arr: Section[], inst: string, name: string): number[] {
  const out: number[] = []
  arr.forEach((s, i) => { if (s.patterns?.[inst] === name) out.push(i + 1) })
  return out
}

/** Bar offset where each section starts. */
export function sectionStarts(arr: Section[]): number[] {
  const out: number[] = []
  let at = 0
  for (const s of arr) { out.push(at); at += Number(s.bars) || 0 }
  return out
}

/** Index of the section that contains absolute bar `bar`, or null. */
export function sectionAtBar(arr: Section[], bar: number): number | null {
  const starts = sectionStarts(arr)
  for (let i = arr.length - 1; i >= 0; i--) if (bar >= starts[i]) return bar < starts[i] + (Number(arr[i].bars) || 0) ? i : null
  return null
}

/** Format a list of section numbers: "2, 4". */
export function listSections(nums: number[]) {
  return nums.join(', ')
}
