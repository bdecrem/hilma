#!/usr/bin/env node
// The daily sweep (2026-11-18). Bart: "a new daily 'agentic sweep' where the agent (you) take a
// look at all the things that happened that day and, from that, improves its memory and other
// systems for both (a) the management of the project ("kit") and (b) orchestration, skills and
// how the ola agents work ... that should be a page with updates on it on most date ... with one
// or more headline numbers".
// The sweep itself is done by an agent following apps/venture/SWEEP.md. This script is its hands:
//   node scripts/venture/sweep.mjs due                  the days that still need a sweep, one per line
//   node scripts/venture/sweep.mjs --wait               waits until a day is owed (6 pm Pacific), prints it
//                                                       and exits: a clock for a session that is open but
//                                                       idle, run beside the other watchers
//   node scripts/venture/sweep.mjs gather [--day D]     everything that happened that day, printed to read
//   node scripts/venture/sweep.mjs template [--day D]   an empty entry (JSON) for that day
//   node scripts/venture/sweep.mjs post <entry.json>    check the entry and store it; the Learning page
//                                                       of app.kochitolabs.com shows it at once. The first
//                                                       post of a day also texts Bart the day's two ideas
//                                                       (one for Kit, one for Ola); --no-text skips that
//   node scripts/venture/sweep.mjs show [--day D]       what is stored
//   node scripts/venture/sweep.mjs weaknesses           the ledger: every weakness, how often it was seen,
//                                                       its guard and whether the guard is holding
// Days are Pacific. Entries live in venture_state "sweeps" ({ at, since, days: [newest first] });
// the shape is Sweep in src/lib/venture/board.ts. Keep the posted file in
// apps/venture/private/data/sweeps/<day>.json (private, backed up by sync.mjs).
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { getState, setState, sweepDue, pacificDay } from './_state.mjs'
import { loadWeaknesses, unnumberedCorrections, weaknessStatus, WEAK_FILE } from './_weak.mjs'
import { openCounts } from './_plate.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const env = Object.fromEntries(
  readFileSync(root + '.env.local', 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const args = process.argv.slice(2)
const cmd = args[0]
const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null)
const day = opt('--day') ?? pacificDay()
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) (console.error(`not a day: ${day}`), process.exit(1))
const die = (m) => (console.error(m), process.exit(1))
const priv = (f) => root + 'apps/venture/private/' + f
// the Pacific day as two instants (PST or PDT, whichever the day's noon is in)
const offset = new Date(`${day}T12:00:00Z`).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'shortOffset' }).match(/GMT([+-]\d+)/)?.[1] ?? '-8'
const from = new Date(Date.parse(`${day}T00:00:00Z`) - Number(offset) * 3600e3).toISOString()
const to = new Date(Date.parse(from) + 86400e3).toISOString()
const rootUrl = new URL('../../', import.meta.url)
const ledger = () => weaknessStatus(loadWeaknesses(rootUrl), pacificDay())
const ledgerLines = () => ledger().sort((a, b) => ['back', 'open', 'guarded'].indexOf(a.status) - ['back', 'open', 'guarded'].indexOf(b.status) || b.seen - a.seen).map((w) => `${w.status === 'back' ? 'CAME BACK' : w.status === 'open' ? 'open     ' : `holding ${String(w.held_days).padStart(2)}d`}  ${w.id.padEnd(15)} ${w.side}  seen ${w.seen}x (last ${w.last})  ${w.name}${w.guard ? `  | guard: ${w.guard.what}${w.guard.enforced ? '' : ' (a rule only)'}` : '  | no guard'}${w.bet ? `  | to build: ${w.bet.text}${w.bet.issue ? ` (${w.bet.issue})` : ''}` : ''}`)
const long = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

// ---------------------------------------------------------------- what happened that day
async function facts() {
  const out = { counts: [], sections: [] }
  const add = (title, lines) => out.sections.push({ title, lines })
  const count = (n, what) => out.counts.push({ n: String(n), what })
  const tryIt = async (title, fn) => {
    try {
      await fn()
    } catch (e) {
      add(title, [`(could not be read: ${String(e.message).split('\n')[0]})`])
    }
  }

  await tryIt("Bart's words", async () => {
    spawnSync('node', [root + 'scripts/venture/steers.mjs', '--export'], { encoding: 'utf8' }) // this machine's typed messages, for the other machines
    const r = spawnSync('node', [root + 'scripts/venture/steers.mjs', '--collect', '--full', '--day', day], { encoding: 'utf8', maxBuffer: 64e6 })
    if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim().split('\n').pop())
    const lines = r.stdout.split('\n').filter((l) => /^#\d+ /.test(l))
    count(lines.length, 'messages from you')
    add("Bart's words (typed, texted, said; every machine that has exported its day)", lines)
  })

  await tryIt('Steers', async () => {
    const d = (await getState(db, 'steers'))?.value?.days?.[day]
    if (!d) return add('Steers (the grader)', ['not graded yet for this day (the grader runs the next morning)'])
    count(d.rate ?? '–', 'steers per 100 messages')
    add('Steers (the grader)', [`${d.messages} messages, ${d.steers} steers, ${d.repeats} repeats, rate ${d.rate}`, ...d.items.filter((x) => x.label === 'steer').map((x) => `${x.time} ${x.class}${x.repeat ? ' REPEAT' : ''}: "${x.quote}"`)])
  })

  await tryIt('Corrections', async () => {
    const parts = readFileSync(priv('CORRECTIONS.md'), 'utf8').split(/^## (?=\d+\. )/m).slice(1).filter((p) => p.split('\n')[0].includes(long))
    const rep = parts.filter((p) => /\bREPEAT\b/.test(p) || /(third|second|three|two) times?|asked (three|twice)/i.test(p.split('\n')[0])).length
    count(parts.length, `corrections${parts.length ? `, ${rep} ${rep === 1 ? 'repeat' : 'repeats'}` : ''}`)
    add(`Corrections written on ${long} (CORRECTIONS.md; read each in full there)`, parts.map((p) => p.split('\n')[0].slice(0, 200)))
    const loose = unnumberedCorrections(readFileSync(priv('CORRECTIONS.md'), 'utf8'))
    if (loose.length) add('Corrections written WITHOUT a number (not counted above, not filed; number them before posting)', loose)
  })

  await tryIt('Tracker', async () => {
    const { data: issues, error } = await db.from('venture_issues').select('id, title, status, proof, opened_at, finished_at, day, priority').eq('project', 'ola').order('num')
    if (error) throw new Error(error.message)
    const opened = issues.filter((i) => i.opened_at >= from && i.opened_at < to)
    const done = issues.filter((i) => i.status === 'done' && i.day === day)
    const waiting = issues.filter((i) => i.status === 'waiting')
    count(done.length, `issues done, ${opened.length} opened`)
    add('Tracker: opened that day', opened.map((i) => `${i.id} ${i.priority} [${i.status}] ${i.title}`))
    add('Tracker: done that day', done.map((i) => `${i.id} ${i.title}  [${(i.proof ?? '').slice(0, 140)}]`))
    add('Tracker: waiting on Bart now', waiting.map((i) => `${i.id} ${i.title}`))
    const { data: acts, error: e2 } = await db.from('venture_issue_activity').select('issue_id, at, who, kind, field, new_value, body, seen_by_kit_at').eq('via', 'board').gte('at', from).lt('at', to).order('at')
    if (e2) throw new Error(e2.message)
    add('Tracker: what Bart wrote on the board that day', acts.map((a) => `${a.issue_id} ${a.kind}${a.field ? ` ${a.field} → ${a.new_value}` : ''}${a.body ? `: ${a.body.slice(0, 300)}` : ''}${a.seen_by_kit_at ? '' : '  (NOT READ BY KIT)'}`))
  })

  await tryIt('Commits', async () => {
    const log = execFileSync('git', ['-C', root, 'log', '--all', `--since=${from}`, `--until=${to}`, '--format=%h %s'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    count(log.length, 'commits')
    add('Commits that day (subjects)', log)
    const evals = execFileSync('git', ['-C', root, 'log', '--all', `--since=${from}`, `--until=${to}`, '--format=', '--name-only', '--', 'apps/activist-ai/evals', 'apps/activist-ai/skills', '.claude/skills', '.claude/hooks', 'apps/venture/runner'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    add('Files changed that day in the tests, skills, hooks and the runner', [...new Set(evals)].slice(0, 80))
  })

  await tryIt('Ola: tests', async () => {
    const rounds = JSON.parse(readFileSync(root + 'apps/activist-ai/evals/results/learning.json', 'utf8')).rounds
    const r = rounds.at(-1)
    add('Ola: the latest test round', [`${r.date} ${r.model}: ${r.passed} of ${r.runs}; Claude ${r.claude_passed} of ${r.claude_runs}`])
    const l = (await getState(db, 'learning'))?.value
    if (l?.ola?.apps) add('Ola: the app problems ("build me an app" requests)', [`own model ${l.ola.apps.own.passed} of ${l.ola.apps.own.run}; Claude Code ${l.ola.apps.claude.passed} of ${l.ola.apps.claude.run} (${l.ola.apps.date})`])
  })

  await tryIt('Ola: requests', async () => {
    // the turns people chose to keep on the Ola machine, and those handed to another engine after a first try.
    // Over Tailscale (100.95.51.98): the public address's port 22 timed out on Nov 19 and the day's
    // requests went unread; Tailscale reaches the mini from this iMac and from the mini itself.
    const ssh = (c) => spawnSync('ssh', ['-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes', 'admin@100.95.51.98', `export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH; cd ~/ola-staging/current/apps/activist-ai/frontdesk && node admin.mjs ${c}`], { encoding: 'utf8', timeout: 30000 })
    const r = ssh('kept --days 3 --json')
    if (r.status !== 0) throw new Error((r.stderr || 'the Ola machine did not answer').trim().split('\n').pop())
    const rows = JSON.parse(r.stdout.trim().split('\n').pop()).filter((k) => new Date(k.at).toISOString() >= from && new Date(k.at).toISOString() < to)
    const sw = rows.filter((k) => k.switched_from)
    count(rows.length, `kept requests to Ola, ${sw.length} handed on after a first try`)
    add('Ola: kept requests that day (only people who turned on "Store your conversations")', rows.map((k) => `${new Date(k.at).toISOString().slice(11, 16)}Z ${k.handle} ${k.product}/${k.runtime} ${k.engine}${k.switched_from ? ` (AFTER ${k.switched_from})` : ''} ${k.status}: ${String(k.request).replace(/\s+/g, ' ').slice(0, 300)}`))
  })

  await tryIt('Ola: the machine', async () => {
    const s = (await getState(db, 'ola_status'))?.value
    if (!s) return
    add('Ola: the machine now', [`alarm ${s.alarm?.state}: ${(s.alarm?.says ?? []).join(' ') || 'nothing'}`, s.deployed ? `web app ${s.deployed.commit.slice(0, 8)} updated ${s.deployed.at}, checks ${s.checks?.passed} of ${s.checks?.total}` : 'no deploy on record'])
  })

  for (const [f, what] of [['LOG.md', 'the log'], ['JOURNAL.md', "the journal's day notes"]]) if (existsSync(priv(f))) add(`Also read ${what} for that day`, [priv(f)])
  return out
}

// ---------------------------------------------------------------- the entry
const IDEA_MAX = 220 // characters of an idea's one sentence
// A one-week daily task (Bart, 2026-11-19, 6:31 am: "add a daily task for the next week, then review
// if useful: improvements to the learning system"; OLA-182). From `from` to `to` every entry names
// one improvement made that day to the learning system itself (`learning`); the entry of `review`
// carries the review (`learningReview`) and its ticket goes to Bart to keep or stop.
const TRIAL = { from: '2026-11-19', to: '2026-11-25', review: '2026-11-26', issue: 'OLA-182' }
function checkEntry(e) {
  const bad = []
  const known = new Set(loadWeaknesses(rootUrl).map((w) => w.id))
  const str = (v) => typeof v === 'string' && v.trim().length > 0
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.day ?? '')) bad.push('day must be YYYY-MM-DD')
  if (!str(e.summary)) bad.push('summary: one or two sentences in plain words')
  if (!Array.isArray(e.read) || e.read.some((r) => !str(r.n) || !str(r.what))) bad.push('read: [{ n: "115", what: "messages from you" }, …] (strings)')
  for (const side of ['kit', 'ola']) {
    if (!Array.isArray(e[side])) { bad.push(`${side} must be a list (empty when nothing changed)`); continue }
    e[side].forEach((c, n) => {
      for (const k of ['saw', 'changed', 'where']) if (!str(c[k])) bad.push(`${side}[${n}].${k} is missing`)
      if (c.issue && !/^OLA-\d+$/.test(c.issue)) bad.push(`${side}[${n}].issue must look like OLA-171`)
      if (known.size && !known.has(c.weakness)) bad.push(`${side}[${n}].weakness must be the id of a weakness in ${WEAK_FILE} (${c.weakness ? `"${c.weakness}" is not there` : 'missing'}): add the day to its "seen" and the fix to its "guards" there first`)
    })
  }
  if (!Array.isArray(e.open) || e.open.some((o) => !str(o.text))) bad.push('open: [{ text, issue? }]')
  if (!e.quiet && known.size && (!e.build || !str(e.build.text))) bad.push('build: { text, issue? }: the one thing to build next that would remove a whole weakness, not one instance (or say why nothing is worth building)')
  if (!e.quiet && Array.isArray(e.read) && e.read.length === 0) bad.push('read is empty: say what the sweep looked at, or mark the day quiet')
  // Bart, 2026-11-18, 11:13 pm: "daily loop for kit and Ola each to think of one idea or improvement to
  // make the overall system and the code engine work better. Notify me each day when that happened.
  // Document on the learning page". One idea for each side, every day (a quiet day too), each with
  // the evidence it comes from and its own ticket, so the page can show what became of it.
  for (const side of ['kit', 'ola']) {
    const i = e.ideas?.[side]
    const what = side === 'kit' ? 'how the project is run' : 'the code engine: agents, skills, orchestration'
    if (!i || !str(i.text) || !str(i.why)) { bad.push(`ideas.${side}: { text, why, issue }: one idea or improvement for ${what} (text: one sentence saying what would be built; why: what in the record points to it and how it would be measured)`); continue }
    if (i.text.length > IDEA_MAX) bad.push(`ideas.${side}.text is ${i.text.length} characters: at most ${IDEA_MAX}, it goes to Bart's phone`)
    if (!/^OLA-\d+$/.test(i.issue ?? '')) bad.push(`ideas.${side}.issue: open a ticket for the idea (issues.mjs add) and name it here, like OLA-180`)
  }
  if (e.ideas?.kit?.issue && e.ideas.kit.issue === e.ideas?.ola?.issue) bad.push('ideas: the two ideas need a ticket each')
  if (e.day >= TRIAL.from && e.day <= TRIAL.to && (!str(e.learning?.changed) || !str(e.learning?.why) || !str(e.learning?.where)))
    bad.push(`learning: { changed, why, where, enforced? }: the one improvement made today to the learning system itself (how corrections are stored, loaded, enforced, counted or shown), finished today; a daily task until ${TRIAL.to} (${TRIAL.issue})`)
  if (e.day === TRIAL.review && (!str(e.learningReview?.text) || !/^OLA-\d+$/.test(e.learningReview?.issue ?? '')))
    bad.push(`learningReview: { text, issue }: the review of the week of daily improvements to the learning system (what each day changed, what the figures did, keep or stop), with ${TRIAL.issue} set to waiting on Bart for his answer`)
  if (/[—]/.test(JSON.stringify(e))) bad.push('no em dashes: Bart reads this page')
  // Bart, 2026-11-18: "I don't love the writing style on the learning section ... write it like a
  // factual straight description of our evolving learning system". An entry is a description of the
  // system, not Kit's account of itself: no first person outside a direct quote of his words.
  const texts = [e.summary, e.pattern, e.build?.text, e.ideas?.kit?.text, e.ideas?.kit?.why, e.ideas?.ola?.text, e.ideas?.ola?.why, e.learning?.changed, e.learning?.why, e.learning?.where, e.learningReview?.text, ...(e.open ?? []).map((o) => o.text), ...['kit', 'ola'].flatMap((k) => (Array.isArray(e[k]) ? e[k] : []).flatMap((c) => [c.saw, c.changed, c.where]))].filter((t) => typeof t === 'string')
  const first = [...new Set(texts.flatMap((t) => t.replace(/"[^"]*"/g, '').replace(/“[^”]*”/g, '').match(/\b(I|I'm|I've|I'd|my|me|myself|we|our|us)\b/g) ?? []))]
  if (first.length) bad.push(`written in the first person (${first.join(', ')}): describe what the system does and what happened, with Kit, Ola, Bart or the mechanism as the subject (apps/venture/SWEEP.md, "Rules for the entry")`)
  return bad
}

if (cmd === '--wait') {
  for (;;) {
    const due = await sweepDue(db).catch(() => [])
    if (due.length) {
      console.log(`The daily sweep is owed for ${due.join(', ')}: follow apps/venture/SWEEP.md, then start this watcher again.`)
      process.exit(0)
    }
    await new Promise((r) => setTimeout(r, 5 * 60e3))
  }
} else if (cmd === 'due') {
  const due = await sweepDue(db)
  if (due.length) console.log(due.join('\n'))
} else if (cmd === 'gather') {
  const f = await facts()
  console.log(`# The day to sweep: ${long} (${day}, Pacific)\n`)
  console.log(`Counts for the entry's "read": ${f.counts.map((c) => `${c.n} ${c.what}`).join(' · ')}\n`)
  console.log(`## The weaknesses so far (${WEAK_FILE}); file every finding of the day under one of these, or add one\n${ledgerLines().join('\n')}\n`)
  for (const s of f.sections) console.log(`## ${s.title}\n${s.lines.length ? s.lines.join('\n') : '(none)'}\n`)
  if (day >= TRIAL.from && day <= TRIAL.to) console.log(`## A daily task until ${TRIAL.to} (${TRIAL.issue})\nOne improvement to the learning system itself, made and finished today, goes in the entry's "learning" (SWEEP.md, "One improvement to the learning system, every day until Nov 25").\n`)
  if (day === TRIAL.review) console.log(`## Today: the review of the week of daily improvements to the learning system (${TRIAL.issue})\nIt goes in the entry's "learningReview", and the ticket goes to Bart (issues.mjs wait ${TRIAL.issue}).\n`)
  console.log('Now follow apps/venture/SWEEP.md.')
} else if (cmd === 'template') {
  const f = await facts()
  console.log(JSON.stringify({ day, by: 'Kit', summary: '', read: f.counts, pattern: '', kit: [{ weakness: '', saw: '', changed: '', where: '', enforced: false }], ola: [], open: [{ text: '', issue: 'OLA-0' }], build: { text: '', issue: 'OLA-0' }, ideas: { kit: { text: '', why: '', issue: 'OLA-0' }, ola: { text: '', why: '', issue: 'OLA-0' } }, ...(day >= TRIAL.from && day <= TRIAL.to ? { learning: { changed: '', why: '', where: '', enforced: false } } : {}), ...(day === TRIAL.review ? { learningReview: { text: '', issue: TRIAL.issue } } : {}) }, null, 2))
} else if (cmd === 'post') {
  const file = args[1]
  if (!file || !existsSync(file)) die('usage: sweep.mjs post <entry.json>')
  const e = JSON.parse(readFileSync(file, 'utf8'))
  const bad = checkEntry(e)
  // Rule 50 (Bart, Nov 18: "the learning agents need to treat every correction I make as an error the
  // agent made"): every correction written down is filed under a weakness, and the grader's count
  // of corrections in his messages (when it has graded the day) is not larger than what was written.
  {
    const corrText = readFileSync(priv('CORRECTIONS.md'), 'utf8')
    const unnumbered = unnumberedCorrections(corrText)
    if (unnumbered.length) bad.push(`corrections written without a number, so nothing counts or files them: give each "## N. <Month D, YYYY>, <time>: …" in CORRECTIONS.md (${unnumbered.map((h) => `"${h.slice(0, 60)}"`).join('; ')})`)
    const heads = corrText.split(/^## (?=\d+\. )/m).slice(1).map((p) => p.split('\n')[0])
    const filed = new Set(loadWeaknesses(rootUrl).flatMap((w) => w.seen.map((x) => x.ref)))
    const unfiled = heads.map((h) => Number(/^\d+/.exec(h)[0])).filter((n) => !filed.has(`correction ${n}`))
    if (unfiled.length) bad.push(`corrections not filed under a weakness in ${WEAK_FILE}: ${unfiled.join(', ')}`)
    const dayLong = new Date(`${e.day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    const written = heads.filter((h) => h.includes(dayLong)).length
    const graded = (await getState(db, 'steers'))?.value?.days?.[e.day]
    if (graded && graded.steers > written) bad.push(`the grader found ${graded.steers} corrections in Bart's messages on ${e.day} and CORRECTIONS.md has ${written} for that day: write down and file the others (node scripts/venture/steers.mjs --dry --day ${e.day} lists them)`)
    if (!graded) console.log(`note: ${e.day} is not graded yet (steers.mjs), so the count of corrections rests on the sweep's own re-read of the messages`)
  }
  const old = (await getState(db, 'sweeps'))?.value ?? { days: [] }
  // an idea is new: its ticket was not the idea of another day
  for (const side of ['kit', 'ola']) {
    const again = old.days.find((d) => d.day !== e.day && [d.ideas?.kit?.issue, d.ideas?.ola?.issue].includes(e.ideas?.[side]?.issue))
    if (again && e.ideas?.[side]?.issue) bad.push(`ideas.${side}: ${e.ideas[side].issue} was already the idea of ${again.day}; think of a new one`)
  }
  if (bad.length) die(`the entry was not stored:\n- ${bad.join('\n- ')}`)
  const told = old.days.find((d) => d.day === e.day)?.ideas?.told
  const ideas = { kit: { text: e.ideas.kit.text.trim(), why: e.ideas.kit.why.trim(), issue: e.ideas.kit.issue }, ola: { text: e.ideas.ola.text.trim(), why: e.ideas.ola.why.trim(), issue: e.ideas.ola.issue }, ...(told ? { told } : {}) }
  const entry = { day: e.day, at: e.at ?? new Date().toISOString(), by: e.by ?? 'Kit', summary: e.summary.trim(), ...(e.quiet ? { quiet: true } : {}), read: e.read, kit: e.kit.map((c) => ({ ...c, enforced: !!c.enforced })), ola: e.ola.map((c) => ({ ...c, enforced: !!c.enforced })), open: e.open, ...(e.build ? { build: e.build } : {}), ...(e.pattern ? { pattern: e.pattern } : {}), ideas, ...(e.learning ? { learning: { changed: e.learning.changed.trim(), why: e.learning.why.trim(), where: e.learning.where.trim(), enforced: !!e.learning.enforced, ...(e.learning.issue ? { issue: e.learning.issue } : {}) } } : {}), ...(e.learningReview ? { learningReview: e.learningReview } : {}) }
  // "Open issues: N (yesterday: M)", from the tracker's records at the moment of posting (OLA-212:
  // "the daily update on the dashboard should always list the open issues count from now on"), kept
  // with the entry so a past day keeps its own number.
  {
    const r = await db.from('venture_issues').select('status, opened_at, finished_at').eq('project', 'ola')
    if (r.error) die(`venture_issues: ${r.error.message}`)
    entry.openIssues = openCounts(r.data, Date.now(), entry.day)
  }
  const days = [entry, ...old.days.filter((d) => d.day !== entry.day)].sort((a, b) => b.day.localeCompare(a.day))
  const value = { at: new Date().toISOString(), since: [old.since, entry.day].filter(Boolean).sort()[0], days }
  await setState(db, 'sweeps', value)
  const all = days.flatMap((d) => [...d.kit, ...d.ola])
  console.log(`stored ${entry.day}: ${entry.kit.length} for Kit, ${entry.ola.length} for Ola, ${entry.open.length} open`)
  console.log(`so far: ${all.length} changes from ${days.filter((d) => !d.quiet).length} day(s) swept, ${all.filter((c) => c.enforced).length} enforced by the system`)
  // the ledger and the two percentages ride along, so the page is whole at once
  const learn = spawnSync('node', [root + 'scripts/venture/learning.mjs'], { encoding: 'utf8' })
  console.log(learn.status === 0 ? learn.stdout.trim().split('\n').filter((l) => /^Weaknesses/.test(l)).join('\n') : `learning numbers NOT refreshed: ${(learn.stderr || learn.stdout).trim().split('\n').pop()}`)
  // "Notify me each day when that happened": one text per day, on the day's first post. A repost
  // (after a correction is added) changes the page and sends nothing.
  if (!told && !args.includes('--no-text')) {
    const d = new Date(`${entry.day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
    const text = `Daily ideas, ${d}.\nKit, for how the project is run: ${ideas.kit.text} (${ideas.kit.issue})\nOla, for the code engine: ${ideas.ola.text} (${ideas.ola.issue})\nhttps://app.kochitolabs.com/learning`
    const sent = spawnSync('node', [root + 'scripts/venture/imsg.mjs', 'send', text], { encoding: 'utf8' })
    if (sent.status === 0) {
      entry.ideas.told = new Date().toISOString()
      await setState(db, 'sweeps', { ...value, at: new Date().toISOString() })
      console.log(`texted Bart the two ideas of ${entry.day}`)
    } else {
      console.log(`Bart was NOT texted the ideas (${(sent.stderr || sent.stdout).trim().split('\n').pop()}): post the entry again to retry`)
      process.exitCode = 1
    }
  }
  console.log('https://app.kochitolabs.com/learning')
} else if (cmd === 'weaknesses') {
  console.log(ledgerLines().join('\n'))
} else if (cmd === 'show') {
  const s = (await getState(db, 'sweeps'))?.value
  if (!s) die('no sweeps yet')
  const which = opt('--day') ? s.days.filter((d) => d.day === day) : s.days
  for (const d of which) {
    console.log(`\n${d.day} (swept ${d.at} by ${d.by}): ${d.summary}`)
    for (const side of ['kit', 'ola']) for (const c of d[side]) console.log(`  ${side.toUpperCase().padEnd(3)} ${c.enforced ? '[enforced]' : '[note]    '} ${c.changed}  (${c.where})`)
    for (const o of d.open) console.log(`  OPEN ${o.text}${o.issue ? ` ${o.issue}` : ''}`)
    for (const side of ['kit', 'ola']) if (d.ideas?.[side]) console.log(`  IDEA ${side.toUpperCase().padEnd(3)} ${d.ideas[side].text} ${d.ideas[side].issue}${d.ideas.told ? '' : '  (Bart not texted yet)'}`)
  }
} else {
  die('usage: sweep.mjs weaknesses | --wait | due | gather [--day D] | template [--day D] | post <entry.json> | show [--day D]')
}
