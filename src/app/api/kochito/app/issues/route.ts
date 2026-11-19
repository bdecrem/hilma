import { createIssue } from '@/lib/venture/issue-writes'
import { asUser } from './guard'

export const runtime = 'nodejs'

// POST /api/kochito/app/issues { title, area, priority?, what?, week?, who? }: a new issue, next up.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  return asUser(req, async (user) => ({ issue: await createIssue(body, user) }))
}
