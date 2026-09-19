import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { cleanUpChat, isCleanupQuality } from '@/lib/polly/infinity'

export const runtime = 'nodejs'
// The curation is one LLM pass over the transcript; give it room.
export const maxDuration = 120

// POST /api/polly/infinity/chats/[id]/cleanup  { quality?: 'fast' | 'deep' }
// Curate the ≤5 fixes + vocab + grammar (idempotent: returns the existing
// analysis if already run). `quality` is the app's Settings preference:
// 'fast' (Sonnet 5, medium — ~9 s) or 'deep' (Opus 5, high — ~12 s, a sharper
// read; measured 2026-09-19 with scripts/polly/cleanup-bench.ts). Older app
// builds send no body and get 'fast'.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { id } = await params
  let quality: unknown
  try {
    const text = await req.text()
    if (text.trim()) quality = (JSON.parse(text) as { quality?: unknown }).quality
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (quality !== undefined && !isCleanupQuality(quality)) {
    return NextResponse.json({ error: "quality must be 'fast' or 'deep'" }, { status: 400 })
  }
  const chat = await cleanUpChat(user.id, id, isCleanupQuality(quality) ? quality : 'fast')
  if (!chat) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ chat })
}
