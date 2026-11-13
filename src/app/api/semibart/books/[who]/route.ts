// CASBS Quest: a fellow's book, as far as the reader may see it. Handler: src/lib/semibart/social-handlers.ts.
import { book } from '@/lib/semibart/social-handlers'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ who: string }> }
export const GET = async (req: Request, ctx: Ctx) => book(req, (await ctx.params).who.toLowerCase())
