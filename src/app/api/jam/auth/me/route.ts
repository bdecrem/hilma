import { NextResponse } from 'next/server'
import { getJamUser } from '@/lib/jam/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getJamUser()
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  return NextResponse.json({ user })
}
