#!/usr/bin/env node
// Every request Bart made in a day is matched to a ticket; a request with no ticket is opened as one
// (OLA-213, a daily idea of the Nov 19 review; built Nov 20). On Nov 19 he had to ask again for the
// Mac Cloud setting ("BAD FAIL THAT I HAVE TO REMIND YOU AGAIN", correction 90): an earlier request
// never became a ticket. The evening review runs this before posting; `sweep.mjs post` refuses a day
// that has not been matched and stores the counts with the entry, which the Learning page shows.
//
//   node scripts/venture/requests.mjs [--day D]        match the day (Pacific, today by default), open the
//                                                       missing tickets, store the day in venture_state "requests"
//   node scripts/venture/requests.mjs --dry [--day D]   match and print; writes nothing anywhere (no ticket, no
//                                                       state, not even this machine's export of typed messages)
//   node scripts/venture/requests.mjs show [--day D]    what is stored for the day
//   for tests: --messages <file.json> (the day's messages instead of steers.mjs --collect --json) and
//              --answer <file.json> (the matcher's answer instead of a call); VENTURE_STEERS_SCRIPT names
//              another collector; with VENTURE_TRACKER_FAKE the tracker is a copy (_fakedb.mjs)
//
// Each request gets one outcome: "ticket" (an existing ticket carries it), "done" (finished the same
// day), "answered" (a question answered that day), or "new" (still wanted at the end of the day and no
// ticket carries it): only "new" opens a ticket, and every request is listed with its reason.
// A run that fails for its own reasons (the collector, the model call, a crash) is stored as failed, so
// `sweep.mjs post` says so and names the two ways on; a --dry run stores nothing, its failure included.
// What he said comes from the same place as the grader's (steers.mjs --collect: what he typed in this
// project's Claude Code sessions on every machine that exported its day, his texts and voice notes,
// what he said on the calls), through a file: no size limit. The matching is one question to Claude
// Opus on the machine's own Claude login (_claude.mjs: the Max plan, never the API key).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { askClaude } from './_claude.mjs'
import { getState, setState, pacificDay } from './_state.mjs'
import { fakeClient } from './_fakedb.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const FAKE = !!process.env.VENTURE_TRACKER_FAKE
const env = FAKE && !existsSync(root + '.env.local') ? {} : Object.fromEntries(
  readFileSync(root + '.env.local', 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
const db = FAKE ? fakeClient(process.env.VENTURE_TRACKER_FAKE) : createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const args = process.argv.slice(2)
const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null)
const day = opt('--day') ?? pacificDay()
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) (console.error(`not a day: ${day}`), process.exit(1))
const dry = args.includes('--dry')
const AREAS = ['web', 'apps', 'model', 'security', 'ops', 'voice', 'design', 'board']
const OUTCOMES = ['ticket', 'done', 'answered', 'new']
const TZ = 'America/Los_Angeles'
const STEERS = process.env.VENTURE_STEERS_SCRIPT || root + 'scripts/venture/steers.mjs'
const hhmm = (t) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }).replace(' AM', ' am').replace(' PM', ' pm')
class Failed extends Error {}
const fail = (m) => { throw new Failed(m) }

if (args[0] === 'show') {
  const d = (await getState(db, 'requests'))?.value?.days?.[day]
  if (!d) (console.error(`${day}: not matched yet (node scripts/venture/requests.mjs --day ${day})`), process.exit(1))
  if (d.failed) (console.log(`${day}: FAILED at ${d.failed.at}: ${d.failed.error}`), process.exit(1))
  console.log(`${day}: ${d.counts.requests} requests in ${d.messages} messages: ${d.counts.matched} on a ticket, ${d.counts.done} done that day, ${d.counts.answered} answered, ${d.counts.opened} opened (${d.at})`)
  for (const r of d.requests) console.log(`  ${r.time} ${r.source.padEnd(8)} ${r.outcome.padEnd(8)} ${r.ticket ?? ''}${r.opened ? ' (opened)' : ''}  ${r.request}  [${r.why}]`)
  process.exit(0)
}

// ---------------------------------------------------------------- what he said, the tickets, the commits
const MIN = 60e3
/** Is every machine that had a session that day in the messages? Fails, named, when one is not (OLA-213):
 *  zero messages from a machine with a session that day, or an export older than its session's last hour.
 *  This machine's own transcripts are read directly, so only its count is checked. */
function machineCheck(list, own) {
  const bad = []
  for (const m of list) {
    const isOwn = m.host === own
    console.log(`  machine ${m.host}${isOwn ? ' (this one)' : ''}: ${m.messages} message(s), newest ${m.newest ? hhmm(m.newest) : 'none'}; export ${m.exportedAt ? `${m.exportedAt.slice(0, 16)}Z` : 'never'}; session that day ${m.session ? `until ${hhmm(m.session)}` : 'none'}`)
    if (!m.session || (isOwn && dry)) continue
    if (!m.messages) bad.push(`${m.host} had a session that day until ${hhmm(m.session)} and its export holds no message from Bart`)
    else if (!isOwn && (!m.exportedAt || Date.parse(m.exportedAt) < Date.parse(m.session) - 60 * MIN)) bad.push(`${m.host}'s export (${m.exportedAt ? `${m.exportedAt.slice(0, 16)}Z` : 'never'}, newest message ${m.newest ? hhmm(m.newest) : "none"}) is older than its session's last hour (until ${hhmm(m.session)}): run node scripts/venture/steers.mjs --export on ${m.host} (sync.mjs push does it)`)
  }
  if (bad.length) fail(`Bart's messages of ${day} are not all here: ${bad.join('; ')}. Then rerun requests.mjs.`)
}
function messages() {
  if (opt('--messages')) {
    const j = JSON.parse(readFileSync(opt('--messages'), 'utf8'))
    return Array.isArray(j) ? j : j.messages
  }
  // this machine's typed messages first (from the main checkout's sessions, whatever folder this runs in),
  // for the other machines: a write, so never in a dry run or on a copy
  if (!dry && !FAKE) {
    const x = spawnSync(process.execPath, [STEERS, '--export'], { encoding: 'utf8' })
    if (x.status !== 0) fail(`this machine's messages could not be exported (steers.mjs --export): ${(x.stderr || x.stdout || '').trim().split('\n').pop()}`)
  }
  const dir = mkdtempSync(join(tmpdir(), 'requests-'))
  try {
    const out = join(dir, 'messages.json')
    const r = spawnSync(process.execPath, [STEERS, '--collect', '--json', '--out', out, '--day', day], { encoding: 'utf8', env: process.env })
    if (r.status !== 0 || !existsSync(out)) fail(`Bart's messages could not be read (steers.mjs --collect): ${(r.stderr || r.stdout || '').trim().split('\n').pop()}`)
    const j = JSON.parse(readFileSync(out, 'utf8'))
    if (!Array.isArray(j.messages) || !Array.isArray(j.machines)) fail('the collector gave no list of messages and machines')
    machineCheck(j.machines, j.host)
    return j.messages
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
async function tickets() {
  const { data, error } = await db.from('venture_issues').select('id, num, title, what, status, opened_at, updated_at, finished_at, day').eq('project', 'ola').order('num')
  if (error) fail(`venture_issues: ${error.message}`)
  // every ticket still open, and every other one touched in the 14 days before the day's end
  const since = Date.parse(`${day}T12:00:00Z`) - 15 * 86400e3
  return data.filter((t) => !['done', 'dropped'].includes(t.status) || Date.parse(t.updated_at ?? t.opened_at) >= since)
}
function commits() {
  const off = new Date(`${day}T12:00:00Z`).toLocaleString('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' }).match(/GMT([+-]\d+)/)?.[1] ?? '-8'
  const from = new Date(Date.parse(`${day}T00:00:00Z`) - Number(off) * 3600e3)
  const to = new Date(from.getTime() + 30 * 3600e3) // the day and the night after it, when the review runs
  const r = spawnSync('git', ['-C', root, 'log', '--all', `--since=${from.toISOString()}`, `--until=${to.toISOString()}`, '--format=%ad %s', '--date=format-local:%H:%M'], { encoding: 'utf8', env: { ...process.env, TZ } })
  return (r.stdout ?? '').trim().split('\n').filter(Boolean)
}

// ---------------------------------------------------------------- the matcher
const SYSTEM = `You read every message Bart (the owner of a small software project) wrote on one day, in the terminal, by text and on voice calls, with the end of what the agent ("Kit") said just before each, the project's tickets and the day's commits. You list each request he made and what became of it by the end of the day.

A request is something he wanted done or changed: built, fixed, set up, found out, checked, written down, or kept as a rule from now on, including one phrased as a complaint ("why is X still broken?"). Thanks, greetings, his answers to questions put to him, a plain yes or no to a proposal (unless it adds something to do) and comments with nothing to do are not requests and are left out. One request said in several messages (repeated, reworded, continued) is one request listing every message number. Two different asks in one message are two requests.

Each request gets one outcome:
- "ticket": an existing ticket carries it (its title or description covers what he asked, open or done). Give its id. A ticket that already covers the request in other words counts: do not ask for a near-duplicate.
- "done": the job was finished the same day: a later message of his, what Kit said after it, a commit or a ticket closed that day shows it was done, and nothing he said afterwards reopens it.
- "answered": a question whose answer was given in the conversation that day, with nothing left to do.
- "new": he still wants it at the end of the day and no ticket carries it. Only these become tickets, so be sure: a one-off job that was done, a question that was answered and anything an existing ticket covers are never "new".
For every request: "messages" (the numbers), "request" (one plain sentence saying what he asked for), "outcome", "ticket" (the id for "ticket", else null), "why" (one short sentence: the ticket, message, reply or commit that shows the outcome). For "new" also "title" (the new ticket's title, plain words he understands, at most 140 characters) and "area" (one of ${AREAS.join(', ')}). Use only ticket ids from the list.`
const SCHEMA = {
  type: 'object',
  required: ['requests'],
  additionalProperties: false,
  properties: {
    requests: {
      type: 'array',
      items: {
        type: 'object',
        required: ['messages', 'request', 'outcome', 'ticket', 'why'],
        additionalProperties: false,
        properties: {
          messages: { type: 'array', items: { type: 'integer' } },
          request: { type: 'string' },
          outcome: { type: 'string', enum: OUTCOMES },
          ticket: { type: ['string', 'null'] },
          why: { type: 'string' },
          title: { type: ['string', 'null'] },
          area: { type: ['string', 'null'] },
        },
      },
    },
  },
}

/** The matcher's answer, checked against the messages and the tickets. */
function checkAnswer(answer, msgs, list) {
  const ids = new Set(list.map((t) => t.id))
  const nums = new Set(msgs.map((m) => m.id))
  const out = []
  for (const r of answer?.requests ?? []) {
    const ms = (r.messages ?? []).filter((n) => nums.has(n))
    if (!ms.length || !String(r.request ?? '').trim()) continue
    let outcome = OUTCOMES.includes(r.outcome) ? r.outcome : 'new'
    let note = null
    if (outcome === 'ticket' && !ids.has(r.ticket)) { note = `the matcher named ${r.ticket ?? 'no ticket'}, which is not in the list`; outcome = 'new' }
    out.push({ ...r, messages: ms, outcome, ticket: outcome === 'ticket' ? r.ticket : null, area: AREAS.includes(r.area) ? r.area : 'ops', ...(note ? { note } : {}) })
  }
  return out
}

async function run() {
  const msgs = messages()
  const list = await tickets()
  let answer = { requests: [] }
  if (msgs.length) {
    if (opt('--answer')) answer = JSON.parse(readFileSync(opt('--answer'), 'utf8'))
    else {
      const user = `The day: ${day} (Pacific).\n\nThe tickets (id [status] title: description):\n${list.map((t) => `${t.id} [${t.status}${t.status === 'done' && t.day ? ` ${t.day}` : ''}] ${t.title}${t.what ? `: ${String(t.what).replace(/\s+/g, ' ').slice(0, 220)}` : ''}`).join('\n')}\n\nThe day's commits (Pacific time, subject):\n${commits().join('\n') || '(none)'}\n\nBart's messages that day (number, time, where; after "Kit before:" the end of what the agent had said just before):\n${msgs.map((m) => `#${m.id} ${hhmm(m.at)} ${m.source}${m.kit ? `\nKit before: ${String(m.kit).replace(/\s+/g, ' ').slice(-600)}` : ''}\nBart: ${String(m.text).slice(0, 6000)}`).join('\n\n')}`
      const r = await askClaude({ system: SYSTEM, user, schema: SCHEMA, effort: 'medium' }).catch((e) => fail(`the matcher failed (on the Max login, _claude.mjs): ${e.message}`))
      answer = r.json
    }
  }
  const found = checkAnswer(answer, msgs, list)
  const byNum = new Map(msgs.map((m) => [m.id, m]))
  const opened = []
  for (const r of found.filter((x) => x.outcome === 'new')) {
    const first = byNum.get(r.messages[0])
    const quote = String(first.text).replace(/\s+/g, ' ').slice(0, 300).replace(/"/g, "'")
    r.title = String(r.title || r.request).replace(/\s+/g, ' ').trim().slice(0, 140)
    const what = `Bart, ${new Date(first.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ })}, ${hhmm(first.at)} (${first.source}): '${quote}'. Opened by the nightly request match (requests.mjs, OLA-213): still wanted at the end of the day and no ticket carried it. ${r.why}`
    if (dry) continue
    const a = spawnSync(process.execPath, [root + 'scripts/venture/issues.mjs', 'add', r.title, '--area', r.area, '--pri', 'P1', '--who', 'lead', '--what', what], { encoding: 'utf8', env: process.env })
    const id = /\b(OLA-\d+)\b/.exec(a.stdout ?? '')?.[1]
    if (a.status !== 0 || !id) fail(`opening a ticket for "${r.request}" failed: ${(a.stderr || a.stdout).trim().split('\n').pop()}${opened.length ? ` (opened before it: ${opened.join(', ')})` : ''}`)
    r.ticket = id
    r.opened = true
    opened.push(id)
  }
  const requests = found.map((r) => {
    const m = byNum.get(r.messages[0])
    return { time: hhmm(m.at), at: m.at, source: m.source, messages: r.messages, request: r.request.trim(), outcome: r.outcome, ticket: r.ticket, opened: !!r.opened, why: r.why, ...(r.outcome === 'new' ? { title: r.title, area: r.area } : {}), ...(r.note ? { note: r.note } : {}) }
  })
  const n = (o) => requests.filter((r) => r.outcome === o).length
  console.log(`${day}: ${requests.length} requests in ${msgs.length} messages: ${n('ticket')} on a ticket, ${n('done')} done that day, ${n('answered')} answered, ${n('new')} ${dry ? 'would be opened' : `opened${opened.length ? ` (${opened.join(', ')})` : ''}`}`)
  for (const r of requests) console.log(`  ${r.time} ${r.source.padEnd(8)} ${r.outcome.padEnd(8)} ${r.outcome === 'new' ? (dry ? `would open "${r.title}" (${r.area})` : `${r.ticket} "${r.title}"`) : r.ticket ?? ''}  ${r.request}  [${r.why}]${r.note ? `  [${r.note}]` : ''}`)
  if (dry) return console.log('--dry: nothing opened, nothing stored, nothing exported')
  const old = (await getState(db, 'requests'))?.value ?? { days: {} }
  const prev = old.days?.[day]
  // a rerun keeps the tickets an earlier run of the same day opened
  const openedAll = [...new Set([...(prev?.opened ?? []), ...opened])]
  const counts = { requests: requests.length, matched: n('ticket'), done: n('done'), answered: n('answered'), opened: openedAll.length }
  const stored = { day, at: new Date().toISOString(), messages: msgs.length, requests, opened: openedAll, counts }
  await setState(db, 'requests', { at: stored.at, days: { ...(old.days ?? {}), [day]: stored } })
  console.log(`stored in venture_state "requests" for ${day}; sweep.mjs post puts the counts in the day's entry`)
}

try {
  await run()
} catch (e) {
  const error = String(e instanceof Failed ? e.message : `requests.mjs crashed: ${e.stack ?? e}`).split('\n').slice(0, 3).join(' ').slice(0, 600)
  console.error(error)
  if (!dry) {
    // stored, so the review's post says so plainly instead of waiting on a match that never came; a
    // matched day that a rerun fails on keeps its match
    try {
      const old = (await getState(db, 'requests'))?.value ?? { days: {} }
      const prev = old.days?.[day]
      if (!prev || prev.failed) await setState(db, 'requests', { at: new Date().toISOString(), days: { ...(old.days ?? {}), [day]: { day, at: new Date().toISOString(), failed: { at: new Date().toISOString(), error }, opened: prev?.opened ?? [] } } })
      console.error(prev && !prev.failed ? `the earlier match of ${day} (${prev.at}) is kept` : `stored as failed for ${day}: sweep.mjs post names it`)
    } catch (e2) {
      console.error(`the failure could not be stored either: ${e2.message}`)
    }
  }
  process.exit(1)
}
