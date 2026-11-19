import { NextResponse } from 'next/server'
import { addComment } from '@/lib/venture/issue-writes'
import { asUser, issueId } from '../../guard'

export const runtime = 'nodejs'

// POST /api/kochito/app/issues/OLA-150/comments { body }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = issueId((await params).id)
  if (!id) return NextResponse.json({ error: 'not an issue id' }, { status: 404 })
  const body = (await req.json().catch(() => ({}))) as { body?: unknown }
  return asUser(req, async (user) => {
    if (!(await addComment(id, body.body, user))) return { ok: false, error: 'comments are not set up yet' }
    return { ok: true }
  })
}
