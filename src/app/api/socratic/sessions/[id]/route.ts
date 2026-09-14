// GET   /api/socratic/sessions/:id — the session, its turns (student-facing: no verdicts, no coach notes), the module
// PATCH /api/socratic/sessions/:id — { ended: true } ends it

import { NextRequest, NextResponse } from 'next/server'
import { ARM_INFO } from '@/lib/socratic/arms'
import { getModule } from '@/lib/socratic/modules'
import { getSession, listTurns, publicTurn, UUID_RE, updateSession } from '@/lib/socratic/store'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  try {
    const session = await getSession(id)
    if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const mod = getModule(session.module)
    if (!mod) return NextResponse.json({ error: 'module missing' }, { status: 500 })
    const turns = await listTurns(id)
    return NextResponse.json({
      session,
      turns: turns.map(publicTurn),
      module: { id: mod.id, title: mod.title, subtitle: mod.subtitle, course: mod.course, source: mod.source, masteryCriteria: mod.masteryCriteria },
      arm: ARM_INFO[session.arm],
    })
  } catch (e) {
    console.error('[socratic/session GET]', (e as Error).message)
    return NextResponse.json({ error: 'Could not load the session.' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  let body: { ended?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  if (body.ended !== true) return NextResponse.json({ error: 'nothing to do' }, { status: 400 })
  try {
    const session = await getSession(id)
    if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })
    if (!session.ended_at) await updateSession(id, { ended_at: new Date().toISOString() })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[socratic/session PATCH]', (e as Error).message)
    return NextResponse.json({ error: 'Could not end the session.' }, { status: 500 })
  }
}
