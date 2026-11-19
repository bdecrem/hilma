import { loadFrame } from '@/lib/venture/board'
import { FACE, gate } from '../../gate'
import Login from '../../Login'
import { boardViewport, meta } from '../../meta'
import Shell from '../../Shell'
import NewIssue from '../../views/NewIssue'
import '../../../company.css'

// New issue (app.kochitolabs.com/issues/new): views/NewIssue.tsx.
export const dynamic = 'force-dynamic'
export const metadata = meta('New issue')
export const viewport = boardViewport

export default async function New() {
  const { user, base, q } = await gate()
  if (!user) return <Login face={FACE} />
  const f = await loadFrame()
  return (
    <Shell base={base} q={q} user={user} f={f} current="issues">
      <NewIssue base={base} />
    </Shell>
  )
}
