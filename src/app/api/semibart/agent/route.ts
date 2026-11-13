// CASBS Quest: the chat with a room's Claude. A turn that changes the room runs the decorator
// (a Claude call that writes and test-runs drawing code), so it can take a minute or two.
import { agent } from '@/lib/semibart/social-handlers'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
export const POST = agent
