// The silences a player gets: for every Stage song, part and tier, the longest stretches with
// nothing to play (the way in before the first onset, every onset to the next, and the last
// note's end to where the game ends). Bart, 2026-11-12: "15 seconds or so should be the longest
// break ever, and not more than once a game, at any level of difficulty." CHARTING.md rule 24:
// none over LONGEST_SILENCE seconds, at most one of BREAK_SILENCE or more. The measure is
// `silences()` in src/lib/takt/charting.ts (measure.ts, Agent mode's ladder line); LessonCheck
// asserts the same in the app.
//
//   npx tsx scripts/takt/gaps.ts [song ...] [--all]   (--all prints every chart, not only failures)

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Charting, masks, silences, silenceFigure, LONGEST_SILENCE, BREAK_SILENCE } from '../../src/lib/takt/charting'
import { type SongFile, sortedNotes, ticksPerBar, partKeys } from '../../src/lib/takt/songfile'

const CONTENT = join(__dirname, '../../apps/takt/Takt/Content')
const args = process.argv.slice(2)
const all = args.includes('--all')
const charting = JSON.parse(readFileSync(join(CONTENT, 'charting.json'), 'utf8')) as Charting
const catalog = readFileSync(join(__dirname, '../../apps/takt/Takt/Game/Song.swift'), 'utf8').match(/static let catalog = \[([^\]]*)\]/)![1]
const files = [...catalog.matchAll(/"([^"]+)"/g)].map((m) => m[1])
const wanted = args.filter((a) => !a.startsWith('--'))
let bad = 0
for (const f of files) {
  if (wanted.length && !wanted.some((w) => f.includes(w))) continue
  const song = JSON.parse(readFileSync(join(CONTENT, `${f}.json`), 'utf8')) as SongFile
  const tpb = ticksPerBar(song)
  for (const part of partKeys(song)) {
    const notes = sortedNotes(song.song.parts[part]!.notes)
    const m = masks(charting, charting.songs?.[f] ?? null, notes, part, song.song.tempo, song.ticksPerBeat, tpb)
    m.forEach((mask, i) => {
      const line = notes.filter((_, j) => mask[j])
      const fig = silenceFigure(song, line)
      if (!fig.ok) bad++
      if (!fig.ok || all) {
        const show = silences(song, line).slice(0, 3).map((x) => `${x.seconds.toFixed(1)} s (bars ${(x.fromTick / tpb + 1).toFixed(1)}–${(x.toTick / tpb + 1).toFixed(1)})`).join(', ')
        console.log(`${fig.ok ? 'ok  ' : 'FAIL'}  ${f} · ${part} · level ${i + 1}: ${show}`)
      }
    })
  }
}
console.log(`\n${bad} chart(s) break the rule (none over ${LONGEST_SILENCE} s; at most one of ${BREAK_SILENCE} s or more)`)
process.exit(bad ? 1 : 0)
