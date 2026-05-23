import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'

export const runtime = 'nodejs'

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  return NextResponse.json({ user })
}
