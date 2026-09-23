import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getJumboState } from '@/lib/f2/flash'
import { PECK_GAME_FIRST_YEAR, getPeckGameBoard, isRestStop, recordPeckGameRound } from '@/lib/f2/peck-game'

export const runtime = 'nodejs'

const NO_STORE = { 'Cache-Control': 'no-store' }

type Ctx = { params: Promise<{ level: string }> }

// GET /api/f2/peck-game/5 — the board for one rest stop.
export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const level = Number((await ctx.params).level)
  if (!isRestStop(level)) return NextResponse.json({ error: 'Not a rest stop.' }, { status: 400 })
  try {
    return NextResponse.json(await getPeckGameBoard(user.id, level), { headers: NO_STORE })
  } catch (e) {
    console.error('[f2/peck-game] GET failed:', e)
    return NextResponse.json({ error: 'Could not load the board.' }, { status: 500 })
  }
}

// POST /api/f2/peck-game/5 { year } — one finished round. Only players who
// have cleared that rest stop land on its board.
export async function POST(req: Request, ctx: Ctx) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  let body: { year?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const level = Number((await ctx.params).level)
  const year = Number(body.year)
  if (!isRestStop(level)) return NextResponse.json({ error: 'Not a rest stop.' }, { status: 400 })
  if (!Number.isInteger(year) || year < PECK_GAME_FIRST_YEAR || year > 2200) {
    return NextResponse.json({ error: 'Invalid year.' }, { status: 400 })
  }
  const jumbo = await getJumboState(user.id)
  if (jumbo.highest_passed < level) {
    return NextResponse.json({ error: 'Clear this rest stop first.' }, { status: 403 })
  }
  try {
    const newBest = await recordPeckGameRound(user.id, level, year)
    const board = await getPeckGameBoard(user.id, level)
    return NextResponse.json({ ...board, new_best: newBest }, { headers: NO_STORE })
  } catch (e) {
    console.error('[f2/peck-game] POST failed:', e)
    return NextResponse.json({ error: 'Could not save the round.' }, { status: 500 })
  }
}
