// Measure playable material the way the app will play it, and judge it against the sheets:
// BLUES.md §2–3 (onsets a second per named level), CHARTING.md rule 5 (no rung more than twice
// the one below), LEVELING.md §2 (the hand budget and the density band of a map level). The
// charter is src/lib/takt/charting.ts (Charting.swift ported, proven by charting-check.ts) and
// the hand is src/lib/takt/fingering.ts (Fingering.swift ported), so the figures here are the
// ones -LessonCheck prints, without a build. Both Takt skills (.claude/skills/takt-blues,
// takt-chart) and their eval graders run this.
//
//   npx tsx scripts/takt/measure.ts <song> [<song>…] [--part melody|chords] [--blues]
//                                   [--level N [--difficulty medium] [--solo]] [--scale 9,0,2,4,7] [--json]
//   npx tsx scripts/takt/measure.ts --notes <file.json> --tempo 84 [--level N [--solo]] [--scale …]
//   npx tsx scripts/takt/measure.ts --step apps/takt/Takt/Content/lesson-S1m.json:penta2-rh [--level N]
//   npx tsx scripts/takt/measure.ts --snapshot <out.json>              # every bundled song's figures
//   npx tsx scripts/takt/measure.ts --compare <snapshot.json> [--except song-a,song-b]
//   … --content <dir>   reads songs and charting.json from another checkout's Takt/Content (a worktree)
//
// <song> is a bundled name (song-halsted) or a path to a song file. --blues judges every named
// level against BLUES.md's bands (on by default for a song whose style names the blues).
// --level N judges the goal tier (the difficulty named, Medium by default) against the Level N
// hand budget and density band; --solo takes the tighter solo-track budget. --scale lists the
// pitch classes the part may use (and must all use at the goal tier). --notes takes a raw list
// [{t, n, len}] (or a bundle with a `notes` list: a solo, the improv teacher's idea) in ticks of
// 12 a beat; --step expands a lesson step's pattern (one cycle over the step's form) the way
// Lesson.expected does. Exit 1 on any FAIL.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { type Charting, type Difficulty, type FixedDifficulty, DIFFICULTIES, figures, masks, tierFor, tiersOf } from '../../src/lib/takt/charting'
import { type SongFile, type PartKey, partKeys, sortedNotes, ticksPerBar, validateSong, musicBars, noteName } from '../../src/lib/takt/songfile'
import { handFigures, handLine, handMoves, handMoments, handPositions, plan, type HandFigures } from '../../src/lib/takt/fingering'
import { handBudget, budgetLine, type HandBudget } from '../../src/lib/takt/leveling'

const ROOT = join(__dirname, '../..')

// MARK: Arguments

const args = process.argv.slice(2)
const flags = new Map<string, string | true>()
const songs: string[] = []
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a.startsWith('--')) {
    const next = args[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(a.slice(2), next)
      i++
    } else flags.set(a.slice(2), true)
  } else songs.push(a)
}
const str = (k: string) => (typeof flags.get(k) === 'string' ? (flags.get(k) as string) : undefined)
const has = (k: string) => flags.has(k)
const asJson = has('json')
const level = str('level') ? Number(str('level')) : null
const solo = has('solo')
const difficulty = (str('difficulty') ?? 'medium') as FixedDifficulty
const scale = str('scale') ? str('scale')!.split(',').map((x) => ((Number(x.trim()) % 12) + 12) % 12) : null
const partFilter = str('part') as PartKey | undefined
// --content <dir>: another checkout's Content folder (a worktree), so the figures, the
// charting.json and the snapshot all read the same tree.
const CONTENT = str('content') ? resolve(str('content')!) : join(ROOT, 'apps/takt/Takt/Content')

const charting = JSON.parse(readFileSync(str('charting') ?? join(CONTENT, 'charting.json'), 'utf8')) as Charting

let pass = 0, warn = 0, fail = 0
const out: Record<string, unknown> = {}
function say(kind: 'PASS' | 'WARN' | 'FAIL' | 'note', text: string) {
  if (kind === 'PASS') pass++
  else if (kind === 'WARN') warn++
  else if (kind === 'FAIL') fail++
  if (!asJson) console.log(`${kind.padEnd(4)}  ${text}`)
}
const line = (text: string) => { if (!asJson) console.log(text) }

// MARK: The sheets' numbers

/** BLUES.md §2–3: onsets a second per named level. Medium's top for a melody is 1.1, "a
 *  jump-blues riff runs to 1.6"; that is a WARN, not a FAIL. */
const BLUES_BANDS: Record<PartKey, Partial<Record<FixedDifficulty, [number, number, number?]>>> = {
  melody: { beginner: [0.2, 0.35], easy: [0.4, 0.55], medium: [0.8, 1.1, 1.6] },
  chords: { beginner: [0.2, 0.4], easy: [0.6, 1.0], medium: [0.9, 1.2] },
}
/** LEVELING.md §2: the density band of a map level (onsets a second). */
function densityBand(l: number): [number, number] | null {
  if (l <= 1) return [0.3, 0.7]
  if (l === 2) return [0.4, 1.0]
  if (l === 3) return [0.5, 1.2]
  if (l <= 6) return [0.6, 1.4]
  return null
}
const short = (h: HandFigures) => `${h.moves.length}/${h.moments} · ${h.positions} · ${h.span}`
const budgetShort = (b: HandBudget) => `${b.moves}/${b.moments} · ${b.positions} · ${b.span}`
function holds(b: HandBudget, h: HandFigures) {
  return h.moves.length <= b.moves && h.moments <= b.moments && h.positions <= b.positions && h.span <= b.span
}
const PC_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']
const pcSet = (ns: number[]) => [...new Set(ns.map((n) => ((n % 12) + 12) % 12))].sort((a, b) => a - b)
const pcNames = (pcs: number[]) => pcs.map((p) => PC_NAMES[p]).join(' ')

// MARK: Songs

function loadSong(ref: string): { name: string; song: SongFile } {
  const path = existsSync(ref) ? resolve(ref) : join(CONTENT, ref.endsWith('.json') ? ref : `${ref}.json`)
  if (!existsSync(path)) {
    console.error(`no song at ${ref} (not a path, not in ${CONTENT})`)
    process.exit(2)
  }
  const song = JSON.parse(readFileSync(path, 'utf8')) as SongFile
  const name = song.name ?? ref.replace(/.*\//, '').replace(/\.json$/, '')
  return { name, song }
}

function measureSong(name: string, s: SongFile) {
  const override = charting.songs?.[name] ?? null
  const problem = validateSong(s, charting.chords.keep)
  if (problem) say('FAIL', `${name}: the app would refuse this file: ${problem}`)
  else say('PASS', `${name}: loads by the app's rules (${musicBars(s)} bars at ${s.song.tempo}, ${Math.round(musicBars(s) * s.beatsPerBar * 60 / s.song.tempo)} s)`)
  const blues = has('blues') || /blues|shuffle|boogie|delta|chicago|texas|jump/i.test(s.song.style ?? '')
  const result: Record<string, unknown> = { tempo: s.song.tempo, bars: musicBars(s), parts: {} }
  for (const k of partKeys(s)) {
    if (partFilter && k !== partFilter) continue
    const figs = figures(charting, override, s, k)
    const tiers = tiersOf(charting, override, k)
    const names = new Map<number, FixedDifficulty[]>()
    for (const d of DIFFICULTIES) {
      const t = tierFor(charting, override, k, d as Difficulty)
      if (t != null) names.set(t, [...(names.get(t) ?? []), d])
    }
    const all = sortedNotes(s.song.parts[k]!.notes)
    const tpb = ticksPerBar(s)
    // The keys each tier plays (pitch classes), from the masks the figures were cut by.
    const perTier = figs.map((f) => {
      const tag = names.get(f.tier)?.join('/') ?? ''
      return { ...f, tag }
    })
    line(`\n${name} · ${k} (${s.song.parts[k]!.title}) · ${s.song.tempo} bpm, ${musicBars(s)} bars`)
    for (const f of perTier) {
      line(`  L${f.tier}${f.tag ? ` (${f.tag})` : ''}: ${f.perSecond.toFixed(2)}/s [${f.quietest.toFixed(1)}–${f.busiest.toFixed(1)}], ${f.notes} notes${f.hand ? `, hand ${short(f.hand)} (${handLine(f.hand)})` : ''} — ${tiers[f.tier - 1].line}`)
    }
    // BLUES.md bands for the named levels.
    if (blues) {
      for (const d of ['beginner', 'easy', 'medium'] as FixedDifficulty[]) {
        const band = BLUES_BANDS[k][d]
        const t = tierFor(charting, override, k, d as Difficulty)
        if (!band || t == null) continue
        const f = figs[t - 1]
        const [lo, hi, stretch] = band
        const v = f.perSecond
        const where = `${name} ${k} ${d} (tier ${t}) is ${v.toFixed(2)}/s; BLUES.md wants ${lo}–${hi}`
        if (v >= lo - 0.005 && v <= hi + 0.005) say('PASS', where)
        else if (level != null) say('note', `${where} (a level's song is judged by LEVELING.md, below)`)
        else if (stretch && v <= stretch + 0.005 && v > hi) say('WARN', `${where} (a riff may run to ${stretch})`)
        else if (d === 'beginner' && v < lo) say('WARN', `${where} (a fast song cannot always reach it: Friars Point 0.24, Halsted 0.18)`)
        else if (v >= lo - 0.1 && v <= hi + 0.1) say('WARN', `${where} (within 0.1: say so in BLUES.md's notes, or move it)`)
        else say('FAIL', where)
      }
    }
    // CHARTING.md rule 5: no rung more than twice the one below (Beginner → Easy is often over
    // it on a fast song and is noted in BLUES.md, so that step is a WARN; a bigger one above is
    // a FAIL).
    for (let i = 1; i < figs.length; i++) {
      const a = figs[i - 1].perSecond, b = figs[i].perSecond
      if (a > 0 && b > a * 2 + 0.005) {
        const text = `${name} ${k}: L${i} → L${i + 1} climbs ${a.toFixed(2)} → ${b.toFixed(2)} (×${(b / a).toFixed(1)}), over the "twice" rule (CHARTING.md rule 5)`
        // Beginner → Easy is often over it on a fast song (noted in BLUES.md), and the comping
        // ladder's rhythm steps sit where the part's weights put them (BLUES.md §3): warnings.
        say(i === 1 || k === 'chords' ? 'WARN' : 'FAIL', text)
      }
    }
    // Every tier is the one below plus more (the charter guarantees it; a broken override shows here).
    const nonDecreasing = figs.every((f, i) => i === 0 || f.notes >= figs[i - 1].notes)
    if (!nonDecreasing) say('FAIL', `${name} ${k}: a tier plays fewer notes than the one below`)
    // The scale, when given: every note on it; the goal tier plays all of it.
    const goalTier = tierFor(charting, override, k, difficulty as Difficulty) ?? figs.length
    if (scale && k === 'melody') {
      const off = all.filter((n) => !scale.includes(((n.n % 12) + 12) % 12))
      if (off.length) say('FAIL', `${name} ${k}: ${off.length} notes off the scale ${pcNames(scale)} (first at bar ${Math.floor(off[0].t / tpb) + 1}: ${noteName(off[0].n)})`)
      else say('PASS', `${name} ${k}: every note on ${pcNames(scale)}`)
      const goalNotes = goalTierNotes(s, k, goalTier)
      const used = pcSet(goalNotes.map((n) => n.n))
      const missing = scale.filter((p) => !used.includes(p))
      if (missing.length) say('FAIL', `${name} ${k} at ${difficulty} (tier ${goalTier}) uses ${pcNames(used)}; missing ${pcNames(missing)} of the level's notes`)
      else say('PASS', `${name} ${k} at ${difficulty} (tier ${goalTier}) uses every note of ${pcNames(scale)}`)
    }
    // LEVELING.md: the goal tier against the level's hand budget and density band.
    if (level != null && k === 'melody') {
      judgeLevel(`${name} ${k} at ${difficulty} (tier ${goalTier})`, goalTierNotes(s, k, goalTier), s.song.tempo, s.ticksPerBeat)
    }
    ;(result.parts as Record<string, unknown>)[k] = perTier.map((f) => ({
      tier: f.tier, tag: f.tag, notes: f.notes, perSecond: +f.perSecond.toFixed(3), quietest: +f.quietest.toFixed(2), busiest: +f.busiest.toFixed(2),
      hand: f.hand ? { moves: f.hand.moves.length, moments: f.hand.moments, positions: f.hand.positions, span: f.hand.span, short: short(f.hand) } : undefined,
    }))
  }
  out[name] = result
}

/** The notes the goal tier plays, by the same masks the figures use. */
function goalTierNotes(s: SongFile, k: PartKey, tier: number) {
  const override = charting.songs?.[s.name] ?? null
  const all = sortedNotes(s.song.parts[k]!.notes)
  // figures() hides the masks; recompute them the same way.
  const ms = masks(charting, override, all, k, s.song.tempo, s.ticksPerBeat, ticksPerBar(s))
  return all.filter((_, i) => ms[tier - 1][i])
}

/** The hand budget and the density band of a map level, on a line of notes. */
function judgeLevel(what: string, notes: { t: number; n: number; len: number }[], tempo: number, ticksPerBeat: number, figuresGiven?: HandFigures, drill = false) {
  if (level == null) return
  const b = handBudget(level, solo)
  const h = figuresGiven ?? handFigures(notes, !has('left'), ticksPerBeat)
  const seconds = notes.length ? (Math.max(...notes.map((n) => n.t + n.len)) / (ticksPerBeat * 4)) * 4 * 60 / tempo : 0
  const onsets = new Set(notes.map((n) => n.t)).size
  const density = seconds > 0 ? onsets / seconds : 0
  const ok = holds(b, h)
  say(ok ? 'PASS' : 'FAIL', `${what}: hand ${short(h)} against the Level ${level}${solo ? ' solo' : ''} budget ${budgetShort(b)} (${handLine(h)}; ${budgetLine(b)})`)
  if (!ok && h.moves.length) {
    const bars = h.moves.map((m) => `${Math.floor(notes[m.index].t / (ticksPerBeat * 4)) + 1}${m.kind === 'tuck' ? ' (thumb under)' : m.kind === 'over' ? ' (over the thumb)' : ''}`)
    line(`      moves at bars ${bars.slice(0, 20).join(', ')}${bars.length > 20 ? ` and ${bars.length - 20} more` : ''}`)
  }
  const band = densityBand(level)
  if (band && drill) line(`      ${density.toFixed(2)} onsets a second (a drill's density is its own: Level ${level}'s song band is ${band[0]}–${band[1]})`)
  else if (band) {
    const [lo, hi] = band
    if (density >= lo - 0.005 && density <= hi + 0.005) say('PASS', `${what}: ${density.toFixed(2)} onsets a second, inside Level ${level}'s ${lo}–${hi}`)
    else say('WARN', `${what}: ${density.toFixed(2)} onsets a second; Level ${level}'s band is ${lo}–${hi}`)
  }
  out[`${what} level`] = { level, solo, hand: short(h), budget: budgetShort(b), holds: ok, density: +density.toFixed(3) }
}

// MARK: Raw notes and lesson steps

function measureNotes(file: string) {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown
  const notes = (Array.isArray(raw) ? raw : (raw as { notes?: unknown }).notes) as { t: number; n: number; len: number }[] | undefined
  if (!Array.isArray(notes) || !notes.length) {
    console.error(`${file}: no notes (a list of {t, n, len}, or an object with a notes list)`)
    process.exit(2)
  }
  const tempo = Number(str('tempo') ?? (raw as { tempo?: number }).tempo ?? 0)
  if (!tempo) {
    console.error('--tempo <bpm> is needed for a raw note list')
    process.exit(2)
  }
  const tpb = Number(str('tpb') ?? 12)
  const sorted = [...notes].sort((a, b) => a.t - b.t || a.n - b.n)
  const h = handFigures(sorted, !has('left'), tpb)
  const end = Math.max(...sorted.map((n) => n.t + n.len))
  const seconds = (end / (tpb * 4)) * 4 * 60 / tempo
  const onsets = new Set(sorted.map((n) => n.t)).size
  line(`${file}: ${sorted.length} notes over ${Math.ceil(end / (tpb * 4))} bars at ${tempo}, ${(onsets / seconds).toFixed(2)} onsets a second, ${noteName(Math.min(...sorted.map((n) => n.n)))}–${noteName(Math.max(...sorted.map((n) => n.n)))}`)
  line(`  hand ${short(h)}: ${handLine(h)}; keys ${pcNames(pcSet(sorted.map((n) => n.n)))}`)
  line(`  fingers (the app's): ${h.fingers.slice(0, 40).join(' ')}${h.fingers.length > 40 ? ' …' : ''}`)
  if (scale) {
    const off = sorted.filter((n) => !scale.includes(((n.n % 12) + 12) % 12))
    say(off.length ? 'FAIL' : 'PASS', off.length ? `${off.length} notes off the scale ${pcNames(scale)}` : `every note on ${pcNames(scale)}`)
  }
  judgeLevel(file.replace(/.*\//, ''), sorted, tempo, tpb)
  out[file] = { notes: sorted.length, hand: short(h), onsetsPerSecond: +(onsets / seconds).toFixed(3) }
}

type Pattern = { bar?: number; beat: number; tick?: number; semitones?: number; tone?: string; note?: number; finger?: number; chord?: string }
type Step = { id: string; tempo?: number; cycle?: number; pattern?: Pattern[]; form?: string[]; chords?: Record<string, { root: number }>; hand?: string; kind?: string; title?: string }
type Module = { displayRoot: number; form: string[]; chords: Record<string, { root: number }>; steps: Step[] }
const TONES: Record<string, number> = { root: 0, minorThird: 3, third: 4, fourth: 5, flatFifth: 6, fifth: 7, sixth: 9, seventh: 10, majorSeventh: 11, octave: 12, ninth: 14, second: 2 }

/** A lesson step's expected notes for one chorus, as Lesson.expected builds them. */
function measureStep(ref: string) {
  const [file, id] = ref.split(':')
  const m = JSON.parse(readFileSync(existsSync(file) ? file : join(CONTENT, file), 'utf8')) as Module
  const step = m.steps.find((s) => s.id === id)
  if (!step) {
    console.error(`${file}: no step ${id} (${m.steps.map((s) => s.id).join(', ')})`)
    process.exit(2)
  }
  const form = step.form ?? m.form
  const chords = step.chords ?? m.chords
  const cycle = step.cycle ?? 1
  const tpb = 12
  const pattern = [...(step.pattern ?? [])].sort((a, b) => (a.bar ?? 0) - (b.bar ?? 0) || a.beat - b.beat || (a.tick ?? 0) - (b.tick ?? 0))
  const notes: { t: number; n: number; len: number; f?: number }[] = []
  form.forEach((name, bar) => {
    const root = chords[name].root
    const here = pattern.filter((p) => (p.bar ?? 0) === bar % cycle && (!p.chord || p.chord === name))
    for (const p of here) {
      const interval = p.semitones ?? (p.tone ? TONES[p.tone] : 0)
      const n = p.note ?? m.displayRoot + root + interval
      notes.push({ t: (bar * 4 + p.beat - 1) * tpb + (p.tick ?? 0), n, len: 0, f: p.finger })
    }
  })
  // Lengths: to the next onset, a beat at most (the step scores onsets only).
  for (let i = 0; i < notes.length; i++) notes[i].len = Math.max(1, Math.min(tpb, (notes[i + 1]?.t ?? notes[i].t + tpb) - notes[i].t))
  const right = step.hand !== 'left'
  const tempo = step.tempo ?? 60
  const written = notes.map((n) => n.f ?? 0)
  const allWritten = written.every((f) => f > 0)
  // A lesson teaches its written fingering, so the hand is read from it (the Stage's planner
  // is what a song's line gets); without fingers, the planner's.
  const h: HandFigures = allWritten
    ? (() => {
        const moves = handMoves(notes, written, right)
        const ns = notes.map((n) => n.n)
        return { moves, moments: handMoments(notes, moves, tpb * 4), positions: handPositions(notes, written, right).length, span: Math.max(...ns) - Math.min(...ns), fingers: written }
      })()
    : handFigures(notes, right, tpb)
  const planned = plan(notes, right, tpb)
  const onePass = notes.filter((n) => n.t < cycle * 4 * tpb)
  line(`${id} (${step.title ?? step.kind}) in ${file.replace(/.*\//, '')}: ${notes.length} notes a chorus (${onePass.length} a cycle of ${cycle} bars) at ${tempo}, ${step.hand ?? 'right'} hand`)
  line(`  one pass: ${onePass.map((n) => noteName(n.n)).join(' ')}`)
  line(`  written fingers: ${onePass.map((n) => n.f ?? '·').join(' ')}${allWritten ? '' : ' (not all written: the hand below is the Stage planner\'s)'}`)
  line(`  the Stage's planner would finger it: ${planned.slice(0, onePass.length).join(' ')} (a lesson teaches the written fingering; this is for a riff that will also be a song line)`)
  line(`  hand ${short(h)}: ${handLine(h)}; keys ${pcNames(pcSet(notes.map((n) => n.n)))}`)
  if (scale) {
    const off = notes.filter((n) => !scale.includes(((n.n % 12) + 12) % 12))
    say(off.length ? 'FAIL' : 'PASS', off.length ? `${id}: ${off.length} notes off ${pcNames(scale)}` : `${id}: every note on ${pcNames(scale)}`)
  }
  judgeLevel(id, notes, tempo, tpb, h, true)
  out[id] = { notes: notes.length, hand: short(h), fingers: onePass.map((n) => n.f ?? 0) }
}

// MARK: Snapshot and compare (CHARTING.md rule 4: patch the song, never the ladder)

type Snapshot = Record<string, Record<string, { perSecond: number; notes: number; hand?: string }[]>>
function snapshot(): Snapshot {
  // Every song file in the Content folder (the catalog may not list a song under test yet).
  const names = readdirSync(CONTENT).filter((f) => f.startsWith('song-') && f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
  const snap: Snapshot = {}
  for (const name of names) {
    const path = join(CONTENT, `${name}.json`)
    if (!existsSync(path)) continue
    const s = JSON.parse(readFileSync(path, 'utf8')) as SongFile
    snap[name] = {}
    for (const k of partKeys(s)) {
      snap[name][k] = figures(charting, charting.songs?.[name] ?? null, s, k).map((f) => ({ perSecond: +f.perSecond.toFixed(3), notes: f.notes, hand: f.hand ? short(f.hand) : undefined }))
    }
  }
  return snap
}

// MARK: Main

if (str('snapshot')) {
  const snap = snapshot()
  writeFileSync(str('snapshot')!, JSON.stringify(snap, null, 1))
  console.log(`wrote ${Object.keys(snap).length} songs' figures to ${str('snapshot')}`)
  process.exit(0)
}
if (str('compare')) {
  const before = JSON.parse(readFileSync(str('compare')!, 'utf8')) as Snapshot
  const now = snapshot()
  const except = new Set((str('except') ?? '').split(',').map((x) => x.trim()).filter(Boolean))
  let changed = 0
  for (const [name, parts] of Object.entries(before)) {
    for (const [k, tiers] of Object.entries(parts)) {
      const cur = now[name]?.[k]
      const same = cur && cur.length === tiers.length && cur.every((f, i) => f.perSecond === tiers[i].perSecond && f.notes === tiers[i].notes && f.hand === tiers[i].hand)
      if (!same && !except.has(name)) {
        changed++
        say('FAIL', `${name} ${k} changed: was ${tiers.map((t) => t.perSecond.toFixed(2)).join(' · ')}, now ${cur ? cur.map((t) => t.perSecond.toFixed(2)).join(' · ') : 'missing'}`)
      } else if (!same) say('note', `${name} ${k} changed (excepted)`)
    }
  }
  if (!changed) say('PASS', `every other song's figures are unchanged (${Object.keys(before).length} songs${except.size ? `, except ${[...except].join(', ')}` : ''})`)
}
if (str('notes')) measureNotes(str('notes')!)
if (str('step')) measureStep(str('step')!)
for (const ref of songs) {
  const { name, song } = loadSong(ref)
  measureSong(name, song)
}
if (!songs.length && !str('notes') && !str('step') && !str('compare')) {
  console.error('usage: measure.ts <song>… | --notes <file> --tempo N | --step <module>:<id> | --snapshot <out> | --compare <snap>  [--level N] [--solo] [--scale pcs] [--json]')
  process.exit(2)
}
if (asJson) console.log(JSON.stringify({ pass, warn, fail, results: out }, null, 1))
else console.log(`\n${pass} pass, ${warn} warn, ${fail} fail`)
process.exit(fail ? 1 : 0)
