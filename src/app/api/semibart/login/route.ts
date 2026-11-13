// CASBS Quest accounts: the handler lives in src/lib/semibart/handlers.ts (plain Request -> Response).
import { login } from '@/lib/semibart/handlers'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const POST = login
