#!/usr/bin/env node
// Read the founding interview back (apps/venture/README.md).
//   node scripts/venture/transcript.mjs            the latest session, as text
//   node scripts/venture/transcript.mjs --list     every session, one line each
//   node scripts/venture/transcript.mjs <session>  one session
//   node scripts/venture/transcript.mjs --wait [call]   block until a real call
//       (of that call slug, when given) has ended (the interviewer's "ended" marker, or three minutes of silence
//       after a hang-up or drop), then print it. Ignores sessions marked test.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

async function all() {
  const { data, error } = await db.from('venture_interview_turns').select('*').order('id')
  if (error) throw new Error(error.message)
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

if (arg === '--list') {
  for (const s of await all()) console.log(`${s.id}  ${s.call.padEnd(10)} ${s.first.slice(0, 19)}  ${s.spoken} turns, ${s.answers} answers${s.ended ? ', ended' : ''}${s.test ? ', test' : ''}`)
} else if (arg === '--wait') {
  const IDLE_MS = 3 * 60 * 1000
  const only = process.argv[3]
  const since = Date.now()
  for (;;) {
    const real = (await patient(all)).filter((s) => !s.test && s.answers >= 3 && (!only || s.call === only) && new Date(s.last).getTime() > since)
    const s = real[real.length - 1]
    if (s) {
      const lastEvent = [...s.turns].reverse().find((t) => t.role === 'event')?.text ?? ''
      const stopped = lastEvent === 'hung up' || lastEvent === 'dropped'
      const idle = Date.now() - new Date(s.last).getTime()
      const lastIsEvent = s.turns[s.turns.length - 1].role === 'event'
      if (s.ended || (stopped && lastIsEvent && idle > IDLE_MS)) {
        print(s)
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
