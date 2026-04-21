import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Proxies a user question to Claude Opus 4.7 and returns the answer text.
// Called by Feynd's iOS app when the Realtime model invokes the `ask_opus`
// tool. The answer is spoken back to the user by Realtime (cedar voice).

const SYSTEM_PROMPT = `You are the reasoning brain behind Feynd, a voice tutor that can teach anything. A voice AI has captured the user's spoken question and passed it to you. Answer clearly, accurately, and with a light, curious tone.

Your output will be spoken aloud, so write plain prose:
- No markdown, no bullet points, no headers, no code blocks.
- Short sentences. Conversational cadence. Vivid examples and analogies.
- Two to four sentences is usually enough. Go longer only when the idea genuinely needs it.

If the question is broad, pick the most useful angle and address it directly — don't ask a clarifying question, since that round-trip is expensive. If the question is genuinely nonsensical, say so briefly.`

type Turn = { role: 'user' | 'assistant'; text: string }

type VideoContext = {
  title?: string
  author?: string
  host?: string
  publishedOn?: string
  transcript?: string
}

export async function POST(request: NextRequest) {
  const sharedSecret = process.env.FEYND_SHARED_SECRET
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  if (!sharedSecret || !anthropicKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }
  if (request.headers.get('x-feynd-secret') !== sharedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { question?: string; history?: Turn[]; videoContext?: VideoContext } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const question = (body.question ?? '').trim()
  if (!question) {
    return NextResponse.json({ error: 'Missing question' }, { status: 400 })
  }

  const history = Array.isArray(body.history) ? body.history.slice(-20) : []
  const messages = [
    ...history.map((t) => ({ role: t.role, content: t.text })),
    { role: 'user' as const, content: question },
  ]

  // When the user is asking about a specific video we inject its transcript
  // as a cached system block. Anthropic's prompt caching keeps the cost
  // low on follow-up questions within the same video.
  const systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [
    { type: 'text', text: SYSTEM_PROMPT },
  ]
  const vc = body.videoContext
  if (vc && vc.transcript && vc.transcript.trim().length > 0) {
    const header = `The user is asking about this specific video. Ground your answer in its transcript. If the transcript doesn't cover the question, say so briefly, then give your best answer from general knowledge.\n\nVIDEO: "${vc.title ?? ''}" — ${vc.author ?? ''}${vc.host ? ` (with ${vc.host})` : ''}${vc.publishedOn ? `, ${vc.publishedOn}` : ''}\n\nTRANSCRIPT:\n`
    systemBlocks.push({
      type: 'text',
      text: header + vc.transcript,
      cache_control: { type: 'ephemeral' },
    })
  }

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 700,
      system: systemBlocks,
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
  const answer =
    (data.content ?? [])
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string)
      .join('\n')
      .trim() || ''

  if (!answer) {
    return NextResponse.json(
      { error: 'No text in Anthropic response', body: data },
      { status: 502 }
    )
  }

  return NextResponse.json({ answer })
}
