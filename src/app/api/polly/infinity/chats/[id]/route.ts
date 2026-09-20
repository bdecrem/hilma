import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { chatForClient, chatRows, getInfinityChat, renameInfinityChat } from '@/lib/polly/infinity'
import { pollySupabase } from '@/lib/polly/supabase'

export const runtime = 'nodejs'
const NO_STORE = { 'Cache-Control': 'no-store' }

// GET /api/polly/infinity/chats/[id] — one conversation: its analysis (fixes /
// vocab / grammar) if clean-up has been run, and its transcript.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: NO_STORE })
  const { id } = await params
  const chat = await getInfinityChat(user.id, id)
  if (!chat) return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE })
  return NextResponse.json({ chat: chatForClient(chat, { transcript: await chatRows(user.id, chat) }) }, { headers: NO_STORE })
}

// PATCH { title } — rename.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { id } = await params
  let body: { title?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const title = body.title?.trim()
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })
  if (!(await renameInfinityChat(user.id, id, title))) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const chat = await getInfinityChat(user.id, id)
  return NextResponse.json({ chat: chat ? chatForClient(chat) : null })
}

// DELETE — the conversation goes; the cards it made stay in the deck.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { id } = await params
  const { data } = await pollySupabase().from('polly_infinity_chats').delete().eq('id', id).eq('user_id', user.id).select('id')
  if ((data ?? []).length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
