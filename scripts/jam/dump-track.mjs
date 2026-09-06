#!/usr/bin/env node
// Dump a user's jam_tracks rows (session, messages, feed) to JSON files for
// headless replay/debugging. Read-only.
//   node scripts/jam/dump-track.mjs <username> "<title prefix>" <outDir>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const HILMA = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const [username, title, outDir] = process.argv.slice(2)
if (!username || !title || !outDir) {
  console.error('usage: dump-track.mjs <username> "<title prefix>" <outDir>')
  process.exit(1)
}
const env = Object.fromEntries(
  readFileSync(resolve(HILMA, '.env.local'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] })
)
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
const { data: users, error: ue } = await sb.from('jam_users').select('id,username').eq('username', username)
if (ue) throw ue
if (!users?.length) throw new Error(`no user ${username}`)
const { data: tracks, error } = await sb.from('jam_tracks').select('*').eq('user_id', users[0].id).ilike('title', `${title}%`)
if (error) throw error
mkdirSync(outDir, { recursive: true })
for (const t of tracks) {
  const file = resolve(outDir, `${t.id}.json`)
  writeFileSync(file, JSON.stringify(t, null, 1))
  const s = t.session || {}
  console.log(`${t.id}  ${JSON.stringify(t.title)}  updated ${t.updated_at}\n  -> ${file}`)
  console.log('  session keys:', Object.keys(s).join(','))
}
