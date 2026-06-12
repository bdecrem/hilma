import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { homeData } from '@/lib/f3/cards'

export const runtime = 'nodejs'

// GET /api/f3/home?tz=America/Los_Angeles
// Everything the Today screen needs in one call: due count, streak,
// reviewed-today, and per-topic card counts + memory strength.
export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const tz = new URL(req.url).searchParams.get('tz') ?? 'America/Los_Angeles'
  try {
    const data = await homeData(user.id, tz)
    return NextResponse.json(data)
  } catch (e) {
    // An invalid tz makes Intl throw — retry with the default rather than 500.
    console.error('[f3] home failed, retrying with default tz:', e)
    const data = await homeData(user.id)
    return NextResponse.json(data)
  }
}
