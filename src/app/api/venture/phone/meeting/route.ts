import { startMeeting } from '@/lib/venture/phone'
import { phoneDeps } from '@/lib/venture/phone-deps'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/venture/phone/meeting { session? } (Bearer: the phone's admin token) → a token for
// one ElevenLabs conversation with Kit. Called only when Bart presses Talk to Kit. See
// src/lib/venture/phone.ts.
export const POST = (req: Request) => startMeeting(req, phoneDeps)
