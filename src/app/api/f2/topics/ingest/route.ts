import Anthropic from '@anthropic-ai/sdk'
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

let _anthropic: Anthropic | null = null
function anthropic(): Anthropic {
  if (_anthropic) return _anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  _anthropic = new Anthropic({ apiKey })
  return _anthropic
}

const NAME_TOPIC_INSTRUCTION =
  'Name this learning topic in 3–7 words, like a chapter title or a Wikipedia article: noun phrase, Title Case, no quotes, no trailing punctuation, no "Notes on…" or "Introduction to…". Focus on the SUBJECT, not the format (don\'t say "transcript", "article", "video"). If it\'s about a specific person, place, or concept, lead with that. Reply with only the title.'

async function nameTopic(text: string): Promise<string | null> {
  try {
    const sample = text.slice(0, 4000)
    const res = await anthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 40,
      messages: [{ role: 'user', content: `${NAME_TOPIC_INSTRUCTION}\n\n---\n${sample}` }],
    })
    const block = res.content[0]
    // Strip surrounding quotes Claude sometimes wraps the title in. The
    // previous regex used `^…|…$` without a global flag, which only stripped
    // ONE side; "Hello" came back as `Hello"`. Two passes are unambiguous.
    const title = block?.type === 'text'
      ? block.text.trim().replace(/^["']+/, '').replace(/["']+$/, '').trim()
      : ''
    return title.length >= 3 && title.length <= 70 ? title : null
  } catch (err) {
    console.error('[f2] nameTopic failed:', err)
    return null
  }
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

  const title = body.title?.trim() || (await nameTopic(text)) || deriveTitle(text)

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
