import { notFound } from 'next/navigation'
import Memo from '../Memo'
import { keyOk } from '@/lib/venture/interview'

export const dynamic = 'force-dynamic'

// Voice notes for Claude: a permanent page to bookmark. Record, send, done.
export default async function Page({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { k } = await searchParams
  if (!keyOk(k)) notFound()
  return <Memo />
}
