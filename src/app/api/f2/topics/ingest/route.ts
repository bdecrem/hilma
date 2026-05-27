import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { createThread } from '@/lib/f2/threads'
import { nameTopic, deriveTitle } from '@/lib/f2/name-topic'

export const runtime = 'nodejs'
// Allow big pastes (transcripts, books). Vercel serverless body limit applies.
export const maxDuration = 60

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

  // The AI always names the topic. A user-typed title goes in as a hint —
  // Haiku will keep it when it's clean and rewrite it when it's not. Final
  // fallback (when the LLM call fails) is the first line of the paste.
  const aiTitle = await nameTopic({ body: text, documentTitle: body.title })
  const title = aiTitle || body.title?.trim() || deriveTitle(text)

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
