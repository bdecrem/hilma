import { NextResponse } from 'next/server'
import { recordEvent } from '@/lib/kochito/store'

// A page view or a click on kochitolabs.com (posted by Track.tsx).
export async function POST(req: Request) {
  try {
    await recordEvent(await req.json(), req.headers.get('user-agent'))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
