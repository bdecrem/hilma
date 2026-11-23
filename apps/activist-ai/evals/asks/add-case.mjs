#!/usr/bin/env node
// Adds a case to the asks (evals/asks/cases.json, OLA-231): the person's sentence, word for word,
// where it is sent, what must be true afterwards, and the failure it came from. Then commit it; the
// next update's run sends it (or try it now on the test server: run.mjs --case <id>).
//
//   node apps/activist-ai/evals/asks/add-case.mjs "<the person's sentence>" --runtime cloud,local \
//        --must "site:Bart" [--must "says:claude"] [--must-not "<regex>"] --ticket OLA-nnn \
//        [--places cloud-web:chat,local-mac:chat] [--id short-name] [--what "what happened"] [--date 2026-11-20] [--minutes 8]
//        [--before "<said first>"]...
//
// --before, any number, in order: what the person said first in the same conversation (each answered
// yes like the case itself, not judged, but it has to finish): "make a page that says Bart and
// publish it on ola" before "take it down".
//
// --runtime cloud is every chat place in a cloud project (cloud-web, cloud-mac, cloud-phone), local
// every chat place on the Mac (local-mac, local-phone); --places names them exactly instead. The
// runner sends it in cloud-web:chat and local-mac:chat and lists the others as not run.
//
// --must, any number of them, each one of:
//   site:<words>            Ola's answer gives a https://sites.ola.cx/<name>/ address that answers 200
//                           with a page saying <words>
//   says:<regex>            Ola's answer matches (case-insensitive)
//   opens:<regex>           the first 300 characters of the answer match (what a phone shows first)
//   newfile:<regex>, nonewfile:<regex>   a file matching was (was not) made by the request
//   noran:<regex>                         no step of the request matches (OLA-244)
//   file:<path>[:<words>]   the file is in the project afterwards (and says <words>)
//   served:<name>           the model connection's own record says <name> served one of the case's
//                           requests (served:design); served:!<name> says it served none (OLA-168)
//   card                    the request asked with a question card, not in words (OLA-325)
//   gone                    every sites.ola.cx address Ola gave in the conversation answers 404 (with --before)
// Every case is also held to the never list in lib.mjs (it cannot do it from here; press a button
// or go to another screen yourself; not switched on); --must-not adds patterns to it.
//
// The sentence is the person's exact words from the stored conversation, not a description (Bart,
// Nov 20: "don't rely on the report, rely on the logs"). Every sentence is looked up in what the
// person typed (admin.mjs asked on the Ola machine: kept turns and their cloud projects'
// conversations, the last --days 2, --handle bart); found, the case records the time and the place
// from the log; not found, the tool says so and records the sentence as a description.
//   --from-log "<words>"      take the sentence from the log: the request with all these words
//   --from-log 9:28           ... or the one nearest that time today (9:28 am, 2026-11-20T09:28; Pacific, within 30 min)
//   --pick <n>                when several match, the n-th of the list it printed
//   --wake                    also read cloud projects whose computer is stopped
//   --separate                each --before sentence and the case in a conversation of its own (a
//                             person coming back to a project that published before; OLA-267)
//   --from-wrong <n>          take the sentence from an answer a person marked "This was wrong" (OLA-235;
//                             admin.mjs wrong lists them); the mark records the case's id
// Off the Ola machine it asks it over ssh (OLA_ASKS_HOST, default admin@100.95.51.98).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { PLACES, RUNTIME_PLACES } from './lib.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cases.json')
const argv = process.argv.slice(2)
const many = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] !== undefined ? [argv[i + 1]] : []))
const one = (name, dflt) => many(name).at(-1) ?? dflt
const flags = new Set(['--from-wrong', '--places', '--runtime', '--must', '--must-not', '--ticket', '--id', '--what', '--date', '--minutes', '--from-log', '--pick', '--handle', '--days', '--before'])
const given = argv.find((a, i) => !a.startsWith('--') && !flags.has(argv[i - 1]))
const fail = (m) => (console.error(m), process.exit(2))
if (!given && !one('--from-log') && !one('--from-wrong')) fail('usage: add-case.mjs "<the person\'s sentence>" | --from-log "<words or time>"  --runtime cloud,local --must "<outcome>" --ticket OLA-nnn')

// ---------------------------------------------------------------- the stored conversation
const handle = one('--handle', 'bart')
const days = one('--days', '2')
function readLog() {
  if (process.env.OLA_ASKS_LOG_JSON) return JSON.parse(readFileSync(process.env.OLA_ASKS_LOG_JSON, 'utf8'))
  return admin(['asked', handle, '--days', days, '--json', ...(argv.includes('--wake') ? ['--wake'] : [])])
}
/** One admin.mjs command on the Ola machine (here, or over ssh); its last line of JSON, or { error }. */
function admin(args, { raw = false } = {}) {
  const cmd = ['frontdesk/admin.mjs', ...args]
  const here = path.join(homedir(), 'ola-staging/current/apps/activist-ai')
  const r = existsSync(path.join(here, 'frontdesk/admin.mjs'))
    ? spawnSync(process.execPath, cmd, { cwd: here, encoding: 'utf8', timeout: 240_000 })
    : spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', process.env.OLA_ASKS_HOST || 'admin@100.95.51.98', `cd ~/ola-staging/current/apps/activist-ai && node ${cmd.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`], { encoding: 'utf8', timeout: 240_000 })
  if (r.status !== 0) return { error: (r.stderr || r.error?.message || `exit ${r.status}`).trim().split('\n').pop() }
  if (raw) return { out: r.stdout }
  try { return JSON.parse(r.stdout.trim().split('\n').pop()) } catch { return { error: 'the Ola machine did not answer with the list' } }
}
// A mark "This was wrong" (OLA-235): the request as the project had it, kept with the person's yes.
function readMark(n) {
  if (process.env.OLA_ASKS_WRONG_JSON) return JSON.parse(readFileSync(process.env.OLA_ASKS_WRONG_JSON, 'utf8'))
  const r = admin(['wrong', '--id', String(n), '--json'], { raw: true })
  if (r.error) return r
  try { return JSON.parse(r.out) } catch { return { error: 'the Ola machine did not answer with the mark' } }
}
const norm = (t) => String(t).replace(/\s+/g, ' ').trim().toLowerCase()
const pacific = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
function atOf(q) {
  const m = /^(?:(\d{4}-\d{2}-\d{2})[T ])?(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(q.trim())
  if (!m) return null
  const h = m[4] ? (Number(m[2]) % 12) + (m[4].toLowerCase() === 'pm' ? 12 : 0) : Number(m[2])
  if (h > 23 || Number(m[3]) > 59) return null
  const day = m[1] ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  // Pacific: try both offsets and keep the one that reads back as that hour there
  for (const off of ['-08:00', '-07:00']) {
    const t = Date.parse(`${day}T${String(h).padStart(2, '0')}:${m[3]}:00${off}`)
    if (Number(new Date(t).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' })) === h) return t
  }
  return null
}
let say = given
let source = null
const fromWrong = one('--from-wrong')
const log = fromWrong ? { rows: [] } : readLog()
const rows = log.rows ?? []
if (fromWrong) {
  if (!/^\d+$/.test(fromWrong)) fail('--from-wrong <n>: the number admin.mjs wrong prints')
  const list = readMark(fromWrong)
  if (list.error) fail(`the mark could not be read (${list.error})`)
  const m = Array.isArray(list) ? list.find((x) => String(x.id) === fromWrong) : null
  if (!m) fail(`no mark #${fromWrong} on the Ola machine (admin.mjs wrong lists them)`)
  say = m.request.trim()
  source = { at: m.at, place: 'cloud-web:chat', source: `marked wrong #${m.id} by ${m.handle} in ${m.project}`, runtime: 'cloud', mark: m.id, why: m.why }
} else if (one('--from-log')) {
  if (log.error) fail(`the stored conversation could not be read (${log.error}). Give his sentence as he typed it instead; the case records it as a description.`)
  const q = one('--from-log')
  const at = atOf(q)
  let found = at !== null
    ? rows.map((r) => ({ r, d: Math.abs(Math.floor(r.at / 60_000) * 60_000 - at) })).filter((x) => x.d <= 30 * 60_000).sort((a, b) => a.d - b.d).map((x) => x.r) // by the minute, as a clock shows it
    : rows.filter((r) => norm(q).split(' ').every((w) => norm(r.request).includes(w)))
  if (!found.length) fail(`nothing ${handle} typed in the last ${days} day(s) ${at !== null ? `near ${pacific(at)}` : `has the words "${q}"`} (${rows.length} requests read${log.notes?.length ? `; ${log.notes.join('; ')}` : ''}). With no log, give his sentence as he typed it; the case records it as a description.`)
  if (at !== null) found = found.slice(0, 1) // a time names one request: the nearest
  if (found.length > 1 && !one('--pick')) {
    console.error(`${found.length} requests match; add --pick <n>:`)
    found.slice(0, 20).forEach((r, i) => console.error(`  ${i + 1}. ${pacific(r.at)}  ${r.place ?? r.runtime}  ${r.request.replace(/\s+/g, ' ').slice(0, 150)}`))
    process.exit(2)
  }
  const r = found[Number(one('--pick', '1')) - 1] ?? fail('--pick: no such number in the list')
  say = r.request.trim()
  source = r
} else {
  const r = log.error ? null : rows.find((x) => norm(x.request) === norm(given))
  if (r) source = r
  else console.log(log.error
    ? `note: the stored conversation could not be read (${log.error}); the sentence is recorded as a description`
    : `note: ${handle} did not type this in the last ${days} day(s) (${rows.length} requests read${log.notes?.length ? `; ${log.notes.join('; ')}` : ''}); recorded as a description. If he did type it, use --from-log.`)
}
const places = one('--places') ? one('--places').split(',').map((x) => x.trim()) : one('--runtime', 'cloud,local').split(',').flatMap((r) => RUNTIME_PLACES[r.trim()] ?? fail('--runtime is cloud, local or cloud,local'))
for (const p of places) if (!PLACES.includes(p)) fail(`--places: ${p} is not a place (${PLACES.join(', ')})`)
const must = many('--must')
if (!must.length) fail('at least one --must: site:<words>, says:<regex>, file:<path>[:<words>] or gone')
if (must.includes('gone') && !many('--before').length) fail('--must gone needs --before: the request that published the page first')
for (const m of must) {
  const kind = m.split(':')[0]
  if (m === 'gone') continue
  if (m !== 'card' && (!['site', 'says', 'opens', 'file', 'newfile', 'nonewfile', 'noran', 'served'].includes(kind) || !m.slice(kind.length + 1))) fail(`--must "${m}": site:<words>, says:<regex>, file:<path>[:<words>], newfile:<regex>[:<words>], nonewfile:<regex>, noran:<regex>, opens:<regex>, served:<name> or gone`)
  if (kind === 'says') new RegExp(m.slice(5), 'i')
}
for (const s of many('--must-not')) new RegExp(s, 'i')
const ticket = one('--ticket') ?? fail('--ticket OLA-nnn: the failure this case came from')
if (!/^OLA-\d+$/.test(ticket)) fail('--ticket looks like OLA-231')

const doc = JSON.parse(readFileSync(file, 'utf8'))
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 4).join('-')
let id = one('--id', slug(say) || 'case')
if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id)) fail('--id: lowercase letters, digits and dashes')
if (doc.cases.some((c) => c.say === say && JSON.stringify(c.before ?? []) === JSON.stringify(many('--before')) && (c.places ?? []).some((p) => places.includes(p)))) fail('that sentence is already a case in that place')
for (let n = 2; doc.cases.some((c) => c.id === id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`
const c = {
  id,
  say,
  ...(many('--before').length ? { before: many('--before') } : {}),
  ...(process.argv.includes('--separate') ? { separate: true } : {}),
  places,
  must,
  mustNot: many('--must-not'),
  ...(one('--minutes') ? { limitMin: Number(one('--minutes')) } : {}),
  // OLA-231: a request that failed for a person needs five passes before it shows as working (--passes 2 to override).
  passes: Number(one('--passes', 5)),
  from: {
    date: one('--date', source ? new Date(source.at).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) : new Date().toISOString().slice(0, 10)),
    ticket,
    what: one('--what', source?.why ? `marked wrong: ${source.why}` : ''),
    words: source ? 'log' : 'description',
    ...(source?.mark ? { mark: source.mark } : {}),
    ...(source ? { handle: source.mark ? source.source.split(' by ')[1].split(' in ')[0] : handle, at: new Date(source.at).toISOString(), where: source.place ?? `${source.runtime} (${source.source})`, log: source.source } : {}),
  },
}
doc.cases.push(c)
writeFileSync(file, JSON.stringify(doc, null, 2) + '\n')
console.log(`added ${id} (${places.join(', ')}), ${c.passes} passes needed: ${must.join('; ')}`)
console.log(source ? `his words, from the log: "${say}" (${pacific(source.at)}, ${c.from.where})` : `his words, as described: "${say}"`)
if (source?.mark && !process.env.OLA_ASKS_WRONG_JSON) {
  const r = admin(['wrong', 'case', String(source.mark), id], { raw: true })
  console.log(r.error ? `note: the mark was not updated with the case (${r.error}); run admin.mjs wrong case ${source.mark} ${id} on the Ola machine` : `mark #${source.mark} now names case ${id}`)
}
console.log(`next: commit evals/asks/cases.json with [${ticket}]; to try it now on the test server: node evals/asks/run.mjs --case ${id}`)
