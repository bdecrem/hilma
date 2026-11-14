import { NextResponse } from 'next/server'
import { keyOk } from '@/lib/venture/interview'
import { sendVenture } from '@/lib/venture/messages'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/venture/imsg  { key, text }
// The working session texts Bart (scripts/venture/imsg.mjs send "…").
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { key?: unknown; text?: unknown } | null
  if (!body || !keyOk(body.key)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 4000) : ''
  if (!text) return NextResponse.json({ error: 'empty' }, { status: 400 })
  try {
    await sendVenture(text, 'session')
  } catch (e) {
    console.error('[venture/imsg] send failed:', e)
    return NextResponse.json({ error: 'the iMessage bridge did not take it' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
