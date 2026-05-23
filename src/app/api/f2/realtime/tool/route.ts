import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getTopicContext } from '@/lib/f2/realtime'

export const runtime = 'nodejs'

type ToolBody = {
  name?: string
  arguments?: {
    thread_id?: string
    query?: string
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let body: ToolBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (body.name !== 'get_topic_context') {
    return NextResponse.json({ error: 'unknown tool' }, { status: 400 })
  }

  const threadId = body.arguments?.thread_id
  const query = body.arguments?.query ?? ''
  if (!threadId) {
    return NextResponse.json({ error: 'thread_id required' }, { status: 400 })
  }

  try {
    const result = await getTopicContext({
      userId: user.id,
      threadId,
      query,
    })
    return NextResponse.json({ result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'tool failed'
    return NextResponse.json({ error: message }, { status: 404 })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'f2/realtime/tool' })
}
