import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { createArtifact, listArtifacts } from '@/lib/f2/artifacts'

export const runtime = 'nodejs'

// GET /api/f2/artifacts — every artifact the user has saved, newest first.
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const artifacts = await listArtifacts(user.id)
  return NextResponse.json({ artifacts })
}

// POST /api/f2/artifacts — save { body, source?, thread_id? }.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  let body: { body?: unknown; source?: unknown; thread_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (typeof body.body !== 'string' || !body.body.trim()) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 })
  }
  const artifact = await createArtifact(user.id, {
    body: body.body,
    source: typeof body.source === 'string' ? body.source : null,
    thread_id: typeof body.thread_id === 'string' ? body.thread_id : null,
  })
  if (!artifact) {
    return NextResponse.json({ error: 'save failed' }, { status: 500 })
  }
  return NextResponse.json({ artifact })
}
