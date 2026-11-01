// Agent mode end to end against a server: a guest account, a mod of a bundled song from one
// request, the streamed steps, the bundle, a second turn on the mod, a mod of the mod, the list,
// delete. Real Opus turns (a few minutes, a few dollars).
//
//   pnpm exec next dev -p 3270         # in another shell, with .env.local
//   npx tsx scripts/takt/mod-agent-check.ts [base-url] [--keep] [--out dir] [--song song-slow-burn-short] [--ask "…"]
//
// `--keep` leaves the mods on the account (the guest's); `--out` writes each bundle as the app
// would receive it (load one with `-LoadMod <file>`). Default base http://localhost:3270.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Charting, figures, tierFor } from '../../src/lib/takt/charting'
import { type SongFile, musicBars, validateSong } from '../../src/lib/takt/songfile'

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const BASE = args.find((a) => a.startsWith('http')) ?? 'http://localhost:3270'
const KEEP = args.includes('--keep')
const OUT = flag('--out')
const SONG = flag('--song') ?? 'song-slow-burn-short'
const ASK = flag('--ask') ?? 'Medium on the melody is way too hard — get rid of half the notes.'
const CONTENT = join(__dirname, '../../apps/takt/Takt/Content')
const charting = JSON.parse(readFileSync(join(CONTENT, 'charting.json'), 'utf8')) as Charting
const song = JSON.parse(readFileSync(join(CONTENT, `${SONG}.json`), 'utf8')) as SongFile
if (OUT) mkdirSync(OUT, { recursive: true })

let cookie = ''
let pass = 0, fail = 0
function check(name: string, ok: boolean, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  · ${info}` : ''}`)
  if (ok) pass++
  else fail++
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${BASE}/api/takt/${path}`, { ...init, headers: { 'Content-Type': 'application/json', cookie, ...(init.headers ?? {}) } })
  const set = res.headers.get('set-cookie')
  if (set) cookie = set.split(';')[0]
  return res
}

type Event = Record<string, unknown> & { type: string }

async function stream(path: string, body: unknown): Promise<Event[]> {
  const res = await call(path, { method: 'POST', body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  const events: Event[] = []
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  const t0 = Date.now()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trimEnd()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data: ')) continue
      const e = JSON.parse(line.slice(6)) as Event
      events.push(e)
      const secs = ((Date.now() - t0) / 1000).toFixed(0).padStart(3)
      if (e.type === 'status') console.log(`   ${secs}s  · ${e.text}`)
      else if (e.type === 'reply') console.log(`   ${secs}s  agent: ${String(e.text).replace(/\n/g, '\n          ')}`)
      else if (e.type === 'error') console.log(`   ${secs}s  ERROR ${e.text}`)
      else console.log(`   ${secs}s  [${e.type}]${e.type === 'mod' ? ` ${(e.mod as { title: string }).title}` : ''}`)
    }
  }
  return events
}

function ladderOf(file: SongFile, override: unknown, part: 'chords' | 'melody') {
  const figs = figures(charting, override as never, file, part)
  return ['beginner', 'easy', 'medium', 'hard'].map((d) => {
    const t = tierFor(charting, override as never, part, d as never)!
    return `${d} L${t} ${figs[t - 1].perSecond.toFixed(2)}`
  }).join(' · ')
}

function context() {
  return { charting, figures: { melody: figures(charting, charting.songs[SONG] ?? null, song, 'melody').map((f) => f.perSecond), chords: figures(charting, charting.songs[SONG] ?? null, song, 'chords').map((f) => f.perSecond) }, device: 'check' }
}

async function main() {
  const guest = await call('auth/guest', { method: 'POST', body: '{}' })
  check('a guest account', guest.ok && cookie.startsWith('takt_session='), String(guest.status))

  const bad = await call('mods', { method: 'POST', body: JSON.stringify({ message: 'hi', context: {}, song }) })
  check('a request without charting is refused', bad.status === 400, (await bad.json()).error)

  console.log(`\n→ ${SONG}: "${ASK}"`)
  const t0 = Date.now()
  const events = await stream('mods', { base: SONG, base_title: song.song.title, song, charting: charting.songs[SONG] ?? null, message: ASK, context: context() })
  const done = events.find((e) => e.type === 'done')
  const created = events.find((e) => e.type === 'mod') as { mod: { id: string; title: string } } | undefined
  check('the mod row is announced first', !!created && events[0].type === 'mod', created?.mod.title)
  check('the turn streamed working steps', events.filter((e) => e.type === 'status').length >= 1, `${events.filter((e) => e.type === 'status').length} steps, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  check('a reply came back', events.some((e) => e.type === 'reply' && String(e.text).length > 20))
  check('the turn finished with the bundle', !!done)
  if (!done) {
    console.log(`\nmod-agent-check: ${pass} passed, ${fail} failed`)
    process.exit(1)
  }
  const mod = done.mod as { id: string; name: string; title: string; version: number; song: SongFile; charting: unknown; messages: unknown[]; base: string }
  check('the bundle names the mod and bumps the version', mod.name.startsWith('mod-') && mod.version === 1 && mod.song.name === mod.name && mod.song.song.title === mod.title, `${mod.name} "${mod.title}" v${mod.version}`)
  check('the mod\'s song validates by the app\'s rules', validateSong(mod.song, charting.chords.keep) === null, validateSong(mod.song, charting.chords.keep) ?? '')
  check('the thread holds both messages', mod.messages.length === 2)
  console.log(`   base ladder    melody: ${ladderOf(song, charting.songs[SONG] ?? null, 'melody')}`)
  console.log(`   mod ladder     melody: ${ladderOf(mod.song, mod.charting, 'melody')}`)
  if (OUT) writeFileSync(join(OUT, `${mod.name}-v1.json`), JSON.stringify({ mod }))

  // A second turn on the mod: a question, nothing should move.
  console.log(`\n→ ${mod.title}: a question`)
  const q = await stream(`mods/${mod.id}/agent`, { message: 'What does Hard on the melody play now, in one sentence?', context: context() })
  const qdone = q.find((e) => e.type === 'done') as { mod: { version: number; messages: unknown[] } } | undefined
  check('a question leaves the version alone', qdone?.mod.version === 1 && qdone.mod.messages.length === 4, `v${qdone?.mod.version}, ${qdone?.mod.messages.length} messages`)

  // A third turn that changes the song: a solo chorus.
  console.log(`\n→ ${mod.title}: a solo chorus`)
  const s = await stream(`mods/${mod.id}/agent`, { message: 'Add a hard solo chorus at the end, over the same twelve bars.', context: context() })
  const sdone = s.find((e) => e.type === 'done') as { mod: { version: number; song: SongFile; charting: unknown; title: string; name: string } } | undefined
  check('the solo turn bumps the version and lengthens the song', !!sdone && sdone.mod.version === 2 && musicBars(sdone.mod.song) > musicBars(song), sdone ? `v${sdone.mod.version}, ${musicBars(sdone.mod.song)} bars (was ${musicBars(song)})` : 'no done')
  if (sdone) {
    check('the longer song validates', validateSong(sdone.mod.song, charting.chords.keep) === null, validateSong(sdone.mod.song, charting.chords.keep) ?? '')
    console.log(`   mod v2 ladder  melody: ${ladderOf(sdone.mod.song, sdone.mod.charting, 'melody')}`)
    if (OUT) writeFileSync(join(OUT, `${sdone.mod.name}-v2.json`), JSON.stringify({ mod: sdone.mod }))
  }

  // The history, and a rollback to v1 (a new version with v1's song: 12 bars again).
  const hist = await (await call(`mods/${mod.id}/versions`)).json() as { versions: { version: number; ask: string }[] }
  check('the history holds v0 (the original), v1 and v2 with their asks', hist.versions.map((v) => v.version).join(',') === (sdone ? '0,1,2' : '0,1') && hist.versions[1]?.ask === ASK, hist.versions.map((v) => `v${v.version} ${v.ask.slice(0, 30)}`).join(' | '))
  const rb = await call(`mods/${mod.id}/rollback`, { method: 'POST', body: JSON.stringify({ version: 1 }) })
  const rbBody = await rb.json() as { mod?: { version: number; song: SongFile; versions: { version: number; ask: string }[]; messages: unknown[] }; error?: string }
  check('rollback to v1 makes v3 with v1\'s song (12 bars), the history kept', rb.ok && rbBody.mod?.version === (sdone ? 3 : 2) && musicBars(rbBody.mod!.song) === musicBars(song) && rbBody.mod!.versions.length === (sdone ? 4 : 3) && rbBody.mod!.versions.at(-1)!.ask === 'Back to v1', rbBody.error ?? `v${rbBody.mod?.version}, ${rbBody.mod ? musicBars(rbBody.mod.song) : '?'} bars, ${rbBody.mod?.versions.length} versions`)
  const same = await call(`mods/${mod.id}/rollback`, { method: 'POST', body: JSON.stringify({ version: rbBody.mod?.version }) })
  check('rolling back to the current version is refused', same.status === 400)
  if (OUT && rbBody.mod) writeFileSync(join(OUT, `${mod.name}-rolledback.json`), JSON.stringify({ mod: rbBody.mod }))

  const list = await (await call('mods')).json() as { mods: { id: string; version: number; line: string }[] }
  check('the list has the mod at its version', list.mods.length === 1 && list.mods[0].id === mod.id && list.mods[0].version === (sdone ? 3 : 2), list.mods[0]?.line)
  const full = await (await call(`mods/${mod.id}`)).json() as { mod: { song: SongFile; versions: unknown[] } }
  check('GET returns the bundle with its history', !!full.mod?.song?.song && full.mod.versions.length === (sdone ? 4 : 3))

  if (!KEEP) {
    const del = await call(`mods/${mod.id}`, { method: 'DELETE' })
    check('DELETE removes it', del.ok && ((await (await call('mods')).json()) as { mods: unknown[] }).mods.length === 0)
  } else {
    console.log(`   kept ${mod.id} on the guest account (cookie ${cookie.slice(0, 30)}…)`)
  }
  console.log(`\nmod-agent-check: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
