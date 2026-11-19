import { loadFrame } from '@/lib/venture/board'
import { loadOverview } from '@/lib/venture/overview'
import { FACE, gate } from '../gate'
import Login from '../Login'
import { boardViewport, meta } from '../meta'
import Shell from '../Shell'
import { OverviewNote } from '../views/Notes'
import '../../company.css'

// Ola in one page (app.kochitolabs.com/overview, OLA-132), the first of the Notes:
// apps/activist-ai/OVERVIEW.md, the map every agent reads first, with a red "stale" badge when Ola's
// code has moved since the page was last checked (src/lib/venture/overview.ts).
export const dynamic = 'force-dynamic'
export const viewport = boardViewport
export const metadata = meta('Ola in one page')

export default async function OverviewPage() {
  const { user, base, q } = await gate()
  if (!user) return <Login face={FACE} />
  const [o, f] = await Promise.all([loadOverview(), loadFrame()])
  return (
    <Shell base={base} q={q} user={user} f={f} current="notes">
      <OverviewNote o={o} base={base} />
    </Shell>
  )
}
