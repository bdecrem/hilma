import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

type Turn = { role: 'user' | 'assistant'; text: string }

export async function POST(request: NextRequest) {
  const sharedSecret = process.env.LEARNAI_SHARED_SECRET
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  if (!sharedSecret || !anthropicKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }
  if (request.headers.get('x-learnai-secret') !== sharedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    question?: string
    history?: Turn[]
    systemPrompt?: string
    maxTokens?: number
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const question = body.question?.trim()
  if (!question) {
    return NextResponse.json({ error: 'Missing question' }, { status: 400 })
  }

  const history = Array.isArray(body.history) ? body.history.slice(-20) : []
  const systemPrompt =
    body.systemPrompt ??
    'You are the deep-reasoning brain behind a voice tutor app about AI. Answer clearly in 3–6 sentences unless the question truly needs more. Plain prose only — no markdown, no lists. This text will be spoken aloud.'
  const maxTokens = Math.min(Math.max(body.maxTokens ?? 1024, 64), 4096)

  const messages = [
    ...history.map((t) => ({ role: t.role, content: t.text })),
    { role: 'user', content: question },
  ]

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  })

  const text = await upstream.text()
  if (!upstream.ok) {
    return NextResponse.json(
      { error: 'Anthropic error', status: upstream.status, body: text },
      { status: 502 }
    )
  }

  const data = JSON.parse(text) as { content?: Array<{ type: string; text?: string }> }
  const answer = (data.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n')
    .trim()

  return NextResponse.json({ answer: answer || '(Opus returned no text.)' })
}
