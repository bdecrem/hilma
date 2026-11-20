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
//   node scripts/venture/sweep.mjs post <entry.json> [--dry]   check the entry (--dry: only check) and store it; the Learning page
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
import { existsSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { getState, setState, sweepDue, pacificDay } from './_state.mjs'
import { OWED_DAYS, loadWeaknesses, owedFixes, privPath, refuseOnCopy, unnumberedCorrections, weaknessStatus, WEAK_FILE } from './_weak.mjs'
import { openCounts } from './_plate.mjs'
import { overridesOf } from './_overrides.mjs'
import { fakeClient } from './_fakedb.mjs'
import { CASE_DIR, UNTESTABLE, uncoveredCorrections } from './_replay.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const env = Object.fromEntries(
  readFileSync(root + '.env.local', 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
// VENTURE_TRACKER_FAKE=<file.json>: a copy of the tracker (_fakedb.mjs), for tests; nothing then reaches the live page or Bart
const FAKE = !!process.env.VENTURE_TRACKER_FAKE
const db = FAKE ? fakeClient(process.env.VENTURE_TRACKER_FAKE) : createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const args = process.argv.slice(2)
const cmd = args[0]
const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null)
const day = opt('--day') ?? pacificDay()
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) (console.error(`not a day: ${day}`), process.exit(1))
const die = (m) => (console.error(m), process.exit(1))
const priv = (f) => privPath(root, f) // VENTURE_PRIVATE=<copy> for tests
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
    // Switches to Claude (OLA-157): labels and counts for everyone, the largest group of the week.
    const sws = ssh('switches --json --days 7')
    if (sws.status === 0) {
      const w = JSON.parse(sws.stdout.trim().split('\n').pop())
      add('Ola: switches to Claude or the hosted model after a cheaper engine, the last 7 days (labels and counts only)', [
        `${w.switches} in ${w.requests} requests${w.per100 === null ? '' : `, ${w.per100} per 100`}; to Claude ${w.to.claude}, to the hosted model ${w.to.hosted}`,
        `by kind: ${w.kinds.map((k) => `${k.words} ${k.n}`).join(', ') || 'none'}${w.largest ? `; the largest group: ${w.largest.words}` : ''}`,
        `test tasks: ${w.tasks.copies} made-up copies (${w.tasks.candidates} became candidates, \`admin.mjs compare candidates\`), ${w.tasks.waiting} waiting, ${w.tasks.kept} drafts from kept conversations (\`admin.mjs switches tasks\`), ${w.tasks.labels_only} labels only`,
      ])
    } else add('Ola: switches to Claude', [`not read: ${(sws.stderr || 'no answer').trim().split('\n').pop()}`])
    add('Ola: kept requests that day (only people who turned on "Store your conversations")', rows.map((k) => `${new Date(k.at).toISOString().slice(11, 16)}Z ${k.handle} ${k.product}/${k.runtime} ${k.engine}${k.switched_from ? ` (AFTER ${k.switched_from})` : ''} ${k.status}: ${String(k.request).replace(/\s+/g, ' ').slice(0, 300)}`))
  })

  await tryIt('Ola: the machine', async () => {
    const s = (await getState(db, 'ola_status'))?.value
    if (!s) return
    add('Ola: the machine now', [`alarm ${s.alarm?.state}: ${(s.alarm?.says ?? []).join(' ') || 'nothing'}`, s.deployed ? `web app ${s.deployed.commit.slice(0, 8)} updated ${s.deployed.at}, checks ${s.checks?.passed} of ${s.checks?.total}` : 'no deploy on record'])
  })

  await tryIt('Models', async () => {
    // OLA-245: the day's shares of the models, and each stretch where the lead session did on Fable
    // what an Opus agent could have done (scripts/venture/delegable.mjs, this machine's transcripts).
    const r = spawnSync('node', [root + 'scripts/venture/delegable.mjs', '--day', day], { encoding: 'utf8', maxBuffer: 16e6 })
    if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim().split('\n').pop())
    add("Models: the day's shares, and work the lead did on Fable that an Opus agent could have done (the entry's \"models\": delegable.mjs --json)", r.stdout.trim().split('\n'))
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
const dayStart = (d) => {
  const off = new Date(`${d}T12:00:00Z`).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'shortOffset' }).match(/GMT([+-]\d+)/)?.[1] ?? '-8'
  return new Date(Date.parse(`${d}T00:00:00Z`) - Number(off) * 3600e3).toISOString()
}
/** The file or folder a cleaned item names: in the notes (VENTURE_PRIVATE or apps/venture/private), this checkout, or absolute. */
function noteFile(where) {
  const w = String(where ?? '').trim().split(/\s+/)[0]?.replace(/[,;:]$/, '').replace(/^apps\/venture\/private\//, '')
  if (!w) return null
  for (const f of [priv(w), root + w, root + 'apps/venture/private/' + w, w]) if (f && existsSync(f) && (f.startsWith('/') || f.startsWith(root))) return f
  return null
}
/** Was `where` a code file that a commit changed on that day? { ok, why }. */
function codeChangedOn(where, d) {
  const f = String(where ?? '').trim().split(/\s+/)[0]?.replace(/[,;]$/, '').replace(/:\d+$/, '')
  if (!f || /\.(md|txt)$/i.test(f)) return { ok: false, why: `where (${where ?? 'none'}) is not a code file` }
  if (!existsSync(root + f)) return { ok: false, why: `where (${f}) is not a file in this checkout` }
  const to = new Date(Date.parse(dayStart(d)) + 86400e3).toISOString()
  const log = spawnSync('git', ['-C', root, 'log', 'origin/main', `--since=${dayStart(d)}`, `--until=${to}`, '--format=%h', '--', f], { encoding: 'utf8' }).stdout.trim()
  return log ? { ok: true, why: '' } : { ok: false, why: `no commit on main changed ${f} on ${d}` }
}
const quietCache = {}
/** A day is quiet when its record holds no correction and no commit (OLA-260). */
function quietDay(d) {
  if (quietCache[d]) return quietCache[d]
  const long = new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  const corr = readFileSync(priv('CORRECTIONS.md'), 'utf8').split(/^## (?=\d+\. )/m).slice(1).filter((p) => p.split('\n')[0].includes(long)).length
  const to = new Date(Date.parse(dayStart(d)) + 86400e3).toISOString()
  const commits = spawnSync('git', ['-C', root, 'log', '--all', `--since=${dayStart(d)}`, `--until=${to}`, '--format=%h'], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean).length
  return (quietCache[d] = { quiet: corr === 0 && commits === 0, why: `${corr} correction(s) and ${commits} commit(s) that day` })
}
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
  // OLA-251 (Nov 20): the review cleans the notes instead of adding rules. `cleaned` lists what was
  // removed, merged or corrected in the notes that day, checked against what really happened.
  const CLEAN = ['removed', 'merged', 'corrected']
  if (!Array.isArray(e.cleaned) || e.cleaned.some((c) => !CLEAN.includes(c.did) || !str(c.what) || !str(c.where))) bad.push(`cleaned: [{ did: ${CLEAN.map((x) => `"${x}"`).join(' | ')}, what: "what changed in the notes, and what in the day's record showed it was wrong, stale or a duplicate", where: "the file" }]`)
  else {
    if (!e.cleaned.length && !(e.quiet && quietDay(e.day).quiet)) bad.push(`cleaned is empty: the review removes, merges or corrects something in the notes every day (SWEEP.md, "Clean the notes")${e.quiet ? `; the day is not quiet by its record (${quietDay(e.day).why})` : ''}`)
    // OLA-260: each cleaned item names a file (or, for a file removed whole, its folder) that exists and changed on or after that day
    e.cleaned.forEach((c, n) => {
      const f = noteFile(c.where)
      if (!f) bad.push(`cleaned[${n}].where: "${c.where}" is no file or folder in the notes or this checkout (a file removed whole: name its folder)`)
      else if (statSync(f).mtimeMs < Date.parse(dayStart(e.day))) bad.push(`cleaned[${n}].where: ${c.where} has not changed since before ${e.day}: nothing was cleaned there that day`)
    })
  }
  // quiet is the day's record, not the author's word (OLA-260)
  if (e.quiet && !quietDay(e.day).quiet) bad.push(`quiet: true, but ${e.day} was not quiet: ${quietDay(e.day).why}`)
  // OLA-245: the day's model shares and the stretches the lead could have handed to an Opus agent
  // (delegable.mjs --json, which the template fills in); an empty list of stretches is a finding too.
  // the entry's own models part is not used: sweep.mjs post counts it from the transcripts itself (OLA-245 check #2)
  // A written rule for a weakness that already has a fix is the fix that failed (correct.mjs): refused.
  const weakById = new Map(loadWeaknesses(rootUrl).map((w) => [w.id, w]))
  for (const side of ['kit', 'ola']) for (const [n, c] of (Array.isArray(e[side]) ? e[side] : []).entries()) {
    // OLA-260: enforced: true is the code's, not the author's: a code file (not a note, not a .md) that a commit changed that day
    const code = codeChangedOn(c.where, e.day)
    if (c.enforced && !code.ok) bad.push(`${side}[${n}] says enforced: true, but ${code.why}. A change is enforced when code refuses or does it: name that file in where`)
    const enforced = c.enforced && code.ok
    // a written rule: level 1, a rule named, or any change whose where is a text file sessions read (RULES.md, SWEEP.md, CLAUDE.md, a skill, any .md)
    const written = !enforced && (Number(c.level) === 1 || /\.md\b/i.test(c.where ?? '') || /\brules? \d+|RULES\.md|LESSONS\.md|CLAUDE\.md|SWEEP\.md|SKILL\.md|a (new )?rule\b/i.test(`${c.where ?? ''} ${c.changed ?? ''}`))
    const w = weakById.get(c.weakness)
    const before = (w?.guards ?? []).filter((g) => g.day < e.day)
    if (written && before.length) bad.push(`${side}[${n}] adds a written rule for "${w.name}", which already has a fix (strongest: kind ${Math.max(...before.map((g) => g.level ?? (g.enforced ? 3 : 1)))}): a rule of the same kind is what failed. Make the change stronger (correct.mjs: refused by code, checked by another, taken away) or, when none can be built yet, owe it with correct.mjs add --owed OLA-n`)
  }
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
  const texts = [e.summary, e.pattern, e.build?.text, e.ideas?.kit?.text, e.ideas?.kit?.why, e.ideas?.ola?.text, e.ideas?.ola?.why, e.learning?.changed, e.learning?.why, e.learning?.where, e.learningReview?.text, ...(e.open ?? []).map((o) => o.text), ...(Array.isArray(e.cleaned) ? e.cleaned.map((c) => c.what) : []), ...['kit', 'ola'].flatMap((k) => (Array.isArray(e[k]) ? e[k] : []).flatMap((c) => [c.saw, c.changed, c.where]))].filter((t) => typeof t === 'string')
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
  const del = spawnSync('node', [root + 'scripts/venture/delegable.mjs', '--day', day, '--json'], { encoding: 'utf8', maxBuffer: 16e6 })
  const models = del.status === 0 ? JSON.parse(del.stdout.trim().split('\n').pop()) : { shares: [], rule: '', stretches: [], note: `not read: ${(del.stderr || '').trim().split('\n').pop()}` }
  console.log(JSON.stringify({ day, by: 'Kit', summary: '', read: f.counts, pattern: '', cleaned: [{ did: 'removed', what: '', where: '' }], models, kit: [{ weakness: '', saw: '', changed: '', where: '', enforced: false }], ola: [], open: [{ text: '', issue: 'OLA-0' }], build: { text: '', issue: 'OLA-0' }, ideas: { kit: { text: '', why: '', issue: 'OLA-0' }, ola: { text: '', why: '', issue: 'OLA-0' } }, ...(day >= TRIAL.from && day <= TRIAL.to ? { learning: { changed: '', why: '', where: '', enforced: false } } : {}), ...(day === TRIAL.review ? { learningReview: { text: '', issue: TRIAL.issue } } : {}) }, null, 2))
} else if (cmd === 'post') {
  const file = args[1]
  if (!file || !existsSync(file)) die('usage: sweep.mjs post <entry.json>')
  const e = JSON.parse(readFileSync(file, 'utf8'))
  const bad = checkEntry(e)
  // OLA-245 check #2, OLA-261: the models part is counted here from the transcripts of every machine the
  // lead ran on (delegable.mjs), never taken from the entry; what the author wrote there is ignored.
  {
    const del = spawnSync('node', [root + 'scripts/venture/delegable.mjs', '--day', e.day, '--json'], { encoding: 'utf8', maxBuffer: 16e6 })
    const counted = del.status === 0 ? JSON.parse(del.stdout.trim().split('\n').pop()) : null
    if (!counted) bad.push(`models: the count of the day's model use failed (${(del.stderr || del.stdout || '').trim().split('\n').pop()}); the entry is posted with the count, not without it`)
    else {
      const said = e.models
      if (said && (JSON.stringify(said.shares) !== JSON.stringify(counted.shares) || (said.stretches ?? []).length !== counted.stretches.length)) console.log(`note: the entry's models part differs from the count (${(said.stretches ?? []).length} stretch(es) written, ${counted.stretches.length} counted); the count is stored`)
      if (counted.missing?.length) console.log(`note: the count is missing ${counted.missing.join(', ')}; the entry says so on the page`)
      e.models = counted
    }
  }
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
    // OLA-175: every correction becomes a replay case the same day (or says why it cannot be one)
    const noCase = uncoveredCorrections(rootUrl, corrText)
    if (noCase.length) bad.push(`corrections with no replay case: ${noCase.join(', ')}. Write one per correction in ${CASE_DIR} (the situation just before the mistake, must, must_not, weakness; SWEEP.md, "A replay case for every correction"), or give the reason in ${UNTESTABLE}`)
    const dayLong = new Date(`${e.day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    const written = heads.filter((h) => h.includes(dayLong)).length
    const graded = (await getState(db, 'steers'))?.value?.days?.[e.day]
    if (graded && graded.steers > written) bad.push(`the grader found ${graded.steers} corrections in Bart's messages on ${e.day} and CORRECTIONS.md has ${written} for that day: write down and file the others (node scripts/venture/steers.mjs --dry --day ${e.day} lists them)`)
    if (!graded) console.log(`note: ${e.day} is not graded yet (steers.mjs), so the count of corrections rests on the sweep's own re-read of the messages`)
    // OLA-251: a correction is recorded at once, its stronger fix may be owed; owed for more than two days blocks the day's entry
    const late = owedFixes(loadWeaknesses(rootUrl)).filter((o) => Date.now() - Date.parse(o.since) > OWED_DAYS * 86400e3)
    if (late.length) bad.push(`fixes owed for more than ${OWED_DAYS} days: ${late.map((o) => `${o.ref} (${o.name}, ${o.issue}, ${o.days} days)`).join('; ')}. Build each and settle it: correct.mjs fix <n> --fix … --level … --where … (correct.mjs owed lists them)`)
  }
  const old = (await getState(db, 'sweeps'))?.value ?? { days: [] }
  // an idea is new: its ticket was not the idea of another day
  for (const side of ['kit', 'ola']) {
    const again = old.days.find((d) => d.day !== e.day && [d.ideas?.kit?.issue, d.ideas?.ola?.issue].includes(e.ideas?.[side]?.issue))
    if (again && e.ideas?.[side]?.issue) bad.push(`ideas.${side}: ${e.ideas[side].issue} was already the idea of ${again.day}; think of a new one`)
  }
  // OLA-251, third pass: the day's ways around a guard (issues.mjs overrides) are counted here from the
  // tracker's record and stored with the entry; what the author wrote there is ignored
  const ways = await overridesOf(db, e.day)
  const overrides = { count: ways.length, list: ways.map((v) => ({ at: v.at, ticket: v.ticket, what: v.what, caller: v.caller, tool: v.tool })) }
  if (e.overrides !== undefined && JSON.stringify(e.overrides) !== JSON.stringify(overrides)) console.log(`note: the entry's overrides part differs from the tracker's record (${e.overrides?.count ?? 'no count'} written, ${overrides.count} recorded); the record is stored`)
  console.log(`ways around a guard on ${e.day}: ${overrides.count} (stored with the entry; issues.mjs overrides --day ${e.day})`)
  if (bad.length) die(`the entry was not stored:\n- ${bad.join('\n- ')}`)
  if (args.includes('--dry')) (console.log(`--dry: the entry for ${e.day} passes every check; nothing was stored`), process.exit(0))
  if (!FAKE) refuseOnCopy('posting the entry')
  const told = old.days.find((d) => d.day === e.day)?.ideas?.told
  const ideas = { kit: { text: e.ideas.kit.text.trim(), why: e.ideas.kit.why.trim(), issue: e.ideas.kit.issue }, ola: { text: e.ideas.ola.text.trim(), why: e.ideas.ola.why.trim(), issue: e.ideas.ola.issue }, ...(told ? { told } : {}) }
  const entry = { day: e.day, at: e.at ?? new Date().toISOString(), by: e.by ?? 'Kit', summary: e.summary.trim(), ...(e.quiet ? { quiet: true } : {}), read: e.read, kit: e.kit.map((c) => ({ ...c, enforced: !!c.enforced })), ola: e.ola.map((c) => ({ ...c, enforced: !!c.enforced })), open: e.open, ...(e.build ? { build: e.build } : {}), ...(e.pattern ? { pattern: e.pattern } : {}), ideas, ...(e.learning ? { learning: { changed: e.learning.changed.trim(), why: e.learning.why.trim(), where: e.learning.where.trim(), enforced: !!e.learning.enforced, ...(e.learning.issue ? { issue: e.learning.issue } : {}) } } : {}), ...(e.learningReview ? { learningReview: e.learningReview } : {}), cleaned: e.cleaned.map((c) => ({ did: c.did, what: c.what.trim(), where: c.where.trim() })), overrides, models: { shares: e.models.shares, rule: e.models.rule, stretches: e.models.stretches, ...(e.models.note ? { note: e.models.note } : {}), ...(e.models.missing?.length ? { missing: e.models.missing } : {}) } }
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
  if (FAKE) (console.log(`a copy of the tracker (${process.env.VENTURE_TRACKER_FAKE}): stored there only; the Learning page was not refreshed and Bart was not texted`), process.exit(0))
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
