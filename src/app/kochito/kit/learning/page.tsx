import { loadBoard, loadFrame } from '@/lib/venture/board'
import { FACE, gate } from '../gate'
import Login from '../Login'
import { boardViewport, meta } from '../meta'
import Shell from '../Shell'
import Learning from '../views/Learning'
import '../../company.css'

// Learning (app.kochitolabs.com/learning): views/Learning.tsx. It replaced Numbers on Nov 18;
// /numbers redirects here (next.config.ts).
export const dynamic = 'force-dynamic'
export const metadata = meta('Learning')
export const viewport = boardViewport

export default async function LearningPage() {
  const { user, base, q } = await gate()
  if (!user) return <Login face={FACE} />
  const [d, f] = await Promise.all([loadBoard(), loadFrame()])
  return (
    <Shell base={base} q={q} user={user} f={f} current="learning">
      <Learning d={d} base={base} />
    </Shell>
  )
}
