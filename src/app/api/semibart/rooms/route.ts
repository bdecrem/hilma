// CASBS Quest rooms as data: the handlers live in src/lib/semibart/room-handlers.ts (plain Request -> Response).
import { roomsIndex } from '@/lib/semibart/room-handlers'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const GET = () => roomsIndex()
