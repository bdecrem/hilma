import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy getter — never init at module top level (Next.js imports routes during
// build when env vars aren't present; top-level init crashes the build).
// Reuses the same SUPABASE_URL / SUPABASE_SERVICE_KEY that F2 already runs on
// in production (see src/lib/f2/supabase.ts).
let _client: SupabaseClient | null = null

export function ttdSupabase(): SupabaseClient {
  if (_client) return _client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_KEY is not set')
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}
