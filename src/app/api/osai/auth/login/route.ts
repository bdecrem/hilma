import { NextRequest, NextResponse } from 'next/server'
import { isOsaiUser, passcodeOk, setSessionCookie } from '@/lib/osai/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let body: { user?: unknown; passcode?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const user = typeof body.user === 'string' ? body.user.trim().toLowerCase() : ''
  if (!isOsaiUser(user)) return NextResponse.json({ error: 'Pick a name.' }, { status: 400 })
  if (!passcodeOk(body.passcode)) return NextResponse.json({ error: 'That passcode is not right.' }, { status: 403 })
  const res = NextResponse.json({ ok: true, user })
  setSessionCookie(res, user)
  return res
}
