// Proves src/lib/takt/charting.ts is Charting.swift: every bundled song, part and tier charts
// to the same notes the app's `-DumpCharts` wrote. Then a few of the tool edits on a real song.
//
//   xcrun simctl launch --console-pty "iPhone 17 Pro" com.bartdecrem.Takt -DumpCharts /tmp/takt-charts.json
//   npx tsx scripts/takt/charting-check.ts /tmp/takt-charts.json
//
// (The app writes the file inside the simulator's sandbox when the path isn't absolute; an
// absolute /tmp path is written as given.)

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Charting, figures, masks, validateOverride } from '../../src/lib/takt/charting'
import { type SongFile, sortedNotes, ticksPerBar, validateSong, partKeys, musicBars } from '../../src/lib/takt/songfile'
import { type Draft, runTool } from '../../src/lib/takt/mod-tools'

const CONTENT = join(__dirname, '../../apps/takt/Takt/Content')
const dumpPath = process.argv[2]
if (!dumpPath) {
  console.error('usage: charting-check.ts <dump.json>')
  process.exit(2)
}
const dump = JSON.parse(readFileSync(dumpPath, 'utf8')) as Record<string, Record<string, number[][]>>
const charting = JSON.parse(readFileSync(join(CONTENT, 'charting.json'), 'utf8')) as Charting

let pass = 0, fail = 0
function check(name: string, ok: boolean, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  · ${info}` : ''}`)
  if (ok) pass++
  else fail++
}

for (const [name, parts] of Object.entries(dump)) {
  const song = JSON.parse(readFileSync(join(CONTENT, `${name}.json`), 'utf8')) as SongFile
  const override = charting.songs[name] ?? null
  for (const [part, theirs] of Object.entries(parts)) {
    const notes = sortedNotes(song.song.parts[part as 'chords' | 'melody']!.notes)
    const ours = masks(charting, override, notes, part as 'chords' | 'melody', song.song.tempo, song.ticksPerBeat, ticksPerBar(song)).map((m) =>
      m.map((v, i) => (v ? i : -1)).filter((i) => i >= 0),
    )
    let same = theirs.length === ours.length
    let where = ''
    for (let t = 0; same && t < theirs.length; t++) {
      if (theirs[t].length !== ours[t].length || theirs[t].some((v, i) => v !== ours[t][i])) {
        same = false
        const a = new Set(theirs[t]), b = new Set(ours[t])
        const onlyApp = theirs[t].filter((i) => !b.has(i)).slice(0, 5)
        const onlyUs = ours[t].filter((i) => !a.has(i)).slice(0, 5)
        where = `tier ${t + 1}: app ${theirs[t].length} notes, port ${ours[t].length}; only app ${onlyApp.join(',')}; only port ${onlyUs.join(',')}`
      }
    }
    const figs = figures(charting, override, song, part as 'chords' | 'melody')
    check(`${name} ${part}: ${theirs.length} tiers chart the same`, same, same ? figs.map((f) => f.perSecond.toFixed(2)).join(' · ') : where)
  }
}

// The tools on Slow Burn Short: a level change, a reweight, a rewrite, a copied chorus, and
// the file still loads by the app's rules after each.
const sb = JSON.parse(readFileSync(join(CONTENT, 'song-slow-burn-short.json'), 'utf8')) as SongFile
const keep = charting.chords.keep
const draft: Draft = { song: JSON.parse(JSON.stringify(sb)), override: charting.songs['song-slow-burn-short'] ?? null, title: 'Slow Burn Short mod 01', mutated: false }
check('slow burn short validates as the app would load it', validateSong(draft.song, keep) === null)
let out = runTool(draft, charting, 'read_song', {})
check('read_song reads the ladder', out.includes('Ladder') && out.includes('L1 (beginner)'), out.split('\n').slice(0, 3).join(' | '))
out = runTool(draft, charting, 'set_levels', { part: 'melody', medium: 3 })
check('set_levels names tier 3 for Medium', out.includes('medium → L3') && draft.override?.melody?.medium === 3, out.split('\n')[0])
out = runTool(draft, charting, 'set_levels', { part: 'melody', tiers: { '3': { gap: 5 } } })
check('set_levels refuses a tier that tightens the ladder', out.startsWith('Error') && draft.override?.melody?.tiers?.['3'] == null, out)
check('the override still validates', validateOverride(charting, draft.override!) === null)
const beforeNotes = draft.song.song.parts.melody!.notes.length
out = runTool(draft, charting, 'read_notes', { part: 'melody', from_bar: 1, to_bar: 2 })
check('read_notes lists bars 1–2', out.includes('1: 0') && out.includes('Chords:'), out.split('\n').slice(0, 3).join(' | '))
out = runTool(draft, charting, 'write_notes', {
  part: 'melody', from_bar: 1, to_bar: 1,
  notes: [{ bar: 1, tick: 0, n: 'G4', len: 24, lv: 1, f: 1 }, { bar: 1, tick: 24, n: 'Bb4', len: 12, lv: 2, f: 3 }, { bar: 1, tick: 42, n: 'D5', len: 6, lv: 3, f: 5 }],
})
const after = draft.song.song.parts.melody!.notes
check('write_notes replaces bar 1 and keeps the rest', !out.startsWith('Error') && after.filter((n) => n.t < 48).length === 3 && after.length === beforeNotes - sb.song.parts.melody!.notes.filter((n) => n.t < 48).length + 3, out.split('\n')[0])
const horns = draft.song.channels.horns.filter((e) => e.t < 48)
check('the record\'s horns mirror the new bar (with the long-tone instrument on the half note)', horns.length === 3 && horns[0].i === 'saxLong' && horns[2].i == null && horns.every((e) => e.v > 0 && e.v <= 1), JSON.stringify(horns))
out = runTool(draft, charting, 'write_notes', { part: 'melody', from_bar: 2, to_bar: 2, notes: [{ bar: 3, tick: 0, n: 60, len: 12, lv: 1 }] })
check('write_notes refuses a note outside its range', out.startsWith('Error'), out)
out = runTool(draft, charting, 'write_notes', { part: 'chords', from_bar: 2, to_bar: 2, notes: [{ bar: 2, tick: 0, n: 55, len: 12, lv: 1 }] })
check('write_notes refuses a chord note without a role', out.startsWith('Error'), out)
out = runTool(draft, charting, 'set_weights', { part: 'melody', changes: [{ bar: 1, tick: 24, lv: 3 }] })
check('set_weights moves one onset', !out.startsWith('Error') && after.find((n) => n.t === 24)!.lv === 3, out.split('\n')[0])
const barsBefore = musicBars(draft.song)
out = runTool(draft, charting, 'add_bars', { copy_from_bar: 1, bars: 12 })
check(`add_bars appends a chorus (${barsBefore} → ${musicBars(draft.song)} bars)`, !out.startsWith('Error') && musicBars(draft.song) === barsBefore + 12 && draft.song.form.length === draft.song.bars && draft.song.form[draft.song.bars - 1] === '—', out.split('\n')[0])
check('the copy carries the drums, the bass and both parts', draft.song.channels.drums.some((h) => h.t >= barsBefore * 48) && draft.song.channels.bass.some((n) => n.t >= barsBefore * 48) && partKeys(draft.song).every((k) => draft.song.song.parts[k]!.notes.some((n) => n.t >= barsBefore * 48)))
check('the longer song still validates', validateSong(draft.song, keep) === null, validateSong(draft.song, keep) ?? '')
out = runTool(draft, charting, 'set_sections', { sections: [{ bar: 1, name: 'Head' }, { bar: barsBefore + 1, name: 'Solo' }] })
check('set_sections names the new chorus', !out.startsWith('Error') && draft.song.song.sections[1].bar === barsBefore, out)
out = runTool(draft, charting, 'remove_bars', { from_bar: barsBefore + 1, bars: 12 })
check('remove_bars takes it back out', !out.startsWith('Error') && musicBars(draft.song) === barsBefore && draft.song.song.sections.length === 1 && validateSong(draft.song, keep) === null, out)
out = runTool(draft, charting, 'set_title', { title: 'Slow Burn Short, thinner', line: 'Medium at the tune’s main notes.' })
check('set_title sets both', draft.title === 'Slow Burn Short, thinner' && draft.song.song.line.startsWith('Medium'), out)
check('the draft counts as changed', draft.mutated)

console.log(`\ncharting-check: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
