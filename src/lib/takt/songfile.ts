// A Takt Stage song file (apps/takt/Takt/Content/song-*.json; written by
// apps/takt/scripts/songs/*.py, read by Takt/Game/Song.swift + Takt/Audio/BandData.swift):
// a band the renderer plays once through, plus a `song` block with the parts the player can
// take. Agent mode (src/lib/takt/mods.ts) clones one of these for a user and edits it, so the
// shape and the app's validation rules live here too, mirrored from the Swift.
//
// Time: `ticksPerBeat` ticks a beat (12), `beatsPerBar` beats a bar (4): 48 ticks a bar; `t`
// is the tick in the whole song. Notes are MIDI, C4 = 60. The last bar of the band is a silent
// tail the game ends in: `bars` counts it, `form` has an entry ("—") for it, and no event or
// part note may sit in it.

export type BandHit = { t: number; s: string; v: number }
export type BandNote = { t: number; n: number; v: number; len: number; i?: string }

export type PartNote = {
  t: number
  n: number
  len: number
  /** 1 the hits the part stands on, 2 the groove, 3 pushes and ornaments. */
  lv: number
  /** The finger. */
  f?: number
  /** A chord note's role: root, third, fifth, sixth, seventh, ninth. */
  r?: string
}

export type Part = {
  title: string
  monitor: string
  /** The band channel the part replaces: keys or horns. */
  channel: 'keys' | 'horns'
  notes: PartNote[]
}

export type Section = { bar: number; name: string }

export type SongMeta = {
  title: string
  style: string
  key: string
  tempo: number
  art: string
  line: string
  sections: Section[]
  parts: { chords: Part; melody?: Part }
}

export type SongFile = {
  name: string
  ticksPerBeat: number
  beatsPerBar: number
  bars: number
  form: string[]
  sounds: Record<string, { kit: string; gainDb: number }>
  instruments: Record<string, string>
  levels?: Record<string, number> | null
  duck?: unknown
  dub?: unknown
  stab?: unknown
  knee?: number | null
  channels: { drums: BandHit[]; bass: BandNote[]; keys: BandNote[]; horns: BandNote[] }
  song: SongMeta
}

export type PartKey = 'chords' | 'melody'
export const PART_KEYS: PartKey[] = ['chords', 'melody']

export const ROLES = ['root', 'third', 'fifth', 'sixth', 'seventh', 'ninth']

export function ticksPerBar(s: SongFile): number {
  return s.ticksPerBeat * s.beatsPerBar
}

/** Bars of music: the band's last bar is the silent tail. */
export function musicBars(s: SongFile): number {
  return s.bars - 1
}

export function endTick(s: SongFile): number {
  return musicBars(s) * ticksPerBar(s)
}

export function seconds(s: SongFile): number {
  return (musicBars(s) * s.beatsPerBar * 60) / s.song.tempo
}

export function partKeys(s: SongFile): PartKey[] {
  return PART_KEYS.filter((k) => s.song.parts[k] != null)
}

export function part(s: SongFile, key: PartKey): Part {
  const p = s.song.parts[key]
  if (!p) throw new Error(`the song has no ${key} part`)
  return p
}

/** The whole part in time order, the way the app reads it (`Song.notes`). */
export function sortedNotes(notes: PartNote[]): PartNote[] {
  return [...notes].sort((a, b) => a.t - b.t || a.n - b.n)
}

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

export function noteName(n: number): string {
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`
}

/** "G4", "Bb3", "F#5" → MIDI; null when it isn't a note name. */
export function midiOf(name: string): number | null {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name.trim())
  if (!m) return null
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  let pc = base[m[1].toUpperCase()]
  if (m[2] === '#') pc += 1
  if (m[2] === 'b') pc -= 1
  return 12 * (Number(m[3]) + 1) + pc
}

/** Every rule the app enforces when it loads a song (Song.validate, BandData.bundled, the
 *  writer's asserts), as one error message, or null when the file is sound. The agent's tools
 *  run this after every edit so a bad edit never reaches the app, which would trap on it. */
export function validateSong(s: SongFile, keep: string[] | null): string | null {
  const problems: string[] = []
  const tpb = ticksPerBar(s)
  if (!(s.ticksPerBeat >= 1 && s.beatsPerBar >= 1)) problems.push('ticksPerBeat and beatsPerBar must be at least 1')
  if (!(s.bars >= 2)) problems.push('the band needs two bars at least (music plus the tail)')
  if (s.form.length !== s.bars) problems.push(`form has ${s.form.length} entries for ${s.bars} bars`)
  if (!(s.song.tempo >= 40)) problems.push('tempo under 40')
  if (s.song.sections.length === 0 || s.song.sections[0].bar !== 0) problems.push('sections must start with one at bar 0')
  const sorted = [...s.song.sections].sort((a, b) => a.bar - b.bar)
  if (sorted.some((x, i) => i > 0 && x.bar <= sorted[i - 1].bar)) problems.push('two sections start on the same bar')
  if (sorted.some((x) => x.bar < 0 || x.bar >= musicBars(s))) problems.push('a section starts past the music')
  const end = endTick(s)
  for (const [ch, events] of Object.entries(s.channels) as [string, (BandHit | BandNote)[]][]) {
    if (!Array.isArray(events)) {
      problems.push(`channel ${ch} is not a list`)
      continue
    }
    for (const e of events) {
      if (!(e.t >= 0 && e.t < end)) {
        problems.push(`a ${ch} event at tick ${e.t} is past the music (end ${end})`)
        break
      }
    }
    if (ch === 'drums') {
      const missing = (events as BandHit[]).find((h) => !s.sounds[h.s])
      if (missing) problems.push(`drum hit on an unknown sound ${missing.s}`)
    } else {
      const bad = (events as BandNote[]).find((n) => !(n.len > 0) || !(n.n >= 0 && n.n <= 127) || !(n.v > 0 && n.v <= 1))
      if (bad) problems.push(`a ${ch} note with a bad length, pitch or velocity: ${JSON.stringify(bad)}`)
    }
  }
  for (const ch of ['bass', 'keys', 'horns', 'monitor']) {
    if (!s.instruments[ch]) problems.push(`no instrument for ${ch}`)
  }
  if (!s.song.parts.chords) problems.push('no chords part')
  for (const k of Object.keys(s.song.parts)) {
    if (!PART_KEYS.includes(k as PartKey)) problems.push(`an unknown part ${k}`)
  }
  for (const k of partKeys(s)) {
    const p = s.song.parts[k]!
    if (!['keys', 'horns'].includes(p.channel)) problems.push(`part ${k} on channel ${p.channel}`)
    if (!p.notes.length) problems.push(`part ${k} has no notes`)
    else if (!p.notes.some((n) => n.lv === 1)) problems.push(`part ${k} has no weight-1 notes (the hits it stands on)`)
    for (const n of p.notes) {
      if (!(n.lv >= 1 && n.lv <= 3 && Number.isInteger(n.lv))) {
        problems.push(`part ${k}: weight ${n.lv} at tick ${n.t} (1, 2 or 3)`)
        break
      }
      if (!(Number.isInteger(n.t) && n.t >= 0 && n.t < end)) {
        problems.push(`part ${k}: a note at tick ${n.t} is past the music (end ${end}, bar ${Math.floor(n.t / tpb) + 1})`)
        break
      }
      if (!(Number.isInteger(n.len) && n.len > 0)) {
        problems.push(`part ${k}: a note at tick ${n.t} with length ${n.len}`)
        break
      }
      if (!(Number.isInteger(n.n) && n.n >= 21 && n.n <= 108)) {
        problems.push(`part ${k}: pitch ${n.n} at tick ${n.t} is off the piano`)
        break
      }
      if (n.f != null && !(Number.isInteger(n.f) && n.f >= 1 && n.f <= 5)) {
        problems.push(`part ${k}: finger ${n.f} at tick ${n.t}`)
        break
      }
    }
    if (k === 'chords' && keep) {
      const bad = p.notes.find((n) => !n.r || !keep.includes(n.r))
      if (bad) problems.push(`a chord note without a role charting keeps (${keep.join(', ')}): ${JSON.stringify(bad)}`)
    }
    const span = p.notes.map((n) => n.n)
    if (span.length && Math.max(...span) - Math.min(...span) > 48) problems.push(`part ${k} spans more than four octaves`)
  }
  return problems.length ? problems.join('; ') : null
}

/** A deep copy (the files are plain JSON). */
export function cloneSong(s: SongFile): SongFile {
  return JSON.parse(JSON.stringify(s)) as SongFile
}

/** Is this JSON a song file at all (the shape, before the rules)? */
export function looksLikeSong(x: unknown): x is SongFile {
  if (!x || typeof x !== 'object') return false
  const s = x as Partial<SongFile>
  return (
    typeof s.name === 'string' &&
    typeof s.ticksPerBeat === 'number' &&
    typeof s.beatsPerBar === 'number' &&
    typeof s.bars === 'number' &&
    Array.isArray(s.form) &&
    !!s.channels &&
    Array.isArray(s.channels.drums) &&
    Array.isArray(s.channels.bass) &&
    Array.isArray(s.channels.keys) &&
    Array.isArray(s.channels.horns) &&
    !!s.song &&
    typeof s.song.title === 'string' &&
    typeof s.song.tempo === 'number' &&
    Array.isArray(s.song.sections) &&
    !!s.song.parts &&
    typeof s.song.parts === 'object'
  )
}
