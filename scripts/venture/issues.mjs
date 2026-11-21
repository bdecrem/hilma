#!/usr/bin/env node
// The issue tracker behind app.kochitolabs.com (tables venture_issues and venture_commits, schema 011).
// One issue per piece of work; the lead and every builder keep it current with this, and the board,
// the 10 am text and the plate read it. Titles in plain words for Bart, never internal names.
//
//   node scripts/venture/issues.mjs add "title" --area web --pri P1 [--what "why, one or two sentences"]
//                                   [--who lead] [--week 1] [--start] [--link "label=https://…"] [--doc slug]
//   node scripts/venture/issues.mjs start <id> [--who name] [--role builder|checker|investigator|hold|runner]
//                                   [--wait [min]] [--beside "<folders you will change>"]   also claims it (below).
//                                   A builder is refused while another builder or the runner holds the server lane
//                                   (OLA-251): --wait registers it as waiting (claims shows it, the runner yields to
//                                   a higher priority) and starts it when the lane is free; --beside is refused when
//                                   the holder's commits of the last 6 hours touch those folders. The lane is the
//                                   ticket's (--lane only repeats it; change it with edit --lane). Roles: a --who that
//                                   is a role word is that role, lead/kit/bart are holds, any other name a builder;
//                                   checker, investigator and hold take no lane, unless the ticket gets commits that
//                                   change the server's code while they hold it.
//   node scripts/venture/issues.mjs claim <id> [--who name] [--role …] [--wait] "I am on this": renew at least every 45 min
//   node scripts/venture/issues.mjs release <id>                                 let go (done, wait, open and drop release too)
//   node scripts/venture/issues.mjs claims                                       the live claims
//   node scripts/venture/issues.mjs done <id> --proof "…" [--commit <hash>]… [--day YYYY-MM-DD]   refused until every check has
//                                                                                passed (below), unless --proof "Bart: <his words>"
//   Checks: what Bart will do and see, per place, written BEFORE the work; passed only by someone who did not build it.
//   node scripts/venture/issues.mjs check <id> add --at cloud-web:chat --do "what he types or taps" --see "what he must then see"
//   node scripts/venture/issues.mjs check <id> edit <n> [--do "…"] [--see "…"] --why "what changed"   (an unchecked check whose facts changed; the old words go on the thread)
//   node scripts/venture/issues.mjs check <id> skip 'local-*' --why "why this place does not apply"     (a pattern, * allowed)
//   node scripts/venture/issues.mjs check <id> internal --why "why nothing a person does or sees changes"
//   node scripts/venture/issues.mjs check <id> pass <n> --by checker --on "<release or build>" --saw "what happened" --shot <file>
//                                   [--case <id>@<place>]  refused from the agent or session that built it, claimed it as
//                                   builder, marked it ready or committed for it (scripts/venture/_who.mjs: who runs the
//                                   command, read from the hook's record, not the name typed); a --case must be in the
//                                   request tests' result file by that exact name and working there
//   node scripts/venture/issues.mjs check <id> fail <n> --by checker --saw "what happened instead"
//   node scripts/venture/issues.mjs check <id>                                    the checks and where each stands
//   node scripts/venture/issues.mjs ready <id> --on "<release or build>"          the builder: built and live, needs a checker
//   node scripts/venture/issues.mjs say <id>                                      what may be told to Bart about it: works / fails / not checked;
//                                   a pass on a release of the test server that is no longer live is "worked on an earlier version"
//   (VENTURE_TRACKER_FAKE=<file.json> runs any of these on a copy of the tracker: node scripts/venture/_fakedb.mjs copy <file>)
//   node scripts/venture/issues.mjs unchecked                                     tickets waiting for a checker; closed today without checks
//   node scripts/venture/issues.mjs wait <id> [--what "what Bart has to do"]      waiting on Bart
//   node scripts/venture/issues.mjs open <id>                                    back to open (next up)
//   node scripts/venture/issues.mjs drop <id> [--why "…"]
//   node scripts/venture/issues.mjs edit <id> [--title …] [--what …] [--area …] [--pri …] [--who …] [--week …] [--proof …] [--lane <lane> --why …]
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
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { hostname } from 'node:os'
import { createClient } from '@supabase/supabase-js'
import { sweepDue } from './_state.mjs'
import { tmpdir } from 'node:os'
import { CLAIM_PREFIX, CLAIM_TTL, LANES, WAIT_PREFIX, caseKey, caseState, claimRole, isServerFile, laneHolder, laneOf, laneSentence, liveWaiters, releasesIn } from './_plate.mjs'
import { CALLERS, LANE_ROLES, ROLES, caller, committers, roleOf } from './_who.mjs'
import { checkDeploys, overrideLine, overridesOf, writeOverride } from './_overrides.mjs'
import { relative, resolve } from 'node:path'
import { fakeClient } from './_fakedb.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const env = !existsSync(root + '.env.local') ? process.env : Object.fromEntries(
  readFileSync(root + '.env.local', 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
// VENTURE_TRACKER_FAKE=<file.json>: a copy of the tracker in one file (_fakedb.mjs copy), for tests
const db = process.env.VENTURE_TRACKER_FAKE ? fakeClient(process.env.VENTURE_TRACKER_FAKE) : createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
if (process.env.VENTURE_TRACKER_FAKE) console.error(`(a copy of the tracker: ${process.env.VENTURE_TRACKER_FAKE})`)
const FAKE = !!process.env.VENTURE_TRACKER_FAKE
// The version of the tracker's rules (OLA-273): bump it with every change to what the tracker refuses.
// The newest tracker that ran writes it to venture_state "tracker_version"; an older copy (an agent's
// worktree that was not rebased) refuses to run.
export const TRACKER_VERSION = 12
// Variables that change what the tracker believes (OLA-251, third pass): honored on a copy of the
// tracker only. On the real one they are ignored, and each use leaves a line in the overrides.
const envWays = []
// (VENTURE_FAKE_AS_REAL=1 makes a copy of the tracker treat them as the real one does, to test this)
if (!FAKE || process.env.VENTURE_FAKE_AS_REAL) for (const k of ['VENTURE_CALLERS_FILE', 'VENTURE_LIVE_RELEASE', 'VENTURE_ASKS_FILE']) if (process.env[k]) { envWays.push(`${k} was set on the real tracker (ignored there; honored only with VENTURE_TRACKER_FAKE)`); delete process.env[k] }

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
// OLA-273: an older copy of the tracker does not run against the database a newer one has used
{
  const v = await db.from('venture_state').select('value').eq('key', 'tracker_version').maybeSingle()
  const seen = Number(v.data?.value?.v ?? 0)
  if (seen > TRACKER_VERSION) die(`This copy of the tracker (${fileURLToPath(import.meta.url)}) is older than the newest one that ran (its rules are version ${TRACKER_VERSION}, the newest ${seen}): rebase this checkout on origin/main (git pull --rebase) and run it again.`)
  if (!v.error && seen < TRACKER_VERSION) await db.from('venture_state').upsert({ key: 'tracker_version', value: { v: TRACKER_VERSION, at: new Date().toISOString(), host: hostname() }, at: new Date().toISOString() })
}
const idArg = /^(OLA-)?\d+$/i.test(String(pos[0] ?? '')) ? `OLA-${Number(String(pos[0]).replace(/\D/g, ''))}` : null
async function flushWays() {
  while (envWays.length) await writeOverride(db, { ticket: idArg, what: `${envWays.shift()}: issues.mjs ${cmd}` })
}
if (cmd !== 'hook') await flushWays()
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
// ---- Claims, roles and lanes (OLA-211, OLA-251). A claim says who is on a ticket and in what role
// (_who.mjs: builder, checker, investigator, hold, runner). One builder at a time in the server lane,
// counting the runner on the mini (Nov 20: three builders at once overwrote each other's work and the
// test server refused updates). The lane comes from the ticket only; a hold keeps others off a ticket
// and takes no lane; whatever its role, a claim whose ticket gets commits changing the server's code
// while it is held counts as a builder there. A renewal of one's own claim is never refused.
const me = caller()
function roleFor(who) {
  try {
    return roleOf(who, one('role') === undefined ? null : one('role'))
  } catch (e) {
    die(e.message)
  }
}
function laneFlag(r, a) {
  const l = one('lane')
  if (l === undefined) return
  const ticket = laneOf(r, a.lane)
  if (l === true || !LANES.includes(l)) die(`--lane must be one of: ${LANES.join(', ')}. And a ticket's lane comes from the ticket, not from a flag: ${r.id} is in the ${ticket} lane.`)
  if (l !== ticket) die(`Refused: ${r.id} is in the ${ticket} lane (from its area and title). A ticket's lane comes from the ticket, not from a flag. If the ticket is in the wrong lane, change it on the ticket, where it is recorded: issues.mjs edit ${r.id} --lane ${l} --why "what it changes"`)
}
async function liveClaims() {
  const rows = check(await db.from('venture_state').select('key, value, at').like('key', `${CLAIM_PREFIX}%`), 'claims')
  return Object.fromEntries(rows.filter((x) => Date.now() - Date.parse(x.at) < CLAIM_TTL).map((x) => [x.key.slice(CLAIM_PREFIX.length), { ...x.value, at: x.at }]))
}
let fetched = false
/** Files changed by commits naming `id` (in the subject or body) since `since`, on main and this checkout. */
function filesOf(id, since) {
  if (!fetched) {
    fetched = true
    try { execFileSync('git', ['-C', root, 'fetch', '--quiet', 'origin', 'main'], { stdio: 'ignore', timeout: 20000 }) } catch {}
  }
  try {
    const out = execFileSync('git', ['-C', root, 'log', 'origin/main', 'HEAD', `--since=${since}`, '-E', `--grep=${id}([^0-9]|$)`, '--name-only', '--format='], { encoding: 'utf8', timeout: 20000 })
    return [...new Set(out.split('\n').filter(Boolean))]
  } catch {
    return []
  }
}
/** The claims (other than id) whose ticket got commits changing the server's code while held. */
function buildingNow(claims, id) {
  const out = {}
  for (const [cid, c] of Object.entries(claims)) {
    if (cid === id) continue
    const f = filesOf(cid, c.since ?? c.at).find(isServerFile)
    if (f) out[cid] = `its commits since ${when(c.since ?? c.at)} change the server's code (${f})`
  }
  return out
}
async function laneState(id, lane) {
  const claims = await liveClaims()
  const ids = Object.keys(claims).filter((x) => x !== id)
  const issues = ids.length ? check(await db.from('venture_issues').select('id, area, title, what, priority').in('id', ids), 'read') : []
  const acc = ids.length ? check(await db.from('venture_state').select('key, value').in('key', ids.map((x) => ACCEPT + x)), 'checks') : []
  const lanes = Object.fromEntries(acc.filter((x) => x.value?.lane).map((x) => [x.key.slice(ACCEPT.length), x.value.lane]))
  return laneHolder({ id, lane, issues, claims, lanes, building: lane === 'server' ? buildingNow(claims, id) : {} })
}
const BESIDE_HOURS = 6
const SERVER_HOME = ['apps/activist-ai/']
async function laneGate(id, who, role, lane, r) {
  if (role !== 'builder' && role !== 'runner') return
  const holder = await laneState(id, lane)
  if (!holder) return
  if (one('beside') !== undefined) {
    // --beside: the folders this builder will change; refused when the holder's commits of the last hours touch any of them
    const dirs = (typeof one('beside') === 'string' ? one('beside') : '').split(/[\s,]+/).map((d) => d.trim().replace(/^\.\//, '').replace(/\/+$/, '')).filter(Boolean)
    if (!dirs.length) die(`--beside needs the folders you will change, like --beside "apps/activist-ai/frontdesk,apps/activist-ai/gateway"\n${laneSentence(holder, lane)}`)
    for (const d of dirs) if (d.includes('..') || d.startsWith('/') || !existsSync(root + d)) die(`--beside: ${d} is not a folder or file in this checkout. Name the folders you will change.`)
    // OLA-251, third pass: the repository root, or a folder that holds the server's code, names all of it
    for (const d of dirs) {
      const rel = relative(root, resolve(root, d)).toLowerCase() // the Mac's disk ignores case (OLA-251, fourth pass)
      if (rel === '' || SERVER_HOME.some((s) => s === rel + '/' || s.startsWith(rel + '/'))) die(`Refused: --beside ${d} names ${rel === '' ? 'the whole repository' : `a folder that holds all of the server's code (${SERVER_HOME.join(', ')})`}. Name the folders inside it that you will change.`)
    }
    const theirs = filesOf(holder.id, `${BESIDE_HOURS} hours ago`)
    const hit = theirs.filter((f) => dirs.some((d) => f.toLowerCase() === d.toLowerCase() || f.toLowerCase().startsWith(d.toLowerCase() + '/')))
    if (hit.length) die(`Refused: ${holder.who}'s commits for ${holder.id} in the last ${BESIDE_HOURS} hours change what you named (${hit.slice(0, 5).join(', ')}${hit.length > 5 ? ', …' : ''}). Wait for it (--wait) or take another ticket.`)
    const said = `started by ${who} beside ${holder.who} on ${holder.id}, both in the server lane; will change ${dirs.join(', ')}; ${holder.id}'s commits of the last ${BESIDE_HOURS} hours touch none of them (${theirs.length ? theirs.length + ' files' : 'it has none yet'})`
    await record([{ issue_id: id, kind: 'comment', body: said }])
    await writeOverride(db, { ticket: id, what: `--beside accepted: ${said}` })
    console.log(said)
    return dirs
  }
  if (one('wait') === undefined) die(laneSentence(holder, lane))
  // --wait [minutes]: registered as waiting (issues.mjs claims shows it; the runner yields to it), started when the lane is free
  const mins = one('wait') === true ? 90 : Number(one('wait'))
  if (!(mins > 0 && mins <= 240)) die('--wait takes minutes, 1 to 240 (90 when left out)')
  const key = WAIT_PREFIX + id
  const since = new Date().toISOString()
  const mark = () => db.from('venture_state').upsert({ key, value: { who, role, lane, priority: r.priority, since, host: hostname(), caller: me.id }, at: new Date().toISOString() })
  check(await mark(), 'wait')
  console.log(`${id}: waiting for the ${lane} lane, held by ${holder.who} on ${holder.id}; registered (issues.mjs claims shows it), checking every 30 s for up to ${mins} min`)
  const end = Date.now() + mins * 60e3
  for (;;) {
    await new Promise((res) => setTimeout(res, 30e3))
    const h = await laneState(id, lane)
    if (!h) {
      check(await db.from('venture_state').delete().eq('key', key), 'wait')
      console.log(`${id}: the ${lane} lane is free (${when(new Date().toISOString())}); starting`)
      return
    }
    if (Date.now() > end) {
      check(await db.from('venture_state').delete().eq('key', key), 'wait')
      die(`${id}: still held by ${h.who} on ${h.id} after ${mins} min; stopped waiting`)
    }
    check(await mark(), 'wait')
  }
}
async function claim(id, who, row = null, { gated = false } = {}) {
  const key = CLAIM_PREFIX + id
  const r = row ?? (await get(id))
  const a = await accept(id)
  laneFlag(r, a)
  const role = roleFor(who)
  const old = check(await db.from('venture_state').select('value, at').eq('key', key).maybeSingle(), 'claim')
  // OLA-251, sixth pass: the runner is runner.mjs alone (it writes its claim itself, with no caller); no
  // session claims as the runner or changes the runner's live claim, under any name or role
  const runnerLive = old && Date.now() - Date.parse(old.at ?? 0) < CLAIM_TTL && claimRole(old.value) === 'runner'
  // runner.mjs claims first, then runs issues.mjs start --who runner: that renews its own claim on its machine
  if ((role === 'runner' || /^runner$/i.test(String(who).trim())) && !(runnerLive && old.value?.host === hostname())) die(`Refused: only the runner (runner.mjs on the mini) claims as the runner. Claim under your own name and role.`)
  if (runnerLive && role !== 'runner') die(`Refused: ${id} is the runner's (renewed ${Math.round((Date.now() - Date.parse(old.at)) / 60e3)} min ago); its claim ends when its run ends.`)
  // a caller the tracker cannot identify only renews a claim exactly as it was: same name, machine and role
  if (!me.id && old && Date.now() - Date.parse(old.at ?? 0) < CLAIM_TTL && LANE_ROLES.has(claimRole(old.value)) && claimRole(old.value) !== role) die(`Refused: ${id} is held by ${old.value?.who} (${claimRole(old.value)}), and this call cannot be identified (${me.why ?? 'no hook record'}), so it may only renew the claim as it is, not change its role.`)
  // OLA-251, fifth pass: a live builder's or the runner's claim is not taken over by another caller, under any name or role
  // (a session with no caller record renews only a claim made the same way, under its name, on its machine)
  if (old && Date.now() - Date.parse(old.at ?? 0) < CLAIM_TTL && LANE_ROLES.has(claimRole(old.value)) && !(me.id ? old.value?.caller === me.id : !old.value?.caller && old.value?.who === who && old.value?.host === hostname())) {
    die(`Refused: ${id} is held by ${old.value?.who} (${claimRole(old.value)}${old.value?.lane ? ` in the ${old.value.lane} lane` : ''}), renewed ${Math.round((Date.now() - Date.parse(old.at)) / 60e3)} min ago, by another caller. A claim is taken over only after it ends (${CLAIM_TTL / 60e3} min after its last renewal) or is released by its holder.`)
  }
  // a renewal keeps its start; the same name in a role that takes a lane, after one that took none, is a new start (OLA-251)
  const keep = old && Date.now() - Date.parse(old.at ?? 0) < CLAIM_TTL && old.value?.who === who && old.value?.since && (claimRole(old.value) === role || !LANE_ROLES.has(role))
  const lane = laneOf(r, a.lane)
  const beside = !keep && !gated ? await laneGate(id, who, role, lane, r) : null
  const since = keep ? old.value.since : new Date().toISOString()
  check(await db.from('venture_state').upsert({ key, value: { who, role, host: hostname(), since, lane, ...(me.id ? { caller: me.id } : {}), ...(beside ? { beside } : keep && old.value.beside ? { beside: old.value.beside } : {}) }, at: new Date().toISOString() }), 'claim')
  // OLA-251, sixth pass: two builders that pass the gate at the same moment both wrote a claim. Each reads
  // the lane again after writing, and backs off when another builder holds it: the gate saw nobody, so that
  // one came at the same moment. When both see each other both back off and try again; two are never kept.
  if (!keep && !beside && LANE_ROLES.has(role) && lane === 'server') {
    const h = await laneState(id, lane)
    const theirs = h ? (await liveClaims())[h.id] : null
    if (h && theirs && !theirs.beside) {
      check(await db.from('venture_state').delete().eq('key', key), 'claim')
      die(laneSentence(h, lane))
    }
  }
  if ((role === 'builder' || role === 'runner') && me.id && !(a.builders ?? []).some((b) => b.caller === me.id)) await saveAccept(id, { ...a, builders: [...(a.builders ?? []), { who, role, caller: me.id, host: me.host, at: new Date().toISOString(), via: 'claim' }] })
  console.log(`${id} claimed by ${who} (${role}) ${role === 'builder' || role === 'runner' ? `in the ${lane} lane` : `(the ticket is in the ${lane} lane; ${/^[aeiou]/.test(role) ? 'an' : 'a'} ${role} takes none)`} (expires in ${CLAIM_TTL / 60e3} min unless claimed again)`)
}
async function release(id) {
  check(await db.from('venture_state').delete().eq('key', CLAIM_PREFIX + id), 'release')
  check(await db.from('venture_state').delete().eq('key', WAIT_PREFIX + id), 'release')
}
/** OLA-251, fourth pass: a live builder's or the runner's claim held by someone else, or null. Clearing one
 *  frees the server lane for a second builder, so it is refused (release) or leaves a line (open, wait, drop). */
async function foreignClaim(id) {
  const cl = (await liveClaims())[id]
  if (!cl || !LANE_ROLES.has(claimRole(cl))) return null
  // only the caller that made the claim; a name or an inherited setting (VENTURE_RUNNER) proves nothing
  return me.id && cl.caller === me.id ? null : cl
}
async function releaseNoting(id, how) {
  const cl = await foreignClaim(id)
  if (cl) await writeOverride(db, { ticket: id, what: `${how} released ${cl.who}'s live claim (${claimRole(cl)}${cl.lane ? `, ${cl.lane} lane` : ''}, from ${cl.host ?? 'unknown host'}), held by someone else` })
  await release(id)
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

// ---- The test server, read over ssh (OLA-264, OLA-259): the release that is live, and the request
// tests' result file. Each read is kept two minutes in the temp folder, so `say` on many tickets asks once.
const MINI = ['admin@171.66.240.175', 'admin@100.95.51.98']
function fromMini(what, remote, parse) {
  const cache = `${tmpdir()}/venture-${what}.json`
  try {
    const c = JSON.parse(readFileSync(cache, 'utf8'))
    if (Date.now() - c.at < 120e3) {
      // OLA-251, third pass: a cache the tracker did not write as it is (a time ahead of the clock, a file
      // time that is not its own, not from the test server) is not used, and is a line in the overrides
      const m = statSync(cache).mtimeMs
      if (c.at <= Date.now() + 1e3 && Math.abs(m - c.at) < 5e3 && MINI.includes(c.from)) return c
      envWays.push(`the cache file ${cache} was not written by the tracker as it is (its time ${new Date(c.at).toISOString()}, the file's ${new Date(m).toISOString()}, from ${c.from ?? 'nowhere'}); not used`)
    }
  } catch {}
  let err = ''
  for (const host of MINI) {
    try {
      const out = execFileSync('ssh', ['-o', 'ConnectTimeout=8', '-o', 'BatchMode=yes', host, remote], { encoding: 'utf8', timeout: 20000, maxBuffer: 32e6, stdio: ['ignore', 'pipe', 'pipe'] })
      const c = { at: Date.now(), value: parse(out), from: host }
      try { writeFileSync(cache, JSON.stringify(c)) } catch {}
      return c
    } catch (e) {
      err = String(e.stderr || e.message).trim().split('\n').pop().slice(0, 160)
    }
  }
  return { at: Date.now(), value: null, error: err || 'the test server did not answer' }
}
const liveRelease = () => (process.env.VENTURE_LIVE_RELEASE ? { value: process.env.VENTURE_LIVE_RELEASE } : fromMini('live-release', 'readlink ~/ola-staging/current', (o) => /([0-9a-f]{12})\s*$/.exec(o.trim())?.[1] ?? null))
const asksCases = () => (process.env.VENTURE_ASKS_FILE ? { value: JSON.parse(readFileSync(process.env.VENTURE_ASKS_FILE, 'utf8')) } : fromMini('asks-latest', 'cat ~/ola-staging/asks-latest.json', (o) => JSON.parse(o)))
// A check about the test server: any check of a ticket in the server lane, and a product ticket's checks
// in a cloud project (the Mac and iPhone apps use the server there; Ola on his Mac does not).
const onServer = (r, a, c = null) => laneOf(r, a.lane) === 'server' || (PRODUCT.has(r.area) && (!c || /^cloud-/.test(String(c.at))))

// OLA-251, third pass: a checker, investigator or hold whose own commits for its ticket change the server's
// code is a builder from then on; the tracker says so at its next call, and the lane rule applies.
async function lostRoles() {
  if (!me.id) return
  const claims = await liveClaims()
  for (const [cid, c] of Object.entries(claims)) {
    if (c.caller !== me.id || LANE_ROLES.has(claimRole(c)) || !committers(cid).includes(me.id)) continue
    const f = filesOf(cid, c.since ?? c.at).find(isServerFile)
    if (!f) continue
    const was = claimRole(c)
    console.error(`${cid}: you hold it as ${was}, but your commits for it since ${when(c.since ?? c.at)} change the server's code (${f}). A ${was} who builds is a builder: the claim is a builder's now, and the lane rule applies.`)
    const holder = await laneState(cid, 'server')
    if (holder) {
      await release(cid)
      await record([{ issue_id: cid, kind: 'comment', body: `${c.who}'s claim as ${was} was released: its commits change the server's code (${f}) while ${holder.who} holds the server lane on ${holder.id}` }])
      await writeOverride(db, { ticket: cid, what: `built the server's code as ${was} (${f}) while ${holder.who} held the server lane on ${holder.id}; the claim was released` })
      die(`${laneSentence(holder, 'server')}\nYour claim on ${cid} was released.`)
    }
    const { at, ...v } = c
    check(await db.from('venture_state').upsert({ key: CLAIM_PREFIX + cid, value: { ...v, role: 'builder', lane: 'server', was, became_builder: new Date().toISOString() }, at }), 'claim')
    await record([{ issue_id: cid, kind: 'comment', body: `${c.who}'s claim as ${was} is a builder's now: its commits change the server's code (${f})` }])
  }
}
if (!['hook', 'wait-board', 'record-override'].includes(cmd)) await lostRoles()

if (cmd === 'overrides') {
  // the record of deliberate ways around a guard (OLA-251, third pass; _overrides.mjs)
  const d = one('day')
  const day = !d || d === 'today' ? pacificDay() : d === 'yesterday' ? shiftDay(pacificDay(), -1) : d
  const rows = await overridesOf(db, day)
  for (const v of rows) console.log(overrideLine(v))
  console.log(`${rows.length} way(s) around a guard on ${day}`)
} else if (cmd === 'record-override') {
  // for the other venture tools (a refusal on a copy of the notes, an update of the test server outside the gate)
  const what = typeof one('what') === 'string' ? one('what') : die('usage: issues.mjs record-override --what "…" [--ticket OLA-n] [--tool name] [--key k] [--at iso]')
  await writeOverride(db, { what, ticket: typeof one('ticket') === 'string' ? one('ticket') : null, tool: typeof one('tool') === 'string' ? one('tool') : 'venture', key: typeof one('key') === 'string' ? one('key') : null, at: typeof one('at') === 'string' ? one('at') : null, who: typeof one('caller') === 'string' ? one('caller') : null })
} else if (cmd === 'add') {
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
  // the claim (and its lane, OLA-251) comes before anything else changes: a refusal changes nothing
  const who = typeof one('who') === 'string' ? one('who') : r.who ?? 'lead'
  const role = roleFor(who)
  await claim(id, who, r)
  await patch(id, { status: 'in_progress', started_at: r.started_at ?? new Date().toISOString(), ...(typeof one('who') === 'string' && (role === 'builder' || role === 'runner') ? { who: one('who') } : {}) })
} else if (cmd === 'claim') {
  const id = normId(pos[0])
  const r = await get(id)
  await claim(id, typeof one('who') === 'string' ? one('who') : r.who ?? 'lead', r)
} else if (cmd === 'release') {
  const id = normId(pos[0])
  const cl = await foreignClaim(id)
  if (cl) {
    const why = typeof one('why') === 'string' ? one('why').trim() : ''
    if (why.length < 15) die(`Refused: ${id} is held by ${cl.who} (${claimRole(cl)}${cl.lane ? ` in the ${cl.lane} lane` : ''}), renewed ${Math.round((Date.now() - Date.parse(cl.at)) / 60e3)} min ago. A claim is released by whoever holds it, or ends by itself ${CLAIM_TTL / 60e3} min after its last renewal. To clear it anyway, say why: issues.mjs release ${id} --why "…" (recorded in the overrides).`)
    await writeOverride(db, { ticket: id, what: `released ${cl.who}'s live claim (${claimRole(cl)}${cl.lane ? `, ${cl.lane} lane` : ''}), held by someone else: ${why}` })
  }
  await release(id)
  console.log(`${id} released`)
} else if (cmd === 'claims') {
  const rows = check(await db.from('venture_state').select('key, value, at').like('key', `${CLAIM_PREFIX}%`).order('at'), 'claims')
  for (const c of rows) {
    const mins = Math.round((Date.now() - Date.parse(c.at)) / 60e3)
    console.log(`${c.key.slice(CLAIM_PREFIX.length).padEnd(8)} ${String(c.value.who).padEnd(12)} ${claimRole(c.value).padEnd(12)} ${(c.value.lane ?? '').padEnd(7)} ${c.value.host ?? ''}  renewed ${mins} min ago${mins * 60e3 >= CLAIM_TTL ? ' (expired)' : ''}${c.value.beside ? `  beside, changing ${c.value.beside.join(', ')}` : ''}`)
  }
  console.log(`${rows.length} claim(s)`)
  // builders waiting for a lane (start --wait): the runner yields to one whose ticket is of a higher priority
  const ws = check(await db.from('venture_state').select('key, value, at').like('key', `${WAIT_PREFIX}%`).order('at'), 'waits')
  const live = liveWaiters(Object.fromEntries(ws.map((w) => [w.key, { ...w.value, at: w.at }])))
  for (const w of ws) console.log(`waiting  ${w.key.slice(WAIT_PREFIX.length).padEnd(8)} ${String(w.value.who).padEnd(12)} ${w.value.priority} for the ${w.value.lane} lane since ${when(w.value.since)}${live[w.key] ? '' : ' (stopped: not renewed)'}`)
  console.log(`${Object.keys(live).length} waiting for a lane`)
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
  // OLA-251, third pass: a check added, changed or skipped after the work started is a line in the overrides
  const lateCheck = async (what) => { if (r.started_at) await writeOverride(db, { ticket: id, what: `${what} after the ticket was started (${when(r.started_at)})` }) }
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
    await lateCheck(`check #${a.checks.at(-1).n} added`)
    printChecks(r, a)
  } else if (sub === 'edit') {
    const c = a.checks.find((x) => String(x.n) === String(pos[2]))
    const [does, see, why] = [str('do'), str('see'), str('why')]
    if (!c || (!does && !see) || !why || why.length < 15) die(`usage: issues.mjs check ${id} edit <n> [--do "…"] [--see "…"] --why "what changed, so the old words no longer hold"`)
    if (c.result === 'pass') die(`check #${c.n} has passed; add a new check instead of changing one that passed`)
    const old = `do: ${c.do} / see: ${c.see}`
    if (does) c.do = does
    if (see) c.see = see
    c.result = null
    await saveAccept(id, a)
    await record([{ issue_id: id, kind: 'comment', body: `check #${c.n} changed by ${str('by') ?? 'kit'}: ${why}. It was: ${old}` }])
    await lateCheck(`check #${c.n} reworded`)
    printChecks(r, a)
  } else if (sub === 'skip') {
    const pattern = pos[2]
    const why = str('why')
    if (!pattern || !why || why.length < 15) die(`usage: issues.mjs check ${id} skip '<place or pattern with *>' --why "why this place does not apply (a real reason: he will read it)"`)
    if (!CELLS.some((c) => globs(pattern).test(c))) die(`"${pattern}" matches no place.\n  ${CELL_HELP}`)
    a.skips.push({ pattern, why, by: str('by') ?? 'kit', at: now })
    await saveAccept(id, a)
    await lateCheck(`place ${pattern} skipped`)
    printChecks(r, a)
  } else if (sub === 'internal') {
    const why = str('why')
    if (!why || why.length < 15) die(`usage: issues.mjs check ${id} internal --why "why nothing a person does or sees changes"`)
    if (a.checks.length) die(`${id} already has checks; an internal ticket has none`)
    a.internal = { why, by: str('by') ?? 'kit', at: now }
    await saveAccept(id, a)
    await lateCheck('the ticket marked internal (no checks)')
    printChecks(r, a)
  } else if (sub === 'pass' || sub === 'fail') {
    const c = a.checks.find((x) => x.n === Number(pos[2]))
    if (!c) die(`no check #${pos[2]} on ${id} (issues.mjs check ${id})`)
    const [by, saw, on] = [str('by'), str('saw'), str('on')]
    if (!by || !saw || saw.length < 20) die(`usage: issues.mjs check ${id} ${sub} ${c.n} --by <who checked> --saw "what happened, in a sentence"${sub === 'pass' ? ' --on "<release or build>" --shot <file that shows it>' : ''}`)
    if (sub === 'pass') {
      // The one who built it does not grade it (OLA-263): by the agent or session that ran the command
      // (_who.mjs), not by the name typed. Refused for the builders recorded on the ticket (start, claim,
      // ready, commit) and for whoever committed for it on this machine; and by name for the builders'
      // names. A checker holding the claim as checker passes under its own name.
      const claimRow = check(await db.from('venture_state').select('value').eq('key', CLAIM_PREFIX + id).maybeSingle(), 'claim')
      const recorded = (a.builders ?? []).filter((b) => b.role === 'builder' || b.role === 'runner')
      const names = new Set(['builder', 'runner', ...recorded.map((b) => b.who), ...(!recorded.length && claimRole({ who: r.who }) === 'builder' ? [r.who] : []), ...(claimRow?.value && ['builder', 'runner'].includes(claimRole(claimRow.value)) ? [claimRow.value.who] : [])].filter(Boolean).map((x) => String(x).toLowerCase()))
      // OLA-251, third pass (OLA-278): Bart does not use the command line; his word is "done --proof 'Bart: …'"
      if (/\b(bart|kit|lead)\b/i.test(by)) die(`Refused: a check is not passed as "${by}" from the command line. Bart does not use it: what he says is recorded with issues.mjs done ${id} --proof "Bart: <his words>". Kit and the lead do not pass checks; a checker that did not build ${id} does.`)
      if (names.has(by.toLowerCase())) die(`a check is passed by someone who did not build ${id} ("${by}" is its builder). Run "issues.mjs ready ${id} --on <release>"; the lead starts a checker with a fresh context.`)
      const isBart = false
      if (!me.known) await writeOverride(db, { ticket: id, what: `a pass of check #${c.n} was tried by a caller the tracker could not identify (${me.why}); refused` })
      if (!me.known) die(`Refused: the tracker cannot tell who is passing this check (${me.why}). A pass is recorded from the Claude Code agent or session that did the check, so the builder cannot pass its own work under another name; run it there, without anything before the command that changes it. See scripts/venture/_who.mjs.`)
      const theirs = new Map([...recorded.filter((b) => b.caller).map((b) => [b.caller, `${b.via} as ${b.who}`]), ...(a.ready?.caller ? [[a.ready.caller, 'marked it ready']] : []), ...(claimRow?.value?.caller && ['builder', 'runner'].includes(claimRole(claimRow.value)) ? [[claimRow.value.caller, `holds its claim as ${claimRow.value.who}`]] : []), ...committers(id).map((x) => [x, `committed for ${id}`])])
      if (!isBart && theirs.has(me.id)) die(`Refused: this ${me.agent ? 'agent' : 'session'} built ${id} (${theirs.get(me.id)}), whatever name it gives (--by ${by}). The one who built it does not grade it: run "issues.mjs ready ${id} --on <release>"; the lead starts a checker.`)
      if (!on) die('--on "<release or build>" is required: which live version was checked')
      const file = str('shot') ?? str('log')
      const kase = str('case')
      if (!file && !kase) die('a pass needs something that shows it: --shot <screenshot> or --log <file> (or --case <id>@<place> for a run of the request test set)')
      if (file && (!existsSync(file) || statSync(file).size < 200)) die(`${file}: no such file, or it is empty`)
      if (kase) {
        // OLA-259: the case is looked up in the request tests' own result file, by its exact name, and must be working there
        const f = asksCases()
        await flushWays()
        if (!f.value) die(`--case: the request tests' result file could not be read (${f.error}); a pass by --case is checked against it`)
        const cs = caseState(kase, f.value.cases)
        if (cs.state === 'unknown') {
          const near = Object.keys(f.value.cases ?? {}).filter((k) => k.split('@')[0] === kase.split('@')[0] || k.includes(kase)).slice(0, 6)
          die(`--case: there is no case "${kase}" in the request tests' result file (release ${f.value.release}). Name it exactly as the file does, id@place${near.length ? `: ${near.join(', ')}` : ''}.`)
        }
        if (cs.state !== 'works') die(`--case: ${kase} is "${cs.state}" in the request tests' result file (${cs.tries ?? ''}${cs.release ? `, release ${cs.release}` : ''}): it does not show that it works`)
        c.case = { key: kase, release: cs.release, at: cs.at, tries: cs.tries }
      }
      c.evidence = [file ? `${file} (${statSync(file).size} bytes)` : null, kase ? `case ${kase}` : null].filter(Boolean).join('; ')
      c.on = on
    }
    Object.assign(c, { result: sub, by, saw, checked_at: now, ...(me.id ? { caller: me.id } : {}) })
    await saveAccept(id, a)
    if (sub === 'pass' && !(a.builders ?? []).some((b) => b.caller) && !a.ready?.caller && !committers(id).length) await writeOverride(db, { ticket: id, what: `check #${c.n} passed by ${by} on a ticket built before callers were recorded: the builder test was by name only` })
    await record([{ issue_id: id, kind: 'comment', body: `check #${c.n} (${c.at}) ${sub === 'pass' ? 'passed' : 'FAILED'}, by ${by}${me.known ? ` (${me.why})` : ''}: ${saw}` }])
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
  a.ready = { on: one('on'), at: new Date().toISOString(), by: typeof one('by') === 'string' ? one('by') : r.who, ...(me.id ? { caller: me.id } : {}) }
  if (me.id && !(a.builders ?? []).some((b) => b.caller === me.id)) a.builders = [...(a.builders ?? []), { who: a.ready.by, role: 'builder', caller: me.id, host: me.host, at: a.ready.at, via: 'ready' }]
  await saveAccept(id, a)
  await record([{ issue_id: id, kind: 'comment', body: `built and live on ${one('on')}: ready for a checker` }])
  console.log(`${id} is ready for a checker on ${one('on')}. It stays open until every check has passed.`)
} else if (cmd === 'say' || cmd === 'unchecked') {
  // What may be told to Bart about a ticket: read from the checks, never from memory or a builder's report.
  // A pass is about the version it was made on (OLA-264): on a ticket about the test server, a pass on
  // a release that is no longer live prints as "worked on an earlier version", never as WORKS. A pass by
  // a case of the request tests (OLA-251, OLA-259) says what that case says now in their result file:
  // "works" is passing with no fail between; 2 of 3 is "works sometimes"; a case the file does not hold
  // is not checked.
  const nowOf = (r, a, c, live, cases) => {
    const k = c.case?.key ?? /\bcase (\S+)/.exec(c.evidence ?? '')?.[1] ?? null
    let rels = releasesIn(c.on)
    if (k) {
      if (!cases?.value) return { word: 'NOT KNOWN NOW', ok: false, why: `its request test ${k} could not be read now (${cases?.error ?? 'no result file'})` }
      const cs = caseState(k, cases.value.cases)
      if (cs.state === 'unknown') return { word: 'NOT CHECKED', ok: false, why: `it was passed with the request test "${k}", which the request tests' result file does not hold (no such case, or spelled differently)` }
      if (cs.state === 'sometimes') return { word: 'WORKS SOMETIMES (2 of 3)', ok: false, why: `its request test ${k} passed twice with a fail between on its last run (${cs.release}); "works" is two passes in a row` }
      if (cs.state === 'fails') return { word: 'DOES NOT WORK NOW', ok: false, why: `passed ${when(c.checked_at)}, but its request test ${k} fails on its last run (${cs.tries ?? ''}, ${cs.release})` }
      if (cs.state === 'not run') return { word: 'NOT CHECKED', ok: false, why: `its request test ${k} was not run on the last run (${cs.release})` }
      if (cs.release) rels = [cs.release, ...rels]
    }
    if (!onServer(r, a, c)) return { word: 'WORKS', ok: true, why: `checked ${when(c.checked_at)} on ${c.on}` }
    if (!live?.value) return { word: 'WORKED, LIVE VERSION UNKNOWN', ok: false, why: `checked ${when(c.checked_at)} on ${c.on}; the test server's live release could not be read (${live?.error ?? 'no answer'}), so it is not known to be the one that was checked` }
    if (rels.includes(live.value)) return { word: 'WORKS', ok: true, why: `checked ${when(c.checked_at)} on ${live.value}, the live release${k ? `; its request test ${k} passes there` : ''}` }
    return { word: 'WORKED ON AN EARLIER VERSION', ok: false, why: `worked on an earlier version (${rels[0] ?? c.on}, checked ${when(c.checked_at)}); not checked on this one (${live.value})` }
  }
  if (cmd === 'say') {
    const id = normId(pos[0])
    const r = await get(id)
    const a = await accept(id)
    const v = verdict(r, a)
    console.log(`${r.id}  ${r.title}`)
    if (a.internal) console.log(`  nothing a person does or sees changes (${a.internal.why}); ${r.status === 'done' ? `closed: ${r.proof}` : 'not closed'}`)
    const live = onServer(r, a) && v.works.length ? liveRelease() : null
    const cases = v.works.some((c) => c.case || /\bcase \S/.test(c.evidence ?? '')) ? asksCases() : null
    await flushWays()
    if (live) console.log(live.value ? `  (the test server is on release ${live.value} now)` : `  (the test server's live release could not be read: ${live.error})`)
    let tell = true
    for (const c of v.works) {
      const n = nowOf(r, a, c, live, cases)
      if (!n.ok) tell = false
      console.log(`  ${n.word.padEnd(12)} ${c.at}: ${c.do} (${n.why})`)
    }
    for (const c of v.fails) console.log(`  DOES NOT WORK ${c.at}: ${c.do} -> ${c.saw}`)
    for (const c of v.open) console.log(`  NOT CHECKED  ${c.at}: ${c.do}`)
    for (const cell of v.uncovered) console.log(`  NOT CHECKED  ${cell}: no check written`)
    for (const k of a.skips) console.log(`  not offered  ${k.pattern}: ${k.why}`)
    if (!a.internal && !a.checks.length) console.log('  NOT CHECKED  anywhere: this ticket has no checks')
    console.log(v.ok && !a.internal && tell ? '  -> may be told: it works in the places above.' : a.internal ? '' : '  -> may NOT be told "it works". Say what works, what does not, and what nobody checked, in that order.')
  } else {
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
    // passes that no longer speak for the live version (OLA-264): in progress, or closed today or yesterday
    const recent = rows.filter((r) => r.status === 'in_progress' || (r.status === 'done' && r.day >= shiftDay(today, -1)))
    const withPasses = recent.filter((r) => (by.get(r.id)?.checks ?? []).some((c) => c.result === 'pass'))
    const live = withPasses.some((r) => onServer(r, by.get(r.id))) ? liveRelease() : null
    const cases = withPasses.some((r) => by.get(r.id).checks.some((c) => c.result === 'pass' && (c.case || /\bcase \S/.test(c.evidence ?? '')))) ? asksCases() : null
    await flushWays()
    const stale = withPasses.flatMap((r) => by.get(r.id).checks.filter((c) => c.result === 'pass').map((c) => ({ r, c, n: nowOf(r, by.get(r.id), c, live, cases) })).filter((x) => !x.n.ok))
    // OLA-279: the test server's own list of updates against the updates runner.mjs deploy allowed
    {
      const dl = fromMini('deploys-log', 'tail -20 ~/ola-staging/deploys.log', (o) => o)
      await flushWays()
      if (dl.value === null) console.log(`Updates of the test server: its list could not be read (${dl.error})`)
      else {
        const d = await checkDeploys(db, dl.value, { tool: 'issues.mjs unchecked' })
        console.log(`Updates of the test server outside runner.mjs deploy (${d.bad.length})${d.bad.length ? `: ${d.bad.map((x) => x.at).join(', ')} (each a line in issues.mjs overrides)` : ''}`)
      }
    }
    console.log(`Passed, but not on what is live now (${stale.length})${live ? (live.value ? `: the test server is on ${live.value}` : `: the live release could not be read (${live.error})`) : ''}`)
    for (const x of stale) console.log(`  ${x.r.id.padEnd(8)} #${x.c.n} ${x.n.word}: ${x.n.why}`)
  }
} else if (cmd === 'wait') {
  const id = normId(pos[0])
  await patch(id, { status: 'waiting', ...(one('what') ? { what: one('what') } : {}) })
  await releaseNoting(id, 'moved to waiting')
} else if (cmd === 'open') {
  const id = normId(pos[0])
  const r = await get(id)
  const a = await accept(id)
  // reopened: earlier passes are about an older version
  if (r.status === 'done' && a.checks.some((c) => c.result)) await saveAccept(id, { ...a, ready: null, checks: a.checks.map((c) => ({ ...c, earlier: [...(c.earlier ?? []), { result: c.result, by: c.by, at: c.checked_at, saw: c.saw }], result: null })) })
  await patch(id, { status: 'open' })
  await releaseNoting(id, 'moved to open')
} else if (cmd === 'drop') {
  const id = normId(pos[0])
  const r = await get(id)
  await patch(id, { status: 'dropped', finished_at: new Date().toISOString(), day: pacificDay(), ...(one('why') ? { proof: `dropped: ${one('why')}` } : {}), what: r.what })
  await releaseNoting(id, 'dropped')
} else if (cmd === 'edit') {
  const id = normId(pos[0])
  const f = {}
  for (const [k, col] of [['title', 'title'], ['what', 'what'], ['area', 'area'], ['pri', 'priority'], ['who', 'who'], ['proof', 'proof'], ['day', 'day']]) if (one(k) !== undefined) f[col] = one(k)
  if (one('week') !== undefined) f.week = one('week') === 'none' ? null : Number(one('week'))
  validate(f)
  if (one('lane') !== undefined) {
    // the lane is the ticket's (OLA-251): changed here, with the reason, on its thread
    const l = one('lane')
    const why = typeof one('why') === 'string' ? one('why').trim() : ''
    if (l === true || !LANES.includes(l)) die(`--lane must be one of: ${LANES.join(', ')}`)
    if (why.length < 15) die('--lane needs --why "what the ticket changes that puts it in that lane"')
    const r = await get(id)
    const a = await accept(id)
    const was = laneOf(r, a.lane)
    // OLA-251, third pass: whoever holds a ticket does not move it to another lane; only the lead's hold does
    const cl = (await liveClaims())[id]
    const leadHold = cl && claimRole(cl) === 'hold' && /^(lead|kit)$/i.test(String(cl.who).trim()) && (!cl.caller || cl.caller === me.id)
    if (cl && !leadHold) die(`Refused: ${id} is claimed by ${cl.who} (${claimRole(cl)}), and a ticket's lane is not changed by whoever holds it. Only the lead, holding it (issues.mjs claim ${id} --who lead), changes it.`)
    await saveAccept(id, { ...a, lane: l })
    await record([{ issue_id: id, kind: 'comment', body: `lane changed from ${was} to ${l}: ${why}` }])
    await writeOverride(db, { ticket: id, what: `lane changed from ${was} to ${l}${leadHold ? " under the lead's hold" : ' (unclaimed)'}: ${why}` })
    console.log(`${id}: lane ${was} -> ${l}`)
    if (!Object.keys(f).length) process.exit(0)
  }
  if (f.area !== undefined || f.title !== undefined) {
    // OLA-251, fourth pass: an area or title that moves the ticket to another lane is a lane change too
    const r = await get(id)
    const a = await accept(id)
    const was = laneOf(r, a.lane)
    const now = laneOf({ ...r, ...f }, a.lane)
    if (now !== was) {
      const cl = (await liveClaims())[id]
      const leadHold = cl && claimRole(cl) === 'hold' && /^(lead|kit)$/i.test(String(cl.who).trim()) && (!cl.caller || cl.caller === me.id)
      if (cl && !leadHold) die(`Refused: this ${f.area !== undefined ? 'area' : 'title'} moves ${id} from the ${was} lane to the ${now} lane, and ${id} is claimed by ${cl.who} (${claimRole(cl)}). A ticket's lane is not changed while someone holds it; change it after the claim ends.`)
      await writeOverride(db, { ticket: id, what: `lane changed from ${was} to ${now} by an edit of its ${Object.keys(f).filter((k) => k === 'area' || k === 'title').join(' and ')}${leadHold ? " under the lead's hold" : ' (unclaimed)'}` })
    }
  }
  await patch(id, f)
} else if (cmd === 'commit') {
  const id = normId(pos[0])
  await get(id)
  await attach(id, pos.slice(1))
  const a = await accept(id)
  if (me.id && !(a.builders ?? []).some((b) => b.caller === me.id)) await saveAccept(id, { ...a, builders: [...(a.builders ?? []), { who: typeof one('who') === 'string' ? one('who') : 'kit', role: 'builder', caller: me.id, host: me.host, at: new Date().toISOString(), via: 'commit' }] })
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
  console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split("\n").slice(1, 57).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
  process.exit(cmd ? 1 : 0)
}
