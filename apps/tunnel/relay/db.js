/**
 * Supabase data layer for tunn3l relay.
 * All methods are fire-and-forget — never block the hot path.
 */

import { createClient } from '@supabase/supabase-js'

let supabase = null

export function initDb() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    console.log('[DB] No SUPABASE_URL/SUPABASE_SERVICE_KEY — running without persistence')
    return false
  }
  supabase = createClient(url, key)
  console.log('[DB] Connected to Supabase')
  return true
}

export async function upsertSubdomain(name) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('subdomains')
    .upsert({ name, last_seen: new Date().toISOString() }, { onConflict: 'name' })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function recordConnect(subdomain, clientIp) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('connections')
    .insert({ subdomain, client_ip: clientIp })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function recordDisconnect(connectionId, stats = {}) {
  if (!supabase || !connectionId) return
  const { error } = await supabase
    .from('connections')
    .update({
      disconnected_at: new Date().toISOString(),
      requests_served: stats.requestsServed || 0,
      bytes_relayed: stats.bytesRelayed || 0,
    })
    .eq('id', connectionId)
  if (error) throw error
}

export async function isSubdomainReserved(name) {
  if (!supabase) return false
  const { data } = await supabase
    .from('subdomains')
    .select('reserved, owner_token')
    .eq('name', name)
    .single()
  return data?.reserved || false
}
