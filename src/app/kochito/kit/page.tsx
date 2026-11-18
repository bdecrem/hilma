import type { Metadata, Viewport } from 'next'
import { loadBoard } from '@/lib/venture/board'
import { loadOverview } from '@/lib/venture/overview'
import Board from './Board'
import { FACE, gate } from './gate'
import Login from './Login'
import '../company.css'

// app.kochitolabs.com: the board for Bart, built around the active project (Ola) since 2026-11-17
// (Bart: "reorganize app.kochitolabs.com, to center the project, OLA ... make it a better more
// useful dashboard", then "key links in the sidebar; a way to view closed / resolved issues").
// What it reads and how it stays fresh: src/lib/venture/board.ts. The frame and the sidebar:
// Shell.tsx; the overview: Board.tsx; the tracker: issues/; the notes: notes/. The design note is
// the board's section in company.css; made-up data to design with: /kochito/kit/mock on a dev server.
// Private: behind a login with a cookie that lasts a year (src/lib/kochito/app-auth.ts), never
// indexed. Its old address, kochitolabs.com/kit?k=, and any other host send you to the new one.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Ola · the board', robots: { index: false, follow: false }, icons: { icon: '/kochito/kit/kit-icon.png', apple: '/kochito/kit/kit-icon.png' } }
export const viewport: Viewport = { themeColor: '#f6ecd9', viewportFit: 'cover' }

export default async function Page() {
  const { user, base, q } = await gate()
  if (!user) return <Login face={FACE} />
  const [d, o] = await Promise.all([loadBoard(), loadOverview()])
  return <Board d={d} o={o} q={q} user={user} face={FACE} base={base} />
}
