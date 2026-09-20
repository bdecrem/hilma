import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import {
  appendGlobalMessages,
  buildGlobalSystem,
  clearGlobalMessages,
  getGlobalMessages,
  historyMessages,
  runGlobalTurn,
  type GlobalMessage,
  type GlobalTurnResult,
} from '@/lib/f2/global-chat'
import { indexStatus } from '@/lib/f2/knowledge'

export const runtime = 'nodejs'
export const maxDuration = 120

// Dodo's GLOBAL chat — one conversation across all of the signed-in user's
// topics (src/lib/f2/global-chat.ts). Voice joins the same conversation: a
// global voice session's transcript is appended when it ends.
//
//   GET    → { messages, index: { topics, indexed, pending } }
//   POST   { text, model? } → { reply, sources, messages }
//   DELETE → start a new conversation
const TEXT_MODELS: Record<string, string> = {
  'sonnet-5': 'claude-sonnet-5',
  'opus-5': 'claude-opus-5',
}
const DEFAULT_TEXT_MODEL = 'claude-sonnet-5'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const [messages, index] = await Promise.all([getGlobalMessages(user.id), indexStatus(user.id)])
  return NextResponse.json({ messages, index })
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  let body: { text?: string; model?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const text = body.text?.trim()
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

  const history = await getGlobalMessages(user.id)
  const { system } = await buildGlobalSystem({ userId: user.id, userName: user.username, surface: 'text' })

  let reply = ''
  let result: GlobalTurnResult | null = null
  try {
    for await (const chunk of runGlobalTurn({
      userId: user.id,
      system,
      messages: [...historyMessages(history), { role: 'user', content: text }],
      model: (body.model && TEXT_MODELS[body.model]) || DEFAULT_TEXT_MODEL,
      thinking: 'adaptive',
      effort: 'low',
      maxTokens: 8192,
      signal: req.signal,
      onDone: (r) => (result = r),
    })) {
      reply += chunk
    }
  } catch (err) {
    console.error('[f2/global-chat] turn failed:', user.id, err)
    return NextResponse.json({ error: 'Dodo could not answer just now. Try again.' }, { status: 502 })
  }
  reply = reply.replace(/[ \t]+\n/g, '\n').trim()
  if (!reply) return NextResponse.json({ error: 'Dodo had nothing to say. Try again.' }, { status: 502 })

  const done = result as GlobalTurnResult | null
  console.log('[f2/global-chat] turn', user.id, JSON.stringify(done?.usage ?? {}), 'searches', done?.searches ?? 0)
  const now = new Date().toISOString()
  const toAdd: GlobalMessage[] = [
    { role: 'user', text, created_at: now },
    { role: 'assistant', text: reply, created_at: new Date().toISOString(), sources: done?.sources ?? [] },
  ]
  const messages = await appendGlobalMessages(user.id, toAdd)
  return NextResponse.json({ reply, sources: done?.sources ?? [], messages })
}

export async function DELETE() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  await clearGlobalMessages(user.id)
  return NextResponse.json({ ok: true })
}
