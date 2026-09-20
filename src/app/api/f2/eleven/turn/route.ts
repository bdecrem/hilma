import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import {
  bridgeSecret,
  elevenOpeningInstruction,
  getElevenSession,
  setElevenConversationId,
  streamElevenTurn,
  turnMessages,
  type ElevenTranscriptMessage,
} from '@/lib/f2/eleven'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/f2/eleven/turn — one spoken turn. Called by the voice bridge
// (apps/dodo-voice-bridge), never by a client: ElevenLabs transcribed what
// the user said and sent the running transcript; we answer as Claude, as a
// plain-text stream the bridge forwards to be spoken. The bridge aborts the
// request when the user cuts in.
type TurnBody = {
  voice_session_id?: string
  conversation_id?: string
  event_id?: number
  transcript?: ElevenTranscriptMessage[]
}

function secretMatches(given: string | null): boolean {
  const expected = Buffer.from(bridgeSecret())
  const actual = Buffer.from(given ?? '')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export async function POST(req: Request) {
  if (!secretMatches(req.headers.get('x-bridge-secret'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: TurnBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.voice_session_id || !Array.isArray(body.transcript)) {
    return NextResponse.json({ error: 'voice_session_id and transcript required' }, { status: 400 })
  }

  const session = await getElevenSession(body.voice_session_id)
  if (!session) {
    return NextResponse.json({ error: 'voice session not found' }, { status: 404 })
  }
  if (session.ended_at) {
    return NextResponse.json({ error: 'voice session has ended' }, { status: 409 })
  }
  if (body.conversation_id) {
    void setElevenConversationId(session.id, body.conversation_id)
  }

  const messages = turnMessages(body.transcript, elevenOpeningInstruction(session.mode))

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const text of streamElevenTurn({
          systemPrompt: session.system_prompt,
          messages,
          signal: req.signal,
          onDone: (usage) =>
            console.log('[f2/eleven] turn', session.id, body.event_id, JSON.stringify(usage)),
        })) {
          controller.enqueue(encoder.encode(text))
        }
        controller.close()
      } catch (err) {
        if (!req.signal.aborted) console.error('[f2/eleven] turn failed:', session.id, err)
        controller.error(err)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    },
  })
}
