import { NextRequest, NextResponse } from 'next/server'
import { feyndAuth } from '@/lib/feynd/supabase'
import { askWithTopic } from '@/lib/feynd/ask'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/feynd/ask
// Body: { question, topic?, history?, videoContext?, system?, maxTokens? }
// Unified agent endpoint — loads topic source pool, calls Opus, returns
// answer + metadata.
export async function POST(request: NextRequest) {
  const auth = feyndAuth(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try { body = await request.json() } catch {}

  const question = typeof body.question === 'string' ? body.question.trim() : ''
  if (!question) return NextResponse.json({ error: 'question required' }, { status: 400 })

  try {
    const r = await askWithTopic({
      question,
      topic: typeof body.topic === 'string' ? body.topic : undefined,
      history: Array.isArray(body.history) ? body.history : undefined,
      videoContext: body.videoContext && typeof body.videoContext === 'object' ? body.videoContext : undefined,
      system: typeof body.system === 'string' ? body.system : undefined,
      maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : undefined,
    })
    return NextResponse.json({
      answer: r.answer,
      topic: r.topicId,
      source_count: r.sourceCount,
      usage: r.usage ?? null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
