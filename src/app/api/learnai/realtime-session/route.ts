import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const sharedSecret = process.env.LEARNAI_SHARED_SECRET
  const openaiKey = process.env.OPENAI_API_KEY

  if (!sharedSecret || !openaiKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }
  if (request.headers.get('x-learnai-secret') !== sharedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { instructions?: string; voice?: string } = {}
  try {
    body = await request.json()
  } catch {
    // empty body is fine
  }

  const instructions =
    body.instructions ??
    'You are a friendly voice tutor for learning how AI works.'
  const voice = body.voice ?? 'cedar'

  const upstream = await fetch(
    'https://api.openai.com/v1/realtime/client_secrets',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 600 },
        session: {
          type: 'realtime',
          model: 'gpt-realtime-1.5',
          instructions,
          audio: { output: { voice } },
        },
      }),
    }
  )

  const text = await upstream.text()
  if (!upstream.ok) {
    return NextResponse.json(
      { error: 'OpenAI error', status: upstream.status, body: text },
      { status: 502 }
    )
  }

  const data = JSON.parse(text) as Record<string, unknown>
  const value =
    (typeof data.value === 'string' && data.value) ||
    (data.client_secret &&
      typeof (data.client_secret as Record<string, unknown>).value === 'string' &&
      ((data.client_secret as Record<string, unknown>).value as string)) ||
    null
  if (!value) {
    return NextResponse.json(
      { error: 'No ephemeral key in OpenAI response', body: data },
      { status: 502 }
    )
  }

  return NextResponse.json({ value })
}
