import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/takt/auth'
import { f2Supabase } from '@/lib/f2/supabase'

export const runtime = 'nodejs'

// POST /api/takt/daily/verify { code } → { phone, verified: true }
// The code from POST /api/takt/daily/phone; wrong or expired is a 400.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { code?: unknown } | null
  const code = typeof body?.code === 'string' ? body.code.trim() : typeof body?.code === 'number' ? String(body.code).padStart(4, '0') : ''
  if (!/^\d{4}$/.test(code)) return NextResponse.json({ error: 'Enter the 4-digit code.' }, { status: 400 })

  const sb = f2Supabase()
  const { data: row, error: rErr } = await sb
    .from('takt_users')
    .select('phone, phone_code, phone_code_expires_at')
    .eq('id', user.id)
    .single()
  if (rErr || !row) return NextResponse.json({ error: 'Could not read the account.' }, { status: 500 })
  if (!row.phone || !row.phone_code) return NextResponse.json({ error: 'Ask for a code first.' }, { status: 400 })
  if (Date.parse(row.phone_code_expires_at as string) < Date.now()) {
    return NextResponse.json({ error: 'That code expired. Ask for a new one.' }, { status: 400 })
  }
  if (row.phone_code !== code) return NextResponse.json({ error: 'That code doesn’t match.' }, { status: 400 })

  const { error } = await sb
    .from('takt_users')
    .update({ phone_verified_at: new Date().toISOString(), phone_code: null, phone_code_expires_at: null })
    .eq('id', user.id)
  if (error) return NextResponse.json({ error: 'Could not verify.' }, { status: 500 })
  return NextResponse.json({ phone: row.phone, verified: true })
}
