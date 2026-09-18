import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { getThreadById } from '@/lib/polly/threads'
import { authorFlashCard } from '@/lib/polly/flash'

export const runtime = 'nodejs'
// Authoring reads the topic's full source to write the answer + distractors.
export const maxDuration = 120

// POST /api/polly/flash/cards — author ONE card from a user-dictated question.
// The answer (unless provided) and distractors are written from the topic's
// source material — same machinery as the polly agent's make_flash_card.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  let body: { thread_id?: string; question?: string; answer?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const question = (body.question ?? '').trim()
  if (!body.thread_id || !question) {
    return NextResponse.json({ error: 'thread_id and question required' }, { status: 400 })
  }
  const thread = await getThreadById(user.id, body.thread_id)
  if (!thread) {
    return NextResponse.json({ error: 'topic not found' }, { status: 404 })
  }
  try {
    const card = await authorFlashCard(thread, question, null, body.answer?.trim() || undefined)
    return NextResponse.json({ card })
  } catch (e) {
    console.error('[polly/flash] authorFlashCard failed:', e)
    return NextResponse.json({ error: 'Could not write the card.' }, { status: 502 })
  }
}
