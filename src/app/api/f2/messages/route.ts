import { NextResponse } from 'next/server'
import { processMessage, type F2Message, type F2Client } from '@/lib/f2/agent'

export const runtime = 'nodejs'

// POST /api/f2/messages
// Body: { handle, text, client }
// Returns: { reply }
//
// Client-agnostic core. Web/iOS/iMessage adapters all call this.
export async function POST(req: Request) {
  let body: Partial<F2Message>
  try {
    body = (await req.json()) as Partial<F2Message>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { handle, text, client } = body
  if (!handle || !text || !client) {
    return NextResponse.json(
      { error: 'handle, text, client required' },
      { status: 400 },
    )
  }
  const valid: F2Client[] = ['imessage', 'web', 'ios']
  if (!valid.includes(client)) {
    return NextResponse.json({ error: `invalid client: ${client}` }, { status: 400 })
  }
  const result = await processMessage({ handle, text, client })
  return NextResponse.json(result)
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'f2/messages' })
}
