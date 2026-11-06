import { NextResponse } from 'next/server'

// Live progress of the six experimental dossiers (apps/mrd/dossiers): one call to
// dossiers_dashboard() in the mrd Supabase project. The service key stays on the server.
export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.MRD_SUPABASE_URL
  const key = process.env.MRD_SUPABASE_SERVICE_KEY
  if (!url || !key) return NextResponse.json({ error: 'MRD_SUPABASE_URL / MRD_SUPABASE_SERVICE_KEY not set' }, { status: 500 })
  const r = await fetch(`${url}/rest/v1/rpc/dossiers_dashboard`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: '{}',
    cache: 'no-store',
  })
  if (!r.ok) return NextResponse.json({ error: `supabase ${r.status}: ${(await r.text()).slice(0, 300)}` }, { status: 502 })
  return NextResponse.json(await r.json(), { headers: { 'Cache-Control': 'no-store' } })
}
