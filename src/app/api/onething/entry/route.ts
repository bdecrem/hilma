import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { COOKIE, editEntryLine, findUserById, localDay, recordEntry, verifySession } from '@/lib/onething/core'

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

// PUT { day, index, text } — change one thought on one day. Empty text removes it.
export async function PUT(req: Request) {
  const userId = verifySession((await cookies()).get(COOKIE)?.value)
  if (!userId) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const user = await findUserById(userId)
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { day?: string; index?: number; text?: string }
  const day = body.day ?? ''
  const index = Number(body.index)
  const text = (body.text ?? '').trim().slice(0, 600)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(index)) {
    return NextResponse.json({ error: 'Which thought?' }, { status: 400 })
  }
  if (text.length === 1) return NextResponse.json({ error: 'One sentence, anything at all.' }, { status: 400 })
  try {
    const entry = await editEntryLine(user, day, index, text)
    return NextResponse.json({ ok: true, entry })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
