import { loadBoard, loadFrame } from '@/lib/venture/board'
import { FACE, gate } from './gate'
import Login from './Login'
import { boardViewport, meta } from './meta'
import Shell from './Shell'
import Home from './views/Home'
import '../company.css'

// app.kochitolabs.com: the board for Bart. Round three (2026-11-18, OLA-162): a working tool of five
// pages, one menu item each. This file is Home; the others are issues/ (the Issue Tracker, with
// issues/[id] and issues/new), plan/, notes/ (with notes/[slug] and overview/), numbers/. Each page
// loads its data and hands it to a view in views/; the frame and menu are Shell.tsx; the styles and
// the design rules are board.css. Made-up data for every page, without signing in, on a dev
// server: /kochito/kit/mock (mock/[[...path]]). What it reads: src/lib/venture/board.ts; what it
// writes: src/lib/venture/issue-writes.ts through src/app/api/kochito/app/issues/.
// Private: behind a login with a cookie that lasts a year (src/lib/kochito/app-auth.ts), never
// indexed. Any other host sends you to app.kochitolabs.com (gate.ts).
export const dynamic = 'force-dynamic'
export const metadata = meta('Home')
export const viewport = boardViewport

export default async function Page() {
  const { user, base, q } = await gate()
  if (!user) return <Login face={FACE} />
  const [d, f] = await Promise.all([loadBoard(), loadFrame()])
  return (
    <Shell base={base} q={q} user={user} f={f} current="home">
      <Home d={d} base={base} />
    </Shell>
  )
}
