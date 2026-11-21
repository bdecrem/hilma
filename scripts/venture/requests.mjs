#!/usr/bin/env node
// Every request Bart made in a day is matched to a ticket; a request with no ticket is opened as one
// (OLA-213, a daily idea of the Nov 19 review; built Nov 20). On Nov 19 he had to ask again for the
// Mac Cloud setting ("BAD FAIL THAT I HAVE TO REMIND YOU AGAIN", correction 90): an earlier request
// never became a ticket. The evening review runs this before posting; `sweep.mjs post` refuses a day
// that has not been matched and stores the counts with the entry, which the Learning page shows.
//
//   node scripts/venture/requests.mjs [--day D]        match the day (Pacific, today by default), open the
//                                                       missing tickets, store the day in venture_state "requests"
//   node scripts/venture/requests.mjs --dry [--day D]   match and print; open nothing, store nothing
//   node scripts/venture/requests.mjs show [--day D]    what is stored for the day
//   for tests: --messages <file.json> (the day's messages instead of steers.mjs --collect --json) and
//              --answer <file.json> (the matcher's answer instead of a call); with VENTURE_TRACKER_FAKE
//              the tracker is a copy (_fakedb.mjs) and the tickets are opened there
//
// What he said comes from the same place as the grader's (steers.mjs --collect: what he typed in this
// project's Claude Code sessions on every machine that exported its day, his texts and voice notes,
// what he said on the calls). The matching is one question to Claude Opus on the machine's own Claude
// login (_claude.mjs: the Max plan, never the API key). His words stay in the database, never in git.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
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
const die = (m) => (console.error(m), process.exit(1))
const day = opt('--day') ?? pacificDay()
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) die(`not a day: ${day}`)
const dry = args.includes('--dry')
const AREAS = ['web', 'apps', 'model', 'security', 'ops', 'voice', 'design', 'board']
const TZ = 'America/Los_Angeles'
const hhmm = (t) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }).replace(' AM', ' am').replace(' PM', ' pm')

if (args[0] === 'show') {
  const d = (await getState(db, 'requests'))?.value?.days?.[day]
  if (!d) die(`${day}: not matched yet (node scripts/venture/requests.mjs --day ${day})`)
  console.log(`${day}: ${d.counts.requests} requests in ${d.messages} messages, ${d.counts.matched} with a ticket, ${d.counts.opened} opened (${d.at})`)
  for (const r of d.requests) console.log(`  ${r.time} ${r.source.padEnd(8)} ${r.ticket}${r.opened ? ' (opened)' : ''}  ${r.request}`)
  process.exit(0)
}

// ---------------------------------------------------------------- what he said, and the tickets
function messages() {
  if (opt('--messages')) return JSON.parse(readFileSync(opt('--messages'), 'utf8'))
  spawnSync('node', [root + 'scripts/venture/steers.mjs', '--export'], { encoding: 'utf8' }) // this machine's typed messages, for the others
  const r = spawnSync('node', [root + 'scripts/venture/steers.mjs', '--collect', '--json', '--day', day], { encoding: 'utf8', maxBuffer: 64e6 })
  if (r.status !== 0) die(`Bart's messages could not be read: ${(r.stderr || r.stdout).trim().split('\n').pop()}`)
  return JSON.parse(r.stdout.trim().split('\n').pop())
}
async function tickets() {
  const { data, error } = await db.from('venture_issues').select('id, num, title, what, status, opened_at, updated_at').eq('project', 'ola').order('num')
  if (error) die(`venture_issues: ${error.message}`)
  // every ticket still open, and every other one touched in the 14 days before the day's end
  const since = Date.parse(`${day}T12:00:00Z`) - 15 * 86400e3
  return data.filter((t) => !['done', 'dropped'].includes(t.status) || Date.parse(t.updated_at ?? t.opened_at) >= since)
}

// ---------------------------------------------------------------- the matcher
const SYSTEM = `You read every message Bart (the owner of a small software project) wrote on one day, in the terminal, by text and on voice calls, and the project's tickets. You list each request he made and say which ticket carries it.

A request is anything he asked to be built, changed, fixed, set up, found out, checked, written down or kept as a rule from now on, including a request phrased as a complaint or a question that expects work ("why is X still broken?", "can the app do Y?"). It is not: thanks, greetings, an answer to a question that was asked of him, a plain yes or no to a proposal (unless it adds something to do), a question fully answered in the conversation, or a comment with nothing to do. One request said in several messages (repeated, reworded, continued) is one request listing every message number. Two different asks in one message are two requests.

For each request: "messages" (the numbers), "request" (one plain sentence saying what he asked for), "ticket" (the id of the ticket whose title or description carries this request, like "OLA-213"; null when none does: a ticket about something nearby, or about only part of it, does not carry it), "why" (one short sentence: what in the ticket matches, or why none does). For a request with ticket null also give "title" (the new ticket's title, plain words he understands, at most 140 characters) and "area" (one of ${AREAS.join(', ')}). Use only ticket ids from the list. When unsure whether a ticket carries a request, answer null: a duplicate ticket costs less than a request that is lost.`
const SCHEMA = {
  type: 'object',
  required: ['requests'],
  additionalProperties: false,
  properties: {
    requests: {
      type: 'array',
      items: {
        type: 'object',
        required: ['messages', 'request', 'ticket', 'why'],
        additionalProperties: false,
        properties: {
          messages: { type: 'array', items: { type: 'integer' } },
          request: { type: 'string' },
          ticket: { type: ['string', 'null'] },
          why: { type: 'string' },
          title: { type: ['string', 'null'] },
          area: { type: ['string', 'null'] },
        },
      },
    },
  },
}

/** The matcher's answer, checked against the messages and the tickets: [{ ...request, ticket|null, note? }]. */
function checkAnswer(answer, msgs, list) {
  const ids = new Set(list.map((t) => t.id))
  const nums = new Set(msgs.map((m) => m.id))
  const out = []
  for (const r of answer?.requests ?? []) {
    const ms = (r.messages ?? []).filter((n) => nums.has(n))
    if (!ms.length || !String(r.request ?? '').trim()) continue
    const known = r.ticket && ids.has(r.ticket)
    out.push({ ...r, messages: ms, ticket: known ? r.ticket : null, ...(r.ticket && !known ? { note: `the matcher named ${r.ticket}, which is not in the list` } : {}), area: AREAS.includes(r.area) ? r.area : 'ops' })
  }
  return out
}

const msgs = messages()
const list = await tickets()
if (!msgs.length) console.log(`${day}: no messages from Bart`)
let answer = { requests: [] }
if (msgs.length) {
  if (opt('--answer')) answer = JSON.parse(readFileSync(opt('--answer'), 'utf8'))
  else {
    const user = `The day: ${day} (Pacific).\n\nThe tickets (id [status] title: description):\n${list.map((t) => `${t.id} [${t.status}] ${t.title}${t.what ? `: ${String(t.what).replace(/\s+/g, ' ').slice(0, 220)}` : ''}`).join('\n')}\n\nBart's messages that day (number, time, where; after "Kit before:" the end of what the agent had said just before):\n${msgs.map((m) => `#${m.id} ${hhmm(m.at)} ${m.source}${m.kit ? `\nKit before: ${String(m.kit).replace(/\s+/g, ' ').slice(-400)}` : ''}\nBart: ${String(m.text).slice(0, 4000)}`).join('\n\n')}`
    const r = await askClaude({ system: SYSTEM, user, schema: SCHEMA, effort: 'medium' }).catch((e) => die(`the matcher failed (on the Max login, _claude.mjs): ${e.message}`))
    answer = r.json
  }
}
const found = checkAnswer(answer, msgs, list)
const byNum = new Map(msgs.map((m) => [m.id, m]))

// ---------------------------------------------------------------- open the missing tickets
const opened = []
for (const r of found.filter((x) => !x.ticket)) {
  const first = byNum.get(r.messages[0])
  const quote = String(first.text).replace(/\s+/g, ' ').slice(0, 300)
  const title = String(r.title || r.request).replace(/\s+/g, ' ').trim().slice(0, 140)
  const what = `Bart, ${new Date(first.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ })}, ${hhmm(first.at)} (${first.source}): '${quote.replace(/"/g, "'")}'. Opened by the nightly request match (requests.mjs, OLA-213): no ticket carried this request. ${r.why}`
  if (dry) { console.log(`would open: ${title} (${r.area})`); r.ticket = '(would open)'; continue }
  const a = spawnSync('node', [root + 'scripts/venture/issues.mjs', 'add', title, '--area', r.area, '--pri', 'P1', '--who', 'lead', '--what', what], { encoding: 'utf8', env: process.env })
  const id = /\b(OLA-\d+)\b/.exec(a.stdout ?? '')?.[1]
  if (a.status !== 0 || !id) die(`opening a ticket for "${r.request}" failed: ${(a.stderr || a.stdout).trim().split('\n').pop()}`)
  r.ticket = id
  r.opened = true
  opened.push(id)
}

const requests = found.map((r) => {
  const m = byNum.get(r.messages[0])
  return { time: hhmm(m.at), at: m.at, source: m.source, messages: r.messages, request: r.request.trim(), ticket: r.ticket, opened: !!r.opened, why: r.why, ...(r.note ? { note: r.note } : {}) }
})
const counts = { requests: requests.length, matched: requests.filter((r) => !r.opened && r.ticket !== '(would open)').length, opened: dry ? requests.filter((r) => r.ticket === '(would open)').length : opened.length }
console.log(`${day}: ${counts.requests} requests in ${msgs.length} messages, ${counts.matched} already had a ticket, ${counts.opened} ${dry ? 'would be opened' : 'opened'}${opened.length ? ` (${opened.join(', ')})` : ''}`)
for (const r of requests) console.log(`  ${r.time} ${r.source.padEnd(8)} ${r.ticket}${r.opened ? ' (opened)' : ''}  ${r.request}${r.note ? `  [${r.note}]` : ''}`)
if (dry) (console.log('--dry: nothing opened, nothing stored'), process.exit(0))
const old = (await getState(db, 'requests'))?.value ?? { days: {} }
const prev = old.days?.[day]
// a rerun keeps the tickets opened by an earlier run of the same day in the count
const openedAll = [...new Set([...(prev?.opened ?? []), ...opened])]
const stored = { day, at: new Date().toISOString(), messages: msgs.length, requests, opened: openedAll, counts: { ...counts, opened: openedAll.length, matched: requests.filter((r) => !openedAll.includes(r.ticket)).length } }
await setState(db, 'requests', { at: stored.at, days: { ...(old.days ?? {}), [day]: stored } })
console.log(`stored in venture_state "requests" for ${day}; sweep.mjs post puts the counts in the day's entry`)
