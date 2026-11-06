import { NextResponse } from 'next/server'
import { getDoc, page } from '@/lib/mrd/text'

// One page of a law's full text for the reader at ola.cx/mrd/law/[id].
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const n = Number(new URL(req.url).searchParams.get('page') ?? 0) || 0
  const doc = await getDoc(id)
  if (!doc) return NextResponse.json({ error: 'no text stored for this law' }, { status: 404 })
  return NextResponse.json(page(doc, n), { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } })
}
