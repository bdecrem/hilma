import { correct } from '@/lib/venture/phone'
import { phoneDeps } from '@/lib/venture/phone-deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/venture/phone/minutes { source, ref, id, to } (Bearer: the phone's admin token):
// Bart moves a line of a call's minutes between Decided and To be decided, or removes it.
export const POST = (req: Request) => correct(req, phoneDeps)
