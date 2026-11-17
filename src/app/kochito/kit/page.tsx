import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { APP_HOST, sessionUser } from '@/lib/kochito/app-auth'
import { keyOk } from '@/lib/venture/interview'
import { loadBoard } from '@/lib/venture/board'
import Board from './Board'
import Login from './Login'
import '../company.css'

// app.kochitolabs.com: the board for Bart, built around the active project (Ola) since 2026-11-17
// (Bart: "reorganize app.kochitolabs.com, to center the project, OLA ... make it a better more
// useful dashboard"). What it reads and how it stays fresh: src/lib/venture/board.ts. The layout:
// Board.tsx; the design note: the board's section in company.css; made-up data to design with:
// /kochito/kit/mock on a dev server.
// Private: behind a login with a cookie that lasts a year (src/lib/kochito/app-auth.ts), never
// indexed. Its old address, kochitolabs.com/kit?k=, and any other host send you to the new one.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Ola · the board', robots: { index: false, follow: false }, icons: { icon: '/kochito/kit/kit-icon.png', apple: '/kochito/kit/kit-icon.png' } }
export const viewport: Viewport = { themeColor: '#f6ecd9', viewportFit: 'cover' }

// Kit's face: number 9, chosen by Bart 2026-11-14 (the candidates are in public/kochito/kit/).
const FACE = '/kochito/kit/brain-1.svg'

export default async function Page() {
  const host = ((await headers()).get('host') ?? '').replace(/:\d+$/, '')
  if (host !== APP_HOST && host !== 'localhost' && host !== '127.0.0.1') redirect(`https://${APP_HOST}/`)
  const user = await sessionUser()
  if (!user) return <Login face={FACE} />
  // the voice pages and notes on ola.cx still open with the venture key; a signed-in reader gets it in the links
  const k = process.env.VENTURE_KEY
  if (!keyOk(k)) throw new Error('VENTURE_KEY is not set, or is not the current key')
  const q = `?k=${encodeURIComponent(k as string)}`
  const voices = [
    { href: `https://ola.cx/venture/memo${q}`, tag: 'voice notes', name: 'Leave a note', what: 'Say what you want done, changed or looked at. I read it within a minute or two and act.' },
    { href: `https://ola.cx/venture/talk${q}`, tag: 'conversation', name: 'Talk it through', what: 'No agenda. I answer out loud from everything in my notes, and you can cut in.' },
    { href: `https://ola.cx/venture/call/checkin${q}`, tag: 'interview', name: 'Answer my questions', what: 'I ask the things only you can settle, one at a time. About five minutes.' },
  ]
  return <Board d={await loadBoard()} q={q} user={user} face={FACE} voices={voices} />
}
