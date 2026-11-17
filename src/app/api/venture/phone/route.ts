import { overview } from '@/lib/venture/phone'
import { phoneDeps } from '@/lib/venture/phone-deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/venture/phone (Bearer: the phone's admin token) → { meetings, notes }, for Kit's
// screen in the Ola iPhone app. See src/lib/venture/phone.ts.
export const GET = (req: Request) => overview(req, phoneDeps)
