import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/dolly/auth'
import { activeTopLevel, knownChunk, levelChunks } from '@/lib/dolly/chunks'
import { updateUser } from '@/lib/dolly/core'

export const runtime = 'nodejs'

// PUT /api/dolly/chunks { id, hidden } — hide a level chunk from the stash
// and the flash sets, or show it again.
export async function PUT(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; hidden?: unknown }
  if (typeof body.id !== 'string' || typeof body.hidden !== 'boolean') return NextResponse.json({ error: 'id and hidden required' }, { status: 400 })
  const top = await activeTopLevel(user)
  if (!knownChunk(user.language, top, body.id)) return NextResponse.json({ error: 'No such chunk.' }, { status: 404 })
  const had = new Set(user.hidden_chunks ?? [])
  if (body.hidden) had.add(body.id)
  else had.delete(body.id)
  const next = await updateUser(user.id, { hidden_chunks: Array.from(had) })
  return NextResponse.json({ ok: true, chunks: levelChunks(next.language, top, next.hidden_chunks) })
}
