// CASBS Quest rooms as data: step a room back one change.
import { roomUndo } from '@/lib/semibart/room-handlers'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ room: string }> }
export const POST = async (req: Request, ctx: Ctx) => roomUndo(req, (await ctx.params).room)
