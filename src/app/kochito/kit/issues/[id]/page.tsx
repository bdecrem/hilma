import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadFrame, loadIssue } from '@/lib/venture/board'
import { FACE, gate } from '../../gate'
import Login from '../../Login'
import { boardViewport, meta } from '../../meta'
import Shell from '../../Shell'
import IssueView from '../../views/IssueView'
import '../../../company.css'

// One issue (app.kochitolabs.com/issues/OLA-150, also /issues/150): views/IssueView.tsx.
export const dynamic = 'force-dynamic'
export const viewport = boardViewport
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return meta((await params).id.toUpperCase())
}

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { user, base, q } = await gate()
  if (!user) return <Login face={FACE} />
  const raw = (await params).id.toUpperCase()
  const id = /^\d+$/.test(raw) ? `OLA-${Number(raw)}` : raw
  if (!/^OLA-\d+$/.test(id)) notFound()
  const [found, f] = await Promise.all([loadIssue(id), loadFrame()])
  if (!found) notFound()
  return (
    <Shell base={base} q={q} user={user} f={f} current="issues">
      <IssueView issue={found.issue} activity={found.activity} base={base} now={f.now} user={user} />
    </Shell>
  )
}
