import { leaveNote } from '@/lib/venture/phone'
import { phoneDeps } from '@/lib/venture/phone-deps'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/venture/phone/note (multipart: audio, seconds; Bearer: the phone's admin token) →
// { note: { id, text, at } }. Transcribed and stored like the memo page's notes; the audio is not kept.
export const POST = (req: Request) => leaveNote(req, phoneDeps)
