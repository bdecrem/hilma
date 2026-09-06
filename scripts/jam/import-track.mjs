#!/usr/bin/env node
// Import a track.json (as written by scripts/jam/songs/*.mjs) into a Jam
// user's library — the way a headless build lands in the web app.
//
//   node scripts/jam/import-track.mjs <track.json> <username>
//
// track.json: { title, bpm, bars, session, messages, feed }. Uses the
// service-role key from hilma/.env.local; inserts one jam_tracks row and
// prints its id. Never overwrites an existing track.

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const [file, username] = process.argv.slice(2)
if (!file || !username) {
  console.error('usage: import-track.mjs <track.json> <username>')
  process.exit(1)
}

const HILMA = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const env = Object.fromEntries(
  readFileSync(resolve(HILMA, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }),
)
const URL = env.SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_KEY
if (!URL || !KEY) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY missing from .env.local')
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const track = JSON.parse(readFileSync(file, 'utf8'))
for (const k of ['title', 'bpm', 'bars', 'session']) if (track[k] === undefined) throw new Error(`track.json missing ${k}`)

const users = await fetch(`${URL}/rest/v1/jam_users?select=id,username&username=eq.${encodeURIComponent(username)}`, { headers }).then((r) => r.json())
if (!Array.isArray(users) || users.length !== 1) throw new Error(`user ${username} not found`)

const row = {
  user_id: users[0].id,
  title: String(track.title).slice(0, 80),
  bpm: Math.round(track.bpm),
  bars: Math.round(track.bars),
  session: track.session,
  messages: Array.isArray(track.messages) ? track.messages : [],
  feed: Array.isArray(track.feed) ? track.feed : [],
}
const res = await fetch(`${URL}/rest/v1/jam_tracks`, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(row) })
const body = await res.json()
if (!res.ok) throw new Error(`insert failed ${res.status}: ${JSON.stringify(body)}`)
const t = body[0]
console.log(`imported "${t.title}" (${t.bpm} BPM, ${t.bars} bars) into ${username}'s library → ${t.id}`)
