import { NextResponse } from 'next/server'
import { findUserByEmail, isValidEmail } from '@/lib/omni/auth'

export const runtime = 'nodejs'

/** Pre-flight for signup step 1: is this email valid and free? Lets the
 *  client reject a taken email before the language/level steps. */
export async function POST(req: Request) {
  let body: { email?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const email = (body.email ?? '').trim().toLowerCase()
  if (!isValidEmail(email)) {
    return NextResponse.json({ valid: false, available: false })
  }
  const existing = await findUserByEmail(email)
  return NextResponse.json({ valid: true, available: !existing })
}
