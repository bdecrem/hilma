// POST /api/rpa/judge  { phrase, enemies: [catalog ids] }  →  Verdict
//
// The client names enemies by id and the server writes the questions, so this
// is not an open proxy to Jev: all anyone can ask is whether forty characters
// beat things from our own catalog.

import { after, NextResponse } from 'next/server'
import { judge, JudgeError } from '@/lib/rpa/judge'
import { cleanPhrase, MAX_ENEMIES } from '@/lib/rpa/rules'
import { overDailyCap, recordCall } from '@/lib/rpa/usage'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: { phrase?: unknown; enemies?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'body must be JSON' }, { status: 400 })
  }
  const phrase = typeof body.phrase === 'string' ? cleanPhrase(body.phrase) : ''
  const enemies = Array.isArray(body.enemies) ? [...new Set(body.enemies.filter((x): x is string => typeof x === 'string'))] : []
  if (phrase.length < 2) return NextResponse.json({ error: 'phrase is too short' }, { status: 400 })
  if (enemies.length === 0 || enemies.length > MAX_ENEMIES) {
    return NextResponse.json({ error: `enemies must list 1–${MAX_ENEMIES} ids` }, { status: 400 })
  }

  if (await overDailyCap()) {
    return NextResponse.json({ error: 'The gate is closed for today: the daily budget of shots is spent. Back at midnight UTC.' }, { status: 429 })
  }

  try {
    const verdict = await judge(phrase, enemies)
    after(() => recordCall(verdict.tokens))
    return NextResponse.json(verdict)
  } catch (err) {
    if (err instanceof JudgeError) {
      if (err.status >= 500) console.error('[rpa] judge failed:', err.message)
      return NextResponse.json({ error: err.status === 503 ? 'Jev is busy, fire again.' : err.status === 400 ? err.message : 'The judge is unreachable.' }, { status: err.status })
    }
    throw err
  }
}
