// CASBS Quest rooms as data: read a room's code, or ask the decorator to change it (a Claude call
// that writes and test-runs drawing code, so the POST can take a minute or two).
import { roomDecorate, roomGet } from '@/lib/semibart/room-handlers'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
type Ctx = { params: Promise<{ room: string }> }
export const GET = async (req: Request, ctx: Ctx) => roomGet(req, (await ctx.params).room)
export const POST = async (req: Request, ctx: Ctx) => roomDecorate(req, (await ctx.params).room)
