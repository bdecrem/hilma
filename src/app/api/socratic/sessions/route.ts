// POST /api/socratic/sessions — start a session for a participant under an arm.

import { NextRequest, NextResponse } from 'next/server'
import { isArm } from '@/lib/socratic/arms'
import { DEFAULT_MODULE, getModule } from '@/lib/socratic/modules'
import { createSession } from '@/lib/socratic/store'

export const runtime = 'nodejs'

const PARTICIPANT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

export async function POST(req: NextRequest) {
  let body: { participant?: unknown; arm?: unknown; module?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const participant = typeof body.participant === 'string' ? body.participant.trim() : ''
  if (!PARTICIPANT_RE.test(participant)) return NextResponse.json({ error: 'participant: 1–64 letters, digits, dots, dashes or underscores' }, { status: 400 })
  const arm = body.arm ?? 'B'
  if (!isArm(arm)) return NextResponse.json({ error: 'arm must be A, B or C' }, { status: 400 })
  const moduleId = typeof body.module === 'string' && body.module ? body.module : DEFAULT_MODULE
  if (!(await getModule(moduleId))) return NextResponse.json({ error: 'unknown module' }, { status: 400 })

  try {
    const session = await createSession({ participant, arm, module: moduleId })
    return NextResponse.json({ session })
  } catch (e) {
    console.error('[socratic/sessions]', (e as Error).message)
    return NextResponse.json({ error: 'Could not start a session. Try again.' }, { status: 500 })
  }
}
