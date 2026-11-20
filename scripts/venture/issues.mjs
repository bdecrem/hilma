#!/usr/bin/env node
// The issue tracker behind app.kochitolabs.com (tables venture_issues and venture_commits, schema 011).
// One issue per piece of work; the lead and every builder keep it current with this, and the board,
// the 10 am text and the plate read it. Titles in plain words for Bart, never internal names.
//
//   node scripts/venture/issues.mjs add "title" --area web --pri P1 [--what "why, one or two sentences"]
//                                   [--who lead] [--week 1] [--start] [--link "label=https://…"] [--doc slug]
//   node scripts/venture/issues.mjs start <id> [--who name]                      also claims it (below)
//   node scripts/venture/issues.mjs claim <id> [--who name]                      "I am on this": renew at least every 45 min
//   node scripts/venture/issues.mjs release <id>                                 let go (done, wait, open and drop release too)
//   node scripts/venture/issues.mjs claims                                       the live claims
//   node scripts/venture/issues.mjs done <id> --proof "…" [--commit <hash>]… [--day YYYY-MM-DD]   refused until every check has
//                                                                                passed (below), unless --proof "Bart: <his words>"
//   Checks: what Bart will do and see, per place, written BEFORE the work; passed only by someone who did not build it.
//   node scripts/venture/issues.mjs check <id> add --at cloud-web:chat --do "what he types or taps" --see "what he must then see"
//   node scripts/venture/issues.mjs check <id> skip 'local-*' --why "why this place does not apply"     (a pattern, * allowed)
//   node scripts/venture/issues.mjs check <id> internal --why "why nothing a person does or sees changes"
//   node scripts/venture/issues.mjs check <id> pass <n> --by checker --on "<release or build>" --saw "what happened" --shot <file>
//   node scripts/venture/issues.mjs check <id> fail <n> --by checker --saw "what happened instead"
//   node scripts/venture/issues.mjs check <id>                                    the checks and where each stands
//   node scripts/venture/issues.mjs ready <id> --on "<release or build>"          the builder: built and live, needs a checker
//   node scripts/venture/issues.mjs say <id>                                      what may be told to Bart about it: works / fails / not checked
//   node scripts/venture/issues.mjs unchecked                                     tickets waiting for a checker; closed today without checks
//   node scripts/venture/issues.mjs wait <id> [--what "what Bart has to do"]      waiting on Bart
//   node scripts/venture/issues.mjs open <id>                                    back to open (next up)
//   node scripts/venture/issues.mjs drop <id> [--why "…"]
//   node scripts/venture/issues.mjs edit <id> [--title …] [--what …] [--area …] [--pri …] [--who …] [--week …] [--proof …]
//   node scripts/venture/issues.mjs commit <id> <hash>…                          attach commits by hand
//   node scripts/venture/issues.mjs list [--day yesterday|today|YYYY-MM-DD] [--status done,in_progress] [--area web]
//   node scripts/venture/issues.mjs show <id>                                    the issue and its whole thread
//   node scripts/venture/issues.mjs comment <id> "text" [--who kit]               Kit's reply on the issue's page
//   node scripts/venture/issues.mjs inbox [--mark]                               what Bart wrote on the board that Kit has not read
//                                                                                (comments, edits, status changes, new issues);
//                                                                                --mark marks the listed ones read ("seen by Kit")
//   node scripts/venture/issues.mjs --wait [--every 20]                          waits until Bart writes something on the board,
//                                                                                prints it and exits (like imsg.mjs --wait)
//   node scripts/venture/issues.mjs plate                                         the plate, as the board shows it
//   node scripts/venture/issues.mjs unsorted                                      Ola commits that name no issue
//   node scripts/venture/issues.mjs place <sha> <id|none>                         file one under an issue, or mark it as needing none
//   node scripts/venture/issues.mjs import <file.json>                            many at once (the backfill; a private file)
//
// Commits find their issue by themselves when the message names it: put [OLA-142] in the subject or the
// body, and the cron /api/venture/commits/sync attaches it within 30 minutes. Areas: web (the web app),
// apps (Mac and phone apps), model (the model and skills), security, ops (operations), voice, design,
// board (this board). Statuses: open, in_progress, waiting (on Bart), done, dropped. Days are Pacific.
// The board's thread (schema 012, venture_issue_activity): what Bart does on an issue's page is new
// for Kit until `inbox --mark`; the hook .claude/hooks/bart-done.py lists it before every prompt
// (through `issues.mjs hook`). Kit's own changes from here are recorded too, already read.
// Claims (OLA-211): the runner on the Mac mini works every open ticket that no one holds. A session
// or a builder that is working on a ticket claims it (venture_state "claim:OLA-n", renewed by running
// `claim` again); a claim not renewed for 45 minutes has expired and the ticket is the runner's.
// Prints no secrets: the database key is read from .env.local (or, where there is no such file, from
// the environment) and used, never shown.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { hostname } from 'node:os'
import { createClient } from '@supabase/supabase-js'
import { sweepDue } from './_state.mjs'
import { CLAIM_PREFIX, CLAIM_TTL, caseVerdict } from './_plate.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const env = !existsSync(root + '.env.local') ? process.env : Object.fromEntries(
  readFileSync(root + '.env.local', 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

export const AREAS = { web: 'Web app', apps: 'Mac and phone apps', model: 'Model and skills', security: 'Security', ops: 'Operations', voice: 'Voice', design: 'Design', board: 'The board' }
const STATUSES = ['open', 'in_progress', 'waiting', 'done', 'dropped']
const PREFIX = 'OLA'
const pacificDay = (t = Date.now()) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
const shiftDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10)

const argv = process.argv.slice(2)
const cmd = argv[0] === '--wait' ? 'wait-board' : argv[0]
// A Desktop folder is on one machine. Text for the tracker that names one must say which
// (Nov 20: OLA-168 said "~/Desktop/Ola/open-design/", the sheets were on the M1 iMac, Bart
// looked on the M4 and found nothing).
for (const a of argv) {
  if (/Desktop\//.test(a) && !/\b(M4|M1|mini|Studio|MacBook)\b/i.test(a)) {
    console.error('A Desktop folder is on one machine: say which in the same text ("on the M1 iMac: ~/Desktop/…"), and copy it to the machine Bart is at.')
    process.exit(1)
  }
}
const pos = []
const opt = {}
for (let i = 1; i < argv.length; i++) {
  const a = argv[i]
  if (a.startsWith('--')) {
    const k = a.slice(2)
    const v = argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[++i]
    opt[k] = opt[k] === undefined ? v : [].concat(opt[k], v)
  } else pos.push(a)
}
const one = (k) => (Array.isArray(opt[k]) ? opt[k][opt[k].length - 1] : opt[k])
const many = (k) => (opt[k] === undefined ? [] : [].concat(opt[k]))
const die = (m) => {
  console.error(m)
  process.exit(1)
}
const check = (r, what) => {
  if (r.error) die(`${what}: ${r.error.message}`)
  return r.data
}
const normId = (s) => {
  const m = String(s ?? '').match(/^(?:OLA-)?(\d+)$/i)
  if (!m) die(`not an issue id: ${s} (like OLA-142)`)
  return `${PREFIX}-${Number(m[1])}`
}
async function get(id) {
  const row = check(await db.from('venture_issues').select('*').eq('id', id).maybeSingle(), 'read')
  if (!row) die(`no issue ${id}`)
  return row
}
const missing = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find the table/i.test(e.message ?? ''))
const KIT = () => (typeof one('who') === 'string' && cmd === 'comment' ? one('who') : 'kit')
/** Kit's own change, in the issue's thread, already read. Silent when schema 012 is not applied. */
async function record(rows) {
  if (!rows.length) return
  const now = new Date().toISOString()
  const r = await db.from('venture_issue_activity').insert(rows.map((x) => ({ at: now, who: KIT(), via: 'cli', seen_by_kit_at: now, body: '', ...x })))
  if (r.error && !missing(r.error)) die(`activity: ${r.error.message}`)
}
async function patch(id, fields) {
  const before = check(await db.from('venture_issues').select('*').eq('id', id).maybeSingle(), 'read')
  const row = check(await db.from('venture_issues').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id).select().single(), 'update')
  const lines = []
  if (before && fields.status && fields.status !== before.status) lines.push({ issue_id: id, kind: 'status', field: 'status', old_value: before.status, new_value: fields.status, body: fields.status === 'done' || fields.status === 'dropped' ? (fields.proof ?? '') : '' })
  for (const k of ['title', 'what', 'priority', 'area', 'who', 'week']) if (before && k in fields && fields[k] !== before[k] && !(k === 'what' && fields.status)) lines.push({ issue_id: id, kind: 'edit', field: k, old_value: before[k] === null ? null : String(before[k]), new_value: fields[k] === null ? null : String(fields[k]) })
  await record(lines)
  console.log(line(row))
  return row
}
async function claim(id, who) {
  const key = CLAIM_PREFIX + id
  const old = check(await db.from('venture_state').select('value').eq('key', key).maybeSingle(), 'claim')
  const keep = old && old.value?.who === who && old.value?.since
  check(await db.from('venture_state').upsert({ key, value: { who, host: hostname(), since: keep ? old.value.since : new Date().toISOString() }, at: new Date().toISOString() }), 'claim')
  console.log(`${id} claimed by ${who} (expires in ${CLAIM_TTL / 60e3} min unless claimed again)`)
}
async function release(id) {
  check(await db.from('venture_state').delete().eq('key', CLAIM_PREFIX + id), 'release')
}
const when = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
const STATUS_WORD = { open: 'next up', in_progress: 'doing', waiting: 'waiting on Bart', done: 'done', dropped: 'dropped' }
/** One thread line in words: "Nov 18, 3:52 PM  bart  moved this to done: proof". */
function says(a) {
  if (a.kind === 'comment') return a.body
  if (a.kind === 'opened') return `opened a new issue: ${a.body}`
  if (a.kind === 'status') return `moved this to ${STATUS_WORD[a.new_value] ?? a.new_value}${a.body ? ` (proof: ${a.body})` : ''}`
  if (a.field === 'what') return `edited the description to: ${a.new_value ?? ''}`
  return `changed ${a.field} from "${a.old_value ?? ''}" to "${a.new_value ?? ''}"`
}
async function unread() {
  const r = await db.from('venture_issue_activity').select('*').is('seen_by_kit_at', null).eq('via', 'board').order('at')
  if (r.error) {
    if (missing(r.error)) return null
    die(`inbox: ${r.error.message}`)
  }
  return r.data
}
const inboxLine = (a) => `${a.issue_id.padEnd(8)} ${when(a.at).padEnd(20)} ${a.who.padEnd(8)} ${a.kind === 'comment' ? 'comment: ' : ''}${says(a).replace(/\s+/g, ' ')}`
function validate(f) {
  if (f.area !== undefined && !AREAS[f.area]) die(`area must be one of: ${Object.keys(AREAS).join(', ')}`)
  if (f.priority !== undefined && !/^P[012]$/.test(f.priority)) die('priority must be P0, P1 or P2')
  if (f.status !== undefined && !STATUSES.includes(f.status)) die(`status must be one of: ${STATUSES.join(', ')}`)
  if (f.week !== undefined && f.week !== null && !(f.week >= 1 && f.week <= 4)) die('week must be 1 to 4')
}

// A commit by hash: the full sha, subject, body and date from this checkout's git.
function gitCommit(hash) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%H%x1f%s%x1f%aI%x1f%b', hash], { cwd: root, encoding: 'utf8' })
    const [sha, subject, at, body] = out.split('\x1f')
    return { sha, subject, at, body: (body ?? '').trim().slice(0, 4000) }
  } catch {
    die(`no commit ${hash} in this checkout (git fetch first?)`)
  }
}
async function attach(id, hashes) {
  for (const h of hashes) {
    const c = gitCommit(h)
    check(await db.from('venture_commits').upsert({ ...c, issue_id: id, ignored: false }), 'commit')
    console.log(`  ${c.sha.slice(0, 8)} ${c.subject}`)
  }
}

const label = { open: 'next', in_progress: 'doing', waiting: 'waiting on Bart', done: 'done', dropped: 'dropped' }
const line = (r) => `${r.id.padEnd(8)} ${r.priority} ${(label[r.status] ?? r.status).padEnd(15)} ${r.area.padEnd(8)} ${(r.who ?? '').padEnd(10)} ${r.title}${r.status === 'done' && r.proof ? `  [${r.proof}]` : ''}`

// ---- Checks (2026-11-20). Bart, after publishing failed for him four times in one morning, each
// time after he was told it worked: "THERE IS ZERO LEARNING AFTER ONE WEEK". The week's record: 104
// corrections, and every fix that was only written down came back (5 to 13 times each). "Use it the
// way he will before saying it works" was written four times (rules 22, 34, 37, 54) and broken four
// times on Nov 20, because the builder tested its own work in one place and closed its own ticket.
// So it is no longer a rule to remember:
//   - a ticket carries checks: where he is, what he does, what he must see; written before the work;
//   - for the product (areas web, apps, model, design) every place Ola can be used is either covered
//     by a check or skipped with a reason: two runtimes, three apps, asked in chat or done on screen;
//   - a check passes only with what was seen and a file that shows it, recorded by someone other than
//     the ticket's builder; `done` refuses until every check has passed;
//   - `say` prints what may be told to Bart: what works, what fails, what nobody checked.
// Kept in venture_state under "accept:OLA-n" (no schema change).
const ACCEPT = 'accept:'
const PLACES = ['cloud-web', 'cloud-mac', 'cloud-phone', 'local-mac', 'local-phone']
const WAYS = ['chat', 'screen']
const CELLS = PLACES.flatMap((p) => WAYS.map((w) => `${p}:${w}`))
const PRODUCT = new Set(['web', 'apps', 'model', 'design'])
const CELL_HELP = `places: ${CELLS.join(', ')}\n  (cloud = a cloud project, local = Ola working on his Mac; web = app.ola.cx, mac = the Mac app, phone = the iPhone app;\n   chat = he asks Ola in words, screen = he uses a button, a setting or a page)`
const emptyAccept = () => ({ checks: [], skips: [], internal: null, ready: null })
async function accept(id) {
  const r = check(await db.from('venture_state').select('value').eq('key', ACCEPT + id).maybeSingle(), 'checks')
  return { ...emptyAccept(), ...(r?.value ?? {}) }
}
async function saveAccept(id, a) {
  check(await db.from('venture_state').upsert({ key: ACCEPT + id, value: a, at: new Date().toISOString() }), 'checks')
}
const globs = (pat) => new RegExp('^' + String(pat).split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$')
const skipped = (a, cell) => a.skips.find((k) => globs(k.pattern).test(cell))
/** Where a ticket stands: { ok, why: [what is missing], works, fails, open, uncovered, skips }. */
function verdict(row, a) {
  const works = a.checks.filter((c) => c.result === 'pass')
  const fails = a.checks.filter((c) => c.result === 'fail')
  const open = a.checks.filter((c) => !c.result)
  const uncovered = PRODUCT.has(row.area) && !a.internal ? CELLS.filter((cell) => !a.checks.some((c) => c.at === cell) && !skipped(a, cell)) : []
  const why = []
  if (!a.internal) {
    if (!a.checks.length) why.push('it has no checks: write what Bart will do and see (issues.mjs check ' + row.id + ' add …), or mark it internal with the reason')
    if (uncovered.length) why.push(`no check and no reason for: ${uncovered.join(', ')}`)
    if (fails.length) why.push(`${fails.length} check(s) failed: ${fails.map((c) => '#' + c.n).join(', ')}`)
    if (open.length) why.push(`${open.length} check(s) not done yet: ${open.map((c) => '#' + c.n).join(', ')} (a checker who did not build it does them)`)
  }
  return { ok: !why.length, why, works, fails, open, uncovered }
}
const checkLine = (c) => `  #${c.n} ${(c.result ?? 'not checked').toUpperCase().padEnd(11)} ${String(c.at).padEnd(18)} do: ${c.do}\n${' '.repeat(34)}see: ${c.see}${c.result ? `\n${' '.repeat(34)}${c.result === 'pass' ? 'saw' : 'instead'}: ${c.saw} (${c.by}, ${when(c.checked_at)}${c.on ? `, on ${c.on}` : ''}${c.evidence ? `, ${c.evidence}` : ''})` : ''}`
function printChecks(row, a) {
  console.log(`${row.id}  ${row.title}`)
  if (a.internal) console.log(`  internal, no checks: ${a.internal.why} (${a.internal.by}, ${when(a.internal.at)})`)
  for (const c of a.checks) console.log(checkLine(c))
  for (const k of a.skips) console.log(`  skipped ${k.pattern}: ${k.why}`)
  const v = verdict(row, a)
  console.log(v.ok ? (a.internal ? '  can be closed with proof ("walked: …" or "no user path: …")' : '  every check has passed: it can be closed') : v.why.map((w) => `  MISSING: ${w}`).join('\n'))
}

if (cmd === 'add') {
  const title = pos[0]
  if (!title) die('usage: issues.mjs add "title" --area web --pri P1 [--what …] [--who lead] [--week 1] [--start]')
  const area = one('area')
  if (!area) die(`--area is required: ${Object.keys(AREAS).join(', ')}`)
  const last = check(await db.from('venture_issues').select('num').eq('project', 'ola').order('num', { ascending: false }).limit(1), 'read')
  const num = (last[0]?.num ?? 0) + 1
  const now = new Date().toISOString()
  const links = [...many('link').map((l) => ({ label: l.split('=')[0], url: l.slice(l.indexOf('=') + 1) })), ...many('doc').map((d) => ({ label: 'note', doc: d }))]
  const row = { id: `${PREFIX}-${num}`, num, project: 'ola', title, what: one('what') ?? '', area, priority: one('pri') ?? 'P1', who: one('who') ?? 'lead', week: one('week') ? Number(one('week')) : null, status: one('start') ? 'in_progress' : 'open', started_at: one('start') ? now : null, links }
  validate(row)
  console.log(line(check(await db.from('venture_issues').insert(row).select().single(), 'add')))
} else if (cmd === 'start') {
  const id = normId(pos[0])
  const r = await get(id)
  const a = await accept(id)
  // What he will do and see is written before the work, not after it (2026-11-20).
  if (!a.internal && !a.checks.length && r.status !== 'in_progress') die(
    `${id} has no checks yet. Before work starts, write what Bart will do and what he must see, one per place:\n` +
    `  issues.mjs check ${id} add --at ${PRODUCT.has(r.area) ? 'cloud-web:chat' : '"where"'} --do "what he types or taps" --see "what he must then see"\n` +
    (PRODUCT.has(r.area) ? `  ${CELL_HELP}\n  a place that does not apply: issues.mjs check ${id} skip 'local-*' --why "…"\n` : '') +
    `or, when nothing a person does or sees changes: issues.mjs check ${id} internal --why "…"`)
  // work restarts: earlier passes are about an older version
  if (r.status === 'done' && a.checks.some((c) => c.result)) await saveAccept(id, { ...a, ready: null, checks: a.checks.map((c) => ({ ...c, earlier: [...(c.earlier ?? []), { result: c.result, by: c.by, at: c.checked_at, saw: c.saw }], result: null })) })
  await patch(id, { status: 'in_progress', started_at: r.started_at ?? new Date().toISOString(), ...(one('who') ? { who: one('who') } : {}) })
  await claim(id, one('who') ?? r.who ?? 'lead')
} else if (cmd === 'claim') {
  const id = normId(pos[0])
  const r = await get(id)
  await claim(id, typeof one('who') === 'string' ? one('who') : r.who ?? 'lead')
} else if (cmd === 'release') {
  const id = normId(pos[0])
  await release(id)
  console.log(`${id} released`)
} else if (cmd === 'claims') {
  const rows = check(await db.from('venture_state').select('key, value, at').like('key', `${CLAIM_PREFIX}%`).order('at'), 'claims')
  for (const c of rows) {
    const mins = Math.round((Date.now() - Date.parse(c.at)) / 60e3)
    console.log(`${c.key.slice(CLAIM_PREFIX.length).padEnd(8)} ${String(c.value.who).padEnd(12)} ${c.value.host ?? ''}  renewed ${mins} min ago${mins * 60e3 >= CLAIM_TTL ? ' (expired)' : ''}`)
  }
  console.log(`${rows.length} claim(s)`)
} else if (cmd === 'done') {
  const id = normId(pos[0])
  const proof = one('proof')
  if (!proof || proof === true) die('done needs --proof "what proved it" (e.g. "402 checks", "his phone, by hand")')
  const r = await get(id)
  const byBart = /^\s*bart:/i.test(proof)
  if (!byBart) {
    // A ticket closes on its checks, each passed by someone who did not build it (see "Checks" above).
    const a = await accept(id)
    const v = verdict(r, a)
    if (!v.ok) die(`${id} cannot be closed yet:\n` + v.why.map((w) => `  - ${w}`).join('\n') + `\nSee: issues.mjs check ${id}. The builder does not pass its own checks: run "issues.mjs ready ${id} --on <release>" and the lead starts a checker.\nOnly "Bart: <his words>" closes a ticket without checks.`)
    // Bart, Nov 20 ("Third time. Massive learning fail"): OLA-223 was closed on a test against a fake
    // service while the feature could not run on his devices. An internal ticket still needs the real thing.
    if (a.internal && !/\b(walked|no user path):/i.test(proof)) die(
      'an internal ticket needs proof on the real thing, in the proof text:\n' +
      '  "walked: <what you did on the live server / installed app and what you saw>"\n' +
      '  or "no user path: <why nothing reaches a person>".')
  }
  const now = new Date().toISOString()
  await patch(id, { status: 'done', proof, finished_at: now, started_at: r.started_at ?? now, day: one('day') ?? pacificDay() })
  await attach(id, many('commit'))
  await release(id)
} else if (cmd === 'check') {
  const id = normId(pos[0])
  const r = await get(id)
  const a = await accept(id)
  const sub = pos[1]
  const now = new Date().toISOString()
  const str = (k) => (typeof one(k) === 'string' && one(k).trim() ? one(k).trim() : null)
  if (!sub) printChecks(r, a)
  else if (sub === 'add') {
    const [at, does, see] = [str('at'), str('do'), str('see')]
    if (!at || !does || !see) die(`usage: issues.mjs check ${id} add --at <place> --do "what he types or taps" --see "what he must then see"\n  ${CELL_HELP}`)
    if (PRODUCT.has(r.area) && !CELLS.includes(at)) die(`--at must be one of the places Ola is used:\n  ${CELL_HELP}`)
    if (does.length < 12 || see.length < 12) die('say exactly what he does and what he sees: the sentence he types, the button he taps, the words or the address that must appear')
    a.checks.push({ n: (a.checks.at(-1)?.n ?? 0) + 1, at, do: does, see, added_by: str('by') ?? 'kit', added_at: now, result: null })
    a.internal = null
    await saveAccept(id, a)
    printChecks(r, a)
  } else if (sub === 'skip') {
    const pattern = pos[2]
    const why = str('why')
    if (!pattern || !why || why.length < 15) die(`usage: issues.mjs check ${id} skip '<place or pattern with *>' --why "why this place does not apply (a real reason: he will read it)"`)
    if (!CELLS.some((c) => globs(pattern).test(c))) die(`"${pattern}" matches no place.\n  ${CELL_HELP}`)
    a.skips.push({ pattern, why, by: str('by') ?? 'kit', at: now })
    await saveAccept(id, a)
    printChecks(r, a)
  } else if (sub === 'internal') {
    const why = str('why')
    if (!why || why.length < 15) die(`usage: issues.mjs check ${id} internal --why "why nothing a person does or sees changes"`)
    if (a.checks.length) die(`${id} already has checks; an internal ticket has none`)
    a.internal = { why, by: str('by') ?? 'kit', at: now }
    await saveAccept(id, a)
    printChecks(r, a)
  } else if (sub === 'pass' || sub === 'fail') {
    const c = a.checks.find((x) => x.n === Number(pos[2]))
    if (!c) die(`no check #${pos[2]} on ${id} (issues.mjs check ${id})`)
    const [by, saw, on] = [str('by'), str('saw'), str('on')]
    if (!by || !saw || saw.length < 20) die(`usage: issues.mjs check ${id} ${sub} ${c.n} --by <who checked> --saw "what happened, in a sentence"${sub === 'pass' ? ' --on "<release or build>" --shot <file that shows it>' : ''}`)
    const claimRow = check(await db.from('venture_state').select('value').eq('key', CLAIM_PREFIX + id).maybeSingle(), 'claim')
    const builders = new Set([r.who, claimRow?.value?.who, 'builder', 'runner'].filter(Boolean).map((x) => String(x).toLowerCase()))
    if (sub === 'pass') {
      // The one who built it does not grade it.
      if (builders.has(by.toLowerCase())) die(`a check is passed by someone who did not build ${id} ("${by}" is its builder). Run "issues.mjs ready ${id} --on <release>"; the lead starts a checker with a fresh context.`)
      if (!on) die('--on "<release or build>" is required: which live version was checked')
      const file = str('shot') ?? str('log')
      const kase = str('case')
      if (!file && !kase) die('a pass needs something that shows it: --shot <screenshot> or --log <file> (or --case <id> for a run of the request test set)')
      if (file && (!existsSync(file) || statSync(file).size < 200)) die(`${file}: no such file, or it is empty`)
      c.evidence = file ? `${file} (${statSync(file).size} bytes)` : `case ${kase}`
      c.on = on
    }
    Object.assign(c, { result: sub, by, saw, checked_at: now })
    await saveAccept(id, a)
    await record([{ issue_id: id, kind: 'comment', body: `check #${c.n} (${c.at}) ${sub === 'pass' ? 'passed' : 'FAILED'}, by ${by}: ${saw}` }])
    if (sub === 'fail' && r.status === 'done') await patch(id, { status: 'in_progress' })
    printChecks(r, a)
  } else die(`unknown: check ${sub} (add, skip, internal, pass, fail)`)
} else if (cmd === 'ready') {
  const id = normId(pos[0])
  const r = await get(id)
  const a = await accept(id)
  if (a.internal) die(`${id} is internal: close it with proof`)
  if (!a.checks.length) die(`${id} has no checks to do yet (issues.mjs check ${id} add …)`)
  if (typeof one('on') !== 'string') die(`usage: issues.mjs ready ${id} --on "<release or build that is live>"`)
  a.ready = { on: one('on'), at: new Date().toISOString(), by: typeof one('by') === 'string' ? one('by') : r.who }
  await saveAccept(id, a)
  await record([{ issue_id: id, kind: 'comment', body: `built and live on ${one('on')}: ready for a checker` }])
  console.log(`${id} is ready for a checker on ${one('on')}. It stays open until every check has passed.`)
} else if (cmd === 'say') {
  // What may be told to Bart about a ticket: read from the checks, never from memory or a builder's report.
  const id = normId(pos[0])
  const r = await get(id)
  const a = await accept(id)
  const v = verdict(r, a)
  console.log(`${r.id}  ${r.title}`)
  if (a.internal) console.log(`  nothing a person does or sees changes (${a.internal.why}); ${r.status === 'done' ? `closed: ${r.proof}` : 'not closed'}`)
  // A check passed by a case of the request tests (--case id@place) says what that case says now
  // (OLA-251): "works" is two passes in a row; 2 of 3 is "works sometimes", never printed as WORKS.
  const asks = (check(await db.from('venture_state').select('value').eq('key', 'ola_status').maybeSingle(), 'status'))?.value?.asks ?? null
  const caseNow = (c) => caseVerdict(c.evidence, asks)
  const sometimes = v.works.filter((c) => caseNow(c) === 'sometimes')
  const failsNow = v.works.filter((c) => caseNow(c) === 'fails')
  for (const c of v.works.filter((x) => !sometimes.includes(x) && !failsNow.includes(x))) console.log(`  WORKS        ${c.at}: ${c.do} (checked ${when(c.checked_at)} on ${c.on})`)
  for (const c of sometimes) console.log(`  WORKS SOMETIMES (2 of 3) ${c.at}: ${c.do} (its request test, ${c.evidence.slice(5)}, passed twice with a fail between on its last run; "works" is two passes in a row)`)
  for (const c of failsNow) console.log(`  DOES NOT WORK NOW ${c.at}: ${c.do} (passed ${when(c.checked_at)}, but its request test, ${c.evidence.slice(5)}, fails on its last run)`)
  for (const c of v.fails) console.log(`  DOES NOT WORK ${c.at}: ${c.do} -> ${c.saw}`)
  for (const c of v.open) console.log(`  NOT CHECKED  ${c.at}: ${c.do}`)
  for (const cell of v.uncovered) console.log(`  NOT CHECKED  ${cell}: no check written`)
  for (const k of a.skips) console.log(`  not offered  ${k.pattern}: ${k.why}`)
  if (!a.internal && !a.checks.length) console.log('  NOT CHECKED  anywhere: this ticket has no checks')
  console.log(v.ok && !a.internal && !sometimes.length && !failsNow.length ? '  -> may be told: it works in the places above.' : a.internal ? '' : '  -> may NOT be told "it works". Say what works, what does not, and what nobody checked, in that order.')
} else if (cmd === 'unchecked') {
  const acc = check(await db.from('venture_state').select('key, value').like('key', `${ACCEPT}%`), 'checks')
  const by = new Map(acc.map((x) => [x.key.slice(ACCEPT.length), { ...emptyAccept(), ...x.value }]))
  const rows = check(await db.from('venture_issues').select('*').eq('project', 'ola').in('status', ['in_progress', 'done']).order('num'), 'read')
  const today = pacificDay()
  const waiting = rows.filter((r) => r.status === 'in_progress' && by.get(r.id)?.ready && !verdict(r, by.get(r.id)).ok)
  const bare = rows.filter((r) => r.status === 'in_progress' && !by.get(r.id)?.internal && !(by.get(r.id)?.checks.length))
  const closedBare = rows.filter((r) => r.status === 'done' && r.day === today && !/^\s*bart:/i.test(r.proof ?? '') && !(by.get(r.id)?.checks.length))
  console.log(`Ready, waiting for a checker (${waiting.length}):`)
  for (const r of waiting) console.log(`  ${r.id.padEnd(8)} on ${by.get(r.id).ready.on}: ${verdict(r, by.get(r.id)).why.join('; ')}\n           ${r.title}`)
  console.log(`In progress with no checks written (${bare.length}):`)
  for (const r of bare) console.log(`  ${r.id.padEnd(8)} ${r.who.padEnd(8)} ${r.title}`)
  console.log(`Closed today without checks (${closedBare.length}): read each proof as a stranger would`)
  for (const r of closedBare) console.log(`  ${r.id.padEnd(8)} ${by.get(r.id)?.internal ? 'internal: ' + by.get(r.id).internal.why : 'closed before checks existed'}\n           proof: ${(r.proof ?? '').slice(0, 220)}`)
} else if (cmd === 'wait') {
  const id = normId(pos[0])
  await patch(id, { status: 'waiting', ...(one('what') ? { what: one('what') } : {}) })
  await release(id)
} else if (cmd === 'open') {
  const id = normId(pos[0])
  const r = await get(id)
  const a = await accept(id)
  // reopened: earlier passes are about an older version
  if (r.status === 'done' && a.checks.some((c) => c.result)) await saveAccept(id, { ...a, ready: null, checks: a.checks.map((c) => ({ ...c, earlier: [...(c.earlier ?? []), { result: c.result, by: c.by, at: c.checked_at, saw: c.saw }], result: null })) })
  await patch(id, { status: 'open' })
  await release(id)
} else if (cmd === 'drop') {
  const id = normId(pos[0])
  const r = await get(id)
  await patch(id, { status: 'dropped', finished_at: new Date().toISOString(), day: pacificDay(), ...(one('why') ? { proof: `dropped: ${one('why')}` } : {}), what: r.what })
  await release(id)
} else if (cmd === 'edit') {
  const id = normId(pos[0])
  const f = {}
  for (const [k, col] of [['title', 'title'], ['what', 'what'], ['area', 'area'], ['pri', 'priority'], ['who', 'who'], ['proof', 'proof'], ['day', 'day']]) if (one(k) !== undefined) f[col] = one(k)
  if (one('week') !== undefined) f.week = one('week') === 'none' ? null : Number(one('week'))
  validate(f)
  await patch(id, f)
} else if (cmd === 'commit') {
  const id = normId(pos[0])
  await get(id)
  await attach(id, pos.slice(1))
} else if (cmd === 'list') {
  let q = db.from('venture_issues').select('*').eq('project', 'ola')
  const d = one('day')
  if (d) q = q.eq('day', d === 'today' ? pacificDay() : d === 'yesterday' ? shiftDay(pacificDay(), -1) : d)
  // the words the list prints are accepted too: doing = in_progress, next = open, waiting on Bart = waiting
  const ALIAS = { doing: 'in_progress', 'in-progress': 'in_progress', next: 'open', 'next-up': 'open', bart: 'waiting' }
  if (one('status')) {
    const wanted = String(one('status')).split(',').map((x) => ALIAS[x.trim()] ?? x.trim())
    for (const w of wanted) if (!STATUSES.includes(w)) die(`status must be one of: ${STATUSES.join(', ')} (or doing, next)`)
    q = q.in('status', wanted)
  }
  if (one('area')) q = q.eq('area', one('area'))
  const rows = check(await q.order('num'), 'list')
  for (const r of rows) console.log(line(r))
  console.log(`${rows.length} issue(s)`)
} else if (cmd === 'show') {
  const r = await get(normId(pos[0]))
  const commits = check(await db.from('venture_commits').select('sha, subject, at').eq('issue_id', r.id).order('at'), 'commits')
  console.log(`${r.id}  ${r.title}\n${r.what}\n`)
  console.log(`area ${AREAS[r.area]} · ${r.priority} · ${label[r.status]} · ${r.who}${r.week ? ` · plan week ${r.week}` : ''}`)
  console.log(`opened ${r.opened_at}${r.started_at ? `, started ${r.started_at}` : ''}${r.finished_at ? `, finished ${r.finished_at}` : ''}${r.day ? ` (counts for ${r.day})` : ''}`)
  if (r.proof) console.log(`proof: ${r.proof}`)
  for (const l of r.links ?? []) console.log(`link: ${l.label} ${l.url ?? `note ${l.doc}`}`)
  for (const c of commits) console.log(`commit ${c.sha.slice(0, 8)} ${c.subject}`)
  const act = await db.from('venture_issue_activity').select('*').eq('issue_id', r.id).order('at')
  if (act.error && !missing(act.error)) die(`activity: ${act.error.message}`)
  if (act.data?.length) {
    console.log('\nthread:')
    for (const a of act.data) console.log(`  ${when(a.at).padEnd(20)} ${a.who.padEnd(8)} ${a.via === 'board' ? (a.seen_by_kit_at ? '' : '[new] ') : ''}${says(a)}`)
  } else if (act.error) console.log('\n(no thread: schema 012 is not applied)')
} else if (cmd === 'comment') {
  const id = normId(pos[0])
  const text = pos.slice(1).join(' ').trim()
  if (!text) die('usage: issues.mjs comment <id> "text" [--who kit]')
  await get(id)
  const now = new Date().toISOString()
  const r = await db.from('venture_issue_activity').insert({ issue_id: id, at: now, who: KIT(), via: 'cli', kind: 'comment', body: text, seen_by_kit_at: now })
  if (r.error) die(missing(r.error) ? 'comments are not set up yet (apply apps/venture/schema/012_issue_activity.sql)' : `comment: ${r.error.message}`)
  check(await db.from('venture_issues').update({ updated_at: now }).eq('id', id), 'update')
  console.log(`${id} comment by ${KIT()}: ${text}`)
} else if (cmd === 'inbox') {
  const rows = await unread()
  if (rows === null) die('the inbox is not set up yet (apply apps/venture/schema/012_issue_activity.sql)')
  for (const a of rows) console.log(inboxLine(a))
  console.log(rows.length ? `${rows.length} new from the board${one('mark') ? ', marked read' : '; mark them read with: issues.mjs inbox --mark'}` : 'nothing new from the board')
  if (one('mark') && rows.length) check(await db.from('venture_issue_activity').update({ seen_by_kit_at: new Date().toISOString() }).in('id', rows.map((a) => a.id)), 'mark')
} else if (cmd === 'wait-board') {
  const every = Number(one('every') ?? 20) * 1000
  for (;;) {
    const rows = await unread()
    if (rows === null) die('the inbox is not set up yet (apply apps/venture/schema/012_issue_activity.sql)')
    if (rows.length) {
      for (const a of rows) console.log(inboxLine(a))
      console.log(`${rows.length} new from the board; read them with issues.mjs inbox --mark`)
      process.exit(0)
    }
    await new Promise((res) => setTimeout(res, every))
  }
} else if (cmd === 'hook') {
  // for .claude/hooks/bart-done.py: one quick read, two lists, JSON; silent and empty on failure
  const [w, u] = await Promise.all([db.from('venture_issues').select('*').eq('project', 'ola').eq('status', 'waiting').order('num'), db.from('venture_issue_activity').select('*').is('seen_by_kit_at', null).eq('via', 'board').order('at')])
  const sweep = await sweepDue(db).catch(() => [])
  console.log(JSON.stringify({ waiting: (w.data ?? []).map(line), unread: u.error ? [] : (u.data ?? []).map(inboxLine), sweep }))
} else if (cmd === 'plate') {
  const rows = check(await db.from('venture_issues').select('*').eq('project', 'ola').in('status', ['in_progress', 'open', 'waiting']), 'plate')
  const order = { in_progress: 0, open: 1, waiting: 2 }
  rows.sort((a, b) => order[a.status] - order[b.status] || a.priority.localeCompare(b.priority) || a.num - b.num)
  for (const r of rows) console.log(line(r))
} else if (cmd === 'unsorted') {
  const rows = check(await db.from('venture_commits').select('sha, subject, at').is('issue_id', null).eq('ignored', false).order('at', { ascending: false }).limit(200), 'unsorted')
  for (const c of rows) console.log(`${c.sha.slice(0, 8)} ${c.at.slice(0, 16)} ${c.subject}`)
  console.log(`${rows.length} unsorted commit(s); place each: issues.mjs place <sha> <OLA-n | none>`)
} else if (cmd === 'place') {
  const [sha, where] = pos
  if (!sha || !where) die('usage: issues.mjs place <sha> <OLA-n | none>')
  const found = check(await db.from('venture_commits').select('sha').like('sha', `${sha}%`), 'find')
  if (found.length !== 1) die(`${found.length} commits start with ${sha}`)
  const fields = where === 'none' ? { issue_id: null, ignored: true } : { issue_id: (await get(normId(where))).id, ignored: false }
  check(await db.from('venture_commits').update(fields).eq('sha', found[0].sha), 'place')
  console.log(`${found[0].sha.slice(0, 8)} → ${where}`)
} else if (cmd === 'import') {
  // [{ num?, title, what, area, priority, status, who, week?, opened_at?, started_at?, finished_at?, day?, links?, proof?, commits?: [hash] }]
  const items = JSON.parse(readFileSync(pos[0], 'utf8'))
  const last = check(await db.from('venture_issues').select('num').eq('project', 'ola').order('num', { ascending: false }).limit(1), 'read')
  let next = (last[0]?.num ?? 0) + 1
  for (const it of items) {
    const num = it.num ?? next++
    const { commits = [], ...rest } = it
    const row = { project: 'ola', links: [], proof: '', what: '', who: 'lead', priority: 'P1', status: 'done', ...rest, id: `${PREFIX}-${num}`, num, updated_at: new Date().toISOString() }
    validate(row)
    check(await db.from('venture_issues').upsert(row), `import ${row.id}`)
    for (const h of commits) check(await db.from('venture_commits').upsert({ ...gitCommit(h), issue_id: row.id, ignored: false }), `commit ${h}`)
    console.log(line(row))
  }
  console.log(`${items.length} imported`)
} else {
  console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 42).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
  process.exit(cmd ? 1 : 0)
}
