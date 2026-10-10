import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { bridgeSecret, streamElevenTurn, turnMessages, type ElevenTranscriptMessage } from '@/lib/f2/eleven'
import { findVoiceSession, updateVoiceSession } from '@/lib/dolly/core'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/dolly/eleven/turn — one spoken turn, called by the voice bridge
// (apps/dodo-voice-bridge, /ws/dolly-*), never by a client: ElevenLabs
// transcribed what the learner said and sent the running transcript; Claude
// answers from the session's stored prompt as a plain-text stream the bridge
// forwards to be spoken. The bridge aborts the request when the learner cuts in.
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
  const session = await findVoiceSession(body.voice_session_id)
  if (!session || !session.system_prompt) return NextResponse.json({ error: 'voice session not found' }, { status: 404 })
  if (session.ended_at) return NextResponse.json({ error: 'voice session has ended' }, { status: 409 })
  if (body.conversation_id && !session.conversation_id) {
    void updateVoiceSession(session.id, { conversation_id: body.conversation_id }).catch(() => {})
  }
  const systemPrompt = session.system_prompt
  const messages = turnMessages(body.transcript, null)
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const text of streamElevenTurn({
          systemPrompt,
          messages,
          signal: req.signal,
          onDone: (usage) => console.log('[dolly/eleven] turn', session.id, body.event_id, JSON.stringify(usage)),
        })) {
          controller.enqueue(encoder.encode(text))
        }
        controller.close()
      } catch (err) {
        if (!req.signal.aborted) console.error('[dolly/eleven] turn failed:', session.id, err)
        controller.error(err)
      }
    },
  })
  return new Response(stream, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
  })
}
