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
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
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
  const log = (extra) => {
    try { return execFileSync('git', ['-C', root, 'log', 'HEAD', 'origin/main', `--since=${o.since}`, '--format=%h', ...extra, '--', file], { encoding: 'utf8', timeout: 20000 }).trim() } catch { return '' }
  }
  if (!log([])) return `--where: ${file} has not been changed by any commit since the correction was recorded (${o.since}); a file settles an owed fix only when a commit after the correction changed it.`
  // OLA-251, fourth pass: and that commit is the owed fix's own work, naming its ticket; an unrelated commit
  // that happened to touch the file (runner.mjs by 036ed3fe for correction 103) settles nothing
  if (!o.issue) return `--where: this owed fix names no ticket, so no commit can be shown to be its work; settle it with a ticket closed with every check passed.`
  const mine = log(['-E', `--grep=${o.issue}([^0-9]|$)`])
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

if (cmd === 'add') {
  const [title, words, did, cause, fix] = ['title', 'words', 'did', 'cause', 'fix'].map(str)
  if (!title || !words || !did || !cause) die('add needs --title, --words (his words), --did (what the agent had done) and --cause (the real cause)')
  const list = weak()
  let w = list.find((x) => x.id === str('weakness'))
  if (str('new')) {
    const [name, what] = str('new').split('|')
    if (!str('weakness') || !name || !what) die('--new "Name|what it is" needs --weakness <new-id> too')
    if (w) die(`weakness ${w.id} exists already`)
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
    const problem = fixProblem(w, level, { prev, cameBack, need }) ?? (level >= 3 || str('where') ? await whereProblem(str('where')) : null)
    if (problem) die(`${problem}\n\nThe correction is NOT recorded yet. Record it now and owe the fix: add --owed OLA-n (open the ticket with issues.mjs add), then settle it with: correct.mjs fix <n> --fix … --level ${need} --where …`)
  }
  const text = readFileSync(COR, 'utf8')
  const n = Math.max(0, ...[...text.matchAll(/^## (\d+)\. /gm)].map((m) => Number(m[1]))) + 1
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
  console.log(`correction ${n} recorded under "${w.name}" (${w.side}); seen ${w.seen.length} time(s)${cannot ? '; NO stronger fix: shown as open' : owed ? `; fix OWED (kind ${need} or stronger, ${owed.issue}): settle with correct.mjs fix ${n} … within ${OWED_DAYS} days` : `; fix kind ${level} (${KINDS[level]})`}`)
  console.log(NEXT)
} else if (cmd === 'fix') {
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
  const need = Math.max(o.need, req.need)
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
  console.log(`correction ${num}: owed fix settled under "${w.name}", kind ${level} (${KINDS[level]})`)
  console.log(NEXT)
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
} else if (cmd === 'owed') {
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
