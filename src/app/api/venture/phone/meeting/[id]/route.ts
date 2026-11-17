import { endMeeting, readMeeting } from '@/lib/venture/phone'
import { phoneDeps } from '@/lib/venture/phone-deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

// GET  /api/venture/phone/meeting/<id>  → { meeting, turns }   (Bearer: the phone's admin token)
// POST /api/venture/phone/meeting/<id>  { seconds, reason } → the meeting is over
export async function GET(req: Request, { params }: Ctx) {
  return readMeeting(req, (await params).id, phoneDeps)
}

export async function POST(req: Request, { params }: Ctx) {
  return endMeeting(req, (await params).id, phoneDeps)
}
