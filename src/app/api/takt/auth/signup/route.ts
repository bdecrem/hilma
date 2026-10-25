import { NextResponse } from 'next/server'
import { claimGuest, createAccount, getSessionUser, setSessionCookie } from '@/lib/takt/auth'

export const runtime = 'nodejs'

// POST /api/takt/auth/signup { email, password } — a signed-in guest becomes a real account in
// place (its progress stays); without a guest session, a new account.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: string; password?: string } | null
  if (!body?.email || !body.password) {
    return NextResponse.json({ error: 'Email and password, please.' }, { status: 400 })
  }
  const current = await getSessionUser()
  const user = current?.is_guest
    ? await claimGuest(current.id, body.email, body.password)
    : await createAccount(body.email, body.password)
  if ('error' in user) return NextResponse.json({ error: user.error }, { status: user.status })
  const res = NextResponse.json({ user })
  setSessionCookie(res, user.id)
  return res
}
