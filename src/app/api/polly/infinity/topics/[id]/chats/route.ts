import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { chatForClient, listInfinityChats } from '@/lib/polly/infinity'

export const runtime = 'nodejs'
const NO_STORE = { 'Cache-Control': 'no-store' }

// GET /api/polly/infinity/topics/[id]/chats — the conversations on a topic
// (Infinity Chat, or the chats about a source), newest first. (Path param, not a query string: the iOS client
// builds URLs with appendingPathComponent, which would percent-encode a "?".)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: NO_STORE })
  const { id } = await params
  const chats = await listInfinityChats(user.id, id)
  return NextResponse.json({ chats: chats.map((c) => chatForClient(c)) }, { headers: NO_STORE })
}
