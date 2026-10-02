import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { COOKIE, findUserById, verifySession } from '@/lib/onething/core'
import { keepRedraw, redrawOptions } from '@/lib/onething/doodle'

// Redraw a day's doodle. POST { id } draws three takes in parallel and
// returns them without storing anything (~5–10 s); PUT { id, svg, alt }
// stores the one the person picked (sanitized again on the way in).
export const runtime = 'nodejs'
export const maxDuration = 60

async function who() {
  const userId = verifySession((await cookies()).get(COOKIE)?.value)
  return userId ? await findUserById(userId) : null
}

export async function POST(req: Request) {
  const user = await who()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const { id } = (await req.json().catch(() => ({}))) as { id?: string }
  if (!id) return NextResponse.json({ error: 'Which day?' }, { status: 400 })
  try {
    const options = await redrawOptions(id, user.id)
    return NextResponse.json({ options })
  } catch (e) {
    console.error('[onething] redraw failed', id, e)
    return NextResponse.json({ error: (e as Error).message.replace(/^onething doodle: /, '') }, { status: 502 })
  }
}

export async function PUT(req: Request) {
  const user = await who()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { id?: string; svg?: string; alt?: string }
  if (!body.id || !body.svg) return NextResponse.json({ error: 'Which drawing?' }, { status: 400 })
  try {
    const drawn = await keepRedraw(body.id, user.id, { svg: body.svg, alt: body.alt ?? '' })
    return NextResponse.json({ ok: true, ...drawn })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.replace(/^onething doodle: /, '') }, { status: 400 })
  }
}
