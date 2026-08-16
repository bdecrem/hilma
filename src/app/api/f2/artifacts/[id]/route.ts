import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { deleteArtifact } from '@/lib/f2/artifacts'

export const runtime = 'nodejs'

// DELETE /api/f2/artifacts/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const { id } = await params
  const ok = await deleteArtifact(user.id, id)
  if (!ok) {
    return NextResponse.json({ error: 'delete failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
