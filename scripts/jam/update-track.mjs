#!/usr/bin/env node
// Replace a Jam track's contents with a rebuilt track.json (as written by
// scripts/jam/songs/*.mjs), keeping the row, its id and its owner — for a
// song script that was rendered again rather than a new track.
//
//   node scripts/jam/update-track.mjs <track.json> <track id>
//
// Writes title, bpm, bars, session, messages and feed; uses the service-role
// key from hilma/.env.local. The row must exist.

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const [file, id] = process.argv.slice(2)
if (!file || !id) {
  console.error('usage: update-track.mjs <track.json> <track id>')
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

const existing = await fetch(`${URL}/rest/v1/jam_tracks?select=id,title&id=eq.${encodeURIComponent(id)}`, { headers }).then((r) => r.json())
if (!Array.isArray(existing) || existing.length !== 1) throw new Error(`track ${id} not found`)

const row = {
  title: String(track.title).slice(0, 80),
  bpm: Math.round(track.bpm),
  bars: Math.round(track.bars),
  session: track.session,
  messages: Array.isArray(track.messages) ? track.messages : [],
  feed: Array.isArray(track.feed) ? track.feed : [],
}
const res = await fetch(`${URL}/rest/v1/jam_tracks?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(row) })
const body = await res.json()
if (!res.ok) throw new Error(`update failed ${res.status}: ${JSON.stringify(body)}`)
console.log(`updated "${existing[0].title}" → "${body[0].title}" (${body[0].bpm} BPM, ${body[0].bars} bars) in place: ${body[0].id}`)
