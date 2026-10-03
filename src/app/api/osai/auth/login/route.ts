import { NextRequest, NextResponse } from 'next/server'
import { isOsaiUser, passcodeOk, setSessionCookie } from '@/lib/osai/auth'
import { checkPassword, getPasswordHash } from '@/lib/osai/password'

export const runtime = 'nodejs'

// { user, passcode } — the "passcode" is the reader's own password once they
// have set one, otherwise the shared passcode.
export async function POST(req: NextRequest) {
  let body: { user?: unknown; passcode?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const user = typeof body.user === 'string' ? body.user.trim().toLowerCase() : ''
  if (!isOsaiUser(user)) return NextResponse.json({ error: "That name isn't on the list." }, { status: 400 })
  const secret = typeof body.passcode === 'string' ? body.passcode : typeof body.password === 'string' ? body.password : ''

  const hash = await getPasswordHash(user)
  const ok = hash ? await checkPassword(secret, hash) : passcodeOk(secret)
  if (!ok) {
    return NextResponse.json(
      { error: hash ? 'That password is not right.' : 'That passcode is not right.' },
      { status: 403 },
    )
  }
  const res = NextResponse.json({ ok: true, user, ownPassword: !!hash })
  setSessionCookie(res, user)
  return res
}
