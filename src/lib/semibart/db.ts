import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// CASBS Quest's tables (semibart_*) live in hilma's Supabase project. Server code only, with the
// service key; no Supabase Auth, no key in the browser. No Next imports in src/lib/semibart, so
// it can move to the game's own project as is.

let _db: SupabaseClient | null = null

export function db(): SupabaseClient {
  if (_db) return _db
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_KEY is not set')
  _db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _db
}
