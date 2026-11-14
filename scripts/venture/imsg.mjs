#!/usr/bin/env node
// Venture's iMessage thread with Bart (apps/venture/README.md).
//   node scripts/venture/imsg.mjs send "text"     text him (through ola.cx → the Mac mini bridge)
//   node scripts/venture/imsg.mjs inbox           what he texted that no session has read; marks it read
//   node scripts/venture/imsg.mjs thread [n=20]   the last n messages, both directions
//   node scripts/venture/imsg.mjs --wait          block until he texts, print it with what was answered, mark it read
// He writes to Venture by starting a text with "v" or "venture".
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const root = new URL('../../', import.meta.url)
const env = Object.fromEntries(
  readFileSync(new URL('.env.local', root), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const key = () => process.env.VENTURE_KEY || env.VENTURE_KEY || readFileSync(new URL('apps/venture/private/KEY', root), 'utf8').trim()
const line = (m) => `${m.at.slice(0, 16).replace('T', ' ')}Z  ${m.direction === 'in' ? 'BART' : m.author === 'session' ? 'CLAUDE (session)' : 'CLAUDE (auto-reply)'}: ${m.text}`

async function unseen() {
  const { data, error } = await db.from('venture_messages').select('*').eq('direction', 'in').is('seen_at', null).order('id')
  if (error) throw new Error(error.message)
  return data
}
// His unread texts, plus everything said after the first of them.
async function printAndMark(rows) {
  const { data, error } = await db.from('venture_messages').select('*').gte('id', rows[0].id).order('id')
  if (error) throw new Error(error.message)
  for (const m of data) console.log(line(m))
  await db.from('venture_messages').update({ seen_at: new Date().toISOString() }).in('id', rows.map((r) => r.id))
}

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

const [cmd, arg] = process.argv.slice(2)
if (cmd === 'send') {
  if (!arg?.trim()) throw new Error('usage: imsg.mjs send "text"')
  const base = process.env.VENTURE_BASE || 'https://ola.cx'
  const res = await fetch(`${base}/api/venture/imsg`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key(), text: arg }) })
  if (!res.ok) throw new Error(`send failed (${res.status}): ${await res.text()}`)
  console.log('sent')
} else if (cmd === 'inbox') {
  const rows = await unseen()
  if (rows.length === 0) console.log('nothing new from Bart')
  else await printAndMark(rows)
} else if (cmd === 'thread') {
  const { data, error } = await db.from('venture_messages').select('*').order('id', { ascending: false }).limit(Number(arg) || 20)
  if (error) throw new Error(error.message)
  for (const m of data.reverse()) console.log(line(m))
} else if (cmd === '--wait') {
  for (;;) {
    const rows = await patient(unseen)
    // Give the auto-reply a moment to land so it prints with his text.
    if (rows.length && Date.now() - new Date(rows[rows.length - 1].at).getTime() > 25_000) {
      await printAndMark(rows)
      process.exit(0)
    }
    await new Promise((r) => setTimeout(r, 15_000))
  }
} else {
  console.error('usage: imsg.mjs send "text" | inbox | thread [n] | --wait')
  process.exit(1)
}
