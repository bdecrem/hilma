// Checks the teacher's chat (src/lib/takt/chat-agent.ts): the request parser, the context in
// words, then Bart's own question ("is this song in A minor? why was the melody i played mostly
// a D (the 4) and the F (a 6)? …") asked from the Level 1 improv with a take mostly on D and F,
// straight through the library; and with BASE set, the same through POST /api/takt/chat as a
// throwaway guest (deleted after).
//
//   set -a; source ./.env.local; set +a
//   npx tsx scripts/takt/chat-check.ts                 # pure checks + one live answer
//   SKIP_LIVE=1 npx tsx scripts/takt/chat-check.ts     # pure checks only
//   BASE=https://ola.cx npx tsx scripts/takt/chat-check.ts   # + the route

import { readFileSync } from 'node:fs'
import { chordRuns, describe, parseChatRequest, runChat, type ChatRequest } from '../../src/lib/takt/chat-agent'
import { libraryText } from '../../src/lib/takt/library'
import { buildLibrary } from './library'
import { SONG_TITLES, chatEvent, dayFactsOf, improvEvent, modEvents, renderMemory, scoreEvents, sessionsOf } from '../../src/lib/takt/memory'

let pass = 0, fail = 0
function check(name: string, ok: boolean, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  · ${info}` : ''}`)
  if (ok) pass++
  else fail++
}

const FORM = ['Dm7', 'Dm7', 'Dm7', 'Dm7', 'Gm7', 'Gm7', 'Dm7', 'Dm7', 'B♭7', 'A7', 'Dm7', 'A7']

// Two choruses mostly on D and F, the way the app transcribes a take.
function take(): string {
  const lines: string[] = []
  for (let bar = 0; bar < 24; bar++) {
    const chord = FORM[bar % 12]
    const head = `Bar ${bar + 1}${bar % 12 === 0 ? ` (chorus ${bar / 12 + 1})` : ''}, ${chord}:`
    const notes = bar % 4 === 3 ? 'rest' : bar % 2 === 0 ? 'D4 on 1 for 1, F4 on 2 for 1, D4 on 3 for 2' : 'F4 on 1 for 1.5, D4 on 2.5 for 0.5, A4 on 3 for 1, F4 on 4 for 1'
    lines.push(`${head} ${notes}`)
  }
  return lines.join('\n')
}

const context = {
  device: 'mac',
  screen: 'lesson',
  where: 'Scales · Improvise on the white keys · Level 1',
  level: {
    n: 1, title: 'White keys', opened: true,
    text: 'Both hands on the white keys: C major and A natural minor, one song, one solo.',
    goals: [
      { title: 'C major, up and down', detail: 'Two octaves in eighths at 72.', status: 'Done · 100% at 72', done: true },
      { title: 'Blue Lantern on the white keys', detail: 'The sax line on the Stage, Medium, an A.', status: 'Best 85% on Medium · an A is 90%', done: false },
      { title: 'Improvise on the white keys', detail: 'Two choruses, 16 notes, nine in ten on the white keys.', status: 'Not yet', done: false },
    ],
  },
  lesson: {
    module: 'Scales', code: 'S1m', lesson: 15, lessonCount: 15, lessonTitle: 'Improvise on the white keys',
    step: {
      id: 'improv-white', title: 'Improvise on the white keys', kind: 'free',
      about: "Blue Lantern II's band without its sax: the solo is yours. Play anything on the white keys, the notes of C major and A natural minor, for two choruses or more.",
      key: 'Dm', keyName: 'D minor', backing: 'Blue Lantern II (Minor blues, D minor, 84 bpm)', hand: 'right', tempo: 84, feel: 'straight',
      form: FORM, chords: { Dm7: { numeral: 'i', root: 'D' }, Gm7: { numeral: 'iv', root: 'G' }, 'B♭7': { numeral: 'VI', root: 'B♭' }, A7: { numeral: 'V', root: 'A' } },
      scale: 'D E F G A B C (the white keys)',
    },
    phase: 'playing', tempoNow: 84, playing: false, bar: 1, chorus: 3,
    coach: 'Your solo. Play anything.',
    improv: { notes: 66, choruses: 2, take: take() },
  },
  progress: { streak: 3, xp: 640, levelsCleared: 0, practicedToday: true },
}

const question = 'is this song in A minor? why was the melody i played mostly a D (the 4) and the F (a 6)? should i lean on those for my improv, and when we get to the IV chord, and the V, what\'s typically advised'

const parsed = parseChatRequest({ message: question, thread: [{ role: 'user', text: 'hi' }, { role: 'teacher', text: 'Hello. Ask away.' }], context })
check('parse: a good body parses', typeof parsed !== 'string', typeof parsed === 'string' ? parsed : '')
const r = parsed as ChatRequest
check('parse: bad bodies are refused', typeof parseChatRequest({}) === 'string' && typeof parseChatRequest({ message: 'x', thread: 'no' }) === 'string'
  && typeof parseChatRequest({ message: 'x'.repeat(3000) }) === 'string' && typeof parseChatRequest({ message: 'x', thread: [{ role: 'agent', text: 'y' }] }) === 'string')
check('parse: a message alone is enough (an empty thread, an empty context)', typeof parseChatRequest({ message: 'hello' }) !== 'string')
check('chordRuns: runs of a chord joined', chordRuns(FORM) === '1–4 Dm7 · 5–6 Gm7 · 7–8 Dm7 · 9 B♭7 · 10 A7 · 11 Dm7 · 12 A7', chordRuns(FORM))
const d = describe(r.context)
check('describe: the screen, the level and its goals, the step, the key, the form with numerals, the notes allowed, the take',
  d.startsWith('Screen: a lesson step, on the Mac.') && d.includes('Level 1, "White keys" (what they are doing now was opened from this level\'s goals)')
  && d.includes('- Blue Lantern on the white keys: The sax line on the Stage, Medium, an A. [Best 85% on Medium · an A is 90%]')
  && d.includes('Key: D minor; the backing: Blue Lantern II (Minor blues, D minor, 84 bpm); hand: right')
  && d.includes('The form, one chorus: Dm7 (i) | Dm7 | Dm7 | Dm7 | Gm7 (iv) | Gm7 | Dm7 | Dm7 | B♭7 (VI) | A7 (V) | Dm7 | A7.')
  && d.includes('Notes allowed on this step: D E F G A B C (the white keys).')
  && d.includes('Their improv so far: 66 notes, 2 whole choruses, bar by bar') && d.includes('Bar 13 (chorus 2), Dm7: D4 on 1 for 1')
  && d.includes('a streak of 3 days, 640 XP, 0 levels cleared on the map, practiced today'),
  d.split('\n').slice(0, 6).join(' / '))
check('describe: a menu with nothing open still reads', describe({ screen: 'stage', device: 'iphone' }) === 'Screen: the Stage (the set list of songs), on the iPhone.')
check('describe: a song run', describe({ screen: 'game', song: { title: 'Blue Lantern II', style: 'Minor blues', keyName: 'D minor', tempo: 84, bars: 48, part: 'melody', partTitle: 'White keys', difficulty: 'Medium', level: 6, tiers: 7, bar: 13, section: 'Snare in', chord: 'Dm7', playing: false, run: { score: 850, combo: 4, maxCombo: 12, accuracy: 0.85, perfect: 20, good: 5, early: 2, late: 0, missed: 3, wrong: 1 }, keys: 'D 34, F 20, A 12', range: 'E4–F5', chart: 'Bar 1 (Head), Dm7: D5 on 1 for 1.5, F4 on 3.5 for 1.5' } })
  .includes('They are playing the White keys part (the melody) on Medium (level 6 of 7 on the ladder).\nNow: at bar 13 (Snare in), chord Dm7, the band paused.\nThe run so far: 850 points, combo 4 (best 12), accuracy 85%: 20 perfect, 5 good, 2 early, 3 missed, 1 wrong keys.\nThe keys the line uses, by how often they come: D 34, F 20, A 12 (range E4–F5).\nThe line at this level'))

// MARK: Memory (memory.ts): the account's recent doings as events, cut into sessions, in words.

const TZ = 'America/Los_Angeles'
const T = (iso: string) => Date.parse(iso)
// Three sittings in Los Angeles: Tuesday afternoon, Wednesday evening, and one under way now (Friday).
const NOW = T('2026-11-06T22:40:00Z')
const takeNotes = Array.from({ length: 46 }, (_, i) => ({ t: i * 24, n: [62, 65, 62, 69, 65][i % 5], v: 0.6, len: 12 }))
const improvRow = {
  created_at: '2026-11-06T22:30:00Z',
  take: { tempo: 84, ticksPerBeat: 12, beatsPerBar: 4, bars: 24, notes: takeNotes },
  backing: { title: 'Blue Lantern II', style: 'Minor blues', key: 'D minor', feel: 'straight', form: FORM, scale: [0, 2, 4, 5, 7, 9, 11], scaleName: 'the white keys' },
  context: { where: 'level', title: 'Improvise on the white keys', about: '', hand: 'right', device: 'mac' },
  review: { headline: 'Your bar 3 answered bar 1 and came home to D', notes: ['The D you sat on in bar 1 rang true.', 'Bar 5 leaned on A over the Gm7: the fifth of the key, and it worked.', 'Next, try leaving bar 4 empty.'], idea: { title: 'Your bar 1 climb, landing on D', why: 'From your bar 1, with a rest at the end.', bars: 2, notes: [{ t: 0, n: 62, len: 12, f: 1 }, { t: 12, n: 65, len: 12, f: 2 }, { t: 24, n: 69, len: 24, f: 4 }] } },
}
const snapshot = {
  scores: [
    { id: 'a', song: 'song-blue-lantern-white', part: 'melody', difficulty: 'medium', score: 5780, accuracy: 0.55, maxCombo: 12, grade: 'D', level: 6, date: '2026-11-06T22:05:00Z' },
    { id: 'b', song: 'song-slow-burn-short', part: 'chords', difficulty: 'adaptive', score: 9100, accuracy: 0.93, maxCombo: 40, grade: 'A', level: 5, date: '2026-11-05T02:10:00Z' },
    { id: 'c', song: 'song-boogie-shoes', part: 'melody', difficulty: 'easy', score: 4000, accuracy: 0.9, maxCombo: 20, grade: 'A', level: 3, date: '2026-11-03T21:00:00Z' },
  ],
  practice: [{ day: '2026-11-04', kind: 'lesson', id: 'S1m·15' }, { day: '2026-11-06', kind: 'stage', id: 'song-blue-lantern-white' }, { day: '2026-11-03', kind: 'lesson', id: 'A1·finish' }],
  goals: { 'blues-year-1·1·scale-c': { done: '2026-11-04', best: 72 }, 'blues-year-1·1·song': { best: 55 } },
}
const events = [
  improvEvent(improvRow)!,
  ...scoreEvents(snapshot),
  ...modEvents({ title: 'Slow Burn Short Mod 01', base_title: 'Slow Burn Short', version: 1, messages: [{ role: 'user', text: 'Medium is way too hard, get rid of half the notes.', at: '2026-11-05T02:20:00Z' }, { role: 'agent', text: 'Medium on the melody: 0.97 → 0.50 a second.', at: '2026-11-05T02:21:00Z' }] }),
  chatEvent({ where_line: 'Stage', question: 'What is a shuffle?', answer: 'Long-short eighths, the first of each pair twice the second.', created_at: '2026-11-05T02:30:00Z' })!,
]
const sessions = sessionsOf(events, undefined, 5)
check('memory: events two hours apart or more make a new session (three sittings here), newest last',
  sessions.length === 3 && sessions.map((s) => s.events.length).join(',') === '1,4,2' && sessions[2].events[0].text.startsWith('Stage run: Blue Lantern II, the melody on Medium: grade D, 55% accuracy, 5780 points'),
  sessions.map((s) => `${s.events.length}@${new Date(s.from).toISOString()}`).join(' '))
check('memory: only the last two sessions are kept', sessionsOf(events).length === 2 && sessionsOf(events)[0].from === T('2026-11-05T02:10:00Z'))
const memory = renderMemory(sessionsOf(events), dayFactsOf(snapshot), TZ, NOW)
console.log(`\n${memory}\n`)
check('memory: in words, the session before and this one, the jam with its review and the idea, the Agent mode ask, the earlier question, the day\'s facts; the Tuesday sitting is gone',
  memory.includes('The session before (Wed, Nov 4, 6:10 PM–6:30 PM):') && memory.includes('This session (today, Fri, Nov 6, 2:05 PM until now):')
  && memory.includes('2:30 PM · Improv "Improvise on the white keys" over Blue Lantern II in D minor: 24 bars (2 choruses), 46 notes, 100% on the notes allowed, from D4 to A4, sent to the teacher. The teacher\'s review: "Your bar 3 answered bar 1 and came home to D" — The D you sat on in bar 1 rang true.')
  && memory.includes('The idea the teacher gave them, "Your bar 1 climb, landing on D" (2 bars): From your bar 1, with a rest at the end. Its notes: D4 on 1 (finger 1), F4 on 2 (finger 2), A4 on 3 (finger 4).')
  && memory.includes('6:20 PM · Agent mode on "Slow Burn Short Mod 01" (their own version of Slow Burn Short): they asked "Medium is way too hard, get rid of half the notes."')
  && memory.includes('6:30 PM · They asked you (on Stage): "What is a shuffle?" You answered: "Long-short eighths')
  && memory.includes('Stage run: Slow Burn Short, the chords on Adaptive, reaching level 5: grade A, 93% accuracy')
  && memory.includes('That day: finished lesson 15 of Scales (A minor); cleared Level 1\'s goal "scale-c".')
  && !memory.includes('Boogie Shoes') && !memory.includes('payoff'),
  memory.split('\n').slice(0, 3).join(' / '))
check('memory: the day\'s facts read from the snapshot', JSON.stringify(dayFactsOf(snapshot)) === JSON.stringify({ '2026-11-04': ['finished lesson 15 of Scales (A minor)', 'cleared Level 1\'s goal "scale-c"'], '2026-11-03': ['finished the Blues Progressions module\'s payoff'] }), JSON.stringify(dayFactsOf(snapshot)))
check('memory: an empty account renders nothing', renderMemory(sessionsOf([]), {}, TZ, NOW) === '')
// The library (library.ts): current with the app's content, the two bands and every Stage song
// in it, and in the teacher's prompt.
const fresh = JSON.stringify(buildLibrary(), null, 1) + '\n' === readFileSync('src/lib/takt/library.json', 'utf8')
check('library: library.json is current with the app\'s content (else npx tsx scripts/takt/library.ts)', fresh)
const songSwift = readFileSync('apps/takt/Takt/Game/Song.swift', 'utf8')
const catalog = [...(/static let catalog = \[([^\]]*)\]/.exec(songSwift)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1])
const titles = Object.fromEntries(catalog.map((n) => [n, (JSON.parse(readFileSync(`apps/takt/Takt/Content/${n}.json`, 'utf8')) as { song: { title: string } }).song.title]))
check('memory: the song titles match the set list', catalog.length > 0 && catalog.every((n) => SONG_TITLES[n] === titles[n]) && Object.keys(SONG_TITLES).length === catalog.length,
  catalog.filter((n) => SONG_TITLES[n] !== titles[n]).join(' '))
const lib = libraryText()
check('library: both lesson bands with their chords and modules, every Stage song with its key and form',
  lib.includes('- Chicago shuffle in C (C): 1–4 C · 5–6 F · 7–8 C · 9 G · 10 F · 11 C · 12 G, looped') && lib.includes('Plays under Blues Progressions')
  && lib.includes('- Minor blues in A (A minor): 1–4 Am · 5–6 Dm') && lib.includes('Minor Chords') && lib.includes('Chord Shapes')
  && catalog.every((n) => lib.includes(`- ${titles[n]}: `)) && lib.includes('- Blue Lantern II: minor blues in D minor, 84 bpm') && lib.includes('Level 1 (White keys) goal: the melody on Medium for an A'),
  `${lib.length} chars`)

async function live() {
  const t0 = Date.now()
  const steps: string[] = []
  let deltas = 0
  const reply = await runChat(r, null, (e) => {
    if (e.type === 'status') steps.push(e.text)
    if (e.type === 'delta') deltas++
  }, memory)
  const secs = ((Date.now() - t0) / 1000).toFixed(0)
  console.log(`\n${reply}\n`)
  const words = reply.split(/\s+/).length
  check(`live: an answer in ${secs} s, ${deltas} pieces, ${words} words, no markdown headings or bold`,
    reply.length > 0 && deltas > 3 && !/^#|\*\*/m.test(reply), steps.join(' → '))
  check('live: it names D minor (not A minor) and the degrees from D', /D minor/i.test(reply) && /\b(1|root|tonic|home)\b/i.test(reply) && /(♭3|flat 3|flat third|minor third)/i.test(reply))
  check('live: it speaks to the iv and the V by name', /Gm7|G minor|\biv\b|\bIV\b/.test(reply) && /A7|\bV\b/.test(reply))
  // The memory: the jam they sent ten minutes ago and the review it got.
  const t1 = Date.now()
  const followUp: ChatRequest = { ...r, thread: [{ role: 'user', text: question }, { role: 'teacher', text: reply }], message: 'what did you say about the jam i sent you earlier, and what was the idea?' }
  const reply2 = await runChat(followUp, null, () => {}, memory)
  console.log(`\n${reply2}\n`)
  check(`live: a follow-up about the jam answers from the memory in ${((Date.now() - t1) / 1000).toFixed(0)} s: the headline, the idea by name`,
    /came home to D|answered bar 1/i.test(reply2) && /bar 1 climb|landing on D/i.test(reply2))
  // The library: a question only the catalog answers, from a menu (no song, no lesson).
  const t2 = Date.now()
  const menu: ChatRequest = { message: 'I want to practise the A minor pentatonic over a backing track. What in the app can I play it over, and where do I find it?', thread: [], context: { screen: 'learn', where: 'Learn', device: 'mac' } }
  const reply3 = await runChat(menu, null, () => {}, '')
  console.log(`\n${reply3}\n`)
  check(`live: from a menu, it recommends real backings in A minor by name and where they are, in ${((Date.now() - t2) / 1000).toFixed(0)} s`,
    /Minor blues in A|Chord Shapes|Minor Chords/.test(reply3) && /Hypnotist|Maxwell Street|Dockery|Stage/.test(reply3) && !/Undertow|Nachtschicht/.test(reply3))
}

async function route(base: string) {
  const guest = await fetch(`${base}/api/takt/auth/guest`, { method: 'POST' })
  const cookie = guest.headers.get('set-cookie')?.split(';')[0] ?? ''
  check('route: a guest session', guest.ok && cookie.startsWith('takt_session='))
  const body = { message: 'In one sentence: what key is this song in?', thread: [], context }
  const res = await fetch(`${base}/api/takt/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) })
  const text = await res.text()
  const events = text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
  const rep = events.find((e) => e.type === 'reply')
  check('route: deltas, a saved reply with an id, done', res.ok && events.some((e) => e.type === 'delta') && !!rep?.id && events.at(-1)?.type === 'done',
    `${res.status} ${events.map((e) => e.type).slice(0, 4).join(',')}… ${rep?.text?.slice(0, 80) ?? ''}`)
  const noAuth = await fetch(`${base}/api/takt/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  check('route: no session, 401', noAuth.status === 401)
  const bad = await fetch(`${base}/api/takt/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ thread: [] }) })
  check('route: no message, 400', bad.status === 400)
  // The throwaway guest goes, its rows with it (on delete cascade).
  const { f2Supabase } = await import('../../src/lib/f2/supabase')
  const me = await fetch(`${base}/api/takt/auth/me`, { headers: { Cookie: cookie } }).then((x) => x.json()).catch(() => null)
  const id = me?.user?.id ?? me?.id
  if (id) {
    const { error } = await f2Supabase().from('takt_users').delete().eq('id', id)
    check('route: the guest is deleted', !error, error?.message ?? '')
  }
}

;(async () => {
  if (!process.env.SKIP_LIVE) await live()
  if (process.env.BASE) await route(process.env.BASE)
  console.log(`chat-check: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
