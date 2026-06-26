import { NextResponse } from 'next/server'
import { bookScoutDb } from '@/lib/book-scout/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/book-scout/run/[id] — poll a run's status (open read).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await bookScoutDb()
    .from('book_scout_runs')
    .select('id, status, genre, message, digest_id, created_at, finished_at')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(data)
}
