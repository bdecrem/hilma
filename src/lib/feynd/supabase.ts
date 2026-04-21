import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy-init so Next.js build doesn't crash when env vars are missing
// during static analysis (per hilma convention).
let _client: SupabaseClient | null = null

export function feyndSupabase(): SupabaseClient {
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

// Shared auth for all /api/feynd/* routes. Returns device_id + null if ok,
// otherwise a NextResponse-compatible error tuple.
export function feyndAuth(req: Request): { ok: true; deviceId: string } | { ok: false; status: number; error: string } {
  const sharedSecret = process.env.FEYND_SHARED_SECRET
  if (!sharedSecret) {
    return { ok: false, status: 500, error: 'Server not configured' }
  }
  if (req.headers.get('x-feynd-secret') !== sharedSecret) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }
  const deviceId = req.headers.get('x-feynd-device') ?? ''
  if (!deviceId || deviceId.length < 8) {
    return { ok: false, status: 400, error: 'Missing x-feynd-device header' }
  }
  return { ok: true, deviceId }
}
