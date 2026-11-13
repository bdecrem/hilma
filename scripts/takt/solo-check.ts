// Checks the improv teacher's whole track (src/lib/takt/solo-agent.ts): the chord tones, the
// rules, the solo checker on a hand-made good solo and on bad ones (looping, off the changes,
// too busy, two notes at once, the idea missing), then one real track over Blue Lantern II
// (Level 1: the white keys) straight through the library, and with BASE set, the same through
// POST /api/takt/improv/track as a throwaway guest (its solo row deleted with it).
//
//   set -a; source ./.env.local; set +a
//   npx tsx scripts/takt/solo-check.ts                  # pure checks + one live track (~2 min)
//   SKIP_LIVE=1 npx tsx scripts/takt/solo-check.ts      # pure checks only
//   BASE=https://ola.cx npx tsx scripts/takt/solo-check.ts   # + the route
//   OUT=<dir>: writes the live track's bundle (load it with -LoadMod <file>)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseRequest, type ImprovRequest, type Review } from '../../src/lib/takt/improv-agent'
import { checkSolo, chordLine, chordTones, parseReview, rulesFor, runSoloTrack } from '../../src/lib/takt/solo-agent'
import { handFigures, handLine } from '../../src/lib/takt/fingering'
import { handBudget, homeLine } from '../../src/lib/takt/leveling'
import { masks } from '../../src/lib/takt/charting'
import { type Charting } from '../../src/lib/takt/charting'
import { type PartNote, type SongFile, cloneSong, musicBars, validateSong } from '../../src/lib/takt/songfile'

let pass = 0, fail = 0
function check(name: string, ok: boolean, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  · ${info}` : ''}`)
  if (ok) pass++
  else fail++
}

const CONTENT = join(__dirname, '../../apps/takt/Takt/Content')
const charting = JSON.parse(readFileSync(join(CONTENT, 'charting.json'), 'utf8')) as Charting
const song = JSON.parse(readFileSync(join(CONTENT, 'song-blue-lantern-white.json'), 'utf8')) as SongFile
const override = charting.songs['song-blue-lantern-white'] ?? null

const FORM = ['Dm7', 'Dm7', 'Dm7', 'Dm7', 'Gm7', 'Gm7', 'Dm7', 'Dm7', 'Bb7', 'A7', 'Dm7', 'A7']
const WHITE = [0, 2, 4, 5, 7, 9, 11]

// Bart's take: mostly the D and the F, two choruses, a climb in bar 1, a drop in bars 25–26.
function take() {
  const notes: { t: number; n: number; v: number; len: number }[] = []
  const phrases = [
    [[0, 62, 12], [12, 65, 12], [24, 67, 24]],
    [[0, 62, 24]],
    [[12, 65, 12], [24, 62, 12], [36, 65, 12]],
    [[0, 62, 36]],
    [[0, 65, 12], [12, 67, 12], [24, 65, 12], [36, 62, 12]],
    [[0, 62, 48]],
  ]
  for (let bar = 0; bar < 24; bar++) {
    for (const [t, n, len] of phrases[bar % phrases.length]) notes.push({ t: bar * 48 + t, n, v: 0.6 + (bar % 4) * 0.05, len })
  }
  notes.push({ t: 24 * 48, n: 69, v: 0.7, len: 12 }, { t: 24 * 48 + 12, n: 67, v: 0.6, len: 12 }, { t: 24 * 48 + 24, n: 62, v: 0.7, len: 24 })
  return { tempo: 84, ticksPerBeat: 12, beatsPerBar: 4, bars: 26, notes }
}

const body = {
  take: take(),
  backing: { title: 'Blue Lantern II', style: 'Minor blues', key: 'Dm', feel: 'straight', form: FORM, scale: WHITE, scaleName: 'the white keys' },
  context: { where: 'level', title: 'Improvise on the white keys', about: 'C major and A natural minor: the white keys.', hand: 'right', device: 'check' },
}
const r = parseRequest(body) as ImprovRequest
check('the take parses', typeof r !== 'string')

const review: Review = {
  headline: 'Your bar 1 climb came home to D',
  notes: ['The D, F, G climb in bar 1 is a real phrase.', 'Bar 25\'s A, G, D drop answered it.'],
  idea: { title: 'Your climb, landing on D', why: 'Bar 1\'s climb with a long G, then bar 25\'s drop onto D on beat 1 of bar 2.', bars: 2, notes: [{ t: 0, n: 62, len: 12, f: 1 }, { t: 12, n: 65, len: 12, f: 2 }, { t: 24, n: 67, len: 24, f: 3 }, { t: 48, n: 62, len: 36, f: 1 }] },
}
check('parseReview: the app\'s review parses', typeof parseReview(review) !== 'string' && typeof parseReview({ ...review, idea: { ...review.idea, bars: 3 } }) === 'string')

// MARK: Chords

check('chordTones: Dm7, Gm7, Bb7, A7, Dm, F#m7b5, Cmaj7',
  chordTones('Dm7')!.join() === '2,5,9,0' && chordTones('Gm7')!.join() === '7,10,2,5' && chordTones('Bb7')!.join() === '10,2,5,8' && chordTones('A7')!.join() === '9,1,4,7'
  && chordTones('Dm')!.join() === '2,5,9' && chordTones('F#m7b5')!.join() === '6,9,0,4' && chordTones('Cmaj7')!.join() === '0,4,7,11' && chordTones('—') === null)
const cl = chordLine(FORM, WHITE)
check('chordLine: every chord once, the tones among the white keys, the rest named', cl === 'Dm7 = D F A C · Gm7 = G D F (B♭ is not allowed) · Bb7 = D F (B♭, A♭ are not allowed) · A7 = A E G (C♯ is not allowed)', cl)

// MARK: Rules and the checker

const rules = rulesFor(r)
// Level 1 (LEVELING.md): the home position is the five white keys the take sat on (D4 to A4:
// the take is D, F, G, A with one C5), the range a step either side. The hand budget and the
// density are the take's own (take-shape.ts, 2026-11-13: it never moved, so 2 moves in 1 place,
// under Level 1's 4; 0.77 notes a second, so 0.62 to 1.0), no sixteenths, runs of 4 at most.
check('rules: Level 1, the home position D4–A4 (thumb on D4), the range C4–B4, the white keys, the take\'s own budget (2 moves in 1 place, under Level 1\'s 4) and density (0.62–1.0)',
  rules.hand.level === 1 && rules.hand.moves === 2 && rules.hand.moments === 1 && rules.home.keys.join() === '62,64,65,67,69' && rules.low === 60 && rules.high === 71
  && rules.minPerSecond === 0.62 && rules.maxPerSecond === 1 && !rules.sixteenths && rules.run === 4
  && rules.scale!.length === 7 && !rules.shuffle && homeLine(rules.home) === 'thumb on D4, then E4 F4 G4, pinky on A4', JSON.stringify({ ...rules, home: rules.home, hand: rules.hand }))
const level3 = rulesFor({ ...r, context: { ...r.context, level: 3 } })
check('rules: Level 3 keeps the old range (a seventh under the take, an octave over it); its budget is the take\'s (2 moves), under the level\'s 20', level3.low === 55 && level3.high === 81 && level3.hand.moves === 2, JSON.stringify(level3.hand))
// A jam (Bart, 2026-11-13: variants "at the same general complexity / difficulty as what the
// user did"): a busy take in sixteenths that moves its hand gets a busier track, sixteenths on
// the grid, longer runs and more moves; its range is where it played.
{
  const busy: typeof body.take.notes = []
  for (let bar = 0; bar < 16; bar++) {
    const lo = bar % 4 < 2 ? 62 : 69
    for (let k = 0; k < 8; k++) busy.push({ t: bar * 48 + k * 3, n: lo + [0, 2, 3, 5, 3, 2, 0, 2][k], v: 0.6, len: 3 })
  }
  const jam = parseRequest({ ...body, take: { ...body.take, bars: 16, notes: busy }, context: { ...body.context, where: 'jam' } }) as ImprovRequest
  const jr = rulesFor(jam, 48)
  check('rules: a jam at the take\'s level: a busy take in sixteenths that moves gets sixteenths, longer runs, more moves, its own range',
    jr.sixteenths && jr.run >= 8 && jr.minPerSecond > 1.2 && jr.hand.moves > 4 && jr.low === 60 && jr.high === 76,
    JSON.stringify({ min: jr.minPerSecond, max: jr.maxPerSecond, run: jr.run, hand: jr.hand, low: jr.low, high: jr.high }))
}

// MARK: The hand (the fingering port against the app's figures, LEVELING.md §1)

{
  const all = [...song.song.parts.melody!.notes].sort((a, b) => a.t - b.t || a.n - b.n)
  const ms = masks(charting, override, all, 'melody', song.song.tempo, song.ticksPerBeat, 48)
  const figs = ms.map((m) => handFigures(all.filter((_, i) => m[i])))
  const line = figs.map((f) => `${f.moves.length}/${f.moments}·${f.positions}·${f.span}`).join(' ')
  check('hand: Blue Lantern II by tier as the app reads it: Beginner to Easy+ one position and no move (0/0·1·10), Medium 6 moves in 3 moments and 3 positions (6/3·3·13)',
    line === '0/0·1·10 0/0·1·10 0/0·1·10 0/0·1·10 0/0·1·10 6/3·3·13 6/4·3·13', line)
  const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures/solo-blue-lantern-2026-11-07.json'), 'utf8')) as { notes: PartNote[] }
  const f = handFigures(fixture.notes)
  check(`hand: the first solo of 2026-11-07 reads ${handLine(f)}`, f.moves.length === 10 && f.moments === 7 && f.span === 15, handLine(f))
  const b = handBudget(1, true)
  const fixtureProblems = checkSolo(withSolo(fixture.notes), rules, review.idea)
  check(`hand: that solo is refused for the hand (budget ${b.moves} moves in ${b.moments} places) with the bars named`,
    fixtureProblems.some((p) => p.startsWith('the hand moves 10 times') && p.includes('bars 13 (thumb under)')), fixtureProblems.join(' | '))
}


const tpb = 48
const bars = musicBars(song)
/** A solo that keeps every rule, the hand's first (LEVELING.md): the whole line in the home
 *  position, thumb on D4 and pinky on A4, with one figure that leaves it and comes straight
 *  back (the peak chorus reaches over the top to B4); the idea stated in chorus 1, up a step in
 *  chorus 2, answered over the top in chorus 3, home in the last, each chorus with its own
 *  rhythm so it never loops; the first note of every change bar a chord tone. */
function goodSolo(): PartNote[] {
  const out: PartNote[] = []
  const put = (bar: number, tick: number, n: number, len: number, lv: number) => out.push({ t: (bar - 1) * tpb + tick, n, len, lv })
  const chorus = (c: number, shift: number, v: number) => {
    const b0 = c * 12
    // Bars 1–2: the idea (D F G, then D), shifted by `shift` semitones within the scale by key;
    // later choruses start it a beat later or stretch it.
    const idea = [62, 65, 67, 62]
    if (v === 1) { put(b0 + 1, 12, idea[0] + shift, 12, 1); put(b0 + 1, 24, idea[1] + shift, 12, 2); put(b0 + 1, 36, idea[2] + shift, 12, 2); put(b0 + 2, 0, idea[3] + shift, 36, 1) }
    else if (v === 3) { put(b0 + 1, 0, idea[0], 24, 1); put(b0 + 1, 24, idea[1], 12, 2); put(b0 + 1, 36, idea[2], 12, 2); put(b0 + 2, 0, idea[3], 48, 1) }
    else { put(b0 + 1, 0, idea[0] + shift, 12, 1); put(b0 + 1, 12, idea[1] + shift, 12, 2); put(b0 + 1, 24, idea[2] + shift, 24, 2); put(b0 + 2, 0, idea[3] + shift, 36, 1) }
    // Bars 3–4: an answer, then a rest bar. The peak chorus reaches over the top (A, then B4
    // under the pinky's stretch) and comes home.
    if (v === 2) { put(b0 + 3, 12, 69, 12, 2); put(b0 + 3, 24, 71, 12, 2); put(b0 + 3, 36, 69, 12, 1); put(b0 + 4, 0, 65, 24, 1) }
    else if (v === 1) { put(b0 + 3, 0, 65, 12, 2); put(b0 + 3, 18, 64, 6, 3); put(b0 + 3, 24, 62, 24, 1); put(b0 + 4, 12, 62, 24, 1) }
    else if (v === 3) { put(b0 + 3, 12, 64, 12, 2); put(b0 + 3, 24, 62, 24, 1); put(b0 + 4, 0, 62, 36, 1) }
    else { put(b0 + 3, 12, 65, 12, 2); put(b0 + 3, 24, 64, 12, 2); put(b0 + 3, 36, 62, 12, 1); put(b0 + 4, 0, 62, 24, 1) }
    // Bars 5–6 Gm7: G on 1, then D and F in a different rhythm each chorus.
    if (v === 1) { put(b0 + 5, 0, 67, 12, 1); put(b0 + 5, 12, 65, 12, 2); put(b0 + 5, 24, 62, 24, 2); put(b0 + 6, 0, 67, 24, 1); put(b0 + 6, 36, 65, 12, 3) }
    else if (v === 2) { put(b0 + 5, 0, 67, 36, 1); put(b0 + 5, 36, 69, 12, 3); put(b0 + 6, 0, 67, 12, 1); put(b0 + 6, 12, 65, 12, 2); put(b0 + 6, 24, 62, 24, 2) }
    else if (v === 3) { put(b0 + 5, 0, 67, 24, 1); put(b0 + 5, 30, 65, 6, 3); put(b0 + 5, 36, 62, 12, 2); put(b0 + 6, 0, 67, 48, 1) }
    else { put(b0 + 5, 0, 67, 24, 1); put(b0 + 5, 24, 62, 12, 2); put(b0 + 5, 36, 65, 12, 2); put(b0 + 6, 0, 67, 36, 1) }
    // Bars 7–8 Dm7: D on 1 held, then F E D.
    if (v === 1) { put(b0 + 7, 0, 62, 12, 1); put(b0 + 7, 12, 65, 12, 2); put(b0 + 7, 24, 64, 12, 3); put(b0 + 7, 36, 62, 12, 2); put(b0 + 8, 0, 65, 48, 1) }
    else if (v === 2) { put(b0 + 7, 0, 69, 24, 1); put(b0 + 7, 24, 67, 12, 2); put(b0 + 7, 36, 65, 12, 3); put(b0 + 8, 0, 62, 48, 1) }
    else { put(b0 + 7, 0, 62, 24, 1); put(b0 + 7, 24, 65, 12, 2); put(b0 + 7, 36, 64, 12, 3); put(b0 + 8, 0, 62, 48, 1) }
    // Bar 9 Bb7: F on 1, D. Bar 10 A7: A on 1, G, E. Bar 11 Dm7: D. Bar 12 A7: E, then A held.
    if (v === 2) { put(b0 + 9, 0, 65, 12, 1); put(b0 + 9, 12, 62, 12, 2); put(b0 + 9, 24, 65, 24, 2); put(b0 + 10, 0, 69, 24, 1); put(b0 + 10, 24, 64, 24, 2) }
    else if (v === 3) { put(b0 + 9, 0, 65, 36, 1); put(b0 + 10, 0, 69, 12, 1); put(b0 + 10, 12, 67, 12, 2); put(b0 + 10, 24, 65, 12, 3); put(b0 + 10, 36, 64, 12, 2) }
    else { put(b0 + 9, 0, 65, 24, 1); put(b0 + 9, 24, 62, 24, 2); put(b0 + 10, 0, 69, 12, 1); put(b0 + 10, 12, 67, 12, 2); put(b0 + 10, 24, 64, 24, 2) }
    if (v === 1) { put(b0 + 11, 0, 62, 24, 1); put(b0 + 11, 24, 64, 12, 2); put(b0 + 11, 36, 65, 12, 2); put(b0 + 12, 0, 64, 24, 2); put(b0 + 12, 24, 69, 24, 1) }
    else { put(b0 + 11, 0, 62, 36, 1); put(b0 + 12, 0, 64, 12, 2); put(b0 + 12, 12, 69, 36, 1) }
  }
  chorus(0, 0, 0)
  chorus(1, 2, 1) // the idea up a step (E G A, E): the same shape, a beat late
  chorus(2, 0, 2) // the peak: the answer reaches over the top of the hand
  chorus(3, 0, 3) // home: longer notes
  // Bars 47–48: home on D, held.
  out.length = out.findIndex((n) => n.t >= 46 * tpb)
  put(47, 0, 65, 12, 2); put(47, 12, 64, 12, 2); put(47, 24, 62, 24, 1)
  put(48, 0, 62, 48, 1)
  return out.sort((a, b) => a.t - b.t || a.n - b.n)
}
function withSolo(notes: PartNote[]): SongFile {
  const s = cloneSong(song)
  s.song.parts.melody!.notes = notes
  return s
}
const good = goodSolo()
const goodSong = withSolo(good)
check('a good solo keeps the song sound', validateSong(goodSong, null) === null, validateSong(goodSong, null) ?? '')
const okProblems = checkSolo(goodSong, rules, review.idea)
const goodHand = handFigures(good)
check(`a good solo passes the check (${handLine(goodHand)})`, okProblems.length === 0 && goodHand.moves.length <= 4, okProblems.join(' | '))

// Looping: four identical choruses.
const looped = (() => {
  const one = good.filter((n) => n.t < 12 * tpb)
  const out: PartNote[] = []
  for (let c = 0; c < 4; c++) for (const n of one) out.push({ ...n, t: n.t + c * 12 * tpb })
  return out
})()
const loopProblems = checkSolo(withSolo(looped), rules, review.idea)
check('a looped solo is sent back for looping', loopProblems.some((p) => p.startsWith('it loops')), loopProblems.join(' | '))

// Off the changes: Gm7 bars start on E (not a tone), A7 bars on F.
const offChanges = good.map((n) => {
  const bar = Math.floor(n.t / tpb) % 12
  if ((bar === 4 || bar === 9 || bar === 11) && n.t % tpb === 0) return { ...n, n: bar === 4 ? 64 : 65 }
  return n
})
const changeProblems = checkSolo(withSolo(offChanges), rules, review.idea)
check('a solo off the changes is sent back naming the bars', changeProblems.some((p) => p.startsWith('the changes') && p.includes('bar 5 (Gm7')), changeProblems.join(' | '))

// Too busy, runs of eighths, a black key, two notes at once, the idea missing.
const busy: PartNote[] = []
for (let b = 0; b < bars; b++) for (let e = 0; e < 8; e++) busy.push({ t: b * tpb + e * 6, n: 62 + (e % 4) * 2, len: 6, lv: e === 0 ? 1 : 2 })
const busyProblems = checkSolo(withSolo(busy), rules, review.idea)
check('a solo of straight eighths is too busy and runs too long', busyProblems.some((p) => p.startsWith('too busy')) && busyProblems.some((p) => p.startsWith('runs of 5')), busyProblems.join(' | '))
const chords = good.flatMap((n) => (n.lv === 1 ? [n, { ...n, n: n.n + 4 }] : [n]))
check('two notes at once are refused', checkSolo(withSolo(chords), rules, review.idea).some((p) => p.startsWith('two notes at once')))
const black = good.map((n, i) => (i === 5 ? { ...n, n: 61 } : n))
check('a black key is refused on the white keys', checkSolo(withSolo(black), rules, review.idea).some((p) => p.startsWith('not among the notes allowed')))
const noIdea = good.map((n) => ({ ...n, n: n.n % 12 === 5 ? n.n - 1 : n.n % 12 === 7 ? n.n + 2 : n.n }))
check('a solo without the idea is sent back for it', checkSolo(withSolo(noIdea), rules, review.idea).some((p) => p.startsWith('the idea is not in it')))
const silent = good.filter((n) => n.t < 20 * tpb || n.t >= 23 * tpb)
check('three silent bars are named', checkSolo(withSolo(silent), rules, review.idea).some((p) => p.startsWith('more than two bars without a note')))
const low = good.map((n, i) => (i === 3 ? { ...n, n: 40 } : n))
check('a note out of range is named', checkSolo(withSolo(low), rules, review.idea).some((p) => p.startsWith('out of range')))

// MARK: Live

async function live() {
  const t0 = Date.now()
  const steps: string[] = []
  const solo = await runSoloTrack(r, review, 'song-blue-lantern-white', 'Blue Lantern II', song, charting, override, null, (e) => {
    if (e.type === 'status') {
      steps.push(e.text)
      console.log(`   ${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s  ${e.text}`)
    }
  })
  const secs = ((Date.now() - t0) / 1000).toFixed(0)
  const perSecond = new Set(solo.notes.map((n) => n.t)).size / ((bars * 4 * 60) / song.song.tempo)
  const lines: string[] = []
  for (let b = 0; b < bars; b++) {
    const inBar = solo.notes.filter((n) => Math.floor(n.t / tpb) === b)
    lines.push(`Bar ${String(b + 1).padStart(2)} ${song.form[b].padEnd(4)} ${inBar.map((n) => `${['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'][n.n % 12]}${Math.floor(n.n / 12) - 1}@${(n.t % tpb) / 12 + 1}/${n.len}${n.lv === 1 ? '*' : ''}`).join(' ')}`)
  }
  console.log(`\n${solo.title}\n${solo.line}\n${lines.join('\n')}\n`)
  const problems = checkSolo(solo.song, rules, review.idea)
  const hand = handFigures(solo.notes)
  check(`live: a track in ${secs} s, ${solo.notes.length} notes (${perSecond.toFixed(2)} a second), ${handLine(hand)}, titled, on the white keys, every rule kept`,
    solo.title.length > 0 && solo.line.length > 0 && problems.length === 0 && solo.notes.every((n) => WHITE.includes(n.n % 12)), problems.join(' | ') || steps.join(' → '))
  check('live: the band\'s horns mirror the solo', solo.song.channels.horns.length === solo.notes.length && solo.song.channels.horns.every((e, i) => e.t === solo.notes[i].t && e.n === solo.notes[i].n))
  check('live: the file is sound for the app', validateSong(solo.song, null) === null)
  if (process.env.OUT) {
    mkdirSync(process.env.OUT, { recursive: true })
    const file = cloneSong(solo.song)
    file.name = 'solo-check001'
    file.song.title = 'Blue Lantern II'
    const now = new Date().toISOString()
    const top = { id: '22222222-3333-4444-5555-666666666666', kind: 'solo', name: file.name, base: 'song-blue-lantern-white', base_title: 'Blue Lantern II', title: 'Blue Lantern II', version: 1, song: file, charting: override, messages: [{ role: 'user', text: `from their take: "${review.headline}"`, at: now }, { role: 'agent', text: `${solo.title}: ${solo.line}`, at: now }], versions: [{ version: 0, title: 'Blue Lantern II', line: '', ask: 'The original: Blue Lantern II', at: now }, { version: 1, title: 'Blue Lantern II', line: solo.line, ask: solo.title, at: now }], created_at: now, updated_at: now }
    const path = join(process.env.OUT, 'solo-blue-lantern.json')
    writeFileSync(path, JSON.stringify(top))
    console.log(`   wrote ${path}`)
  }
}

async function route(base: string) {
  const guest = await fetch(`${base}/api/takt/auth/guest`, { method: 'POST' })
  const cookie = guest.headers.get('set-cookie')?.split(';')[0] ?? ''
  check('route: a guest session', guest.ok && cookie.startsWith('takt_session='))
  const t0 = Date.now()
  const res = await fetch(`${base}/api/takt/improv/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ ...body, review, song, base: 'song-blue-lantern-white', base_title: 'Blue Lantern II', charting, song_charting: override }),
  })
  const text = await res.text()
  const events = text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
  const track = events.find((e) => e.type === 'track')
  const mod = track?.mod
  check(`route: status steps, a track with a solo bundle (v${mod?.version}, kind ${mod?.kind}) in ${((Date.now() - t0) / 1000).toFixed(0)} s, done`,
    res.ok && events.some((e) => e.type === 'status') && mod?.kind === 'solo' && mod?.version === 1 && mod?.name?.startsWith('solo-') && mod?.title === 'Blue Lantern II' && events.at(-1)?.type === 'done',
    `${res.status} ${events.map((e) => e.type === 'status' ? e.text : e.type).join(' → ')}`)
  if (mod) {
    check('route: the bundle\'s song is sound, its melody the solo', validateSong(mod.song, null) === null && mod.song.song.line === track.line && mod.versions?.length === 2)
    const list = await fetch(`${base}/api/takt/mods`, { headers: { Cookie: cookie } }).then((x) => x.json())
    check('route: the list carries its kind', list.mods?.length === 1 && list.mods[0].kind === 'solo')
    if (process.env.OUT) {
      const path = join(process.env.OUT, 'solo-route.json')
      writeFileSync(path, JSON.stringify(mod))
      console.log(`   wrote ${path}`)
    }
  }
  const noAuth = await fetch(`${base}/api/takt/improv/track`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  check('route: no session, 401', noAuth.status === 401)
  const bad = await fetch(`${base}/api/takt/improv/track`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ ...body, review, charting }) })
  check('route: no song file, 400', bad.status === 400)
  const { f2Supabase } = await import('../../src/lib/f2/supabase')
  const me = await fetch(`${base}/api/takt/auth/me`, { headers: { Cookie: cookie } }).then((x) => x.json()).catch(() => null)
  const id = me?.user?.id ?? me?.id
  if (id) {
    const { error } = await f2Supabase().from('takt_users').delete().eq('id', id)
    check('route: the guest is deleted (its solo with it)', !error, error?.message ?? '')
  }
}

;(async () => {
  if (!process.env.SKIP_LIVE) await live()
  if (process.env.BASE) await route(process.env.BASE)
  console.log(`solo-check: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
