// Agent mode's tools: what the agent can do to a mod's draft (a song file plus its charting
// override), each returning plain text for the model. Every edit validates the file against
// the app's rules and refuses rather than leave a song the app would trap on.

import {
  type BandNote,
  type PartKey,
  type PartNote,
  type SongFile,
  endTick,
  midiOf,
  musicBars,
  noteName,
  part as partOf,
  partKeys,
  sortedNotes,
  ticksPerBar,
  validateSong,
} from './songfile'
import {
  type Charting,
  type Difficulty,
  type SongOverride,
  DIFFICULTIES,
  figures,
  ladder,
  ladderLine,
  tierFor,
  tiersOf,
  validateOverride,
} from './charting'

export type Draft = {
  song: SongFile
  override: SongOverride | null
  title: string
  /** Whether a tool changed the draft this turn. */
  mutated: boolean
}

export type ToolDef = {
  name: string
  description: string
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
}

/** One sentence per tool call for the app's working list ("Reading the sax line, bars 25–36"). */
export function describeCall(d: Draft, name: string, input: Record<string, unknown>): string {
  // "the sax line (melody)", "the comping (chords)": a title that starts with "The" keeps its own.
  const partTitle = (k: unknown) => {
    const p = d.song.song.parts[k as PartKey]
    if (!p) return String(k)
    const t = p.title.trim()
    return `${/^the\s/i.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : `the ${t.toLowerCase()}`} (${k})`
  }
  const range = (a: unknown, b: unknown) => (a === b || b == null ? `bar ${a}` : `bars ${a}–${b}`)
  switch (name) {
    case 'read_song': return 'Reading the song and its ladder'
    case 'read_notes': return `Reading ${partTitle(input.part)}, ${range(input.from_bar, input.to_bar)}`
    case 'write_notes': return `Writing ${(input.notes as unknown[] | undefined)?.length ?? 0} notes into ${range(input.from_bar, input.to_bar)} of ${partTitle(input.part)}`
    case 'add_interval': return `Adding a note ${input.interval} semitones ${Number(input.interval) < 0 ? 'under' : 'over'} the hits of ${partTitle(input.part)}`
    case 'set_weights': return `Reweighting ${(input.changes as unknown[] | undefined)?.length ?? 0} onsets of ${partTitle(input.part)}`
    case 'set_levels': return `Setting the levels of ${partTitle(input.part)}`
    case 'measure': return `Measuring ${partTitle(input.part)} ladder`
    case 'add_bars': return `Adding ${input.bars} bars, copied from bar ${input.copy_from_bar}`
    case 'remove_bars': return `Removing ${input.bars} bars from bar ${input.from_bar}`
    case 'set_sections': return 'Naming the sections'
    case 'set_form': return `Relabeling the chords from bar ${input.from_bar}`
    case 'set_title': return input.title ? `Naming it “${input.title}”` : 'Writing the card’s line'
    case 'set_tempo': return `Setting the tempo to ${input.tempo}`
    case 'roll_back': return `Going back to v${input.version}`
    default: return name
  }
}

const NOTE_SCHEMA = {
  type: 'object',
  properties: {
    bar: { type: 'integer', description: 'The bar, 1-based.' },
    tick: { type: 'integer', description: 'Tick inside the bar: 0 is the downbeat, 12 a beat (48 a bar); the 2nd beat is 12, the "and" of 2 is 18.' },
    n: { type: ['integer', 'string'], description: 'The pitch: MIDI (60 = C4) or a name ("Bb3", "F#4").' },
    len: { type: 'integer', description: 'Length in ticks (12 = a quarter note, 6 an eighth, 4 a shuffle eighth, 24 a half note).' },
    lv: { type: 'integer', description: 'Weight: 1 a hit the part stands on (one a bar on a melody; the downbeat on a comping part), 2 the groove (the 3, the answers), 3 pushes, pickups, ornaments, fills.' },
    f: { type: 'integer', description: 'Finger 1–5 (thumb 1). Optional.' },
    r: { type: 'string', description: 'A chord note’s role: root, third, fifth, sixth, seventh, ninth. Required on the chords part, absent on the melody.' },
  },
  required: ['bar', 'tick', 'n', 'len', 'lv'],
}

export const TOOLS: ToolDef[] = [
  {
    name: 'read_song',
    description: 'The song as it stands: key, tempo, length, sections, the chord of every bar, each part with its instrument and note count, and the ladder of every part — onsets a second at every level with the level each difficulty plays. Call this first.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'read_notes',
    description: 'The notes of a part in a range of bars, one line each: bar:tick pitch length weight finger role. Also the chord label of each bar. Read before you rewrite a passage.',
    input_schema: {
      type: 'object',
      properties: {
        part: { type: 'string', enum: ['chords', 'melody'] },
        from_bar: { type: 'integer', description: '1-based, inclusive.' },
        to_bar: { type: 'integer', description: '1-based, inclusive.' },
      },
      required: ['part', 'from_bar', 'to_bar'],
    },
  },
  {
    name: 'write_notes',
    description: 'Replace every note of a part between from_bar and to_bar (inclusive) with these notes, and mirror them into the record (the band channel the part replaces), so the band plays them when the player takes the other part. At most 8 bars per call: a longer passage (or a whole part) takes several calls, one range after another, because one response can only hold so many notes. Notes outside the range are refused; the file is validated against the app’s rules and the ladder re-measured.',
    input_schema: {
      type: 'object',
      properties: {
        part: { type: 'string', enum: ['chords', 'melody'] },
        from_bar: { type: 'integer' },
        to_bar: { type: 'integer' },
        notes: { type: 'array', items: NOTE_SCHEMA },
      },
      required: ['part', 'from_bar', 'to_bar', 'notes'],
    },
  },
  {
    name: 'add_interval',
    description: 'Add one note to many chord hits at once, without rewriting them: at every onset in the range (filtered by weight and by size), a note `interval` semitones from the onset\'s lowest note (or highest, with from: "highest"), the same length and weight, with this role; the record mirrors it. Use it for "make these two-note chords" (7 = the fifth over a root, 12 = the octave, 4/3 = a major/minor third), doubling, thickening. Onsets that already hold that pitch are left alone. Re-measured after.',
    input_schema: {
      type: 'object',
      properties: {
        part: { type: 'string', enum: ['chords', 'melody'] },
        interval: { type: 'integer', description: 'Semitones, -24..24, not 0: 7 a fifth up, -5 a fourth down, 12 an octave.' },
        role: { type: 'string', description: 'The new note\'s role on the chords part (fifth for a fifth over the root).' },
        from: { type: 'string', enum: ['lowest', 'highest'], description: 'Measure from the onset\'s lowest (default) or highest note.' },
        from_bar: { type: 'integer', description: '1-based; default the first bar.' },
        to_bar: { type: 'integer', description: 'Inclusive; default the last bar.' },
        max_lv: { type: 'integer', description: 'Only onsets whose heaviest note weighs at most this (1 = the hits Easy plays). Default 3.' },
        max_notes: { type: 'integer', description: 'Only onsets with at most this many notes (1 = single notes only). Default any.' },
      },
      required: ['part', 'interval'],
    },
  },
  {
    name: 'set_weights',
    description: 'Change the weight of existing onsets (every note at that bar:tick, or one pitch) without rewriting them. Weights are what the ladder cuts by: pushing groove hits to 3 thins Easy and Medium, pulling fills to 2 fattens Hard. Re-measured after.',
    input_schema: {
      type: 'object',
      properties: {
        part: { type: 'string', enum: ['chords', 'melody'] },
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              bar: { type: 'integer' },
              tick: { type: 'integer' },
              n: { type: ['integer', 'string'], description: 'Optional: only this pitch at the onset.' },
              lv: { type: 'integer' },
            },
            required: ['bar', 'tick', 'lv'],
          },
        },
      },
      required: ['part', 'changes'],
    },
  },
  {
    name: 'set_levels',
    description: 'This song’s own charting for a part, the shape of charting.json’s songs entry: which tier a difficulty plays (beginner/easy/easy+/medium/hard), a phrase of its own (bars: every key the line plays in each phrase stays at every level), and patches to a tier’s gap (seconds between onsets, at least) or space (seconds of silence at most before a lighter hit is borrowed; 0 = never borrow). Pass only the keys you set; null clears one. The ladder must still loosen going up. Returns the new figures.',
    input_schema: {
      type: 'object',
      properties: {
        part: { type: 'string', enum: ['chords', 'melody'] },
        beginner: { type: ['integer', 'null'] },
        easy: { type: ['integer', 'null'] },
        'easy+': { type: ['integer', 'null'] },
        medium: { type: ['integer', 'null'] },
        hard: { type: ['integer', 'null'] },
        phrase: { type: ['integer', 'null'] },
        tiers: {
          type: 'object',
          description: 'Tier number (1-based, as a string key) → { gap?, space? }.',
          additionalProperties: {
            type: 'object',
            properties: { gap: { type: ['number', 'null'] }, space: { type: ['number', 'null'] } },
          },
        },
      },
      required: ['part'],
    },
  },
  {
    name: 'measure',
    description: 'The ladder of a part as the app will chart it: onsets a second at every level, with the quietest and busiest eight bars, and which level each difficulty plays.',
    input_schema: { type: 'object', properties: { part: { type: 'string', enum: ['chords', 'melody'] } }, required: ['part'] },
  },
  {
    name: 'add_bars',
    description: 'Make the song longer: copy `bars` bars of everything (drums, bass, both parts, chord labels) starting at copy_from_bar and insert the copy at at_bar (default: the end of the music), shifting what follows. Then rewrite the copied passage with write_notes (a solo chorus: copy the last chorus, then write the solo over it).',
    input_schema: {
      type: 'object',
      properties: {
        copy_from_bar: { type: 'integer', description: '1-based first bar to copy.' },
        bars: { type: 'integer', description: 'How many bars to copy (a chorus: 12).' },
        at_bar: { type: 'integer', description: '1-based bar the copy starts at; the old bar there and everything after move later. Default: right after the last bar.' },
      },
      required: ['copy_from_bar', 'bars'],
    },
  },
  {
    name: 'remove_bars',
    description: 'Make the song shorter: drop `bars` bars from from_bar (1-based) in every channel and part, closing the gap.',
    input_schema: {
      type: 'object',
      properties: { from_bar: { type: 'integer' }, bars: { type: 'integer' } },
      required: ['from_bar', 'bars'],
    },
  },
  {
    name: 'set_sections',
    description: 'The section names shown on the progress rail and in the HUD, by 1-based bar. Replaces the list; the first must start at bar 1.',
    input_schema: {
      type: 'object',
      properties: {
        sections: { type: 'array', items: { type: 'object', properties: { bar: { type: 'integer' }, name: { type: 'string' } }, required: ['bar', 'name'] } },
      },
      required: ['sections'],
    },
  },
  {
    name: 'set_form',
    description: 'The chord label of each bar from from_bar on (what the highway shows by the hit line: "G7", "C9", "D7"). Labels only — the bass and the written chords do not follow; rewrite the chords part too if the harmony changes.',
    input_schema: {
      type: 'object',
      properties: { from_bar: { type: 'integer' }, chords: { type: 'array', items: { type: 'string' } } },
      required: ['from_bar', 'chords'],
    },
  },
  {
    name: 'set_title',
    description: 'The mod’s title (the card’s name) and/or its one-line description under it. Always write the line once the change is made: what this version is, in one sentence.',
    input_schema: {
      type: 'object',
      properties: { title: { type: 'string' }, line: { type: 'string' } },
    },
  },
  {
    name: 'roll_back',
    description: 'Go back to an earlier version of this mod (the history is in the message: v0 is the original as cloned, then one per turn that changed it). Makes a new version with that content, so nothing is lost. For "undo that", "go back to before the solo", "start over from the original".',
    input_schema: { type: 'object', properties: { version: { type: 'integer', description: 'The version to go back to.' } }, required: ['version'] },
  },
  {
    name: 'set_tempo',
    description: 'The song’s tempo (bpm). A level is never made easier by slowing the band — use it only when the user asks for a different speed.',
    input_schema: { type: 'object', properties: { tempo: { type: 'integer' } }, required: ['tempo'] },
  },
]

function err(msg: string): string {
  return `Error: ${msg}`
}

function asInt(x: unknown, what: string): number {
  if (typeof x !== 'number' || !Number.isInteger(x)) throw new Error(`${what} must be a whole number`)
  return x
}

function asPart(d: Draft, x: unknown): PartKey {
  if (x !== 'chords' && x !== 'melody') throw new Error('part must be "chords" or "melody"')
  if (!d.song.song.parts[x]) throw new Error(`the song has no ${x} part (it has ${partKeys(d.song).join(', ')})`)
  return x
}

function pitch(x: unknown): number {
  if (typeof x === 'number' && Number.isInteger(x)) return x
  if (typeof x === 'string') {
    const m = midiOf(x)
    if (m != null) return m
    const n = Number(x)
    if (Number.isInteger(n)) return n
  }
  throw new Error(`pitch ${JSON.stringify(x)} is neither MIDI nor a note name`)
}

function barRange(d: Draft, from: unknown, to: unknown): [number, number] {
  const a = asInt(from, 'from_bar'), b = asInt(to, 'to_bar')
  const n = musicBars(d.song)
  if (a < 1 || b > n || a > b) throw new Error(`bars ${a}–${b} are outside 1–${n}`)
  return [a, b]
}

function formRuns(form: string[], bars: number): string {
  const out: string[] = []
  let i = 0
  while (i < bars) {
    let j = i
    while (j + 1 < bars && form[j + 1] === form[i]) j++
    out.push(j > i ? `${i + 1}–${j + 1} ${form[i]}` : `${i + 1} ${form[i]}`)
    i = j + 1
  }
  return out.join(' · ')
}

function fmtNote(d: Draft, n: PartNote): string {
  const tpb = ticksPerBar(d.song)
  const bar = Math.floor(n.t / tpb) + 1, tick = n.t % tpb
  return `${bar}:${String(tick).padStart(2, ' ')} ${noteName(n.n).padEnd(4)} (${n.n}) len=${n.len} lv=${n.lv}${n.f ? ` f=${n.f}` : ''}${n.r ? ` ${n.r}` : ''}`
}

export function readSong(d: Draft, charting: Charting): string {
  const s = d.song
  const bars = musicBars(s)
  const lines = [
    `Title: ${d.title}`,
    `Card line: ${s.song.line}`,
    `Style: ${s.song.style} · key ${s.song.key} · ${s.song.tempo} bpm · ${bars} bars (${Math.round((bars * s.beatsPerBar * 60) / s.song.tempo)} s) · ${s.ticksPerBeat} ticks a beat, ${ticksPerBar(s)} a bar`,
    `Sections: ${s.song.sections.map((x) => `bar ${x.bar + 1} ${x.name}`).join(' · ')}`,
    `Chords by bar: ${formRuns(s.form, bars)}`,
    `Band instruments: bass ${s.instruments.bass}, keys ${s.instruments.keys}, horns ${s.instruments.horns}`,
  ]
  for (const k of partKeys(s)) {
    const p = partOf(s, k)
    const notes = sortedNotes(p.notes)
    const pitches = notes.map((n) => n.n)
    const weights = [1, 2, 3].map((lv) => notes.filter((n) => n.lv === lv).length)
    lines.push('')
    lines.push(`Part "${k}" — ${p.title}: ${notes.length} notes (weights 1/2/3: ${weights.join('/')}), range ${noteName(Math.min(...pitches))}–${noteName(Math.max(...pitches))}, your keys play ${p.monitor}, replaces the band's ${p.channel}`)
    lines.push(`Ladder (level: onsets a second over the song [quietest–busiest 8 bars], notes${k === 'melody' ? ', the hand: moves over the song (places), positions, width' : ''} — what the level is):`)
    lines.push(ladderLine(charting, d.override, s, k))
    const o = d.override?.[k]
    lines.push(`This song's own charting for it: ${o ? JSON.stringify(o) : 'none (the ladder as is)'}`)
  }
  return lines.join('\n')
}

export function measure(d: Draft, charting: Charting, k: PartKey): string {
  return `Ladder of the ${k}:\n${ladderLine(charting, d.override, d.song, k)}`
}

function readNotes(d: Draft, input: Record<string, unknown>): string {
  const k = asPart(d, input.part)
  const [a, b] = barRange(d, input.from_bar, input.to_bar)
  const tpb = ticksPerBar(d.song)
  const notes = sortedNotes(partOf(d.song, k).notes).filter((n) => n.t >= (a - 1) * tpb && n.t < b * tpb)
  const out = [`${k} bars ${a}–${b}: ${notes.length} notes (bar:tick pitch (midi) len lv finger role)`]
  out.push(`Chords: ${formRuns(d.song.form.slice(a - 1, b), b - a + 1).replace(/(\d+)(–(\d+))?/g, (m, x, _, y) => (y ? `${Number(x) + a - 1}–${Number(y) + a - 1}` : `${Number(x) + a - 1}`))}`)
  if (notes.length > 600) out.push(`(showing the first 600)`)
  for (const n of notes.slice(0, 600)) out.push(fmtNote(d, n))
  return out.join('\n')
}

/** The band's velocity for a part note, from the song's own convention: the median velocity of
 *  the channel events that mirror notes of that weight; else a plain default. And the record's
 *  instrument override (the long sax tone) when the channel uses one past a length. */
function mirrorRules(s: SongFile, k: PartKey): { velocity: (lv: number) => number; instrument: (len: number) => string | undefined } {
  const p = partOf(s, k)
  const ch = s.channels[p.channel]
  const byKey = new Map<string, BandNote>()
  for (const e of ch) byKey.set(`${e.t}:${e.n}`, e)
  const vs: Record<number, number[]> = { 1: [], 2: [], 3: [] }
  for (const n of p.notes) {
    const e = byKey.get(`${n.t}:${n.n}`)
    if (e) vs[n.lv]?.push(e.v)
  }
  const median = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null)
  const defaults: Record<number, number> = k === 'chords' ? { 1: 0.62, 2: 0.5, 3: 0.42 } : { 1: 0.8, 2: 0.68, 3: 0.6 }
  const med = { 1: median(vs[1]), 2: median(vs[2]), 3: median(vs[3]) }
  const velocity = (lv: number) => med[lv as 1 | 2 | 3] ?? defaults[lv] ?? 0.6
  const withInst = ch.filter((e) => e.i)
  let instrument: (len: number) => string | undefined = () => undefined
  if (withInst.length) {
    const minLen = Math.min(...withInst.map((e) => e.len))
    const counts = new Map<string, number>()
    for (const e of withInst) counts.set(e.i!, (counts.get(e.i!) ?? 0) + 1)
    const name = [...counts.entries()].sort((x, y) => y[1] - x[1])[0][0]
    instrument = (len) => (len >= minLen ? name : undefined)
  }
  return { velocity, instrument }
}

function parseNote(d: Draft, k: PartKey, raw: unknown, keep: string[] | null): PartNote {
  if (!raw || typeof raw !== 'object') throw new Error('a note must be an object')
  const x = raw as Record<string, unknown>
  const tpb = ticksPerBar(d.song)
  const bar = asInt(x.bar, 'bar'), tick = asInt(x.tick, 'tick')
  if (tick < 0 || tick >= tpb) throw new Error(`tick ${tick} in bar ${bar}: 0–${tpb - 1}`)
  const n: PartNote = { t: (bar - 1) * tpb + tick, n: pitch(x.n), len: asInt(x.len, 'len'), lv: asInt(x.lv, 'lv') }
  if (x.f != null) n.f = asInt(x.f, 'f')
  if (x.r != null) {
    if (typeof x.r !== 'string') throw new Error('r must be a role name')
    n.r = x.r
  }
  if (k === 'chords' && keep && (!n.r || !keep.includes(n.r))) throw new Error(`chord note at ${bar}:${tick} (${noteName(n.n)}) needs a role: ${keep.join(', ')}`)
  if (k === 'melody' && n.r) delete n.r
  return n
}

function afterEdit(d: Draft, charting: Charting, k: PartKey | null, before: SongFile, what: string): string {
  const keep = ladder(charting, 'chords').keep
  const problem = validateSong(d.song, keep)
  if (problem) {
    d.song = before
    return err(`that edit would break the song, so it was not applied: ${problem}`)
  }
  d.mutated = true
  const out = [what]
  if (k) out.push(`Ladder of the ${k} now:\n${ladderLine(charting, d.override, d.song, k)}`)
  return out.join('\n')
}

function writeNotes(d: Draft, charting: Charting, input: Record<string, unknown>): string {
  const k = asPart(d, input.part)
  const [a, b] = barRange(d, input.from_bar, input.to_bar)
  if (!Array.isArray(input.notes)) throw new Error('notes must be a list')
  const keep = ladder(charting, 'chords').keep
  const notes = input.notes.map((raw) => parseNote(d, k, raw, keep))
  const tpb = ticksPerBar(d.song)
  const lo = (a - 1) * tpb, hi = b * tpb
  const outside = notes.find((n) => n.t < lo || n.t >= hi)
  if (outside) throw new Error(`a note at bar ${Math.floor(outside.t / tpb) + 1} is outside bars ${a}–${b}`)
  const tooLong = notes.find((n) => n.t + n.len > endTick(d.song) + tpb / 2)
  if (tooLong) throw new Error(`a note at bar ${Math.floor(tooLong.t / tpb) + 1} rings past the end of the song`)
  const before = JSON.parse(JSON.stringify(d.song)) as SongFile
  const rules = mirrorRules(d.song, k)
  const p = partOf(d.song, k)
  const removed = p.notes.filter((n) => n.t >= lo && n.t < hi).length
  p.notes = sortedNotes([...p.notes.filter((n) => n.t < lo || n.t >= hi), ...notes])
  const ch = d.song.channels[p.channel]
  const kept = ch.filter((e) => e.t < lo || e.t >= hi)
  const mirrored: BandNote[] = notes.map((n) => {
    const e: BandNote = { t: n.t, n: n.n, v: rules.velocity(n.lv), len: n.len }
    const inst = rules.instrument(n.len)
    if (inst) e.i = inst
    return e
  })
  d.song.channels[p.channel] = [...kept, ...mirrored].sort((x, y) => x.t - y.t || x.n - y.n)
  return afterEdit(d, charting, k, before, `Wrote ${notes.length} notes into bars ${a}–${b} of the ${k} (replacing ${removed}); the record's ${p.channel} channel mirrors them.`)
}

function addInterval(d: Draft, charting: Charting, input: Record<string, unknown>): string {
  const k = asPart(d, input.part)
  const iv = asInt(input.interval, 'interval')
  if (iv === 0 || Math.abs(iv) > 24) throw new Error('interval: -24..24 semitones, not 0')
  const keep = ladder(charting, 'chords').keep
  const role = typeof input.role === 'string' ? input.role : undefined
  if (k === 'chords' && keep && (!role || !keep.includes(role))) throw new Error(`role: one of ${keep.join(', ')}`)
  const [a, b] = barRange(d, input.from_bar ?? 1, input.to_bar ?? musicBars(d.song))
  const maxLv = input.max_lv == null ? 3 : asInt(input.max_lv, 'max_lv')
  const maxNotes = input.max_notes == null ? Infinity : asInt(input.max_notes, 'max_notes')
  const fromHighest = input.from === 'highest'
  const tpb = ticksPerBar(d.song)
  const lo = (a - 1) * tpb, hi = b * tpb
  const before = JSON.parse(JSON.stringify(d.song)) as SongFile
  const p = partOf(d.song, k)
  const onsets = new Map<number, PartNote[]>()
  for (const n of p.notes) if (n.t >= lo && n.t < hi) onsets.set(n.t, [...(onsets.get(n.t) ?? []), n])
  const added: PartNote[] = []
  let skipped = 0
  for (const [, group] of onsets) {
    if (group.length > maxNotes || Math.min(...group.map((n) => n.lv)) > maxLv) continue
    const base = group.reduce((x, y) => (fromHighest ? (y.n > x.n ? y : x) : (y.n < x.n ? y : x)))
    const n = base.n + iv
    if (n < 21 || n > 108 || group.some((g) => g.n === n)) { skipped++; continue }
    const note: PartNote = { t: base.t, n, len: base.len, lv: base.lv }
    if (k === 'chords') note.r = role
    added.push(note)
  }
  if (!added.length) return `No onset in bars ${a}–${b} matched (weight ≤ ${maxLv}${Number.isFinite(maxNotes) ? `, ≤ ${maxNotes} notes` : ''}); nothing changed.`
  p.notes = sortedNotes([...p.notes, ...added])
  const rules = mirrorRules(d.song, k)
  const mirrored: BandNote[] = added.map((n) => {
    const e: BandNote = { t: n.t, n: n.n, v: rules.velocity(n.lv), len: n.len }
    const inst = rules.instrument(n.len)
    if (inst) e.i = inst
    return e
  })
  d.song.channels[p.channel] = [...d.song.channels[p.channel], ...mirrored].sort((x, y) => x.t - y.t || x.n - y.n)
  return afterEdit(d, charting, k, before, `Added ${added.length} notes ${iv} semitones from each onset's ${fromHighest ? 'highest' : 'lowest'} note in bars ${a}–${b} of the ${k}${skipped ? ` (${skipped} skipped: the pitch was there or out of range)` : ''}; the record's ${p.channel} channel mirrors them.`)
}

function setWeights(d: Draft, charting: Charting, input: Record<string, unknown>): string {
  const k = asPart(d, input.part)
  if (!Array.isArray(input.changes)) throw new Error('changes must be a list')
  const tpb = ticksPerBar(d.song)
  const before = JSON.parse(JSON.stringify(d.song)) as SongFile
  const p = partOf(d.song, k)
  let changed = 0
  const misses: string[] = []
  for (const raw of input.changes) {
    const x = raw as Record<string, unknown>
    const bar = asInt(x.bar, 'bar'), tick = asInt(x.tick, 'tick'), lv = asInt(x.lv, 'lv')
    if (lv < 1 || lv > 3) throw new Error(`weight ${lv}: 1, 2 or 3`)
    const t = (bar - 1) * tpb + tick
    const only = x.n != null ? pitch(x.n) : null
    let hit = false
    for (const n of p.notes) {
      if (n.t === t && (only == null || n.n === only)) {
        if (n.lv !== lv) changed++
        n.lv = lv
        hit = true
      }
    }
    if (!hit) misses.push(`${bar}:${tick}${only != null ? ` ${noteName(only)}` : ''}`)
  }
  const note = misses.length ? ` No note at: ${misses.join(', ')}.` : ''
  return afterEdit(d, charting, k, before, `Changed the weight of ${changed} notes of the ${k}.${note}`)
}

function setLevels(d: Draft, charting: Charting, input: Record<string, unknown>): string {
  const k = asPart(d, input.part)
  const next: SongOverride = JSON.parse(JSON.stringify(d.override ?? {}))
  const o = { ...(next[k] ?? {}) } as Record<string, unknown>
  for (const key of ['beginner', 'easy', 'easy+', 'medium', 'hard', 'phrase'] as const) {
    if (key in input) {
      if (input[key] == null) delete o[key]
      else o[key] = asInt(input[key], key)
    }
  }
  if ('tiers' in input) {
    if (input.tiers == null) delete o.tiers
    else {
      if (typeof input.tiers !== 'object') throw new Error('tiers must be an object keyed by tier number')
      const tiers = { ...((o.tiers as Record<string, unknown>) ?? {}) }
      for (const [tk, tv] of Object.entries(input.tiers as Record<string, unknown>)) {
        if (tv == null) delete tiers[tk]
        else {
          const patch = { ...((tiers[tk] as Record<string, unknown>) ?? {}) }
          const pv = tv as Record<string, unknown>
          for (const pk of ['gap', 'space'] as const) {
            if (pk in pv) {
              if (pv[pk] == null) delete patch[pk]
              else if (typeof pv[pk] !== 'number') throw new Error(`${pk} must be a number of seconds`)
              else patch[pk] = pv[pk]
            }
          }
          if (Object.keys(patch).length) tiers[tk] = patch
          else delete tiers[tk]
        }
      }
      if (Object.keys(tiers).length) o.tiers = tiers
      else delete o.tiers
    }
  }
  if (Object.keys(o).length) next[k] = o as SongOverride[PartKey]
  else delete next[k]
  const problem = validateOverride(charting, next)
  if (problem) return err(`that charting is not allowed: ${problem}`)
  d.override = Object.keys(next).length ? next : null
  d.mutated = true
  const names = DIFFICULTIES.map((dd: Difficulty) => `${dd} → L${tierFor(charting, d.override, k, dd)}`).join(', ')
  return `The ${k} now charts with ${JSON.stringify(d.override?.[k] ?? {})}: ${names}.\nLadder of the ${k} now:\n${ladderLine(charting, d.override, d.song, k)}`
}

function shiftAll(s: SongFile, fromTick: number, by: number) {
  for (const ch of Object.values(s.channels) as { t: number }[][]) for (const e of ch) if (e.t >= fromTick) e.t += by
  for (const k of partKeys(s)) for (const n of s.song.parts[k]!.notes) if (n.t >= fromTick) n.t += by
}

function addBars(d: Draft, charting: Charting, input: Record<string, unknown>): string {
  const s = d.song
  const tpb = ticksPerBar(s)
  const n = musicBars(s)
  const from = asInt(input.copy_from_bar, 'copy_from_bar'), count = asInt(input.bars, 'bars')
  const at = input.at_bar == null ? n + 1 : asInt(input.at_bar, 'at_bar')
  if (count < 1 || count > 64) throw new Error('bars: 1–64')
  if (from < 1 || from + count - 1 > n) throw new Error(`bars ${from}–${from + count - 1} to copy are outside 1–${n}`)
  if (at < 1 || at > n + 1) throw new Error(`at_bar ${at}: 1–${n + 1}`)
  const before = JSON.parse(JSON.stringify(s)) as SongFile
  const lo = (from - 1) * tpb, hi = (from + count - 1) * tpb
  const atTick = (at - 1) * tpb
  const copies: Record<string, unknown[]> = {}
  for (const [name, ch] of Object.entries(s.channels) as [string, { t: number }[]][]) {
    copies[name] = ch.filter((e) => e.t >= lo && e.t < hi).map((e) => ({ ...e, t: e.t - lo + atTick }))
  }
  const partCopies: Partial<Record<PartKey, PartNote[]>> = {}
  for (const k of partKeys(s)) {
    partCopies[k] = s.song.parts[k]!.notes.filter((e) => e.t >= lo && e.t < hi).map((e) => ({ ...e, t: e.t - lo + atTick }))
  }
  const formCopy = s.form.slice(from - 1, from - 1 + count)
  shiftAll(s, atTick, count * tpb)
  for (const [name, ch] of Object.entries(s.channels) as [string, { t: number }[]][]) {
    ;(s.channels as unknown as Record<string, unknown[]>)[name] = [...ch, ...copies[name]].sort((x, y) => (x as { t: number }).t - (y as { t: number }).t)
  }
  for (const k of partKeys(s)) s.song.parts[k]!.notes = sortedNotes([...s.song.parts[k]!.notes, ...partCopies[k]!])
  s.form.splice(at - 1, 0, ...formCopy)
  s.bars += count
  for (const sec of s.song.sections) if (sec.bar >= at - 1 && sec.bar > 0) sec.bar += count
  return afterEdit(d, charting, null, before, `The song is ${musicBars(s)} bars now: bars ${from}–${from + count - 1} copied to bars ${at}–${at + count - 1}. Rewrite them with write_notes, and name the new section with set_sections.`)
}

function removeBars(d: Draft, charting: Charting, input: Record<string, unknown>): string {
  const s = d.song
  const tpb = ticksPerBar(s)
  const n = musicBars(s)
  const from = asInt(input.from_bar, 'from_bar'), count = asInt(input.bars, 'bars')
  if (count < 1 || from < 1 || from + count - 1 > n) throw new Error(`bars ${from}–${from + count - 1} are outside 1–${n}`)
  if (n - count < 1) throw new Error('that would leave no music')
  const before = JSON.parse(JSON.stringify(s)) as SongFile
  const lo = (from - 1) * tpb, hi = (from + count - 1) * tpb
  for (const [name, ch] of Object.entries(s.channels) as [string, { t: number }[]][]) {
    ;(s.channels as unknown as Record<string, unknown[]>)[name] = ch.filter((e) => e.t < lo || e.t >= hi)
  }
  for (const k of partKeys(s)) s.song.parts[k]!.notes = s.song.parts[k]!.notes.filter((e) => e.t < lo || e.t >= hi)
  shiftAll(s, hi, -(count * tpb))
  s.form.splice(from - 1, count)
  s.bars -= count
  s.song.sections = s.song.sections
    .filter((sec) => sec.bar === 0 || sec.bar < from - 1 || sec.bar >= from - 1 + count)
    .map((sec) => (sec.bar >= from - 1 + count ? { ...sec, bar: sec.bar - count } : sec))
  return afterEdit(d, charting, null, before, `Removed bars ${from}–${from + count - 1}; the song is ${musicBars(s)} bars now.`)
}

function setSections(d: Draft, charting: Charting, input: Record<string, unknown>): string {
  if (!Array.isArray(input.sections) || !input.sections.length) throw new Error('sections must be a non-empty list')
  const before = JSON.parse(JSON.stringify(d.song)) as SongFile
  d.song.song.sections = input.sections
    .map((raw) => {
      const x = raw as Record<string, unknown>
      if (typeof x.name !== 'string' || !x.name.trim()) throw new Error('a section needs a name')
      return { bar: asInt(x.bar, 'bar') - 1, name: x.name.trim() }
    })
    .sort((a, b) => a.bar - b.bar)
  return afterEdit(d, charting, null, before, `Sections: ${d.song.song.sections.map((x) => `bar ${x.bar + 1} ${x.name}`).join(' · ')}.`)
}

function setForm(d: Draft, charting: Charting, input: Record<string, unknown>): string {
  const from = asInt(input.from_bar, 'from_bar')
  if (!Array.isArray(input.chords) || !input.chords.every((c) => typeof c === 'string' && c.trim())) throw new Error('chords must be a list of labels')
  const n = musicBars(d.song)
  if (from < 1 || from - 1 + input.chords.length > n) throw new Error(`bars ${from}–${from + input.chords.length - 1} are outside 1–${n}`)
  const before = JSON.parse(JSON.stringify(d.song)) as SongFile
  input.chords.forEach((c, i) => (d.song.form[from - 1 + i] = (c as string).trim()))
  return afterEdit(d, charting, null, before, `Chord labels from bar ${from}: ${input.chords.join(' ')}.`)
}

function setTitle(d: Draft, input: Record<string, unknown>): string {
  const out: string[] = []
  if (input.title != null) {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 40) throw new Error('title: 1–40 characters')
    d.title = input.title.trim()
    d.song.song.title = d.title
    d.mutated = true
    out.push(`Title: ${d.title}.`)
  }
  if (input.line != null) {
    if (typeof input.line !== 'string' || !input.line.trim() || input.line.length > 160) throw new Error('line: 1–160 characters')
    d.song.song.line = input.line.trim()
    d.mutated = true
    out.push(`Line: ${d.song.song.line}`)
  }
  return out.length ? out.join('\n') : err('nothing to set')
}

function setTempo(d: Draft, charting: Charting, input: Record<string, unknown>): string {
  const tempo = asInt(input.tempo, 'tempo')
  if (tempo < 40 || tempo > 220) throw new Error('tempo: 40–220')
  const before = JSON.parse(JSON.stringify(d.song)) as SongFile
  d.song.song.tempo = tempo
  return afterEdit(d, charting, null, before, `Tempo ${tempo}. Every ladder figure moved with it (the gaps are in seconds):\n${partKeys(d.song).map((k) => `${k}:\n${ladderLine(charting, d.override, d.song, k)}`).join('\n')}`)
}

/** Run one tool on the draft. Throws only for a malformed call; a refused edit is a message. */
export function runTool(d: Draft, charting: Charting, name: string, input: Record<string, unknown>): string {
  try {
    switch (name) {
      case 'read_song': return readSong(d, charting)
      case 'read_notes': return readNotes(d, input)
      case 'write_notes': return writeNotes(d, charting, input)
      case 'add_interval': return addInterval(d, charting, input)
      case 'set_weights': return setWeights(d, charting, input)
      case 'set_levels': return setLevels(d, charting, input)
      case 'measure': return measure(d, charting, asPart(d, input.part))
      case 'add_bars': return addBars(d, charting, input)
      case 'remove_bars': return removeBars(d, charting, input)
      case 'set_sections': return setSections(d, charting, input)
      case 'set_form': return setForm(d, charting, input)
      case 'set_title': return setTitle(d, input)
      case 'set_tempo': return setTempo(d, charting, input)
      default: return err(`no tool named ${name}`)
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e))
  }
}

export { tiersOf, figures }
