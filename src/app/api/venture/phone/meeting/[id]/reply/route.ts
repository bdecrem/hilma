import { localTurn } from '@/lib/venture/phone'
import { phoneDeps } from '@/lib/venture/phone-deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Ctx = { params: Promise<{ id: string }> }

// POST /api/venture/phone/meeting/<id>/reply { text } (Bearer: the phone's admin token) → Kit's
// reply as streamed text, for a meeting on the local voice (the Mac Studio). See localTurn in
// src/lib/venture/phone.ts.
export async function POST(req: Request, { params }: Ctx) {
  return localTurn(req, (await params).id, phoneDeps)
}
