import { notFound } from 'next/navigation'
import Talk from '../Talk'
import { keyOk } from '@/lib/venture/interview'

export const dynamic = 'force-dynamic'

// The open conversation: no agenda, Bart comments and Claude reacts.
export default async function Page({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { k } = await searchParams
  if (!keyOk(k)) notFound()
  return <Talk />
}
