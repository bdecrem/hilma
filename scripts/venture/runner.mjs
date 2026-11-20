#!/usr/bin/env node
// The runner: Venture's work goes on, day and night. Lives on the Mac mini as the launchd job
// sh.venture.runner (apps/venture/runner/), which calls `tick` every five minutes.
//
// Bart, 2026-11-14: "runner yes". Bart, 2026-11-19 (OLA-211), after it had done nothing for five
// days because a terminal session's heartbeat was always fresh: "'venture mode' is supposed to be a
// hardworking technical cofounder not some moron who goes to sleep for no reason and FOREVER."
// So since Nov 19 the runner works the tracker. A tick:
//
//   1. A run is already going on this machine                           → do nothing.
//   2. The plan's usage limit was reached (or a run could not start) and the
//      reset (plus a minute) has not come yet                            → do nothing.
//   3. No session is open and something came in that a session would answer (a text or voice note
//      from Bart, his writes on the board's tracker, mail, a sign-up, a finished voice call, minutes,
//      the daily sweep, a stale board): an answer run with PROMPT.md, as before. A session that is
//      open answers these itself.
//   4. Then the tracker: the top open ticket (P0, then P1, then P2; the newest private PLATE-*.md
//      orders within a priority; oldest first) that is not waiting on Bart, not claimed by a live
//      session (issues.mjs claim, 45 minutes), not a recurring job, gets a work run with WORK.md:
//      build, check, commit, push, deploy, `issues.mjs done` with proof. Then the next ticket, in
//      the same tick, until none is left or the limit is reached. Nights too.
//   Once a night, between 2 and 8 am Pacific (after the plan's 2 am reset), before the tracker: the
//   replay test (OLA-175, scripts/venture/steer-replay.mjs --nightly): every past correction put to a
//   fresh session with the rules and without, the result on the Learning page and each failing case
//   filed under its weakness. Not a Claude Code run of its own: the script asks Claude once per
//   answer and grade, on the same login.
//
//   node scripts/venture/runner.mjs tick            what launchd runs
//   node scripts/venture/runner.mjs status          one line: open tickets, the last finished, who is working or IDLE
//   node scripts/venture/runner.mjs status --long   and the session, the last run, what is pending
//   node scripts/venture/runner.mjs tick --dry      decide and print why, start nothing
//   node scripts/venture/runner.mjs tick --force "why"   an answer run now, whatever the state (a test, or by hand)
//   node scripts/venture/runner.mjs probe           start Claude Code once, read-only (checks the login, the checkout and the state)
//   node scripts/venture/runner.mjs replay          the nightly replay test now, as the night runs it (by hand, or to prove it)
//   --dry also takes --fake-session (as if a session's heartbeat were fresh), --fake-claim OLA-n,
//   --fake-limit (as if the limit were reached until 2 am), to show the choices without changing anything.
//
// It uses the Claude login saved on the machine it runs on (CLAUDE_CODE_OAUTH_TOKEN in
// ~/.venture-runner.env, read by the launchd job; ANTHROPIC_API_KEY is removed from the
// environment): all agent work runs on Bart's Max plan. What a run may and may not do is in the
// prompts; the hard lines (no destructive operations, no spending, nothing sent outside, no change
// to who can sign in, no Chinese open-weights model in Ola without his yes) are in WORK.md.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { sweepDue, getState, setState, pacificDay } from './_state.mjs'
import { markSeen, minutesText, unseenMinutes } from './_minutes.mjs'
import { CLAIM_PREFIX, CLAIM_TTL, MIN, afterRun, leadLine, limitFrom, pickTicket, plateOrder } from './_plate.mjs'

// ------------------------------------------------------------------ settings
const MODEL = 'opus' // every run (Bart, Nov 19: Opus, not Fable); the CLI's alias for the newest Opus
const SESSION_FRESH = 10 * MIN // a heartbeat younger than this = someone is at a terminal
const ANSWER_RUN_LIMIT = 30 * MIN // a run that answers what came in
const WORK_RUN_LIMIT = 90 * MIN // a run on one ticket
const CLAIM_RENEW = 10 * MIN // the runner renews its own claim this often while a run goes
const LIMIT_RETRY = 30 * MIN // the limit was reached and the message named no reset time
const AFTER_RESET = 1 * MIN // start again this long after the reset
const QUICK_FAIL = 2 * MIN // a run that ends with an error this fast did not start (login, network): pause
const MAX_RUNS_PER_TICK = 24 // a safety stop; one tick normally ends long before
const WORK_EVERY = 3 * 60 * MIN // with no ticket to work and nothing new, still take the next action in NOW.md this often
const BOARD_STALE = 3 * 60 * MIN // the journal older than this, in the day, wakes a refresh
const BOARD_HOURS = [7, 23] // Pacific
const REPLAY_HOURS = [2, 8] // Pacific: the nightly replay test starts in this window, once a day
const REPLAY_LIMIT = 150 * MIN // a replay run (about 70 cases, four calls at a time)

const root = fileURLToPath(new URL('../../', import.meta.url))
const env = Object.fromEntries(
  readFileSync(root + '.env.local', 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

const pacificHour = () => Number(new Date().toLocaleString('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Los_Angeles' }))
const logDir = `${homedir()}/Library/Logs/venture-runner`
const lockFile = `${logDir}/run.lock`
const argv = process.argv.slice(2)
const cmd = argv[0] ?? 'tick'
const has = (f) => argv.includes(f)
const optv = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined)
const DRY = has('--dry')
const say = (s) => console.log(`${new Date().toISOString().slice(0, 19)}Z ${s}`)
const age = (iso) => (iso ? Date.now() - new Date(iso).getTime() : Infinity)
const mins = (ms) => (ms === Infinity ? 'never' : `${Math.round(ms / MIN)} min ago`)
const at = (t) => new Date(t).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
// Only the runner's own clone is ever reset; a dry run from a dev tree never touches git.
const OWN_CHECKOUT = root.replace(/\/$/, '') === `${homedir()}/hilma-venture`
const run = (file, args, opts = {}) => spawnSync(file, args, { cwd: root, encoding: 'utf8', ...opts })

async function count(table, filter) {
  const { count: n, error } = await filter(db.from(table).select('id', { count: 'exact', head: true }))
  if (error) throw new Error(`${table}: ${error.message}`)
  return n ?? 0
}

// Voice conversations that ended after anyone last looked (the last heartbeat of a session, or the
// end of the last answer run).
async function voiceSince(since) {
  const { data, error } = await db.from('venture_interview_turns').select('session, role, text, at').gte('at', new Date(since).toISOString()).order('id')
  if (error) throw new Error(`venture_interview_turns: ${error.message}`)
  const by = new Map()
  for (const t of data) by.set(t.session, [...(by.get(t.session) ?? []), t])
  return [...by.values()].filter((turns) => !turns.some((t) => t.role === 'event' && t.text === 'test') && turns.filter((t) => t.role === 'bart').length >= 2 && age(turns[turns.length - 1].at) > 3 * MIN).length
}

async function claims() {
  const { data, error } = await db.from('venture_state').select('key, value, at').like('key', `${CLAIM_PREFIX}%`)
  if (error) throw new Error(`venture_state: ${error.message}`)
  return Object.fromEntries(data.map((r) => [r.key.slice(CLAIM_PREFIX.length), { ...r.value, at: r.at }]))
}
const claim = (id) => setState(db, CLAIM_PREFIX + id, { who: 'runner', host: hostname(), since: new Date().toISOString() })
const renew = async (id, since) => db.from('venture_state').upsert({ key: CLAIM_PREFIX + id, value: { who: 'runner', host: hostname(), since }, at: new Date().toISOString() })
const release = (id) => db.from('venture_state').delete().eq('key', CLAIM_PREFIX + id)

async function openIssues() {
  const { data, error } = await db.from('venture_issues').select('*').eq('project', 'ola').order('num')
  if (error) throw new Error(`venture_issues: ${error.message}`)
  return data
}

function plate() {
  const dir = root + 'apps/venture/private/'
  const f = existsSync(dir) ? readdirSync(dir).filter((n) => /^PLATE-.*\.md$/.test(n)).sort().pop() : null
  return { file: f, ...plateOrder(f ? readFileSync(dir + f, 'utf8') : '') }
}

// What came in that a session (or, with none open, an answer run) should handle.
async function look() {
  const session = await getState(db, 'session')
  const runner = await getState(db, 'runner')
  const lastEnd = runner?.value?.answerEnded ?? runner?.value?.ended ?? null
  const looked = Math.max(session ? new Date(session.at).getTime() : 0, lastEnd ? new Date(lastEnd).getTime() : 0) || Date.now() - 24 * 60 * MIN
  const texts = await count('venture_messages', (q) => q.eq('direction', 'in').is('seen_at', null))
  const mail = await count('kochito_mail', (q) => q.eq('direction', 'in').is('seen_at', null))
  const leads = await count('kochito_leads', (q) => q.is('seen_at', null))
  const voice = await voiceSince(looked)
  const minutes = await unseenMinutes(db)
  // What the last answer run left unread does not wake the next tick again for an hour.
  const left = age(lastEnd) < 60 * MIN ? (runner?.value?.left ?? {}) : {}
  const { data: journal, error: jErr } = await db.from('venture_docs').select('updated_at').eq('slug', 'journal').maybeSingle()
  if (jErr) throw new Error(`venture_docs: ${jErr.message}`)
  const ph = pacificHour()
  const stale = ph >= BOARD_HOURS[0] && ph < BOARD_HOURS[1] && age(journal?.updated_at) > BOARD_STALE && age(lastEnd) > 60 * MIN
  const fresh = (n, k) => n > (left[k] ?? 0)
  const board = await count('venture_issue_activity', (q) => q.eq('via', 'board').is('seen_by_kit_at', null)).catch(() => 0)
  const owed = await sweepDue(db).catch(() => [])
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const sweep = owed.length > 0 && (ph >= 21 || owed.some((d) => d < today)) && age(lastEnd) > 60 * MIN
  const why = [fresh(texts, 'texts') && `${texts} unread text(s) or voice note(s) from Bart`, fresh(board, 'board') && `${board} thing(s) Bart wrote on the board's tracker (a new ticket, a reopened one or a comment): handle each as PROMPT.md says under "Bart wrote on the tracker"`, sweep && `the daily sweep is owed for ${owed.join(', ')}: do it as PROMPT.md says under "The daily sweep"`, fresh(mail, 'mail') && `${mail} unread message(s) to the company's addresses`, fresh(leads, 'leads') && `${leads} new sign-up(s)`, voice && `${voice} voice conversation(s) ended since anyone looked`, fresh(minutes.length, 'minutes') && `${minutes.length} new minutes of a voice call or note`, stale && `the board is stale (the journal was last written ${mins(age(journal?.updated_at))}): refresh it first, as PROMPT.md says under "The board is stale"`].filter(Boolean)
  const sessionOpen = has('--fake-session') || (!!session && age(session.at) < SESSION_FRESH)
  return { session, sessionOpen, runner, lastEnd, why, minutes, counts: { texts, mail, leads, minutes: minutes.length, board } }
}

function claude(prompt, { readOnly = false, limit = ANSWER_RUN_LIMIT, work = false } = {}) {
  mkdirSync(logDir, { recursive: true })
  const log = `${logDir}/${new Date().toISOString().replace(/[:.]/g, '-')}.log`
  let tools = ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Bash(date*)', 'Bash(ls*)', 'Bash(git log*)', 'Bash(git status*)']
  let denied = ['Bash(git push*)', 'Bash(git commit*)', 'Bash(node scripts/venture/runner.mjs*)']
  if (!readOnly) tools.push('Edit', 'Write', 'Agent', 'Bash(node scripts/venture/*)')
  if (work) {
    // A ticket run builds, checks, commits and pushes: the whole shell, less what is never its call.
    tools = ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Agent', 'WebSearch', 'WebFetch', 'TodoWrite', 'NotebookEdit']
    denied = ['Bash(node scripts/venture/runner.mjs*)', 'Bash(git push --force*)', 'Bash(git push -f*)', 'Bash(git push origin +*)', 'Bash(sudo *)', 'Bash(node scripts/venture/mail.mjs send*)', 'Bash(vercel env*)', 'Bash(vercel link*)', 'Bash(env)', 'Bash(printenv*)']
  }
  const childEnv = { ...process.env, VENTURE_RUNNER: '1', DISABLE_AUTOUPDATER: '1', PATH: `${homedir()}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? '/usr/bin:/bin'}` }
  delete childEnv.ANTHROPIC_API_KEY // the machine's own Claude login (the Max plan), never a key
  const args = ['-p', prompt, '--model', MODEL, '--output-format', 'stream-json', '--verbose', '--permission-mode', readOnly ? 'default' : 'acceptEdits', '--allowedTools', ...tools, '--disallowedTools', ...denied]
  const t0 = Date.now()
  return new Promise((done) => {
    const p = spawn('claude', args, { cwd: root, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    const timer = setTimeout(() => { out += `\n(stopped by the runner after ${limit / MIN} minutes)\n`; p.kill('SIGTERM') }, limit)
    const finish = (code, extra = '') => {
      clearTimeout(timer)
      writeFileSync(log, out + extra)
      let result = ''
      for (const l of out.split('\n')) if (l.startsWith('{') && l.includes('"result"')) { try { const j = JSON.parse(l); if (j.type === 'result') result = String(j.result ?? '') } catch {} }
      done({ code, out, log, ms: Date.now() - t0, result: result || out.trim().split('\n').slice(-3).join(' ').slice(0, 400) })
    }
    p.on('error', (e) => finish(-1, `\n${e.message}\n`))
    p.on('close', (code) => finish(code))
  })
}

// Everything a run leaves behind that is not on main is saved to the log folder, then the clone is
// put back on origin/main, so every run starts clean and nothing is silently lost.
function freshCheckout(tag) {
  if (!OWN_CHECKOUT) { const g = run('git', ['pull', '--ff-only', '--quiet']); if (g.status !== 0) say(`git pull failed (working from the checkout as it is): ${g.stderr.trim().split('\n')[0]}`); return }
  run('git', ['fetch', '--quiet', 'origin'])
  const dirty = run('git', ['diff', 'HEAD']).stdout
  const ahead = run('git', ['log', '--oneline', 'origin/main..HEAD']).stdout.trim()
  if (dirty.trim()) { writeFileSync(`${logDir}/left-${tag}.diff`, dirty); say(`saved uncommitted changes to ${logDir}/left-${tag}.diff`) }
  if (ahead) { run('git', ['format-patch', '--quiet', '-o', `${logDir}/left-${tag}`, 'origin/main..HEAD']); say(`saved ${ahead.split('\n').length} unpushed commit(s) to ${logDir}/left-${tag}/`) }
  const r = run('git', ['reset', '--hard', '--quiet', 'origin/main'])
  if (r.status !== 0) throw new Error(`could not reset the checkout: ${r.stderr.trim()}`)
}

// One run at a time on this machine: a lock with the pid, and the "running" record in the database.
function locked() {
  if (!existsSync(lockFile)) return false
  const pid = Number(readFileSync(lockFile, 'utf8'))
  try { process.kill(pid, 0); return pid !== process.pid } catch { return false }
}
const lock = () => { mkdirSync(logDir, { recursive: true }); writeFileSync(lockFile, String(process.pid)) }
const unlock = () => { try { if (Number(readFileSync(lockFile, 'utf8')) === process.pid) rmSync(lockFile) } catch {} }

async function limitState() {
  if (has('--fake-limit')) {
    const text = "You've hit your session limit · resets 2am (America/Los_Angeles)"
    const lim = limitFrom(`{"type":"result","subtype":"success","is_error":true,"result":${JSON.stringify(text)}}`)
    return { kind: 'limit', until: new Date(lim.resetsAt + AFTER_RESET).toISOString(), text: `${lim.text} (faked by --fake-limit)` }
  }
  const s = (await getState(db, 'runner_limit'))?.value
  return s?.until && Date.parse(s.until) > Date.now() ? s : null
}

/** After any run: was it stopped by the usage limit, or did it fail before it started? Records the pause. */
async function pauseIfNeeded(res) {
  const lim = limitFrom(res.out)
  if (lim) {
    const until = new Date((lim.resetsAt ?? Date.now() + LIMIT_RETRY - AFTER_RESET) + AFTER_RESET).toISOString()
    await setState(db, 'runner_limit', { kind: 'limit', until, text: lim.text, resetKnown: !!lim.resetsAt, at: new Date().toISOString() })
    say(`limit reached, resets at ${lim.resetsAt ? at(lim.resetsAt) : 'an unnamed time'}; starting again ${at(until)} ("${lim.text}")`)
    return 'limit'
  }
  if (res.code !== 0 && res.ms < QUICK_FAIL) {
    const until = new Date(Date.now() + LIMIT_RETRY).toISOString()
    await setState(db, 'runner_limit', { kind: 'error', until, text: res.result.slice(0, 300), at: new Date().toISOString() })
    say(`the run failed in ${Math.round(res.ms / 1000)} s (exit ${res.code}): pausing until ${at(until)}: ${res.result.slice(0, 200)}`)
    return 'error'
  }
  return null
}

async function setRunner(v) {
  const prev = (await getState(db, 'runner'))?.value ?? {}
  await setState(db, 'runner', { ...prev, ...v })
}

async function answerRun(seen, why) {
  const started = new Date().toISOString()
  await setRunner({ running: true, kind: 'answer', ticket: null, host: hostname(), pid: process.pid, started, why })
  let res = { code: -1, log: '', out: '', ms: 0, result: '' }
  let paused = null
  try {
    freshCheckout(started.replace(/[:.]/g, '-'))
    const pulled = run('node', ['scripts/venture/sync.mjs', 'pull'])
    if (pulled.status !== 0) throw new Error(`could not pull the private state: ${pulled.stderr}`)
    const minutes = seen.minutes ?? []
    // Bart, 2026-11-17: "when we have voice mode I need those conversations to go into your memory
    // and decisions to be acted on, always."
    const voice = minutes.length
      ? `\n\n## Minutes of voice calls and notes (act on these)\n\nPut each Decided line under "## Decided" and each To be decided line under "## To be decided" in apps/venture/private/JOURNAL.md, the board (dated, newest first; a line he set is his). Never move a To be decided line to Decided yourself: only his words do that. Do what Kit will do asks, within this prompt's limits, and say on the board what you did. Facts go in the notes they belong to.\n\n${minutes.map(minutesText).join('\n\n')}`
      : ''
    const prompt = `${readFileSync(root + 'apps/venture/runner/PROMPT.md', 'utf8')}\n\n## This run\n\nIt is ${new Date().toString()}. You were woken because: ${why.join('; ')}.${voice}`
    res = await claude(prompt)
    say(`answer run finished, exit ${res.code}, log ${res.log}`)
    paused = await pauseIfNeeded(res)
    if (res.code === 0 && !paused) await markSeen(db, minutes.map((m) => m.id))
    const pushed = run('node', ['scripts/venture/sync.mjs', 'push'])
    if (pushed.status !== 0) say(`push failed: ${pushed.stderr}`)
  } catch (e) {
    say(`answer run failed: ${e.message}`)
  } finally {
    const left = await look().then((l) => l.counts).catch(() => ({}))
    const ended = new Date().toISOString()
    await setRunner({ running: false, kind: 'answer', ticket: null, host: hostname(), started, ended, answerEnded: ended, why, code: res.code, log: res.log, left })
  }
  return paused
}

async function workRun(issue, tickets) {
  const id = issue.id
  const started = new Date().toISOString()
  await claim(id)
  await setRunner({ running: true, kind: 'ticket', ticket: id, host: hostname(), pid: process.pid, started, why: [`${id}: ${issue.title}`] })
  const keep = setInterval(() => renew(id, started).catch(() => {}), CLAIM_RENEW)
  let res = { code: -1, log: '', out: '', ms: 0, result: '' }
  let paused = null
  let outcome = 'failed'
  try {
    freshCheckout(started.replace(/[:.]/g, '-'))
    const pulled = run('node', ['scripts/venture/sync.mjs', 'pull'])
    if (pulled.status !== 0) say(`could not pull the private state (working without it): ${pulled.stderr.trim().split('\n')[0]}`)
    if (issue.status === 'open') run('node', ['scripts/venture/issues.mjs', 'start', id, '--who', 'runner'])
    const thread = run('node', ['scripts/venture/issues.mjs', 'show', id]).stdout
    const before = tickets[id] ?? {}
    const prompt = `${readFileSync(root + 'apps/venture/runner/WORK.md', 'utf8')}\n\n## This run\n\nIt is ${new Date().toString()}. Your ticket is ${id}.${before.runs ? ` The runner has run on it ${before.runs} time(s) before; its comments and commits are in the thread.` : ''}\n\n\`\`\`\n${thread.trim()}\n\`\`\``
    res = await claude(prompt, { limit: WORK_RUN_LIMIT, work: true })
    say(`${id}: run finished, exit ${res.code}, ${Math.round(res.ms / MIN)} min, log ${res.log}`)
    paused = await pauseIfNeeded(res)
    const pushed = run('node', ['scripts/venture/sync.mjs', 'push'])
    if (pushed.status !== 0) say(`push of the private state failed: ${pushed.stderr.trim().split('\n')[0]}`)
    if (!paused) {
      run('git', ['fetch', '--quiet', 'origin'])
      const n = String(issue.num ?? id.split('-')[1])
      const made = run('git', ['log', 'origin/main', `--since=${started}`, '-E', `--grep=OLA-${n}([^0-9]|$)`, '--format=%h']).stdout.trim()
      const now = (await db.from('venture_issues').select('status, updated_at').eq('id', id).maybeSingle()).data
      const blocked = /RUNNER:\s*blocked by (OLA-\d+)/i.exec(res.result)?.[1] ?? null
      const waitUntil = /RUNNER:\s*waiting until (\S+)/i.exec(res.result)?.[1] ?? null
      const r = afterRun(before, { status: now?.status, made: !!made, blockedBy: blocked, waitUntil: waitUntil && !Number.isNaN(Date.parse(waitUntil)) ? waitUntil : null })
      outcome = r.outcome
      if (r.giveUp) {
        run('node', ['scripts/venture/issues.mjs', 'comment', id, `The runner on the mini worked on this ${r.next.runs} time(s) and could not finish it. Its last words: ${res.result.replace(/\s+/g, ' ').slice(0, 300)}. It has moved on to the next ticket; a comment or an edit here puts this one back in its queue.`, '--who', 'runner'])
        r.next.skippedAt = new Date().toISOString()
        outcome += ', given up for now'
      }
      tickets[id] = r.next
      await setState(db, 'runner_tickets', tickets)
      say(`${id}: ${outcome}${made ? ` (commits ${made.split('\n').join(' ')})` : ''}`)
    }
  } catch (e) {
    say(`${id}: run failed: ${e.message}`)
  } finally {
    clearInterval(keep)
    await release(id)
    const ended = new Date().toISOString()
    await setRunner({ running: false, kind: 'ticket', ticket: id, host: hostname(), started, ended, why: [`${id}: ${issue.title}`], code: res.code, log: res.log, last: { ticket: id, outcome: paused ? `stopped: ${paused}` : outcome, at: ended } })
  }
  return paused
}

// The nightly replay test (OLA-175). Due in the night's window when today (Pacific) has no
// finished attempt; an attempt that failed (the limit, the login) is tried again an hour later, at
// most three times a night. "steer_replay_attempt" is written by steer-replay.mjs itself.
async function replayDue() {
  const h = pacificHour()
  if (h < REPLAY_HOURS[0] || h >= REPLAY_HOURS[1]) return false
  const a = (await getState(db, 'steer_replay_attempt'))?.value
  const night = (await getState(db, 'runner_replay'))?.value
  const today = pacificDay()
  const tonight = night?.day === today ? night.starts ?? 0 : 0
  if (tonight >= 3 || (night?.day === today && age(night.last) < 60 * MIN)) return false // a start that died before it recorded an attempt is not retried at once
  if (!a || pacificDay(Date.parse(a.at)) !== today) return true
  if (a.ok && !a.only) return false
  return !a.running && age(a.ended ?? a.at) > 60 * MIN
}

async function replayRun(why) {
  const started = new Date().toISOString()
  const night = (await getState(db, 'runner_replay'))?.value
  const today = pacificDay()
  await setState(db, 'runner_replay', { day: today, starts: (night?.day === today ? night.starts ?? 0 : 0) + 1, last: started })
  await setRunner({ running: true, kind: 'replay', ticket: null, host: hostname(), pid: process.pid, started, why: [why] })
  let outcome = 'failed'
  let log = ''
  try {
    freshCheckout(started.replace(/[:.]/g, '-'))
    const pulled = run('node', ['scripts/venture/sync.mjs', 'pull'])
    if (pulled.status !== 0) throw new Error(`could not pull the private state (the cases live there): ${pulled.stderr.trim().split('\n')[0]}`)
    mkdirSync(logDir, { recursive: true })
    log = `${logDir}/${started.replace(/[:.]/g, '-')}-replay.log`
    const env = { ...process.env, PATH: `${homedir()}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? '/usr/bin:/bin'}` }
    delete env.ANTHROPIC_API_KEY // the machine's Claude login (the Max plan), never a key
    const res = await new Promise((done) => {
      const p = spawn('node', ['scripts/venture/steer-replay.mjs', '--nightly'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      p.stdout.on('data', (d) => (out += d))
      p.stderr.on('data', (d) => (out += d))
      const timer = setTimeout(() => { out += `\n(stopped by the runner after ${REPLAY_LIMIT / MIN} minutes)\n`; p.kill('SIGTERM') }, REPLAY_LIMIT)
      p.on('close', (code) => { clearTimeout(timer); writeFileSync(log, out); done({ code, out }) })
      p.on('error', (e) => { clearTimeout(timer); writeFileSync(log, out + e.message); done({ code: -1, out: e.message }) })
    })
    const line = res.out.split('\n').find((l) => l.startsWith('with the rules:')) ?? res.out.trim().split('\n').pop()
    outcome = res.code === 0 ? line.replace(/^with the rules: /, '') : `exit ${res.code}: ${line.slice(0, 200)}`
    say(`replay test: ${outcome}, log ${log}`)
    const pushed = run('node', ['scripts/venture/sync.mjs', 'push']) // the weaknesses and STEERS.md; it also refreshes Learning (learning.mjs)
    if (pushed.status !== 0) say(`push of the private state failed: ${pushed.stderr.trim().split('\n')[0]}`)
  } catch (e) {
    outcome = `failed: ${e.message}`
    say(`replay test ${outcome}`)
  } finally {
    const ended = new Date().toISOString()
    await setRunner({ running: false, kind: 'replay', ticket: null, host: hostname(), started, ended, why: [why], log, last: { ticket: 'replay test', outcome, at: ended } })
  }
}

/** The decision for this moment: what to start, or why nothing. */
async function decide(seen) {
  const lim = await limitState()
  const fake = optv('--fake-claim')
  const live = await claims()
  if (fake) live[fake] = { who: 'session (faked by --fake-claim)', at: new Date().toISOString() }
  const issues = await openIssues()
  const tickets = (await getState(db, 'runner_tickets'))?.value ?? {}
  const p = plate()
  const choice = pickTicket(issues, { claims: live, tickets, order: p.order, recurring: p.recurring, sessionOpen: seen.sessionOpen, now: Date.now() })
  return { lim, live, issues, tickets, plate: p, choice }
}

if (cmd === 'status') {
  const runner = (await getState(db, 'runner'))?.value ?? null
  const live = await claims()
  const limit = await limitState()
  const issues = await openIssues()
  console.log(leadLine(issues, { runner, claims: live, limit }).text)
  if (has('--long')) {
    const { session, why } = await look()
    console.log(`interactive session: ${session ? `${session.value.host}, heartbeat ${mins(age(session.at))}${age(session.at) < SESSION_FRESH ? ' (open: it answers texts and the board; the runner still works tickets)' : ''}` : 'none seen'}`)
    console.log(`runner: ${runner ? (runner.running ? `RUNNING on ${runner.host} since ${runner.started} (${(runner.why ?? []).join('; ')})` : `idle; last run ended ${runner.ended ?? 'never'}${runner.last ? `, ${runner.last.ticket}: ${runner.last.outcome}` : ''}`) : 'never ran'}`)
    console.log(`claims: ${Object.entries(live).map(([id, c]) => `${id} by ${c.who}, renewed ${mins(age(c.at))}`).join('; ') || 'none'}`)
    if (limit) console.log(`paused: ${limit.kind === 'error' ? 'a run failed to start' : 'the usage limit'} until ${at(limit.until)} (${limit.text})`)
    console.log(`to answer: ${why.length ? why.join('; ') : 'nothing'}`)
  }
} else if (cmd === 'probe') {
  const pulled = run('node', ['scripts/venture/sync.mjs', 'pull'])
  const res = await claude('Read apps/venture/private/RULES.md and apps/venture/private/NOW.md. Reply with exactly two lines: the number of rules in RULES.md, and the "Updated" line of NOW.md. Change nothing.', { readOnly: true, limit: 5 * MIN })
  console.log(`pull: ${pulled.status === 0 ? 'ok' : pulled.stderr}\nclaude exit ${res.code}\n${res.result.trim()}\nlog: ${res.log}`)
  process.exit(res.code === 0 ? 0 : 1)
} else if (cmd === 'replay') {
  if (locked()) { console.error('a run is already going on this machine; try again when it ends'); process.exit(1) }
  lock()
  process.on('exit', unlock)
  await replayRun('the replay test, started by hand')
  const last = (await getState(db, 'runner'))?.value?.last
  console.log(`replay test: ${last?.outcome}`)
  process.exit(/^failed|^exit/.test(last?.outcome ?? 'failed') ? 1 : 0)
} else if (cmd === 'tick') {
  const runner = (await getState(db, 'runner'))?.value
  if (locked() || (runner?.running && runner.host === hostname() && age(runner.started) < WORK_RUN_LIMIT + 15 * MIN && runner.pid && (() => { try { process.kill(runner.pid, 0); return true } catch { return false } })())) {
    if (DRY) say('a run is already going on this machine: idle')
    process.exit(0)
  }
  if (!DRY) {
    lock()
    process.on('exit', unlock)
    // a run that died without cleaning up leaves its claims: they are no one's now
    for (const [id, c] of Object.entries(await claims())) if (c.who === 'runner' && c.host === hostname()) await release(id)
    if (runner?.running) await setRunner({ running: false, ended: new Date().toISOString(), last: { ticket: runner.ticket, outcome: 'the run died (the machine or the runner restarted)', at: new Date().toISOString() } })
  }
  const force = has('--force') ? [optv('--force') || 'a run was asked for by hand'] : null
  for (let n = 0; n < MAX_RUNS_PER_TICK; n++) {
    const seen = await look()
    const d = await decide(seen)
    if (d.lim && !force) {
      say(`paused: ${d.lim.kind === 'error' ? 'the last run failed to start' : 'the usage limit was reached'}; starting again ${at(d.lim.until)} (${d.lim.text})`)
      break
    }
    const answer = force ?? (seen.sessionOpen ? [] : seen.why)
    if (DRY) {
      say(`session: ${seen.sessionOpen ? `open${has('--fake-session') ? ' (faked)' : ''}: texts and the board are its to answer` : 'none open'}`)
      if (answer.length) say(`would first start an answer run: ${answer.join('; ')}`)
      if (await replayDue()) say('would run the nightly replay test (steer-replay.mjs --nightly) before the tracker')
      else if (seen.why.length) say(`would not answer (the open session does): ${seen.why.join('; ')}`)
      for (const x of d.choice.passed) say(`  passed over ${x.id}: ${x.why}`)
      if (d.choice.pick) { const i = d.choice.pick; say(`would start a work run on ${i.id} (${i.priority}, ${i.status === 'open' ? 'next up' : 'doing'}, opened ${i.opened_at.slice(0, 10)}${d.plate.order.includes(i.id) ? `, #${d.plate.order.indexOf(i.id) + 1} on ${d.plate.file}` : ''}): ${i.title}`) }
      else say('no ticket to work')
      break
    }
    if (answer.length) {
      say(`answer run: ${answer.join('; ')}`)
      if (await answerRun(seen, answer)) break
      if (force) break
      continue
    }
    if (await replayDue()) {
      say('the nightly replay test')
      await replayRun('the nightly replay test (OLA-175)')
      continue
    }
    if (d.choice.pick) {
      say(`work run on ${d.choice.pick.id}: ${d.choice.pick.title}`)
      if (await workRun(d.choice.pick, d.tickets)) break
      continue
    }
    // No ticket anyone may take and nothing to answer: the next action in NOW.md, every few hours.
    const lastAnswer = (await getState(db, 'runner'))?.value?.answerEnded
    if (!seen.sessionOpen && age(lastAnswer) > WORK_EVERY) {
      if (await answerRun(seen, ['no ticket is free: take the next action in NOW.md that needs nothing from Bart'])) break
    }
    break
  }
} else {
  console.error('usage: runner.mjs tick [--dry [--fake-session] [--fake-claim OLA-n] [--fake-limit] | --force "why"] | status [--long] | probe | replay')
  process.exit(1)
}
