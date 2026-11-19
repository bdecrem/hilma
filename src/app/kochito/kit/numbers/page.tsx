import { loadBoard, loadFrame } from '@/lib/venture/board'
import { FACE, gate } from '../gate'
import Login from '../Login'
import { boardViewport, meta } from '../meta'
import Shell from '../Shell'
import Numbers from '../views/Numbers'
import '../../company.css'

// Numbers (app.kochitolabs.com/numbers): views/Numbers.tsx.
export const dynamic = 'force-dynamic'
export const metadata = meta('Numbers')
export const viewport = boardViewport

export default async function NumbersPage() {
  const { user, base, q } = await gate()
  if (!user) return <Login face={FACE} />
  const [d, f] = await Promise.all([loadBoard(), loadFrame()])
  return (
    <Shell base={base} q={q} user={user} f={f} current="numbers">
      <Numbers d={d} base={base} />
    </Shell>
  )
}
