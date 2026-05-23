import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { createThread } from '@/lib/f2/threads'

export const runtime = 'nodejs'
// Allow big pastes (transcripts, books). Vercel serverless body limit applies.
export const maxDuration = 60

function deriveTitle(text: string): string {
  const firstLine = text.trim().split('\n')[0]?.trim() ?? ''
  if (!firstLine) return 'Untitled paste'
  return firstLine.length > 60 ? firstLine.slice(0, 60).trimEnd() + '…' : firstLine
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let body: { title?: string; text?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const text = body.text?.trim()
  if (!text) {
    return NextResponse.json({ error: 'text required' }, { status: 400 })
  }

  const title = body.title?.trim() || deriveTitle(text)

  const thread = await createThread({
    userId: user.id,
    client: 'web',
    handle: user.username,
    topic: title,
    content: text,
  })

  if (!thread) {
    return NextResponse.json({ error: 'create failed' }, { status: 500 })
  }
  return NextResponse.json({
    thread: { id: thread.id, topic: thread.topic, length: text.length },
  })
}
