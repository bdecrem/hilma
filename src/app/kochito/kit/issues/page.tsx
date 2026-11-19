import { loadFrame, loadIssues, pacificDay } from '@/lib/venture/board'
import { FACE, gate } from '../gate'
import Login from '../Login'
import { boardViewport, meta } from '../meta'
import Shell from '../Shell'
import Tracker, { type TrackerParams } from '../views/Tracker'
import '../../company.css'

// The Issue Tracker (app.kochitolabs.com/issues): views/Tracker.tsx.
export const dynamic = 'force-dynamic'
export const metadata = meta('Issue Tracker')
export const viewport = boardViewport

export default async function Issues({ searchParams }: { searchParams: Promise<TrackerParams> }) {
  const { user, base, q } = await gate()
  if (!user) return <Login face={FACE} />
  const [p, all, f] = await Promise.all([searchParams, loadIssues(), loadFrame()])
  return (
    <Shell base={base} q={q} user={user} f={f} current="issues">
      <Tracker all={all} p={p} base={base} now={f.now} today={pacificDay()} />
    </Shell>
  )
}
