import { NextResponse } from 'next/server'
import { recordLead } from '@/lib/kochito/store'

// A sign-up from one of kochitolabs.com's forms.
export async function POST(req: Request) {
  try {
    await recordLead(await req.json(), req.headers.get('user-agent'))
    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = (e as Error).message
    return NextResponse.json({ error: message }, { status: message.startsWith('kochito') ? 500 : 400 })
  }
}
