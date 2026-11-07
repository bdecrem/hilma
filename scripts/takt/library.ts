// Takt's music library, for the agents (2026-11-07). Bart: "make sure the agents know about
// these two tracks [the lesson bands] so they are available for various things, along with the
// tracks". The server has no song files, so this reads the app's content (the Stage set list in
// Song.catalog, every song file, the two lesson bands, the lesson modules that play over them,
// the year plan) and writes src/lib/takt/library.json, which src/lib/takt/library.ts renders
// into the chat teacher's, the improv teacher's and Agent mode's prompts.
//
//   npx tsx scripts/takt/library.ts          # write library.json
//   npx tsx scripts/takt/library.ts --check  # exit 1 when library.json is stale (chat-check runs it)
//
// Run it after adding or changing a song, a band or a module's band.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '../..')
const CONTENT = join(ROOT, 'apps/takt/Takt/Content')
const OUT = join(ROOT, 'src/lib/takt/library.json')

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

export type LibrarySong = {
  name: string
  title: string
  style: string
  key: string
  tempo: number
  bars: number
  seconds: number
  line: string
  sections: string
  chorus: string
  choruses: number
  parts: { chords: string; melody: string | null }
  shelf: 'set list' | 'all tracks'
  uses: string[]
}

export type LibraryBand = {
  file: string
  name: string
  key: string
  chorus: string
  channels: string[]
  uses: string[]
}

export type Library = { songs: LibrarySong[]; bands: LibraryBand[]; modules: Record<string, string> }

const json = (f: string) => JSON.parse(readFileSync(join(CONTENT, f), 'utf8'))

/** "1–4 Dm7 · 5–6 Gm7 · …" for the first chorus (the form's repeating unit, else the whole). */
function chorusOf(form: string[]): { runs: string; length: number } {
  let n = form.length
  for (let k = 2; k <= form.length / 2; k++) {
    const same = form.filter((c, i) => i >= k && c === form[i - k]).length
    if (same >= (form.length - k) * 0.9) {
      n = k
      break
    }
  }
  const one = form.slice(0, n)
  const out: string[] = []
  let start = 0
  for (let b = 1; b <= one.length; b++) {
    if (b === one.length || one[b] !== one[start]) {
      out.push(`${start + 1 === b ? `${b}` : `${start + 1}–${b}`} ${one[start]}`)
      start = b
    }
  }
  return { runs: out.join(' · '), length: n }
}

/** The key a band's root moved by `t` semitones lands on: "C" + 5 → "F", "Am" − 2 → "Gm". */
function moved(root: string, minor: boolean, t: number): string {
  const m = /^([A-G])([♯♭#b]?)/.exec(root)
  if (!m) return root
  let p = PC[m[1]] + (m[2] === '♯' || m[2] === '#' ? 1 : m[2] === '♭' || m[2] === 'b' ? -1 : 0)
  p = (((p + t) % 12) + 12) % 12
  return `${NAMES[p]}${minor ? ' minor' : ''}`
}

export function buildLibrary(): Library {
  const songSwift = readFileSync(join(ROOT, 'apps/takt/Takt/Game/Song.swift'), 'utf8')
  const catalog = [...(/static let catalog = \[([^\]]*)\]/.exec(songSwift)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1])
  const stage = readFileSync(join(ROOT, 'apps/takt/Takt/Menu/StageScreen.swift'), 'utf8')
  const featured = Number(/static let defaultPins = Array\(Song\.catalog\.prefix\((\d+)\)\)/.exec(stage)?.[1] ?? '6')
  const plan = json('plan-blues-year-1.json') as { levels: { n: number; title: string; items: Record<string, unknown>[] }[] }
  const lessonFiles = readdirSync(CONTENT).filter((f) => f.startsWith('lesson-') && f.endsWith('.json')).sort()
  const lessons = lessonFiles.map((f) => json(f) as {
    code: string
    module: { title: string }
    key?: string
    band: string
    steps: { id: string; title?: string; tempo?: number; transpose?: number; backing?: string; kind?: string }[]
    jams?: { step: string; title: string; after: number }[]
  })
  const moduleTitle = (l: (typeof lessons)[number]) => (l.code === 'S1' ? 'Scales (C major)' : l.code === 'S1m' ? 'Scales (A minor)' : l.module.title)
  const modules = Object.fromEntries(lessons.map((l) => [l.code, moduleTitle(l)]))

  const songs: LibrarySong[] = catalog.map((name, i) => {
    const f = json(`${name}.json`) as { bars: number; form: string[]; song: { title: string; style: string; key: string; tempo: number; line: string; sections: { bar: number; name: string }[]; parts: Record<string, { title: string }> } }
    const bars = f.bars - 1
    const { runs, length } = chorusOf(f.form.slice(0, bars))
    const uses: string[] = []
    for (const level of plan.levels) {
      for (const item of level.items) {
        if (item.kind === 'song' && item.song === name) uses.push(`Level ${level.n} (${level.title}) goal: the ${item.part} on ${item.difficulty === 'easy+' ? 'Easy+' : String(item.difficulty).replace(/^./, (c) => c.toUpperCase())} for ${item.grade === 'A' ? 'an A' : `a ${item.grade}`}`)
      }
    }
    for (const l of lessons) {
      for (const s of l.steps.filter((x) => x.backing === name)) {
        const level = plan.levels.find((lv) => lv.items.some((it) => it.step === s.id))
        uses.push(`the band under ${level ? `Level ${level.n}'s improv` : 'the improv'} "${s.title ?? s.id}" in ${moduleTitle(l)} (the melody left out for the solo)`)
      }
    }
    return {
      name,
      title: f.song.title,
      style: f.song.style,
      key: f.song.key,
      tempo: f.song.tempo,
      bars,
      seconds: Math.round((bars * 4 * 60) / f.song.tempo),
      line: f.song.line,
      sections: f.song.sections.map((x) => `${x.name} (bar ${x.bar + 1})`).join(', '),
      chorus: runs,
      choruses: Math.round((bars / length) * 10) / 10,
      parts: { chords: f.song.parts.chords?.title ?? '', melody: f.song.parts.melody?.title ?? null },
      shelf: i < featured ? 'set list' : 'all tracks',
      uses,
    }
  })

  const bandFiles = readdirSync(CONTENT).filter((f) => f.startsWith('band-') && f.endsWith('.json')).sort()
  const bands: LibraryBand[] = bandFiles.map((file) => {
    const b = json(file) as { name: string; form: string[]; channels: Record<string, unknown[]> }
    const stem = file.slice(0, -5)
    const minor = /m\b|m7|minor/i.test(b.form[0]) || /minor/i.test(b.name)
    const root = /^([A-G][♯♭#b]?)/.exec(b.form[0])?.[1] ?? ''
    const uses: string[] = []
    for (const l of lessons.filter((x) => x.band === stem)) {
      const own = l.steps.filter((s) => !s.backing)
      if (!own.length) continue
      const tempos = own.map((s) => s.tempo).filter((t): t is number => typeof t === 'number')
      const keys = [...new Set(own.map((s) => s.transpose ?? 0))].sort((a, z) => a - z).filter((t) => t !== 0).map((t) => moved(root, minor, t))
      const jams = (l.jams ?? []).filter((j) => own.some((s) => s.id === j.step)).length
      uses.push(`${moduleTitle(l)} (${own.length} steps${jams ? `, ${jams} jams` : ''}, ${Math.min(...tempos)}–${Math.max(...tempos)} bpm${keys.length ? `; some steps move it to ${keys.join(', ')}` : ''})`)
    }
    return {
      file: stem,
      name: b.name,
      key: `${root}${minor ? ' minor' : ''}`,
      chorus: chorusOf(b.form).runs,
      channels: Object.entries(b.channels).filter(([, v]) => Array.isArray(v) && v.length).map(([k]) => k),
      uses,
    }
  })
  return { songs, bands, modules }
}

if (require.main === module) {
  const built = `${JSON.stringify(buildLibrary(), null, 1)}\n`
  if (process.argv.includes('--check')) {
    const now = (() => {
      try {
        return readFileSync(OUT, 'utf8')
      } catch {
        return ''
      }
    })()
    if (now !== built) {
      console.error('src/lib/takt/library.json is stale: run npx tsx scripts/takt/library.ts')
      process.exit(1)
    }
    console.log('library.json is current')
  } else {
    writeFileSync(OUT, built)
    const lib = JSON.parse(built) as Library
    console.log(`wrote ${OUT}: ${lib.songs.length} songs, ${lib.bands.length} bands`)
  }
}
