#!/usr/bin/env node
// The daily morning text (Bart, 2026-11-16: "you shouild text me daily around 10am to
// schedule our daily checkin, which can be like this, over cli, or can be a voice
// conversation using one of our voice systems").
//   node scripts/venture/morning.mjs          send today's text, once a day (the guard is in venture_state)
//   node scripts/venture/morning.mjs --dry    print it without sending
// Runs at 10:00 on the Mac mini (launchd sh.venture.morning, apps/venture/launchd/).
// The agenda comes from the journal's "On my plate" (P0 and P1 items) and "Waiting on you",
// so the text is only as fresh as the journal: keep it current. No model call, so it cannot
// fail on a model; if the journal cannot be read it sends nothing and exits non-zero.
import { readFileSync } from 'node:fs'
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

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
const sent = await getState(db, 'morning_text')
if (!dry && sent?.value?.date === today) {
  console.log(`already sent today (${today})`)
  process.exit(0)
}

const { data: doc, error } = await db.from('venture_docs').select('body').eq('slug', 'journal').maybeSingle()
if (error || !doc?.body) throw new Error(`cannot read the journal: ${error?.message ?? 'empty'}`)
const section = (title) => {
  const m = doc.body.split(/\n(?=## )/).find((s) => s.startsWith(`## ${title}\n`))
  return m ? m.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2)) : []
}
const plain = (s) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
const plate = section('On my plate')
  .map((l) => l.match(/^\*\*(P\d)\*\*\s*(.*)$/))
  .filter((m) => m && (m[1] === 'P0' || m[1] === 'P1'))
  .slice(0, 3)
  .map((m) => `${m[1]} ${plain(m[2]).split(/(?<=\.)\s/)[0]}`)
const waiting = section('Waiting on you').map((l) => (l.match(/^\*\*([^*]+?):?\*\*/)?.[1] ?? plain(l).split(/[:.,]/)[0]).replace(/[:,.]+$/, '').trim())

const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Los_Angeles' })
const text = [
  `Good morning. ${weekday}'s check-in: when works for you? Reply with a time, and "cli" or "voice".`,
  plate.length ? `On my plate:\n${plate.map((p, i) => `${i + 1}. ${p}`).join('\n')}` : '',
  waiting.length ? `Waiting on you: ${waiting.join('; ')}.` : '',
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
