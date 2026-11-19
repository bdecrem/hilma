import { loadBoard, loadFrame } from '@/lib/venture/board'
import { FACE, gate } from '../gate'
import Login from '../Login'
import { boardViewport, meta } from '../meta'
import Shell from '../Shell'
import Plan from '../views/Plan'
import '../../company.css'

// Plan (app.kochitolabs.com/plan): views/Plan.tsx.
export const dynamic = 'force-dynamic'
export const metadata = meta('Plan')
export const viewport = boardViewport

export default async function PlanPage() {
  const { user, base, q } = await gate()
  if (!user) return <Login face={FACE} />
  const [d, f] = await Promise.all([loadBoard(), loadFrame()])
  return (
    <Shell base={base} q={q} user={user} f={f} current="plan">
      <Plan d={d} base={base} />
    </Shell>
  )
}
