import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { COOKIE, findUserById, normalizeHandle, verifySession } from '@/lib/onething/core'
import { accept, end, findBuddy, invite } from '@/lib/onething/buddies'

export const runtime = 'nodejs'

// POST { action: 'invite', to } | { action: 'accept' | 'end' | 'cancel', id }
// invite: text an invite to a phone or iCloud email. accept: a received invite,
// from the site. end: an active pair. cancel: an invite I sent. Ending and
// cancelling are silent to the other person.
export async function POST(req: Request) {
  const userId = verifySession((await cookies()).get(COOKIE)?.value)
  if (!userId) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const user = await findUserById(userId)
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { action?: string; to?: string; id?: string }
  try {
    if (body.action === 'invite') {
      const handle = normalizeHandle(body.to ?? '', { phone: user.phone, tz: user.tz }) // a buddy's national number is read in the inviter's country
      if (!handle) return NextResponse.json({ error: 'A phone number or an iCloud email.' }, { status: 400 })
      const row = await invite(user, handle)
      return NextResponse.json({ ok: true, id: row.id })
    }
    const row = body.id ? await findBuddy(body.id) : null
    if (!row || (row.inviter_id !== user.id && row.invitee_id !== user.id && row.invitee_handle !== user.phone)) {
      return NextResponse.json({ error: 'Not yours.' }, { status: 404 })
    }
    if (body.action === 'accept') {
      if (row.status !== 'pending' || row.invitee_handle !== user.phone) return NextResponse.json({ error: 'Nothing to accept.' }, { status: 400 })
      await accept(row, user)
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'end' || body.action === 'cancel') {
      if (row.status === 'ended') return NextResponse.json({ ok: true })
      await end(row, user.id)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Which action?' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
