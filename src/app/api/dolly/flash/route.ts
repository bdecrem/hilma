import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/dolly/auth'
import { dealFlashSet, findOpenFlashSet, flashView } from '@/lib/dolly/flash'

export const runtime = 'nodejs'

// GET /api/dolly/flash — the set under way, or null.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const open = await findOpenFlashSet(user.id)
  return NextResponse.json({ set: open ? await flashView(user, open) : null })
}

// POST /api/dolly/flash — deal a new set of ten (an open one is dropped).
export async function POST() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const set = await dealFlashSet(user)
  if ('error' in set) return NextResponse.json({ error: set.error }, { status: set.status })
  return NextResponse.json({ set: await flashView(user, set) })
}
