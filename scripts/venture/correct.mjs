#!/usr/bin/env node
// Record a correction, and refuse a fix that is no stronger than the one that already failed (2026-11-20).
//
// Bart, Nov 20: "THERE IS ZERO LEARNING AFTER ONE WEEK." The record agreed with him: 104 corrections
// in 8 days; every fix that was only written down came back (the 12 text-only fixes were followed by
// 5 to 13 repeats each); the same lesson ("use it the way he will") was written as a rule four times.
// A repeat was answered with another fix of the same kind. This tool is the only way a correction is
// recorded, and it makes that impossible: when a weakness comes back, its next fix must be of a
// stronger kind than every fix before it.
//
// The five kinds of fix, weakest first:
//   1  written down         a rule or a note the agent has to remember
//   2  shown at the moment  a hook or a template puts it in front of the agent when it applies
//   3  refused by code      a guard, a gate or a failing test stops the wrong action
//   4  checked by another   something that did not do the work checks it (a checker, an automatic run on the live thing)
//   5  taken away           the step is no longer the agent's to get wrong (automation does it, or the process changed)
//
//   node scripts/venture/correct.mjs add --title "short name of what went wrong" --words "<his words>" \
//        --did "<what the agent had done>" --cause "<the real cause>" --weakness <id> \
//        --fix "<what changed>" --level 3 --where "<file, command or ticket that carries the fix>" \
//        [--why-last "<why the last fix did not hold>"]   required when the weakness had a fix before
//        [--escape]        he met something broken or untrue after being told it was done or working
//        [--cannot "<why no stronger fix exists>"]        records the weakness as open, on the Learning page
//        [--owed OLA-n]    the stronger fix is not built yet: the correction is recorded NOW and the fix is
//                          listed as owed, carried by that ticket (it must exist; --fix/--level may be left out)
//        [--at "9:28 am"]  the time Bart said it (the heading shows it; "Recorded at" shows when the tool ran);
//                          --when is the same; "about 9:28 am" is kept as said
//        [--side ola] [--new "Name of a new weakness|what it is"]
//   --where, for a fix of kind 3 or stronger, names something that exists (OLA-251 check #6): a file in this
//   checkout (path[:line]), a command whose script exists (node scripts/x.mjs …), or a ticket in the tracker
//   (OLA-n). A plain word, a file or script that is not there, or a ticket that does not exist is refused.
//   node scripts/venture/correct.mjs fix <correction> --fix "<what changed>" --level 3 --where "<file>" [--why-last "…"]
//                                              settles an owed fix; refused when not stronger than the last or not built
//   node scripts/venture/correct.mjs at <correction> --at "10:58 am" [--day YYYY-MM-DD]
//                                              corrects the time of an entry recorded later than Bart said it (OLA-258):
//                                              the heading gets his time, the entry keeps the time it was recorded
//   node scripts/venture/correct.mjs owed      every owed fix, oldest first (sweep.mjs post refuses while one is
//                                              older than two days; the prompt hook and the Learning page show them)
//   node scripts/venture/correct.mjs list      every weakness: times seen, came back, strongest fix
//   node scripts/venture/correct.mjs escapes   per day: how often he met something broken after "it works"
// Writes apps/venture/private/CORRECTIONS.md (a numbered entry) and data/weaknesses.json together
// (VENTURE_PRIVATE=<folder> works on a copy of apps/venture/private instead, for tests).
//
// Since Nov 20, 1 pm (OLA-251): a correction is never held back. Until then `add` refused until the
// stronger fix existed, so corrections waited unrecorded (Nov 18: 9 written, 27 real). Now `add` always
// writes the entry and the weakness's `seen` at once; the escalation rule applies to the fix, which is
// either given with the correction or owed and settled later with `fix`.
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { OWED_DAYS, owedFixes, privPath } from './_weak.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const COR = privPath(root, 'CORRECTIONS.md')
const WEAK = privPath(root, 'data/weaknesses.json')
const argv = process.argv.slice(2)
const cmd = argv[0]
const opt = {}
for (let i = 1; i < argv.length; i++) if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[++i]
const str = (k) => (typeof opt[k] === 'string' && opt[k].trim() ? opt[k].trim() : null)
const die = (m) => (console.error(m), process.exit(1))
// OLA-251, eighteenth checker: add and fix read both ledger files, wait on the tracker and git, then write them
// back whole; two runs at once each wrote what they had read and one correction, with its fix, was lost with no
// line. One run at a time writes the ledger: a lock folder beside data/weaknesses.json, held from before the
// first read to exit, waited for up to two minutes, taken over when its holder is gone or it is ten minutes old.
if (cmd === 'add' || cmd === 'fix' || cmd === 'accept-notes') {
  const lock = `${realpathSync(dirname(WEAK))}/.correct.lock`
  const t0 = Date.now()
  for (;;) {
    try { mkdirSync(lock); writeFileSync(`${lock}/pid`, String(process.pid)); break } catch (e) {
      if (e.code !== 'EEXIST') throw e
      let pid = 0, age = 0
      try { pid = Number(readFileSync(`${lock}/pid`, 'utf8')); age = Date.now() - statSync(lock).mtimeMs } catch {}
      let alive = false
      if (pid) try { process.kill(pid, 0); alive = true } catch (k) { alive = k.code === 'EPERM' }
      if ((pid && !alive) || age > 600e3) { rmSync(lock, { recursive: true, force: true }); continue }
      if (Date.now() - t0 > 120e3) die(`Refused: another correct.mjs run is writing the ledger (lock ${lock}, pid ${pid || '?'}); run this again when it ends.`)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
    }
  }
  process.on('exit', () => { try { if (Number(readFileSync(`${lock}/pid`, 'utf8')) === process.pid) rmSync(lock, { recursive: true, force: true }) } catch {} })
}
const KINDS = { 1: 'written down', 2: 'shown at the moment', 3: 'refused by code', 4: 'checked by another', 5: 'taken away' }
export const levelOf = (g) => g.level ?? (g.enforced ? 3 : 1)
const pacific = (o) => new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', ...o })
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

/** What the next fix of a weakness must be: { prev, cameBack, need }. recorded: the correction is in `seen` already. */
export function required(w, { recorded = false } = {}) {
  const guards = w.guards ?? []
  const prev = guards.length ? Math.max(...guards.map(levelOf)) : 0
  const first = guards.map((g) => g.day).sort()[0]
  const cameBack = first ? w.seen.filter((s) => s.day > first).length + (recorded ? 0 : 1) : 0 // + this one
  let need = prev + 1
  if (cameBack >= 3) need = Math.max(need, 3) // three repeats: remembering has been tried enough
  if (prev >= 4) need = 4 // already checked by another: the hole in that check is what gets fixed
  return { prev, cameBack, need: Math.min(need, 5) }
}

const weak = () => JSON.parse(readFileSync(WEAK, 'utf8'))

// OLA-251, fifteenth checker: data/weaknesses.json decides how strong the next fix must be (its guards and
// counts), and it is a file anyone can edit. The tracker keeps the fingerprint of every version correct.mjs
// wrote (venture_state weaknesses-fp; the replay results steer-replay.mjs adds are left out), and the audit
// writes a line, each day, while the file matches none of them: an edit past correct.mjs is read by a person.
const fpOf = (w) => createHash('sha256').update(JSON.stringify((({ replay, ...rest }) => rest)(w))).digest('hex').slice(0, 16)
const fpList = (list) => createHash('sha256').update(list.map(fpOf).join('|')).digest('hex').slice(0, 16)
// a weaknesses.json that matches no version correct.mjs wrote is a line (each day); run by audit, and by add
// and fix before they read the file, so an edit cannot be made known by the next write
async function checkFp(db, writeOverride, ownLine) {
  const fpRow = (await db.from('venture_state').select('value').eq('key', 'weaknesses-fp').maybeSingle()).data?.value
  const cur = weak()
  if (!fpRow) return recordFp(cur)
  // only the version correct.mjs wrote last: an older one copied back is a rollback (sixteenth checker); a
  // machine that has not pulled the notes yet shows the same way, and should pull
  if ((fpRow.known ?? []).at(-1) === fpList(cur)) return false
  const ids = cur.filter((w) => fpRow.last?.[w.id] !== fpOf(w)).map((w) => w.id)
  const gone = Object.keys(fpRow.last ?? {}).filter((id) => !cur.some((w) => w.id === id))
  const dayNow = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  // keyed by this file AND the version written last (seventeenth checker: keyed by the file alone, a version
  // flagged once could be copied back again after later writes, the same day, with no new line)
  const key = `weak-changed-${fpList(cur)}-${(fpRow.known ?? []).at(-1) ?? 'none'}-${dayNow}`
  if (!(await ownLine(db, key))) await writeOverride(db, { key, what: `data/weaknesses.json is not the version correct.mjs wrote last (a hand edit, a rollback, or notes not pulled on this machine; changed: ${[...ids, ...gone.map((g) => g + ' removed')].join(', ') || 'order'}); it decides how strong the next fix must be: read what changed`, tool: 'correct.mjs' })
  return true
}
async function fpGate() {
  if (onCopy && !process.env.VENTURE_TRACKER_FAKE) return
  try {
    const { writeOverride } = await import('./_overrides.mjs')
    const db = await trackerDb()
    const ownLine = async (d, key) => { const x = await d.from('venture_state').select('value').eq('key', 'override:' + key).maybeSingle(); return x.data?.value?.tool === 'correct.mjs' }
    // add and fix refuse to read a file that is not the version written last: its guards and counts decide how
    // strong a fix must be and which number comes next (seventeenth checker: after a rollback a kind-1 fix was
    // taken where kind 4 was due, and a number was used twice). Pull the notes; a deliberate edit is made known
    // with correct.mjs accept-notes --why "…", which is a line.
    if (await checkFp(db, writeOverride, ownLine)) {
      console.error('Refused: data/weaknesses.json is not the version correct.mjs wrote last (a line is in issues.mjs overrides). Pull the notes (node scripts/venture/sync.mjs pull) and run this again; if the file was changed on purpose, node scripts/venture/correct.mjs accept-notes --why "what was changed and why".')
      process.exit(1)
    }
  } catch (e) {
    console.error(`(the check of data/weaknesses.json against the tracker did not run: ${e.message})`)
  }
}
async function recordFp(list) {
  if (onCopy && !process.env.VENTURE_TRACKER_FAKE) return
  try {
    const db = await trackerDb()
    const had = (await db.from('venture_state').select('value').eq('key', 'weaknesses-fp').maybeSingle()).data?.value ?? { known: [] }
    const known = [...(had.known ?? []).filter((x) => x !== fpList(list)), fpList(list)].slice(-300)
    await db.from('venture_state').upsert({ key: 'weaknesses-fp', value: { known, last: Object.fromEntries(list.map((w) => [w.id, fpOf(w)])), at: new Date().toISOString() }, at: new Date().toISOString() })
  } catch (e) {
    console.error(`(the fingerprint of data/weaknesses.json was not stored: ${e.message})`)
  }
}

/** Why a fix of `level` is refused for weakness w (null when it is accepted). */
function fixProblem(w, level, { prev, cameBack, need }, { whyLast = str('why-last') } = {}) {
  if (prev && !whyLast) return `"${w.name}" had a fix before (strongest so far: ${prev}, ${KINDS[prev]}) and it came back.\nSay why that fix did not hold: --why-last "…". The new fix has to answer that, not repeat it.`
  if (level < need) return (
    `Refused: "${w.name}" has now come back ${cameBack} time(s) after a fix, and its strongest fix so far is ${prev} (${KINDS[prev] ?? 'none'}).\n` +
    `The next fix must be at least ${need} (${KINDS[need]}); you gave ${level} (${KINDS[level]}).\n` +
    `Another rule of the same kind is what failed. Build the stronger fix first, then record it with --where.\n` +
    `If no stronger fix exists, say so: --cannot "<why>". The weakness then shows as open on the Learning page.`)
  if (level >= 3 && !str('where')) return `a fix of kind ${level} (${KINDS[level]}) names what carries it: --where "<file, command or ticket>"`
  return null
}

const RUNNERS = new Set(['node', 'python3', 'python', 'bash', 'sh', 'zsh', 'npx', 'tsx', 'pnpm', 'deno'])
const isFile = (p) => [root + p, p].some((x) => existsSync(x) && statSync(x).isFile())
/** Why --where names nothing that exists (null when it does): a file, a command whose script exists, or a ticket. */
async function whereProblem(where) {
  if (!where) return null
  const w = where.trim()
  if (/^OLA-\d+$/i.test(w)) return (await ticketStatus(w.toUpperCase())) ? null : `--where: there is no ticket ${w} in the tracker.`
  const toks = w.split(/\s+/)
  if (RUNNERS.has(toks[0])) {
    const script = toks.slice(1).find((t) => !t.startsWith('-') && !RUNNERS.has(t))
    if (!script) return `--where: "${w}" is a command with no script to run.`
    return isFile(script.replace(/:\d+$/, '')) ? null : `--where: the command runs ${script}, which does not exist in this checkout.`
  }
  const path = toks[0].replace(/[,;]$/, '').replace(/:\d+(-\d+)?$/, '')
  if (isFile(path)) return null
  return `--where: "${w}" names no file in this checkout, no command whose script exists and no ticket (OLA-n). Name what carries the fix: the file that refuses it, the command that checks it, or the ticket that holds the check. The fix is recorded after it is built, not before.`
}

async function trackerDb() {
  if (process.env.VENTURE_TRACKER_FAKE) return (await import('./_fakedb.mjs')).fakeClient(process.env.VENTURE_TRACKER_FAKE)
  const { createClient } = await import('@supabase/supabase-js')
  const env = existsSync(root + '.env.local') ? Object.fromEntries(readFileSync(root + '.env.local', 'utf8').split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')])) : process.env
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}
/** A ticket's status in the tracker (read only), or null when there is no such ticket. */
async function ticketStatus(id) {
  const { data, error } = await (await trackerDb()).from('venture_issues').select('id, status').eq('id', id).maybeSingle()
  if (error) die(`the tracker could not be read (${error.message})`)
  return data?.status ?? null
}
/** Why --where cannot be the fix that settles owed fix o (null when it can) (OLA-251, third pass): a file
 *  changed by a commit made after the correction was recorded (asked of git), or a ticket that is closed
 *  with every check passed. The ticket that carries the owed fix, an open ticket, and a file untouched
 *  since before the correction are refused. */
async function settleProblem(where, o) {
  const p = await whereProblem(where)
  if (p) return p
  const w = where.trim()
  if (/^OLA-\d+$/i.test(w)) {
    const id = w.toUpperCase()
    if (id === o.issue) return `--where: ${id} is the ticket that carries this owed fix; it settles the fix only by what it built. Name the file it changed, or a ticket closed with every check passed.`
    const st = await ticketStatus(id)
    if (st !== 'done') return `--where: ${id} is ${st === 'in_progress' ? 'in progress' : st}; a ticket settles a fix only when it is closed with every check passed.`
    const acc = (await (await trackerDb()).from('venture_state').select('value').eq('key', 'accept:' + id).maybeSingle()).data?.value
    const checks = acc?.checks ?? []
    if (!checks.length || checks.some((c) => c.result !== 'pass')) return `--where: ${id} is closed, but ${checks.length ? `not every check passed (${checks.filter((c) => c.result !== 'pass').map((c) => '#' + c.n).join(', ')})` : 'it has no checks'}; a ticket settles a fix only when every check passed.`
    return null
  }
  const toks = w.split(/\s+/)
  const file = (RUNNERS.has(toks[0]) ? toks.slice(1).find((t) => !t.startsWith('-') && !RUNNERS.has(t)) : toks[0]).replace(/[,;]$/, '').replace(/:\d+(-\d+)?$/, '')
  // only pushed work counts (origin/main, fetched now), never a local commit (OLA-251, fifth pass)
  try { execFileSync('git', ['-C', root, 'fetch', '--quiet', 'origin', 'main'], { stdio: 'ignore', timeout: 20000 }) } catch {}
  const log = (extra) => {
    try { return execFileSync('git', ['-C', root, 'log', 'origin/main', `--since=${o.since}`, '--format=%h %s', ...extra, '--', file], { encoding: 'utf8', timeout: 20000 }).trim() } catch { return '' }
  }
  if (!log([])) return `--where: ${file} has not been changed by any commit since the correction was recorded (${o.since}); a file settles an owed fix only when a commit after the correction changed it.`
  // OLA-251, fourth pass: and that commit is the owed fix's own work, naming its ticket; an unrelated commit
  // that happened to touch the file (runner.mjs by 036ed3fe for correction 103) settles nothing
  if (!o.issue) return `--where: this owed fix names no ticket, so no commit can be shown to be its work; settle it with a ticket closed with every check passed.`
  // the ticket is named in the subject's [OLA-n] tag, not anywhere in the body (4fcb6747 mentions "OLA-245 check #2")
  const tag = new RegExp(`\\[(?:[^\\]]*[ ,])?${o.issue}(?:[ ,][^\\]]*)?\\]`)
  const mine = log([]).split('\n').filter((l) => tag.test(l)).map((l) => l.split(' ')[0]).join('\n')
  if (!mine) return `--where: ${file} was changed since the correction, but by no commit naming ${o.issue}, the ticket that owes this fix. A file settles it only when ${o.issue}'s own commit changed it.`
  settledBy = mine.split('\n')[0]
  return null
}
let settledBy = null
async function ticketMustExist(id) {
  const st = await ticketStatus(id)
  if (!st) die(`--owed: there is no ticket ${id}. Open it first: node scripts/venture/issues.mjs add "…" --area ops --pri P1`)
  if (['done', 'dropped'].includes(st)) die(`--owed: ${id} is ${st}; a fix that is still owed needs an open ticket`)
}
// A copy of the notes is a folder that is not any checkout's apps/venture/private (OLA-251, sixth pass: a
// worktree has no such folder, so comparing with this checkout's let the real notes pass as a copy); any
// case, since the Mac's disk ignores it
// (and a folder whose ledger files are links into such a folder is that folder, OLA-251 eighth pass)
const REAL_NOTES = /\/apps\/venture\/private(\/|$)/i
const onCopy = !!process.env.VENTURE_PRIVATE && (() => {
  try {
    const dir = process.env.VENTURE_PRIVATE
    if ([dir, `${dir}/CORRECTIONS.md`, `${dir}/data`, `${dir}/data/weaknesses.json`].some((x) => existsSync(x) && REAL_NOTES.test(realpathSync(x)))) return false
    // a hard link is a second name for the same file: a ledger file with more than one name is not a copy (ninth checker)
    return ![`${dir}/CORRECTIONS.md`, `${dir}/data/weaknesses.json`].some((x) => existsSync(x) && statSync(x).nlink > 1)
  } catch {
    return true
  }
})()
// the real notes with a copy of the tracker would settle the real ledger and put its line in the copy
if (process.env.VENTURE_TRACKER_FAKE && !onCopy) die(`Refused: VENTURE_TRACKER_FAKE is set (a copy of the tracker) while the notes are the real ones${process.env.VENTURE_PRIVATE ? ` (${process.env.VENTURE_PRIVATE})` : ''}. Test on a copy of both, or on neither.`)
// On a copy of the notes (VENTURE_PRIVATE) nothing goes to the live page: say so instead of "sync.mjs push" (OLA-262).
const NEXT = process.env.VENTURE_PRIVATE ? `(a copy of the notes, ${process.env.VENTURE_PRIVATE}: nothing to push; sync.mjs push refuses while VENTURE_PRIVATE is set)` : 'next: node scripts/venture/sync.mjs push'
const TIME = /^(about |around |~)?\d{1,2}(:\d{2})?\s*(am|pm)$/i
/** Why a time Bart said is refused (null when it is fine) (OLA-251, third pass): a real time of day, and,
 *  on today's date, not later than the clock. date: "November 20, 2026" or null for today. */
function timeProblem(said, date = null) {
  const m = /^(?:about |around |~)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(said)
  if (!m) return `--at "${said}": the time he said it, like "10:58 am" or "about 11:15 am"`
  const h = Number(m[1])
  const mi = Number(m[2] ?? 0)
  if (h < 1 || h > 12 || mi > 59) return `--at "${said}" is not a time of day`
  const isToday = !date || date === pacific({ month: 'long', day: 'numeric', year: 'numeric' })
  const mins = (h % 12 + (m[3].toLowerCase() === 'pm' ? 12 : 0)) * 60 + mi
  const [nh, nm] = pacific({ hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).split(':').map(Number)
  if (isToday && mins > (nh % 24) * 60 + nm) return `--at "${said}" is later than the clock (${pacific({ hour: 'numeric', minute: '2-digit' }).toLowerCase()} now): he cannot have said it yet`
  return null
}

// the tracker's ledger lock, across machines (_ledgerlock.mjs); a copy of the notes with the real tracker takes none
if ((cmd === 'add' || cmd === 'fix' || cmd === 'accept-notes') && (!onCopy || process.env.VENTURE_TRACKER_FAKE)) {
  const L = await import('./_ledgerlock.mjs')
  const owner = `${(await import('node:os')).hostname()} pid ${process.pid} ${Date.now()}`
  const why = await L.acquire(owner)
  if (why) die(`Refused: ${why}.`)
  process.on('exit', () => { try { execFileSync('node', [fileURLToPath(new URL('./_ledgerlock.mjs', import.meta.url)), 'release', owner], { stdio: 'ignore', env: process.env, timeout: 30e3 }) } catch {} })
}
let newWeakLine = null
if (cmd === 'add') {
  await fpGate()
  const [title, words, did, cause, fix] = ['title', 'words', 'did', 'cause', 'fix'].map(str)
  const words_ = words
  if (!title || !words || !did || !cause) die('add needs --title, --words (his words), --did (what the agent had done) and --cause (the real cause)')
  const list = weak()
  let w = list.find((x) => x.id === str('weakness'))
  if (str('new')) {
    const [name, what] = str('new').split('|')
    if (!str('weakness') || !name || !what) die('--new "Name|what it is" needs --weakness <new-id> too')
    if (w) die(`weakness ${w.id} exists already`)
    // twenty-first checker: a new weakness needs only a kind-1 fix, so filing a correction under a fresh copy of
    // an existing one skipped the fix it was due. The same id in another case, or the same name, is refused;
    // every new weakness is a line naming the closest existing one, for a person to read the same day
    const norm = (x) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
    const same = list.find((x) => norm(x.id) === norm(str('weakness')) || norm(x.name) === norm(name))
    if (same) die(`Refused: weakness ${same.id} ("${same.name}") is the same one; file the correction under --weakness ${same.id}`)
    const words = (x) => new Set(String(x).toLowerCase().match(/[a-z]{4,}/g) ?? [])
    const mineW = words(`${name} ${what}`)
    const closest = list.map((x) => ({ x, k: [...words(`${x.name} ${x.what ?? ''}`)].filter((t) => mineW.has(t)).length })).sort((a, b) => b.k - a.k)[0]?.x
    newWeakLine = `a new weakness ${str('weakness')} ("${name.trim()}") was started, which needs only a kind-1 fix; the closest existing one is ${closest ? `${closest.id} ("${closest.name}")` : 'none'}: read whether the correction belongs there`
    w = { id: str('weakness'), side: str('side') ?? 'kit', name: name.trim(), what: what.trim(), seen: [], guards: [], now: '' }
    list.push(w)
  }
  if (!w) die(`--weakness must be one of:\n${list.map((x) => `  ${x.id.padEnd(18)} ${x.side}  ${x.name}`).join('\n')}\n(or a new one: --weakness new-id --new "Name|what it is")`)
  const { prev, cameBack, need } = required(w)
  const repeat = w.seen.length > 0
  const cannot = str('cannot')
  const owedIssue = str('owed')
  const level = Number(opt.level)
  // the fix given with the correction, if any, is judged exactly as before; a fix that is not there yet is owed
  let owed = null
  if (owedIssue) {
    if (!/^OLA-\d+$/.test(owedIssue)) die('--owed names the ticket that builds the fix, like OLA-251')
    await ticketMustExist(owedIssue)
    if (fix && level >= need && !fixProblem(w, level, { prev, cameBack, need }) && !(await whereProblem(str('where')))) die(`--owed: the fix you gave (kind ${level}) is strong enough and built; record it without --owed`)
    owed = { issue: owedIssue, need }
  } else if (!cannot) {
    if (!fix || !(level >= 1 && level <= 5)) die(`add needs --fix "<what changed>" and --level 1..5:\n${Object.entries(KINDS).map(([n, k]) => `  ${n}  ${k}`).join('\n')}\nor, when that fix is not built yet: --owed OLA-n (the ticket that builds it). The correction is then recorded now.`)
    let problem = fixProblem(w, level, { prev, cameBack, need }) ?? (level >= 3 || str('where') ? await whereProblem(str('where')) : null)
    // a ticket named as the fix carries it only when it is closed with every check passed, as for fix
    // (twentieth checker: add took any existing ticket or file as a kind-4 or kind-5 fix)
    if (!problem && /^OLA-\d+$/i.test(str('where') ?? '')) problem = await settleProblem(str('where'), { issue: null, since: new Date().toISOString() })
    if (problem) die(`${problem}\n\nThe correction is NOT recorded yet. Record it now and owe the fix: add --owed OLA-n (open the ticket with issues.mjs add), then settle it with: correct.mjs fix <n> --fix … --level ${need} --where …`)
  }
  const text = readFileSync(COR, 'utf8')
  // a number is never used twice: past every number in CORRECTIONS.md, in data/weaknesses.json and in the
  // tracker's list of owed fixes (thirteenth checker: 106 was in weaknesses.json and the tracker but not in
  // CORRECTIONS.md, so the next correction was numbered 106 again and took over its owed row)
  const refNums = JSON.stringify(list).match(/"correction (\d+)"/g) ?? []
  let heldNums = []
  try { heldNums = ((await (await trackerDb()).from('venture_state').select('key').like('key', 'owed-fix:%')).data ?? []).map((r) => Number(r.key.slice(9))) } catch {}
  const n = Math.max(0, ...[...text.matchAll(/^## (\d+)\. /gm)].map((m) => Number(m[1])), ...refNums.map((x) => Number(x.replace(/\D/g, ''))), ...heldNums.filter(Number.isFinite)) + 1
  const date = pacific({ month: 'long', day: 'numeric', year: 'numeric' })
  const said = str('at') ?? str('when')
  if (said && timeProblem(said)) die(timeProblem(said))
  const recordedAt = pacific({ hour: 'numeric', minute: '2-digit' }).toLowerCase()
  const time = said ? said.toLowerCase() : recordedAt
  const entry = [
    `## ${n}. ${date}, ${time}: ${title}${repeat ? ` (REPEAT: "${w.name}", seen ${w.seen.length} time(s) before)` : ''}`,
    '',
    `His words: ${/^["“]/.test(words) ? words : `"${words}"`}`,
    `What happened: ${did}`,
    `Cause: ${cause}`,
    `Weakness: ${w.id}${opt.escape ? ' (ESCAPE: he met it after being told it was done or working)' : ''}`,
    ...(said && said.toLowerCase() !== recordedAt ? [`Recorded at: ${recordedAt} (Bart said it at ${said.toLowerCase()})`] : []),
    ...(str('why-last') ? [`Why the last fix did not hold: ${str('why-last')}`] : []),
    cannot ? `No stronger fix found: ${cannot}` : owed ? `Fix OWED (kind ${need} or stronger, ${KINDS[need]}; ${owed.issue}): not built yet. Settle with: correct.mjs fix ${n} --fix … --level ${need} --where …` : `Fix (kind ${level}, ${KINDS[level]}${str('where') ? `; ${str('where')}` : ''}): ${fix}`,
    '',
  ].join('\n')
  writeFileSync(COR, text.replace(/\n*$/, '\n\n') + entry)
  w.seen.push({ day: today(), ref: `correction ${n}`, ...(opt.escape ? { escape: true } : {}) })
  if (cannot) w.stuck = { day: today(), why: cannot, at_level: prev }
  else if (owed) (w.owed ??= []).push({ ref: `correction ${n}`, since: new Date().toISOString(), issue: owed.issue, need, ...(str('why-last') ? { why_last: str('why-last') } : {}) })
  else {
    w.guards.push({ day: today(), what: fix, enforced: level >= 3, level, ...(str('where') ? { where: str('where') } : {}) })
    delete w.stuck
  }
  writeFileSync(WEAK, JSON.stringify(list, null, 2) + '\n')
  await recordFp(list)
  if (owed && (!onCopy || process.env.VENTURE_TRACKER_FAKE)) {
    const o = w.owed.at(-1)
    try {
      const tdb = await trackerDb()
      const had = (await tdb.from('venture_state').select('value').eq('key', `owed-fix:${n}`).maybeSingle()).data
      if (had && !had.value?.settled) {
        const { writeOverride } = await import('./_overrides.mjs')
        await writeOverride(tdb, { ticket: o.issue, what: `correction ${n}'s owed fix replaced another owed fix under the same number in the tracker's list (${had.value?.ref}, ${had.value?.issue}, since ${had.value?.since}): read which fix is owed`, tool: 'correct.mjs' })
      }
      await tdb.from('venture_state').upsert({ key: `owed-fix:${n}`, value: { ref: o.ref, issue: o.issue, since: o.since, need: o.need, settled: null }, at: new Date().toISOString() })
    } catch (e) { console.error(`(the tracker's list of owed fixes was not updated: ${e.message}; correct.mjs audit adds it)`) }
  }
  // a fix given with the correction is the agent's own word that it is built: whether the file or ticket
  // carries it is the same judgment as settling an owed fix, so a fix of kind 3 or stronger, and a "no stronger
  // fix" claim, are a line a person reads the same day, as every settle is (twentieth checker)
  // twenty-second checker: which weakness a correction is filed under decides how strong its fix must be,
  // and that is the agent's own pick (the same correction refused under my-reading at kind 1 was taken under
  // ola-places). No script can say where a correction belongs, so a fix of kind 1 or 2 given where the
  // weakness closest in words to the correction would need more is a line naming that weakness
  // twenty-third checker: also when the fix is owed (an owed fix under a lower-bar weakness owed less), and
  // words most weaknesses share say nothing: each shared word counts by how rare it is among the weaknesses
  // (log N/df), the chosen weakness is ranked too, and a line is written only when another one is clearly closer
  const given = owed ? need : cannot ? null : level
  if (given !== null && given <= 3 && !newWeakLine) {
    const toks = (x) => new Set(String(x).toLowerCase().match(/[a-z]{4,}/g) ?? [])
    const docs = list.map((x) => ({ x, t: toks(`${x.id.replace(/-/g, ' ')} ${x.name} ${x.what ?? ''}`) }))
    const df = new Map()
    for (const d of docs) for (const t of d.t) df.set(t, (df.get(t) ?? 0) + 1)
    const mineW = toks(`${title} ${words_ ?? ''} ${did} ${cause}`)
    const score = (d) => [...d.t].filter((t) => mineW.has(t)).reduce((s, t) => s + Math.log(docs.length / df.get(t)), 0)
    const rank = docs.map((d) => ({ x: d.x, s: score(d) })).sort((a, b) => b.s - a.s)
    const top = rank[0]
    const chosen = rank.find((r) => r.x.id === w.id)?.s ?? 0
    if (top && top.x.id !== w.id && top.s >= 2.5 && top.s >= chosen * 1.5) {
      const r2 = required(top.x)
      if (r2.need > given) newWeakLine = `filed under ${w.id} with ${owed ? `a fix owed at kind ${given}` : `a kind-${given} fix`}; by its words it is closest to ${top.x.id} ("${top.x.name}"), whose next fix must be kind ${r2.need}: read where the correction belongs`
    }
  }
  if (newWeakLine && (!onCopy || process.env.VENTURE_TRACKER_FAKE)) {
    try { const { writeOverride } = await import('./_overrides.mjs'); await writeOverride(await trackerDb(), { what: `correction ${n}: ${newWeakLine}${onCopy ? ` (on a copy of the notes, ${process.env.VENTURE_PRIVATE})` : ''}`, tool: 'correct.mjs' }) } catch (e) { console.error(`(the line for the new weakness was not written: ${e.message})`) }
  }
  if ((cannot || (!owed && level >= 3)) && (!onCopy || process.env.VENTURE_TRACKER_FAKE)) {
    try {
      const { writeOverride } = await import('./_overrides.mjs')
      await writeOverride(await trackerDb(), { what: cannot ? `correction ${n} (${w.id}) recorded with no stronger fix ("${cannot}"), so no fix is owed: read whether that is so${onCopy ? ` (on a copy of the notes, ${process.env.VENTURE_PRIVATE})` : ''}` : `correction ${n} (${w.id}) recorded with its fix already built, kind ${level} (${KINDS[level]}), at ${str('where')}: read whether that carries the fix${onCopy ? ` (on a copy of the notes, ${process.env.VENTURE_PRIVATE})` : ''}`, tool: 'correct.mjs' })
    } catch (e) { console.error(`(the line for this fix was not written: ${e.message})`) }
  }
  console.log(`correction ${n} recorded under "${w.name}" (${w.side}); seen ${w.seen.length} time(s)${cannot ? '; NO stronger fix: shown as open' : owed ? `; fix OWED (kind ${need} or stronger, ${owed.issue}): settle with correct.mjs fix ${n} … within ${OWED_DAYS} days` : `; fix kind ${level} (${KINDS[level]})`}`)
  console.log(NEXT)
} else if (cmd === 'fix') {
  await fpGate()
  // Settles an owed fix. The escalation rule is the same as for a fix given with the correction.
  const num = Number(String(argv[1] ?? '').replace(/^correction\s*/i, ''))
  if (!num) die('usage: correct.mjs fix <correction number> --fix "<what changed>" --level 1..5 --where "<file, command or ticket>" [--why-last "…"]')
  const list = weak()
  const w = list.find((x) => (x.owed ?? []).some((o) => o.ref === `correction ${num}`))
  if (!w) die(`correction ${num} has no owed fix (correct.mjs owed lists them)`)
  const o = w.owed.find((x) => x.ref === `correction ${num}`)
  const fix = str('fix')
  const level = Number(opt.level)
  if (!fix || !(level >= 1 && level <= 5)) die(`fix needs --fix "<what changed>" and --level 1..5 (at least ${o.need}, ${KINDS[o.need]})`)
  const req = required(w, { recorded: true })
  // the kind the tracker recorded when the fix was owed counts too: the notes' copy can be edited (fourteenth checker)
  let heldNeed = 0
  if (!onCopy || process.env.VENTURE_TRACKER_FAKE) {
    try { heldNeed = Number((await (await trackerDb()).from('venture_state').select('value').eq('key', `owed-fix:${num}`).maybeSingle()).data?.value?.need ?? 0) } catch {}
  }
  const need = Math.max(o.need, req.need, heldNeed)
  if (level < need) die(`Refused: correction ${num}'s fix must be kind ${need} or stronger (${KINDS[need]}); kind ${level} is not`)
  const problem = fixProblem(w, level, { ...req, need }, { whyLast: str('why-last') ?? o.why_last }) ?? (await settleProblem(str('where') ?? '', o))
  if (problem) die(problem)
  w.guards.push({ day: today(), what: fix, enforced: level >= 3, level, ...(str('where') ? { where: str('where') } : {}), ...(settledBy ? { commit: settledBy } : {}), settles: o.ref })
  w.owed = w.owed.filter((x) => x !== o)
  if (!w.owed.length) delete w.owed
  delete w.stuck
  // the entry in CORRECTIONS.md gets the fix under its OWED line
  const text = readFileSync(COR, 'utf8')
  const at = text.search(new RegExp(`^## ${num}\\. `, 'm'))
  if (at < 0) die(`correction ${num} is not in CORRECTIONS.md`)
  const next = text.slice(at + 1).search(/^## /m)
  const endAt = next < 0 ? text.length : at + 1 + next
  const block = text.slice(at, endAt).replace(/\n*$/, '')
  const line = `Fix settled ${pacific({ month: 'long', day: 'numeric' })} (kind ${level}, ${KINDS[level]}${str('where') ? `; ${str('where')}` : ''}${settledBy ? `, changed by ${settledBy} [${o.issue}]` : ''}): ${fix}`
  writeFileSync(COR, text.slice(0, at) + block + '\n' + line + '\n' + (next < 0 ? '' : '\n' + text.slice(endAt).replace(/^\n+/, '')))
  writeFileSync(WEAK, JSON.stringify(list, null, 2) + '\n')
  await recordFp(list)
  console.log(`correction ${num}: owed fix settled under "${w.name}", kind ${level} (${KINDS[level]})`)
  // OLA-251, fifth pass: whether the file or ticket really carries the fix (not a comment committed under
  // the ticket's tag, not an unrelated closed ticket) is a judgment no script makes, so every settle is a
  // line in the overrides that a person reads the same day
  {
    const what = settledBy
      ? `owed fix of correction ${num} (${o.issue}) settled by ${str('where')}, changed by ${settledBy}: read whether that change carries the fix`
      : `owed fix of correction ${num} (${o.issue}) settled by ${str('where')}, not by ${o.issue}'s own commit: read whether it carries the fix`
    // OLA-251, tenth pass: written whatever the notes are. Telling a copy from the real notes by the folder
    // could always be walked around (a symlink, a case, a hard link, swapping the files while the tool
    // waits on git), so a settle on a copy is a line too, marked so the reader can pass over a test.
    const { writeOverride } = await import('./_overrides.mjs')
    // the tracker's own list of owed fixes (correct.mjs audit): settled there only from the real notes
    if (!onCopy || process.env.VENTURE_TRACKER_FAKE) await (await trackerDb()).from('venture_state').upsert({ key: `owed-fix:${num}`, value: { ref: o.ref, issue: o.issue, since: o.since, settled: new Date().toISOString() }, at: new Date().toISOString() })
    await writeOverride(await trackerDb(), { ticket: o.issue, what: onCopy && !process.env.VENTURE_TRACKER_FAKE ? `(on a copy of the notes, ${process.env.VENTURE_PRIVATE}) ${what}` : what, tool: 'correct.mjs' })
  }
  console.log(NEXT)
} else if (cmd === 'accept-notes') {
  // a deliberate change to data/weaknesses.json made past this tool: stored as the version written last, with a line
  const why = argv[argv.indexOf('--why') + 1]
  if (!argv.includes('--why') || !why || why.startsWith('--') || why.trim().length < 15) { console.error('accept-notes needs --why "what was changed and why" (15 characters or more)'); process.exit(1) }
  if (onCopy && !process.env.VENTURE_TRACKER_FAKE) { console.log('a copy of the notes: nothing to accept'); process.exit(0) }
  const { writeOverride } = await import('./_overrides.mjs')
  const db = await trackerDb()
  const list = weak()
  await writeOverride(db, { key: `weak-accepted-${fpList(list)}-${Date.now()}`, what: `data/weaknesses.json accepted as it is, past correct.mjs (${why}); it decides how strong the next fix must be: read what changed`, tool: 'correct.mjs' })
  await recordFp(list)
  console.log('accepted; a line is in issues.mjs overrides')
} else if (cmd === 'at') {
  // OLA-258: an entry recorded later than Bart said it gets his time in its heading; the time it was recorded stays in the entry
  const num = Number(String(argv[1] ?? '').replace(/^correction\s*/i, ''))
  const said = str('at')
  if (!num || !said || !TIME.test(said)) die('usage: correct.mjs at <correction number> --at "10:58 am" (the time Bart said it; "about 11:15 am" is kept as said)')
  const text = readFileSync(COR, 'utf8')
  const re = new RegExp(`^## ${num}\\. ([A-Z][a-z]+ \\d{1,2}, \\d{4}), ([^:]*?\\d{1,2}:\\d{2} ?[ap]m)((?: \\([^)]*\\))?): `, 'm')
  const m = re.exec(text)
  if (!m) die(`correction ${num}: no heading "## ${num}. <Month D, YYYY>, <time>: …" in CORRECTIONS.md`)
  const was = m[2]
  if (timeProblem(said, m[1])) die(timeProblem(said, m[1]))
  if (was.toLowerCase() === said.toLowerCase()) die(`correction ${num} already says ${was}`)
  const head = text.slice(m.index, text.indexOf('\n', m.index))
  const fixed = head.replace(`${m[1]}, ${was}`, `${m[1]}, ${said.toLowerCase()}`)
  const end = text.slice(m.index).search(/\n## /)
  const block = text.slice(m.index, end < 0 ? text.length : m.index + end)
  if (/^Recorded at: /m.test(block)) die(`correction ${num} has a "Recorded at" line already; its time was set before`)
  const newBlock = block.replace(head, fixed).replace(/^(Weakness: .*)$/m, `$1\nRecorded at: ${was} (Bart said it at ${said.toLowerCase()}; time corrected ${pacific({ month: 'long', day: 'numeric' })}, ${pacific({ hour: 'numeric', minute: '2-digit' }).toLowerCase()})`)
  writeFileSync(COR, text.slice(0, m.index) + newBlock + text.slice(m.index + block.length))
  console.log(`correction ${num}: heading now says ${said.toLowerCase()}; recorded at ${was} kept in the entry`)
  console.log(NEXT)
} else if (cmd === 'owed' || cmd === 'audit') {
  // OLA-251, tenth pass: a fix settled in the ledger with no line in the overrides was settled past this
  // tool (settled on a copy and copied over, or edited by hand). Each such settle gets a line, once.
  if (!onCopy || process.env.VENTURE_TRACKER_FAKE) {
    try {
      const { writeOverride } = await import('./_overrides.mjs')
      const db = await trackerDb()
      // written once: only a line this audit wrote itself counts (a line someone else put under the key does not)
      const ownLine = async (d, key) => { const x = await d.from('venture_state').select('value').eq('key', 'override:' + key).maybeSingle(); return x.data?.value?.tool === 'correct.mjs' && /^(correction \d+'s owed fix |data\/weaknesses\.json is not the version)/.test(String(x.data?.value?.what ?? '')) }
      const r = await db.from('venture_state').select('value').like('key', 'override:%')
      const lines = (r.data ?? []).map((x) => String(x.value?.what ?? '')).filter((w) => !w.startsWith('(on a copy')) // a settle on a copy does not account for one in the real ledger
      const text = readFileSync(COR, 'utf8')
      // OLA-251, eleventh checker: the ledger's two files can be edited apart, so the tracker keeps its own
      // list of owed fixes (venture_state owed-fix:<n>): each owed fix the notes list is copied there, and one
      // that leaves the notes' list without correct.mjs settling it in the tracker is a line, once
      const owedNow = owedFixes(weak())
      await checkFp(db, writeOverride, ownLine)
      const held = ((await db.from('venture_state').select('key, value').like('key', 'owed-fix:%')).data ?? [])
      // a line is keyed by the event (the number and the owed fix's own time), so a later fix under a reused
      // number, or the same change made again, is a line of its own (thirteenth checker)
      const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
      // and by the day: a mismatch that lasts, or the same edit made again another day, is a line each day
      const ev = (num, v) => `${num}-${String(v?.since ?? '').replace(/[^0-9]/g, '')}-${day}`
      for (const o of owedNow) {
        const num = o.ref.replace(/\D/g, '')
        const h = held.find((x) => x.key === `owed-fix:${num}`)
        if (!h) await db.from('venture_state').upsert({ key: `owed-fix:${num}`, value: { ref: o.ref, issue: o.issue, since: o.since, need: o.need, settled: null }, at: new Date().toISOString() })
        else if (!h.value?.settled && h.value?.need === undefined) {
          // rows written before the kind was kept: take it now, the first time the audit sees one
          await db.from('venture_state').upsert({ key: h.key, value: { ...h.value, need: o.need }, at: new Date().toISOString() })
        } else if (!h.value?.settled) {
          // the notes' entry must still say what the tracker recorded: its time (which decides overdue), ticket and kind
          const diff = ['since', 'issue', 'need'].filter((k) => h.value?.[k] !== undefined && String(h.value[k]) !== String(o[k]))
          if (diff.length) {
            const key = `owed-changed-${ev(num, h.value)}-${createHash('sha256').update(diff.map((k) => `${k}=${o[k]}`).join('|')).digest('hex').slice(0, 10)}`
            if (!(await ownLine(db, key))) await writeOverride(db, { key, ticket: h.value?.issue ?? null, what: `correction ${num}'s owed fix was changed in data/weaknesses.json past correct.mjs (${diff.map((k) => `${k} ${h.value[k]} -> ${o[k]}`).join(', ')}); the tracker keeps ${h.value.since} as when it was owed: read why`, tool: 'correct.mjs' })
          }
        }
      }
      for (const h of held) {
        if (h.value?.settled || owedNow.some((o) => o.ref === h.value?.ref)) continue
        const num = h.key.slice('owed-fix:'.length)
        if (await ownLine(db, `owed-gone-${ev(num, h.value)}`)) continue
        await writeOverride(db, { key: `owed-gone-${ev(num, h.value)}`, ticket: h.value?.issue ?? null, what: `correction ${num}'s owed fix (${h.value?.issue}) is gone from the notes' list of owed fixes, but correct.mjs never settled it (data/weaknesses.json edited by hand, or copied over from a copy): read whether the fix exists`, tool: 'correct.mjs' })
      }
      for (const m of text.matchAll(/^## (\d+)\. [^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)) {
        const num = m[1]
        if (!/^Fix settled /m.test(m[2])) continue
        if (lines.some((w) => new RegExp(`\\bcorrection ${num}\\b[^\\n]*settled`).test(w))) continue
        if (await ownLine(db, `settle-unrecorded-${num}-${day}`)) continue
        await writeOverride(db, { key: `settle-unrecorded-${num}-${day}`, what: `correction ${num}'s owed fix is settled in the ledger with no record of correct.mjs settling it (edited by hand, or settled on a copy and copied over): read whether the fix exists`, tool: 'correct.mjs' })
      }
    } catch (e) {
      console.error(`(the audit of settled fixes did not run: ${e.message})`)
    }
  }
  if (cmd === 'audit') process.exit(0)
  const rows = owedFixes(weak())
  for (const o of rows) console.log(`${o.ref.padEnd(15)} owed ${String(o.days).padStart(2)} day(s)${o.days >= OWED_DAYS ? ' OVERDUE' : '        '}  ${o.issue.padEnd(8)} kind ${o.need}+ (${KINDS[o.need]})  ${o.name}`)
  console.log(`${rows.length} fix(es) owed${rows.some((o) => Date.now() - Date.parse(o.since) > OWED_DAYS * 86400e3) ? `; sweep.mjs post refuses while one is older than ${OWED_DAYS} days` : ''}`)
} else if (cmd === 'list') {
  for (const w of weak().sort((a, b) => b.seen.length - a.seen.length)) {
    const { prev, cameBack } = required(w)
    console.log(`${w.id.padEnd(18)} ${w.side.padEnd(4)} seen ${String(w.seen.length).padStart(2)}  came back ${String(Math.max(0, cameBack - 1)).padStart(2)}  strongest fix ${prev} ${(KINDS[prev] ?? 'none').padEnd(20)}${w.stuck ? ' STUCK: ' + w.stuck.why.slice(0, 60) : ''}  ${w.name}`)
  }
} else if (cmd === 'escapes') {
  const by = {}
  for (const w of weak()) for (const s of w.seen) if (s.escape || w.escape) by[s.day] = (by[s.day] ?? 0) + 1
  for (const d of Object.keys(by).sort()) console.log(`${d}  ${by[d]}`)
  console.log(`total ${Object.values(by).reduce((a, b) => a + b, 0)}: times Bart met something broken or untrue after being told it was done or working`)
} else if (import.meta.url === `file://${process.argv[1]}`) {
  console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1).filter((l, i, a) => a.slice(0, i + 1).every((x) => x.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
  process.exit(cmd ? 1 : 0)
}
