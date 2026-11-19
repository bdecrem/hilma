import { NextResponse } from 'next/server'
import { updateIssue } from '@/lib/venture/issue-writes'
import { asUser, issueId } from '../guard'

export const runtime = 'nodejs'

// PATCH /api/kochito/app/issues/OLA-150 { title?, what?, status?, proof?, priority?, area?, who?, week? }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = issueId((await params).id)
  if (!id) return NextResponse.json({ error: 'not an issue id' }, { status: 404 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  return asUser(req, async (user) => ({ issue: await updateIssue(id, body, user) }))
}
