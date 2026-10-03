import { NextResponse } from 'next/server'
import { getOsaiUser } from '@/lib/osai/auth'
import { getNotes, setNotes } from '@/lib/osai/memory'

export const runtime = 'nodejs'

export async function GET() {
  const user = await getOsaiUser()
  if (!user) return NextResponse.json({ error: 'sign in' }, { status: 401 })
  return NextResponse.json({ notes: await getNotes(user) })
}

/** Forget everything the assistant remembers about the signed-in reader. */
export async function DELETE() {
  const user = await getOsaiUser()
  if (!user) return NextResponse.json({ error: 'sign in' }, { status: 401 })
  await setNotes(user, '')
  return NextResponse.json({ ok: true })
}
