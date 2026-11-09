// Print a Stage part's chart at one tier, bar by bar, with the fingers the Stage will show and
// the hand moves marked: the per-bar read both Takt skills ask for before a chart is believed
// (a chart can pass its band and still lose an anchor in one bar). The TS ports of the charter
// and the hand planner, so no build is needed.
//
//   npx tsx scripts/takt/chart-dump.ts <song> [--part melody|chords] [--tier N] [--bars a-b]
//
// A melody line prints `tick:Key(finger)`; a `^` after the finger marks a hand move (tuck,
// over or jump). A chords line prints `tick:[keys]`.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Charting, masks } from '../../src/lib/takt/charting'
import { type SongFile, type PartKey, sortedNotes, ticksPerBar, noteName, musicBars } from '../../src/lib/takt/songfile'
import { plan, handMoves } from '../../src/lib/takt/fingering'

const args = process.argv.slice(2)
const flag = (k: string) => {
  const i = args.indexOf(`--${k}`)
  return i >= 0 ? args[i + 1] : undefined
}
const ref = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') !== true) ?? args[0]
const CONTENT = join(__dirname, '../../apps/takt/Takt/Content')
const path = ref.endsWith('.json') ? ref : join(CONTENT, `${ref}.json`)
const song = JSON.parse(readFileSync(path, 'utf8')) as SongFile
const name = song.name ?? ref.replace(/.*\//, '').replace(/\.json$/, '')
const charting = JSON.parse(readFileSync(join(CONTENT, 'charting.json'), 'utf8')) as Charting
const part = (flag('part') ?? 'melody') as PartKey
const only = flag('tier') ? Number(flag('tier')) : null
const [from, to] = (flag('bars') ?? `1-${musicBars(song)}`).split('-').map(Number)

const notes = sortedNotes(song.song.parts[part]!.notes)
const tpb = ticksPerBar(song)
const m = masks(charting, charting.songs?.[name] ?? null, notes, part, song.song.tempo, song.ticksPerBeat, tpb)
m.forEach((mask, i) => {
  const tier = i + 1
  if (only && tier !== only) return
  const line = notes.filter((_, j) => mask[j])
  const fingers = part === 'melody' ? plan(line, true, song.ticksPerBeat) : []
  const moved = new Set(part === 'melody' ? handMoves(line, fingers, true).map((x) => x.index) : [])
  console.log(`\n${name} · ${part} · tier ${tier} · ${line.length} notes${part === 'melody' ? ` · ${moved.size} hand moves` : ''}`)
  for (let bar = from; bar <= to; bar++) {
    const o = (bar - 1) * tpb
    const cells: string[] = []
    let chord: string[] = [], at = -1
    line.forEach((n, j) => {
      if (n.t < o || n.t >= o + tpb) return
      if (part === 'melody') cells.push(`${n.t - o}:${noteName(n.n)}(${fingers[j]}${moved.has(j) ? '^' : ''})`)
      else {
        if (n.t !== at) {
          if (chord.length) cells.push(`${at - o}:[${chord.join(' ')}]`)
          chord = []
          at = n.t
        }
        chord.push(noteName(n.n))
      }
    })
    if (chord.length) cells.push(`${at - o}:[${chord.join(' ')}]`)
    console.log(`  ${String(bar).padStart(3)} ${song.form[(bar - 1) % song.form.length].padEnd(4)} ${cells.join('  ') || '·'}`)
  }
})
