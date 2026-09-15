// Create a new topic: a form that has the model draft a module in the
// Zeiler format. Open on the local backend; needs ?key= elsewhere.

import { useClaudeCode } from '@/lib/socratic/claude-code'
import { authorized } from '../sessions/auth'
import NewTopic from './NewTopic'

export const dynamic = 'force-dynamic'

export default async function NewTopicPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams
  const allowed = useClaudeCode() || authorized(key)
  return <NewTopic allowed={allowed} keyParam={allowed && key ? key : ''} />
}
