import { NextRequest, NextResponse } from 'next/server'
import { getOsaiUser } from '@/lib/osai/auth'
import { clearPassword, hasPassword, setPassword, validatePassword } from '@/lib/osai/password'

export const runtime = 'nodejs'

export async function GET() {
  const user = await getOsaiUser()
  if (!user) return NextResponse.json({ error: 'sign in' }, { status: 401 })
  return NextResponse.json({ hasPassword: await hasPassword(user) })
}

/** Set (or change) the signed-in reader's own password. { password, confirm } */
export async function POST(req: NextRequest) {
  const user = await getOsaiUser()
  if (!user) return NextResponse.json({ error: 'sign in' }, { status: 401 })
  let body: { password?: unknown; confirm?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const invalid = validatePassword(body.password, body.confirm)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
  await setPassword(user, body.password as string)
  return NextResponse.json({ ok: true })
}

/** Drop the reader's own password; the shared passcode works again. */
export async function DELETE() {
  const user = await getOsaiUser()
  if (!user) return NextResponse.json({ error: 'sign in' }, { status: 401 })
  await clearPassword(user)
  return NextResponse.json({ ok: true })
}
