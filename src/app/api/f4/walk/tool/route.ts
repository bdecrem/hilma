import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { handleWalkTool, WalkToolError } from '@/lib/f4/walk'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/f4/walk/tool
// Executes one Realtime tool call on behalf of the connected walk session.
// Security: user identity comes from the f2_session cookie only — the model
// (and the iOS client) can never act as another user. Card/topic lookups are
// all user-scoped inside handleWalkTool.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let body: { name?: unknown; arguments?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const name = typeof body.name === 'string' ? body.name : ''
  const args =
    body.arguments && typeof body.arguments === 'object'
      ? (body.arguments as Record<string, unknown>)
      : {}

  try {
    const result = await handleWalkTool(user.id, name, args)
    return NextResponse.json({ result })
  } catch (e) {
    if (e instanceof WalkToolError) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    console.error('[f4/walk] tool failed:', e)
    return NextResponse.json({ error: 'tool failed' }, { status: 500 })
  }
}
