// POST /api/socratic/sessions/:id/turn — one exchange, streamed.
//
// Body { message } sends a student message; an empty body either opens
// the session (no turns yet) or retries the tutor after a failed turn
// (the last turn is the student's). The response is a server-sent event
// stream:
//   data: { type: 'student', turn }          the stored student turn
//   data: { type: 'delta', text }            reply text as it arrives
//   data: { type: 'done', turn, session }    the stored tutor turn + updated session
//   data: { type: 'error', message }
//
// Per student message the observer runs first (every arm); its verdict
// is stored on the student turn and, in arm C, appended for the tutor
// as the coach note.

import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { ARM_INFO } from '@/lib/socratic/arms'
import { getModule } from '@/lib/socratic/modules'
import { coachNote, observe } from '@/lib/socratic/observer'
import { OPENING_MESSAGE } from '@/lib/socratic/prompts'
import { getSession, insertTurn, listTurns, mergeMastery, publicTurn, UUID_RE, updateSession } from '@/lib/socratic/store'
import { runTutor } from '@/lib/socratic/tutor'
import type { Turn } from '@/lib/socratic/types'

export const runtime = 'nodejs'
export const maxDuration = 120

type Ctx = { params: Promise<{ id: string }> }

const MAX_MESSAGE = 4000

const err = (error: string, status: number) => NextResponse.json({ error }, { status })

function friendly(e: unknown): string {
  if (e instanceof Anthropic.RateLimitError) return 'The tutor is busy right now. Try again in a moment.'
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return 'The tutor is misconfigured (its API key was rejected).'
  if (e instanceof Anthropic.APIError && (e.status === 529 || e.status === 503)) return 'The tutor is overloaded. Try again in a moment.'
  // Anthropic reports an exhausted balance as a 400 invalid_request_error.
  if (e instanceof Anthropic.BadRequestError && /credit|billing/i.test(e.message)) return 'The tutor is out of API credit. Nothing is wrong with your session — try again later.'
  if (e instanceof Anthropic.APIError) return 'The tutor could not process this turn. Try again.'
  return 'Something went wrong on the tutor side. Try again.'
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return err('not found', 404)
  let body: { message?: unknown } = {}
  try {
    const text = await req.text()
    if (text) body = JSON.parse(text)
  } catch {
    return err('invalid JSON', 400)
  }
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (message.length > MAX_MESSAGE) return err(`Keep it under ${MAX_MESSAGE} characters.`, 400)

  const session = await getSession(id)
  if (!session) return err('not found', 404)
  if (session.ended_at) return err('This session has ended.', 409)
  const mod = getModule(session.module)
  if (!mod) return err('module missing', 500)

  const turns = await listTurns(id)
  const last = turns[turns.length - 1]

  let studentTurn: Turn
  let history: Turn[]
  if (!message) {
    if (!last) {
      studentTurn = await insertTurn({
        session_id: id, idx: 0, role: 'student', content: OPENING_MESSAGE, hidden: true,
        meta: null, coach: null, usage: null, latency_ms: null, model: null,
      })
      history = [studentTurn]
    } else if (last.role === 'student') {
      // Retry: the tutor failed after this message was stored.
      studentTurn = last
      history = turns
    } else {
      return err('message required', 400)
    }
  } else {
    if (!last) return err('The session has not been opened yet.', 409)
    if (last.role !== 'tutor') return err('The tutor has not answered yet.', 409)

    // The observer's read of this message. In A/B a failure is logged on
    // the turn and the session goes on; in C the coach is part of the
    // treatment, so the turn fails instead of silently running uncoached.
    let meta: Turn['meta'] | { observer_error: string } = null
    let coach: string | null = null
    let usage: Record<string, unknown> | null = null
    let latency: number | null = null
    let model: string | null = null
    try {
      const o = await observe(mod, last.content, message)
      meta = o.verdict
      usage = o.usage as unknown as Record<string, unknown>
      latency = o.latencyMs
      model = o.model
      if (ARM_INFO[session.arm].coached) coach = coachNote(o.verdict)
    } catch (e) {
      console.error('[socratic/turn] observer', (e as Error).message)
      if (ARM_INFO[session.arm].coached) return err(friendly(e), 502)
      meta = { observer_error: (e as Error).message }
    }
    studentTurn = await insertTurn({
      session_id: id, idx: turns.length, role: 'student', content: message, hidden: false,
      meta: meta as Turn['meta'], coach, usage, latency_ms: latency, model,
    })
    history = [...turns, studentTurn]
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      send({ type: 'student', turn: publicTurn(studentTurn) })
      try {
        const r = await runTutor(session.arm, mod, history, (text) => send({ type: 'delta', text }))
        const tutorTurn = await insertTurn({
          session_id: id, idx: history.length, role: 'tutor', content: r.reply, hidden: false,
          meta: r.meta, coach: null, usage: r.usage as unknown as Record<string, unknown>, latency_ms: r.latencyMs, model: r.model,
        })
        const mastery = mergeMastery(session.mastery, r.meta.mastery)
        await updateSession(id, { phase: r.meta.phase, mastery, turns: history.length + 1, tutor_model: r.model })
        send({ type: 'done', turn: publicTurn(tutorTurn), session: { ...session, phase: r.meta.phase, mastery, turns: history.length + 1, tutor_model: r.model } })
      } catch (e) {
        console.error('[socratic/turn] tutor', (e as Error).message)
        send({ type: 'error', message: friendly(e) })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
