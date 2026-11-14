import { notFound } from 'next/navigation'
import Call from '../../Call'
import { getCall, isSlug, keyOk } from '@/lib/venture/interview'

export const dynamic = 'force-dynamic'

// A later call: its agenda is the venture_calls row <slug>, written by Claude.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ k?: string }>
}) {
  const { slug } = await params
  const { k } = await searchParams
  if (!keyOk(k) || !isSlug(slug)) notFound()
  const call = await getCall(slug)
  if (!call) notFound()
  return (
    <Call
      call={call.slug}
      kicker={`Venture · call ${call.slug}`}
      title={call.title}
      blurb={call.blurb}
      doneNote="The transcript is with me. I’ll act on it and report on the next call."
    />
  )
}
