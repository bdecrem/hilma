// Checks the jam on any Stage song (Bart, 2026-11-13: "for all games, offer an JAM/improvize
// mode… And then the agent offers a variant on that. The key for all agent variants on jams is
// that it should be at the same general complexity / difficulty as what the user did"). Two
// takes over Restlicht's band as the app sends them from the card's Jam (the whole track as the
// form, 124 bars; straight; `where: jam`): a beginner's quarter notes on three keys in one hand
// position, and a busier player's eighths over two positions. Offline: the request parses, each
// take's measure (take-shape.ts). Live: a review of each, the idea measured against its take
// (as busy, no quicker, the hand as theirs); then the whole track from the busier take, measured
// the same way. Nothing is saved (no user).
//
//   set -a; source ./.env.local; set +a
//   npx tsx scripts/takt/jam-check.ts              # offline + live (~3 min)
//   SKIP_LIVE=1 npx tsx scripts/takt/jam-check.ts  # offline only

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseRequest, runImprovReview, type ImprovRequest } from '../../src/lib/takt/improv-agent'
import { rulesFor, writeSolo } from '../../src/lib/takt/solo-agent'
import { takeShape, shapeLine } from '../../src/lib/takt/take-shape'
import { handFigures, handLine } from '../../src/lib/takt/fingering'
import { type Charting } from '../../src/lib/takt/charting'
import { type SongFile, musicBars, sortedNotes } from '../../src/lib/takt/songfile'

let pass = 0, fail = 0
function check(name: string, ok: boolean, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  · ${info}` : ''}`)
  if (ok) pass++
  else fail++
}

const CONTENT = join(__dirname, '../../apps/takt/Takt/Content')
const song = JSON.parse(readFileSync(join(CONTENT, 'song-restlicht.json'), 'utf8')) as SongFile
const charting = JSON.parse(readFileSync(join(CONTENT, 'charting.json'), 'utf8')) as Charting
// The app's jam form for Restlicht (`Lesson.jamForm`): the whole track in whole four-bar phrases.
const music = song.form.filter((c) => c !== '—')
const FORM = music.slice(0, Math.floor(music.length / 4) * 4)

type N = { t: number; n: number; v: number; len: number }
// A beginner: D F A in quarters, a phrase and a bar of rest, 16 bars.
function beginner(): N[] {
  const out: N[] = []
  for (let bar = 0; bar < 16; bar += 2) {
    const p = bar % 4 === 0 ? [62, 65, 69, 65] : [69, 65, 62, 62]
    p.forEach((n, i) => out.push({ t: bar * 48 + i * 12, n, v: 0.6, len: 12 }))
  }
  return out
}
// A busier player: eighths, the riff low and an answer an octave up (two positions), 16 bars.
function busier(): N[] {
  const out: N[] = []
  for (let bar = 0; bar < 16; bar++) {
    const low = bar % 4 < 2
    const cell = low ? [50, 53, 55, 57, 55, 53, 50, 53] : [62, 65, 67, 69, 72, 69, 67, 65]
    cell.forEach((n, i) => { if (i !== 7 || bar % 2 === 0) out.push({ t: bar * 48 + i * 6, n, v: 0.7, len: 6 }) })
  }
  return out
}

function request(notes: N[], title: string): ImprovRequest {
  const r = parseRequest({
    take: { tempo: song.song.tempo, ticksPerBeat: 12, beatsPerBar: 4, bars: 16, notes },
    backing: { title: song.song.title, style: song.song.style, key: song.song.key, feel: 'straight', form: FORM, scale: null, scaleName: '' },
    context: { where: 'jam', title, about: 'Restlicht\'s band without its riff: the solo is yours.', hand: 'right', device: 'check', level: 1 },
  })
  if (typeof r === 'string') throw new Error(r)
  return r
}

const easy = request(beginner(), 'Jam on Restlicht')
const busy = request(busier(), 'Jam on Restlicht')
check(`the app's jam request parses with the whole track as its form (${FORM.length} bars)`, easy.backing.form.length === FORM.length && FORM.length === 124)
const se = takeShape(easy.take.notes, easy.take.tempo), sb = takeShape(busy.take.notes, busy.take.tempo)
check('the beginner\'s take reads as quarters, one position', se.quickest === 12 && se.hand.moves.length === 0 && se.atOnce === 1, shapeLine(se))
check('the busier take reads as eighths, the hand moving', sb.quickest === 6 && sb.hand.moves.length > 0 && sb.perSecond > se.perSecond * 1.5, shapeLine(sb))

async function live() {
  for (const [name, r, s] of [['beginner', easy, se], ['busier', busy, sb]] as const) {
    const t0 = Date.now()
    const review = await runImprovReview(r, null, () => {})
    const idea = review.idea
    const ticks = [...new Set(idea.notes.map((n) => n.t))].sort((a, b) => a - b)
    const busyBars = new Set(ticks.map((t) => Math.floor(t / 48))).size
    const per = ticks.length / ((busyBars * 4 * 60) / r.take.tempo)
    const gaps = ticks.slice(1).map((t, i) => t - ticks[i])
    const hand = handFigures(idea.notes, true, 12)
    console.log(`  ${name}: "${review.headline}" · idea "${idea.title}", ${idea.bars} bars: ${idea.notes.map((n) => `${n.n}@${n.t}/${n.len}`).join(' ')}`)
    check(`live: the ${name}'s idea (${Math.round((Date.now() - t0) / 1000)} s) is at the take's level: ${per.toFixed(2)} a second against ${s.perSecond.toFixed(2)}, quickest ${Math.min(...gaps, 99)} ticks against ${s.quickest}, ${handLine(hand)}`,
      per <= s.perSecond * 1.5 + 1e-9 && per >= s.perSecond * 0.6 - 1e-9 && gaps.every((g) => g >= s.quickest * 0.75) && (s.hand.moves.length > 0 || hand.moves.length === 0))
    if (name !== 'busier') continue
    const t1 = Date.now()
    const steps: string[] = []
    const solo = await writeSolo(r, review, song, charting, charting.songs['song-restlicht'] ?? null, (e) => { if (e.type === 'status') steps.push(e.text) })
    const notes = sortedNotes(solo.song.song.parts.melody!.notes)
    const seconds = (musicBars(solo.song) * 4 * 60) / solo.song.song.tempo
    const sPer = new Set(notes.map((n) => n.t)).size / seconds
    const sHand = handFigures(notes, true, 12)
    const rules = rulesFor(r, musicBars(song))
    check(`live: the whole track from the busier take (${Math.round((Date.now() - t1) / 1000)} s): ${notes.length} notes, ${sPer.toFixed(2)} a second (the take's ${s.overall.toFixed(2)}; the band ${rules.minPerSecond}–${rules.maxPerSecond}), ${handLine(sHand)} (budget ${rules.hand.moves})`,
      sPer >= rules.minPerSecond - 0.01 && sPer <= rules.maxPerSecond + 0.01 && sHand.moves.length <= rules.hand.moves && sHand.moves.length > 0, steps.join(' → '))
  }
}

async function main() {
  if (!process.env.SKIP_LIVE) await live()
  console.log(`jam-check: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
main()
