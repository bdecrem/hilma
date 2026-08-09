import { NextResponse } from 'next/server'
import { ttdSupabase } from '@/lib/ttd/supabase'

export const runtime = 'nodejs'

// GET /api/ttd/tracks/[id] — the full track-pack JSON for one track. Public,
// read-only. This is exactly the payload the iOS TrackPack decoder consumes.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { data, error } = await ttdSupabase()
    .from('ttd_tracks')
    .select('payload')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json(data.payload)
}
