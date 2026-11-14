#!/usr/bin/env node
// kochitolabs.com's numbers: per page and per source, how many people (not
// bots) saw it, touched the form, and signed up; then the sign-ups themselves.
//   node scripts/venture/leads.mjs            the table, and every sign-up no session has read (marks them read)
//   node scripts/venture/leads.mjs --all      the same, with every sign-up
//   node scripts/venture/leads.mjs --since 2026-11-16   only what happened from that day on
//   node scripts/venture/leads.mjs --wait     blocks until a new sign-up arrives, prints it, exits (a background task)
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
const args = process.argv.slice(2)
const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : '2026-11-14'
// sign-ups made by our own checks never count
const TEST = /@kochito-check\.test$/

const unseen = async () => {
  const { data, error } = await db.from('kochito_leads').select('*').is('seen_at', null).order('id')
  if (error) throw new Error(error.message)
  return data.filter((l) => !TEST.test(l.email))
}
const show = (l) => console.log(`${l.at.slice(0, 16).replace('T', ' ')}Z  ${l.page.padEnd(5)} ${l.email}  ${l.detail ?? ''}  [${l.src}${l.campaign ? '/' + l.campaign : ''}${l.term ? ' "' + l.term + '"' : ''}]`)

if (args.includes('--wait')) {
  for (;;) {
    const fresh = await unseen()
    if (fresh.length) {
      fresh.forEach(show)
      await db.from('kochito_leads').update({ seen_at: new Date().toISOString() }).in('id', fresh.map((l) => l.id))
      process.exit(0)
    }
    await new Promise((r) => setTimeout(r, 30000))
  }
}

const events = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('kochito_events').select('page, kind, sid, src, bot').gte('at', since).eq('bot', false).order('id').range(from, from + 999)
  if (error) throw new Error(error.message)
  events.push(...data)
  if (data.length < 1000) break
}
// people, not page loads: one browser counts once per page and kind
const cell = new Map()
for (const e of events) {
  const key = `${e.page} · ${e.src}`
  if (!cell.has(key)) cell.set(key, { view: new Set(), cta: new Set(), lead: new Set() })
  cell.get(key)[e.kind]?.add(e.sid ?? Math.random())
}
console.log(`since ${since}, people (bots and our own checks left out)\n`)
console.log('page · source'.padEnd(28) + 'saw it'.padStart(8) + 'touched form'.padStart(14) + 'signed up'.padStart(11))
for (const [key, c] of [...cell].sort()) console.log(key.padEnd(28) + String(c.view.size).padStart(8) + String(c.cta.size).padStart(14) + String(c.lead.size).padStart(11))
if (!cell.size) console.log('(nobody yet)')

const { data: leads, error } = await db.from('kochito_leads').select('*').gte('at', since).order('id')
if (error) throw new Error(error.message)
const real = leads.filter((l) => !TEST.test(l.email))
const list = args.includes('--all') ? real : real.filter((l) => !l.seen_at)
console.log(`\nsign-ups: ${real.length} in all, ${real.filter((l) => !l.seen_at).length} unread`)
list.forEach(show)
const mark = list.filter((l) => !l.seen_at).map((l) => l.id)
if (mark.length) await db.from('kochito_leads').update({ seen_at: new Date().toISOString() }).in('id', mark)
