import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { COOKIE, findUserById, localDay, recordEntry, verifySession } from '@/lib/onething/core'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const userId = verifySession((await cookies()).get(COOKIE)?.value)
  if (!userId) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const user = await findUserById(userId)
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { text?: string }
  const text = (body.text ?? '').trim().slice(0, 600)
  if (text.length < 2) return NextResponse.json({ error: 'One sentence, anything at all.' }, { status: 400 })
  const r = await recordEntry(user, localDay(), text)
  return NextResponse.json({ ok: true, ...r })
}
