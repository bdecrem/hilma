import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { f2Supabase } from '@/lib/f2/supabase'

export const runtime = 'nodejs'

// GET /api/f2/profile — profile extras beyond /auth/me (currently: phone).
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const { data } = await f2Supabase()
    .from('f2_users')
    .select('phone')
    .eq('id', user.id)
    .maybeSingle()
  return NextResponse.json({ phone: (data?.phone as string) ?? null })
}

// PUT /api/f2/profile — set (or clear, with "") the phone number the daily
// flash card texts. Stored E.164-ish: digits with a leading +.
export async function PUT(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  let body: { phone?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const raw = (body.phone ?? '').trim()
  let phone: string | null = null
  if (raw) {
    const digits = raw.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '')
    const normalized = digits.startsWith('+')
      ? digits
      : digits.length === 10
        ? `+1${digits}`
        : `+${digits}`
    if (!/^\+\d{10,15}$/.test(normalized)) {
      return NextResponse.json(
        { error: 'That does not look like a phone number.' },
        { status: 400 },
      )
    }
    phone = normalized
  }
  const { error } = await f2Supabase()
    .from('f2_users')
    .update({ phone })
    .eq('id', user.id)
  if (error) {
    console.error('[f2/profile] phone update failed:', error)
    return NextResponse.json({ error: 'Could not save.' }, { status: 500 })
  }
  return NextResponse.json({ phone })
}
