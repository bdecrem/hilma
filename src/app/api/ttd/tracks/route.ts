import { NextResponse } from 'next/server'
import { ttdSupabase } from '@/lib/ttd/supabase'

export const runtime = 'nodejs'

// GET /api/ttd/tracks — the online track catalog for Tap Tap Dodo. Public,
// read-only. Returns the minimal fields the set-select store cards need,
// pulled out of each row's payload JSON.
export async function GET() {
  const { data, error } = await ttdSupabase()
    .from('ttd_tracks')
    .select('id, name, payload')
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const tracks = (data ?? []).map((row) => {
    const p = (row.payload ?? {}) as Record<string, unknown>
    return {
      id: row.id as string,
      name: (row.name ?? p.name) as string,
      genreLine: (p.genreLine ?? '') as string,
      bpm: (p.bpm ?? 0) as number,
      bars: (p.bars ?? 0) as number,
      skinRef: (p.skinRef ?? null) as string | null,
    }
  })

  return NextResponse.json({ tracks })
}
