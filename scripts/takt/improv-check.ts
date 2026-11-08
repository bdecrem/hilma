// Checks the improv teacher (src/lib/takt/improv-agent.ts): the request parser, the
// transcript, the idea checker, then one real review of a made-up take over Blue Lantern II
// (Level 1: the white keys) straight through the library, and with BASE set, the same take
// through POST /api/takt/improv as a throwaway guest (deleted after).
//
//   set -a; source ./.env.local; set +a
//   npx tsx scripts/takt/improv-check.ts                 # pure checks + one live review
//   SKIP_LIVE=1 npx tsx scripts/takt/improv-check.ts     # pure checks only
//   BASE=https://ola.cx npx tsx scripts/takt/improv-check.ts   # + the route

import { checkIdea, parseRequest, runImprovReview, stats, transcript, type ImprovRequest } from '../../src/lib/takt/improv-agent'

let pass = 0, fail = 0
function check(name: string, ok: boolean, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  · ${info}` : ''}`)
  if (ok) pass++
  else fail++
}

const FORM = ['Dm7', 'Dm7', 'Dm7', 'Dm7', 'Gm7', 'Gm7', 'Dm7', 'Dm7', 'Bb7', 'A7', 'Dm7', 'A7']
const WHITE = [0, 2, 4, 5, 7, 9, 11]

// A beginner's two choruses on the white keys: a phrase, then room, a few repeats, one stray
// C♯ in the last bar.
function take() {
  const notes: { t: number; n: number; v: number; len: number }[] = []
  const phrases = [
    [[0, 62, 12], [12, 65, 12], [24, 67, 6], [30, 69, 18]],
    [[0, 69, 12], [12, 67, 6], [18, 65, 6], [24, 62, 24]],
    [[6, 72, 6], [12, 69, 12], [24, 67, 12], [36, 65, 12]],
    [[0, 62, 24], [24, 64, 12], [36, 65, 12]],
  ]
  for (let bar = 0; bar < 24; bar += 2) {
    const p = phrases[(bar / 2) % phrases.length]
    for (const [t, n, len] of p) notes.push({ t: bar * 48 + t, n, v: 0.55 + ((bar + t) % 5) * 0.06, len })
  }
  notes.push({ t: 23 * 48 + 24, n: 61, v: 0.5, len: 12 })
  return { tempo: 84, ticksPerBeat: 12, beatsPerBar: 4, bars: 24, notes }
}

const body = {
  take: take(),
  backing: { title: 'Blue Lantern II', style: 'Minor blues', key: 'D minor', feel: 'straight', form: FORM, scale: WHITE, scaleName: 'the white keys' },
  context: { where: 'level', title: 'Improvise on the white keys', about: 'C major and A natural minor: the white keys.', hand: 'right', device: 'check' },
}

const parsed = parseRequest(body)
check('parse: a good body parses', typeof parsed !== 'string', typeof parsed === 'string' ? parsed : '')
const r = parsed as ImprovRequest
check('parse: bad bodies are refused', typeof parseRequest({}) === 'string' && typeof parseRequest({ ...body, take: { ...body.take, ticksPerBeat: 24 } }) === 'string'
  && typeof parseRequest({ ...body, backing: { ...body.backing, scale: [13] } }) === 'string')
const s = stats(r)
check('stats: 2 choruses, 46 notes, 45 of them white', s.choruses === 2 && s.notes === 46 && Math.abs(s.inScale - 45 / 46) < 1e-9, JSON.stringify(s))
const tx = transcript(r)
check('transcript: a line a bar, the chord, the beat and the length',
  tx.split('\n').length === 24 && tx.startsWith('Bar 1 (chorus 1), Dm7: D4 on 1 for 1, F4 on 2 for 1, G4 on 3 for 0.5, A4 on 3.5 for 1.5')
  && tx.includes('Bar 13 (chorus 2), Dm7:') && tx.includes('Bar 2, Dm7: rest'), tx.split('\n').slice(0, 3).join(' / '))
const good = { title: 'Your bar 1 climb', why: 'From bar 1.', bars: 2, notes: [{ beat: 0, note: 62, beats: 1, finger: 1 }, { beat: 1, note: 65, beats: 1, finger: 2 }, { beat: 2, note: 67, beats: 0.5, finger: 3 }, { beat: 2.5, note: 69, beats: 1.5, finger: 4 }] }
const ok = checkIdea(good, r)
check('idea: a good one turns into ticks', 'idea' in ok && ok.idea.notes.map((n) => n.t).join(',') === '0,12,24,30' && ok.idea.notes[3].len === 18)
const bad = checkIdea({ ...good, bars: 3, notes: [{ beat: 0.1, note: 63, beats: 1, finger: 6 }, { beat: 9, note: 30, beats: 1, finger: 1 }] }, r)
check('idea: off the grid, a black key, out of reach, past the end, too few, a bad finger, a 3-bar loop: all named',
  'problems' in bad && bad.problems.length >= 6, 'problems' in bad ? bad.problems.join(' | ') : '')
check('idea: a triplet is on the grid', 'idea' in checkIdea({ ...good, notes: [...good.notes.slice(0, 3), { beat: 2 + 2 / 3, note: 69, beats: 1, finger: 4 }] }, r))
// The hand (LEVELING.md §3): one position. The good idea's fingers come back as the app's
// planner sets them (D F G A under 1 3 4 5, whatever the model wrote); an idea that climbs an
// octave is sent back for the hand.
check('idea: the fingers are the planner\'s (1 3 4 5 on D F G A: the thumb on D, the third on F)', 'idea' in ok && ok.idea.notes.map((n) => n.f).join('') === '1345', 'idea' in ok ? ok.idea.notes.map((n) => n.f).join('') : '')
const wide = checkIdea({ ...good, notes: [{ beat: 0, note: 62, beats: 1, finger: 1 }, { beat: 1, note: 65, beats: 1, finger: 2 }, { beat: 2, note: 69, beats: 1, finger: 3 }, { beat: 3, note: 74, beats: 1, finger: 5 }, { beat: 4, note: 76, beats: 2, finger: 5 }] }, r)
check('idea: one that moves the hand (D4 up to E5) is sent back for the hand', 'problems' in wide && wide.problems.some((p) => p.startsWith('the idea must sit in one hand position')), 'problems' in wide ? wide.problems.join(' | ') : 'accepted')
check('parse: the level rides along (3), and defaults to 1', (parseRequest({ ...body, context: { ...body.context, level: 3 } }) as ImprovRequest).context.level === 3 && r.context.level === 1)

async function live() {
  const t0 = Date.now()
  const steps: string[] = []
  const review = await runImprovReview(r, null, (e) => { if (e.type === 'status') steps.push(e.text) })
  const secs = ((Date.now() - t0) / 1000).toFixed(0)
  console.log(`\n${review.headline}\n- ${review.notes.join('\n- ')}\nIdea: ${review.idea.title} (${review.idea.bars} bars): ${review.idea.why}\n  ${review.idea.notes.map((n) => `${n.n}@${n.t}/${n.len} f${n.f}`).join(' ')}\n`)
  check(`live: a review in ${secs} s with ${steps.length} steps, a headline, 2–3 notes, an idea on the white keys`,
    review.headline.length > 0 && review.notes.length >= 2 && review.idea.notes.length >= 3 && review.idea.notes.every((n) => WHITE.includes(n.n % 12)),
    steps.join(' → '))
  const negative = /\b(wrong|mistake|however|unfortunately)\b/i
  check('live: the tone stays warm (no wrong, mistake, however, unfortunately)', ![review.headline, ...review.notes, review.idea.why].some((x) => negative.test(x)))
}

async function route(base: string) {
  const guest = await fetch(`${base}/api/takt/auth/guest`, { method: 'POST' })
  const cookie = guest.headers.get('set-cookie')?.split(';')[0] ?? ''
  check('route: a guest session', guest.ok && cookie.startsWith('takt_session='))
  const res = await fetch(`${base}/api/takt/improv`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) })
  const text = await res.text()
  const events = text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
  const rev = events.find((e) => e.type === 'review')
  check('route: status steps, a saved review with an id, done', res.ok && events.some((e) => e.type === 'status') && !!rev?.id && events.at(-1)?.type === 'done',
    `${res.status} ${events.map((e) => e.type).join(',')}`)
  const noAuth = await fetch(`${base}/api/takt/improv`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  check('route: no session, 401', noAuth.status === 401)
  // The throwaway guest goes, its review with it (on delete cascade).
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
  console.log(`improv-check: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
