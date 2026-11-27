#!/usr/bin/env node
// The daily morning text (Bart, 2026-11-16: "you shouild text me daily around 10am to
// schedule our daily checkin, which can be like this, over cli, or can be a voice
// conversation using one of our voice systems").
//   node scripts/venture/morning.mjs          send today's text, once a day (the guard is in venture_state)
//   node scripts/venture/morning.mjs --dry    print it without sending
// Runs at 10:00 on the Mac mini (launchd sh.venture.morning, apps/venture/launchd/).
// The agenda comes from the issue tracker since 2026-11-17 (venture_issues, schema 011;
// scripts/venture/issues.mjs): the plate is what is in progress, then what is next, P0 and P1
// first, and "Waiting on you" is the issues waiting on Bart. The journal is read only to fail
// loudly when it is gone. No model call, so it cannot fail on a model; if the tracker or the
// journal cannot be read it sends nothing and exits non-zero.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { getState, setState } from './_state.mjs'

const root = new URL('../../', import.meta.url)
const env = Object.fromEntries(
  readFileSync(new URL('.env.local', root), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const key = process.env.VENTURE_KEY || env.VENTURE_KEY || readFileSync(new URL('apps/venture/private/KEY', root), 'utf8').trim()
const dry = process.argv.includes('--dry')

const today = process.env.MORNING_TODAY || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) // MORNING_TODAY: test a day ahead with --dry
const sent = await getState(db, 'morning_text')
if (!dry && sent?.value?.date === today) {
  console.log(`already sent today (${today})`)
  process.exit(0)
}

const { data: doc, error } = await db.from('venture_docs').select('body').eq('slug', 'journal').maybeSingle()
if (error || !doc?.body) throw new Error(`cannot read the journal: ${error?.message ?? 'empty'}`)
const { data: open, error: iErr } = await db.from('venture_issues').select('id, title, priority, status, num, tracker').eq('project', 'ola').in('status', ['in_progress', 'open', 'waiting'])
if (iErr) throw new Error(`cannot read the issue tracker: ${iErr.message}`)
const order = { in_progress: 0, open: 1 }
const plate = open
  .filter((i) => i.status !== 'waiting' && i.priority !== 'P2' && !Array.isArray(i.tracker))
  .sort((a, b) => order[a.status] - order[b.status] || a.priority.localeCompare(b.priority) || a.num - b.num)
  .slice(0, 3)
  .map((i) => `${i.priority} ${i.title} (${i.id}${i.status === 'in_progress' ? ', doing' : ''})`)
const waiting = open.filter((i) => i.status === 'waiting').map((i) => i.title)

// Fable usage (Bart, 2026-11-16: "send me a USAGE update - the correct numbers are 70% this time
// tomorrow, 80% this time Wed, 90% this time Thu. if not, we need to increase the percentage of tasks
// given to Opus agents"). The iMac stores the last 24 h of Claude usage at 9:45 (usage.mjs --all --save,
// launchd sh.venture.usage); the weekly % is an estimate from his 60% reading of Nov 16 (venture_state
// "fable_week"). It only sees this iMac's sessions, so his real number from Settings wins.
const usage = (await getState(db, 'usage'))?.value
const fw = (await getState(db, 'fable_week'))?.value
let usageLine = ''
const fresh = usage && Date.now() - Date.parse(usage.at) < 6 * 3600_000
// A reading Bart gave from /usage within the last 18 h beats any estimate (fw.real_pct, fw.real_at).
const realAge = fw?.real_at ? Date.now() - Date.parse(fw.real_at) : Infinity
if (fw && realAge < 18 * 3600_000) {
  const target = fw.targets?.[today]
  const when = new Date(fw.real_at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
  usageLine = `Usage: Fable ${fw.real_pct}% of the week at your reading (${when})${target ? `, target for today ${target}%` : ''}.${target ? (fw.real_pct > target ? ' Over: I am moving more work to Opus agents today.' : ' On track.') : ''}`
  if (!dry) await setState(db, 'fable_week', { ...fw, est_pct: fw.real_pct, est_date: today })
} else if (fw && fresh && fw.est_date !== today) {
  const est = Math.round(fw.est_pct + (usage.fable_out / fw.cap_est) * 100)
  const target = fw.targets?.[today]
  const k = (x) => `${Math.round(x / 1000)}k`
  usageLine = `Usage: Fable about ${est}% of the week (my estimate)${target ? `, target ${target}%` : ''}. Last 24 h: Fable ${k(usage.fable_out)}, Opus ${k(usage.opus_out)} tokens out.${target ? (est > target ? ' Over: I am moving more work to Opus agents today.' : ' On track.') : ''} Send me the real % from Settings if it differs.`
  if (!dry) await setState(db, 'fable_week', { ...fw, est_pct: est, est_date: today })
} else if (fw && !fresh) usageLine = 'Usage: no fresh numbers from the iMac this morning (is it asleep?). Send me the % from Settings.'

// The steer count for yesterday (scripts/venture/steers.mjs, run on the iMac at 9:40 by launchd
// sh.venture.steers, stored in venture_state "steers"). Only when that day was graded.
const shift = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10)
const steerDays = (await getState(db, 'steers'))?.value?.days ?? {}
const y = steerDays[shift(today, -1)]
const y2 = steerDays[shift(today, -2)]
const steerLine = y
  ? `Yesterday you steered me ${y.steers} ${y.steers === 1 ? 'time' : 'times'} in ${y.messages} messages (${y.repeats} ${y.repeats === 1 ? 'repeat' : 'repeats'}). Steer rate ${y.rate}${y2 ? `, the day before ${y2.rate}` : ''}.`
  : ''


// Ola's branded opencode (apps/activist-ai/opencode-fork, OLA-114): is there a new opencode release,
// and do Ola's changes still apply to it? check-upstream.sh prints one line; exit 0 up to date,
// 1 new release and the changes apply, 2 new release and they no longer apply, 3 could not check.
// Moving to a new release is the lead's call (README "Moving to a new release"). Skipped in --dry.
let forkLine = ''
if (!dry) {
  const script = fileURLToPath(new URL('../../apps/activist-ai/opencode-fork/check-upstream.sh', import.meta.url))
  const r = spawnSync('bash', [script], { encoding: 'utf8', timeout: 20 * 60e3, env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` } })
  const line = (r.stdout || r.stderr || '').trim().split('\n').pop()?.slice(0, 240) || 'no output'
  const prev = (await getState(db, 'opencode_fork'))?.value ?? {}
  const code = r.status ?? 3
  if (code === 1 || code === 2) {
    const title = code === 1 ? 'Move Ola\'s opencode to the new release' : 'Ola\'s opencode changes no longer apply to the new release: fix rebrand.mjs first'
    // One open issue per title (OLA-239: the same move was opened four mornings running, OLA-146,
    // OLA-185, OLA-239, OLA-347, because nothing looked for the one already open).
    const { data: open, error } = await db.from('venture_issues').select('id').eq('title', title).not('status', 'in', '(done,dropped)').limit(1)
    if (error) throw new Error(`venture_issues: ${error.message}`)
    if (!open?.length) spawnSync('node', [fileURLToPath(new URL('./issues.mjs', import.meta.url)), 'add', title, '--area', 'apps', '--pri', code === 2 ? 'P0' : 'P1', '--what', line], { encoding: 'utf8' })
    forkLine = `opencode: ${line} On my plate${open?.length ? ` (${open[0].id})` : ''}.`
  } else if (code !== 0 && prev.last_code === 3 && prev.date !== today) {
    forkLine = `opencode: the daily update check failed two days running (${line}).`
  }
  await setState(db, 'opencode_fork', { date: today, last_code: code, line })
}

const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Los_Angeles' })
const text = [
  `Good morning. ${weekday}'s check-in: when works for you? Reply with a time, and "cli" or "voice".`,
  plate.length ? `On my plate:\n${plate.map((p, i) => `${i + 1}. ${p}`).join('\n')}` : '',
  waiting.length ? `Waiting on you: ${waiting.join('; ')}.` : '',
  usageLine,
  steerLine,
  forkLine,
  `Voice, any time: https://ola.cx/venture/call/checkin?k=${encodeURIComponent(key)}`,
  'The board: https://app.kochitolabs.com',
]
  .filter(Boolean)
  .join('\n\n')

if (dry) {
  console.log(text)
  process.exit(0)
}
const base = process.env.VENTURE_BASE || 'https://ola.cx'
const res = await fetch(`${base}/api/venture/imsg`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, text }) })
if (!res.ok) throw new Error(`send failed (${res.status}): ${await res.text()}`)
await setState(db, 'morning_text', { date: today })
console.log(`sent the morning text for ${today}`)
