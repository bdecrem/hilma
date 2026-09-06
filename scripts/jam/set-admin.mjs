#!/usr/bin/env node
// Grant or revoke Jam admin (jam_users.is_admin). Admins can rename or delete
// any track in the public catalog. Uses the service-role key from .env.local.
//   node scripts/jam/set-admin.mjs <username> on|off
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const HILMA = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const [username, flag] = process.argv.slice(2)
if (!username || !['on', 'off'].includes(flag)) {
  console.error('usage: set-admin.mjs <username> on|off')
  process.exit(1)
}
const env = Object.fromEntries(
  readFileSync(resolve(HILMA, '.env.local'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] })
)
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
const { data, error } = await sb.from('jam_users').update({ is_admin: flag === 'on' }).eq('username', username).select('username, is_admin')
if (error) throw error
if (!data?.length) throw new Error(`no user ${username}`)
console.log(data[0])
const { data: admins } = await sb.from('jam_users').select('username').eq('is_admin', true)
console.log('admins:', admins.map(a => a.username).join(', '))
