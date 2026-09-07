#!/usr/bin/env node
// Replace a track's content from a track.json (session, messages, feed, bpm,
// bars, title) in place — for re-rendered script songs. Owner unchanged.
//   node scripts/jam/update-track.mjs <track.json> <trackId>
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
const HILMA = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const [file, id] = process.argv.slice(2)
if (!file || !id) { console.error('usage: update-track.mjs <track.json> <trackId>'); process.exit(1) }
const env = Object.fromEntries(readFileSync(resolve(HILMA, '.env.local'), 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
const t = JSON.parse(readFileSync(file, 'utf8'))
const { data, error } = await sb.from('jam_tracks').update({ title: t.title, bpm: t.bpm, bars: t.bars, session: t.session, messages: t.messages ?? [], feed: t.feed ?? [], updated_at: new Date().toISOString() }).eq('id', id).select('id, title, bpm, bars').single()
if (error) throw error
console.log(`updated "${data.title}" (${data.bpm} BPM, ${data.bars} bars) → ${data.id}`)
