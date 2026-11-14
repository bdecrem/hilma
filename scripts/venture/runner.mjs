#!/usr/bin/env node
// The runner: Venture's work goes on when no terminal session is open.
// Bart, 2026-11-14: "runner yes". Lives on the Mac mini as the launchd job
// sh.venture.runner (apps/venture/runner/), which calls `tick` every five
// minutes. A tick costs nothing unless there is something to do:
//
//   1. An interactive session is open (its watchers wrote a heartbeat in the
//      last ten minutes)                                    → do nothing.
//   2. A run is already going                               → do nothing.
//   3. Nothing new (no text or voice note from Bart, no mail from a customer,
//      no sign-up, no finished voice conversation) and no work block due
//                                                           → do nothing.
//   4. Otherwise: pull the code and the private state, start Claude Code
//      headless with apps/venture/runner/PROMPT.md and the reasons it was
//      woken, give it thirty minutes, push the state back.
//
//   node scripts/venture/runner.mjs tick            what launchd runs
//   node scripts/venture/runner.mjs status          who is working, what is pending, the last run
//   node scripts/venture/runner.mjs tick --dry      decide and print, start nothing
//   node scripts/venture/runner.mjs probe           start Claude Code once, read-only (checks the login, the checkout and the state)
//
// It uses the Claude login saved on the machine it runs on (CLAUDE_CODE_OAUTH_TOKEN
// in ~/.venture-runner.env, read by the launchd job; ANTHROPIC_API_KEY is removed
// from the environment, as the Almanac and the Token Surfers agent do). What the
// unattended session may and may not do is in the prompt and in the tool list
// below: it reads, writes notes, answers people who wrote to us, researches;
// it does not commit, push, spend, or write to a stranger.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { getState, setState } from './_state.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const env = Object.fromEntries(
  readFileSync(root + '.env.local', 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

const MIN = 60e3
const SESSION_FRESH = 10 * MIN // a heartbeat younger than this = someone is at a terminal
const RUN_LIMIT = 30 * MIN // one unattended run
const WORK_EVERY = 3 * 60 * MIN // with nothing new, still take the next action this often
const WORK_HOURS = [6, 22] // local time on the machine; no work blocks at night
const logDir = `${homedir()}/Library/Logs/venture-runner`
const [cmd = 'tick', flag] = process.argv.slice(2)
const say = (s) => console.log(`${new Date().toISOString().slice(0, 19)}Z ${s}`)
const age = (iso) => (iso ? Date.now() - new Date(iso).getTime() : Infinity)
const mins = (ms) => (ms === Infinity ? 'never' : `${Math.round(ms / MIN)} min ago`)

async function count(table, filter) {
  const { count: n, error } = await filter(db.from(table).select('id', { count: 'exact', head: true }))
  if (error) throw new Error(`${table}: ${error.message}`)
  return n ?? 0
}

// Voice conversations that ended after anyone last looked (the last heartbeat of
// a session, or the end of the last run).
async function voiceSince(since) {
  const { data, error } = await db.from('venture_interview_turns').select('session, role, text, at').gte('at', new Date(since).toISOString()).order('id')
  if (error) throw new Error(`venture_interview_turns: ${error.message}`)
  const by = new Map()
  for (const t of data) by.set(t.session, [...(by.get(t.session) ?? []), t])
  return [...by.values()].filter((turns) => !turns.some((t) => t.role === 'event' && t.text === 'test') && turns.filter((t) => t.role === 'bart').length >= 2 && age(turns[turns.length - 1].at) > 3 * MIN).length
}

async function look() {
  const session = await getState(db, 'session')
  const runner = await getState(db, 'runner')
  const lastEnd = runner?.value?.ended ?? null
  const looked = Math.max(session ? new Date(session.at).getTime() : 0, lastEnd ? new Date(lastEnd).getTime() : 0) || Date.now() - 24 * 60 * MIN
  const texts = await count('venture_messages', (q) => q.eq('direction', 'in').is('seen_at', null))
  const mail = await count('kochito_mail', (q) => q.eq('direction', 'in').is('seen_at', null))
  const leads = await count('kochito_leads', (q) => q.is('seen_at', null))
  const voice = await voiceSince(looked)
  const hour = new Date().getHours()
  const block = hour >= WORK_HOURS[0] && hour < WORK_HOURS[1] && age(lastEnd) > WORK_EVERY && age(session?.at) > 30 * MIN
  // What the last run left unread does not wake the next tick again for an hour
  // (a run that could not deal with something must not loop every five minutes).
  const left = age(lastEnd) < 60 * MIN ? (runner?.value?.left ?? {}) : {}
  const fresh = (n, k) => n > (left[k] ?? 0)
  const why = [fresh(texts, 'texts') && `${texts} unread text(s) or voice note(s) from Bart`, fresh(mail, 'mail') && `${mail} unread message(s) to the company's addresses`, fresh(leads, 'leads') && `${leads} new sign-up(s)`, voice && `${voice} voice conversation(s) ended since anyone looked`, block && 'a work block is due: take the next action in NOW.md that needs nothing from Bart'].filter(Boolean)
  return { session, runner, why, counts: { texts, mail, leads } }
}

function claude(prompt, { readOnly = false, limit = RUN_LIMIT } = {}) {
  mkdirSync(logDir, { recursive: true })
  const log = `${logDir}/${new Date().toISOString().replace(/[:.]/g, '-')}.log`
  const tools = ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Bash(date*)', 'Bash(ls*)', 'Bash(git log*)', 'Bash(git status*)']
  if (!readOnly) tools.push('Edit', 'Write', 'Agent', 'Bash(node scripts/venture/*)')
  const childEnv = { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? '/usr/bin:/bin'}` }
  delete childEnv.ANTHROPIC_API_KEY // the machine's own Claude login, not a key
  return new Promise((done) => {
    const p = spawn('claude', ['-p', prompt, '--permission-mode', readOnly ? 'default' : 'acceptEdits', '--allowedTools', ...tools, '--disallowedTools', 'Bash(git push*)', 'Bash(git commit*)', 'Bash(node scripts/venture/runner.mjs*)'], { cwd: root, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    const timer = setTimeout(() => { out += `\n(stopped by the runner after ${limit / MIN} minutes)\n`; p.kill('SIGTERM') }, limit)
    p.on('error', (e) => { clearTimeout(timer); writeFileSync(log, out + `\n${e.message}\n`); done({ code: -1, out: e.message, log }) })
    p.on('close', (code) => { clearTimeout(timer); writeFileSync(log, out); done({ code, out, log }) })
  })
}

const run = (file, args, opts = {}) => spawnSync(file, args, { cwd: root, encoding: 'utf8', ...opts })

if (cmd === 'status') {
  const { session, runner, why } = await look()
  console.log(`interactive session: ${session ? `${session.value.host}, heartbeat ${mins(age(session.at))}${age(session.at) < SESSION_FRESH ? ' (open: the runner stays idle)' : ''}` : 'none seen'}`)
  const r = runner?.value
  console.log(`runner: ${r ? (r.running ? `RUNNING on ${r.host} since ${r.started} (${r.why.join('; ')})` : `idle; last run ${r.ended ?? 'never'}${r.ended ? `, exit ${r.code}, because: ${r.why.join('; ')}` : ''}`) : 'never ran'}`)
  console.log(`pending: ${why.length ? why.join('; ') : 'nothing'}`)
} else if (cmd === 'probe') {
  const pulled = run('node', ['scripts/venture/sync.mjs', 'pull'])
  const res = await claude('Read apps/venture/private/RULES.md and apps/venture/private/NOW.md. Reply with exactly two lines: the number of rules in RULES.md, and the "Updated" line of NOW.md. Change nothing.', { readOnly: true, limit: 5 * MIN })
  console.log(`pull: ${pulled.status === 0 ? 'ok' : pulled.stderr}\nclaude exit ${res.code}\n${res.out.trim()}\nlog: ${res.log}`)
  process.exit(res.code === 0 ? 0 : 1)
} else if (cmd === 'tick') {
  const { session, runner, why } = await look()
  if (session && age(session.at) < SESSION_FRESH) { say(`a session is open on ${session.value.host} (${mins(age(session.at))}): idle`); process.exit(0) }
  if (runner?.value?.running && age(runner.value.started) < RUN_LIMIT + 10 * MIN) { say('a run is already going: idle'); process.exit(0) }
  if (!why.length) process.exit(0) // nothing to do; stay silent so the log stays short
  say(`waking: ${why.join('; ')}`)
  if (flag === '--dry') process.exit(0)
  const started = new Date().toISOString()
  await setState(db, 'runner', { running: true, host: hostname(), started, why })
  let res = { code: -1, log: '' }
  try {
    const git = run('git', ['pull', '--ff-only', '--quiet'])
    if (git.status !== 0) say(`git pull failed (working from the checkout as it is): ${git.stderr.trim().split('\n')[0]}`)
    const pulled = run('node', ['scripts/venture/sync.mjs', 'pull'])
    if (pulled.status !== 0) throw new Error(`could not pull the private state: ${pulled.stderr}`)
    const prompt = `${readFileSync(root + 'apps/venture/runner/PROMPT.md', 'utf8')}\n\n## This run\n\nIt is ${new Date().toString()}. You were woken because: ${why.join('; ')}.`
    res = await claude(prompt)
    say(`claude finished, exit ${res.code}, log ${res.log}`)
    const pushed = run('node', ['scripts/venture/sync.mjs', 'push'])
    if (pushed.status !== 0) say(`push failed: ${pushed.stderr}`)
  } catch (e) {
    say(`run failed: ${e.message}`)
  } finally {
    const left = await look().then((l) => l.counts).catch(() => ({}))
    await setState(db, 'runner', { running: false, host: hostname(), started, ended: new Date().toISOString(), why, code: res.code, log: res.log, left })
  }
} else {
  console.error('usage: runner.mjs tick [--dry] | status | probe')
  process.exit(1)
}
