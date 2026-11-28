#!/usr/bin/env node
// Read the voice calls back (apps/venture/README.md): the interview, the talk page, the checkin,
// and Kit meetings from the phone app (call "phone").
//   node scripts/venture/transcript.mjs            the latest session, as text
//   node scripts/venture/transcript.mjs --list     every session, one line each
//   node scripts/venture/transcript.mjs <session>  one session
//   node scripts/venture/transcript.mjs --wait [call]   block until a real call (no call named: any call, or a voice note)
//       (of that call slug, when given) has ended (the interviewer's "ended" marker, or three minutes of silence
//       after a hang-up or drop), then print it and its minutes. Ignores sessions marked test.
//       With `phone` it also wakes for a new voice note, and a phone call needs only one answer.
//   node scripts/venture/transcript.mjs --minutes [session]   the minutes of the latest (or that) session
//
// Minutes (what was decided, what is still to decide, what Kit will do) are written by the server a
// few seconds after a call or a note ends (src/lib/venture/minutes.ts). What --wait prints is marked
// read, so the runner does not act on it a second time.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { markSeen, minutesText, readMinutes } from './_minutes.mjs'

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

async function all() {
  // In pages: one request returns at most 1000 rows, and past the thousandth turn (Nov 27) the newest calls
  // were cut off, so a call Bart had just finished was not listed and the watcher never saw it.
  const data = []
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await db.from('venture_interview_turns').select('*').order('id').range(from, from + 999)
    if (error) throw new Error(error.message)
    data.push(...page)
    if (page.length < 1000) break
  }
  const sessions = new Map()
  for (const t of data) {
    if (!sessions.has(t.session)) sessions.set(t.session, [])
    sessions.get(t.session).push(t)
  }
  return [...sessions.entries()].map(([id, turns]) => ({
    id,
    turns,
    call: turns[0].call ?? 'founding',
    test: turns.some((t) => t.role === 'event' && t.text === 'test'),
    ended: turns.some((t) => t.role === 'event' && t.text.startsWith('ended')),
    spoken: turns.filter((t) => t.role !== 'event').length,
    answers: turns.filter((t) => t.role === 'bart').length,
    first: turns[0].at,
    last: turns[turns.length - 1].at,
  }))
}

function print(s) {
  console.log(`# call ${s.call} · session ${s.id} · ${s.first} → ${s.last} · ${s.answers} answers${s.ended ? ' · ended' : ''}${s.test ? ' · TEST' : ''}\n`)
  for (const t of s.turns) {
    if (t.role === 'event') console.log(`[${t.at.slice(11, 19)} ${t.text}]\n`)
    else console.log(`${t.role === 'claude' ? 'CLAUDE' : 'BART'}: ${t.text}\n`)
  }
}

const arg = process.argv[2]
// A watcher must outlive a network blip (both died on one failed poll, 2026-11-14):
// keep trying for half an hour before giving up.
async function patient(fn) {
  for (let fails = 0; ; fails++) {
    try {
      return await fn()
    } catch (e) {
      if (fails >= 60) throw e
      if (fails === 0) console.error(`(the network failed: ${e.message}; retrying)`)
      await new Promise((r) => setTimeout(r, 30_000))
    }
  }
}

// The minutes, once the server has written them (up to two minutes after the end).
async function minutesOf(source, ref, wait) {
  for (let i = 0; ; i++) {
    const m = await patient(() => readMinutes(db, source, ref))
    if (m || !wait || i >= 24) return m
    await new Promise((r) => setTimeout(r, 5_000))
  }
}

async function printMinutes(source, ref, wait) {
  const m = await minutesOf(source, ref, wait)
  if (!m) return console.log(`(no minutes for ${source} ${ref} yet)`)
  console.log(minutesText(m))
  // Printed for a session that is about to act on them. Until 2026-11-18 only --wait marked them,
  // so minutes read any other way stayed "new" and would have woken the runner to act on them again.
  await markSeen(db, [m.id])
}

const MEMO_MARK = '(voice note) '
async function notesSince(since) {
  const { data, error } = await db.from('venture_messages').select('id, text, at').eq('direction', 'in').like('text', `${MEMO_MARK}%`).gt('at', new Date(since).toISOString()).order('id')
  if (error) throw new Error(error.message)
  return data
}

if (arg === '--minutes') {
  const sessions = await all()
  const s = process.argv[3] ? sessions.find((x) => x.id === process.argv[3]) : sessions[sessions.length - 1]
  if (!s) {
    console.error('no such session')
    process.exit(1)
  }
  await printMinutes('meeting', s.id, false)
} else if (arg === '--list') {
  for (const s of await all()) console.log(`${s.id}  ${s.call.padEnd(10)} ${s.first.slice(0, 19)}  ${s.spoken} turns, ${s.answers} answers${s.ended ? ', ended' : ''}${s.test ? ', test' : ''}`)
} else if (arg === '--wait') {
  const IDLE_MS = 3 * 60 * 1000
  const only = process.argv[3]
  const since = Date.now()
  for (;;) {
    // With no call named, every kind is watched: the talk page, the check-in, the phone and voice
    // notes. On Nov 19, 2026 a session watched only "talk"; Bart started the check-in on the phone at
    // 10:20 am, the voice answered that it was broken, and no session saw it for two hours.
    if (!only || only === 'phone') {
      const note = (await patient(() => notesSince(since)))[0]
      if (note) {
        console.log(`# voice note ${note.id} · ${note.at}\n\nBART: ${note.text.slice(MEMO_MARK.length)}\n`)
        await printMinutes('note', note.id, true)
        process.exit(0)
      }
    }
    const need = (s) => (s.call === 'phone' ? 1 : 3)
    const real = (await patient(all)).filter((s) => !s.test && s.answers >= need(s) && (!only || s.call === only) && new Date(s.last).getTime() > since)
    const s = real[real.length - 1]
    if (s) {
      const lastEvent = [...s.turns].reverse().find((t) => t.role === 'event')?.text ?? ''
      const stopped = lastEvent === 'hung up' || lastEvent === 'dropped'
      const idle = Date.now() - new Date(s.last).getTime()
      const lastIsEvent = s.turns[s.turns.length - 1].role === 'event'
      if (s.ended || (stopped && lastIsEvent && idle > IDLE_MS)) {
        print(s)
        await printMinutes('meeting', s.id, true)
        process.exit(0)
      }
    }
    await new Promise((r) => setTimeout(r, 20_000))
  }
} else {
  const sessions = await all()
  const s = arg ? sessions.find((x) => x.id === arg) : sessions[sessions.length - 1]
  if (!s) {
    console.error('no such session')
    process.exit(1)
  }
  print(s)
}
