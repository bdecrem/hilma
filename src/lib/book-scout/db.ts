import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy getter — never init at module top level (Next.js imports during build
// when env vars aren't present).
let _client: SupabaseClient | null = null
export function bookScoutDb(): SupabaseClient {
  if (_client) return _client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_KEY not set')
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}

// Edits require the shared key (env BOOK_SCOUT_PASSWORD), sent as a header.
// Reads are open. Fails closed if the env var is missing.
export function authed(req: Request): boolean {
  const expected = process.env.BOOK_SCOUT_PASSWORD
  if (!expected) return false
  return req.headers.get('x-book-scout-key') === expected
}

export type BookSource = {
  id: string
  name: string
  url: string
  type: string
  notes: string
  genre: string
  active: boolean
}
