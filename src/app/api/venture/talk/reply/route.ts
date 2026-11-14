import { NextResponse } from 'next/server'
import { addTurn, isSession, keyOk, sessionTurns } from '@/lib/venture/interview'
import { TALK, talkReply } from '@/lib/venture/talk'

export const runtime = 'nodejs'
export const maxDuration = 120

// POST /api/venture/talk/reply  { key, session, text? }
// Bart said `text`; store it and stream back what Claude says to it, as plain
// text the page hands to the voice sentence by sentence. Without `text` it
// answers the turns already stored (a reply that was cut off before a word of
// it was spoken).
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { key?: unknown; session?: unknown; text?: unknown } | null
  if (!body || !keyOk(body.key)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!isSession(body.session)) return NextResponse.json({ error: 'bad session' }, { status: 400 })
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 20_000) : ''

  const before = await sessionTurns(body.session)
  if (before.length === 0) return NextResponse.json({ error: 'no such session' }, { status: 404 })
  // A retried request carries the same words; store them once.
  const lastSpoken = [...before].reverse().find((t) => t.role !== 'event')
  const fresh = !!text && !(lastSpoken?.role === 'bart' && lastSpoken.text === text)
  if (fresh) await addTurn(body.session, 'bart', text, TALK)
  const turns = fresh ? await sessionTurns(body.session) : before
  const spoken = turns.filter((t) => t.role !== 'event')
  if (spoken.length === 0 || spoken[spoken.length - 1].role !== 'bart') {
    return NextResponse.json({ error: 'nothing to answer' }, { status: 400 })
  }

  const enc = new TextEncoder()
  const reply = talkReply(turns)
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reply.next()
        if (done) controller.close()
        else controller.enqueue(enc.encode(value))
      } catch (e) {
        console.error('[venture/talk] reply failed:', e)
        controller.error(e)
      }
    },
    cancel() {
      void reply.return(undefined)
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' },
  })
}
