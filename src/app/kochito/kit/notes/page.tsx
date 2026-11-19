import { loadFrame, loadNotes } from '@/lib/venture/board'
import { loadOverview } from '@/lib/venture/overview'
import { getDoc } from '@/lib/venture/interview'
import { FACE, gate } from '../gate'
import Login from '../Login'
import { boardViewport, meta } from '../meta'
import Shell from '../Shell'
import { NotesIndex } from '../views/Notes'
import '../../company.css'

// Notes (app.kochitolabs.com/notes): the index of documents, views/Notes.tsx. Which notes are
// listed: the journal's "Active project" links, then the newest security review and the builders'
// rules (loadNotes in src/lib/venture/board.ts); Ola in one page is always first.
export const dynamic = 'force-dynamic'
export const metadata = meta('Notes')
export const viewport = boardViewport

export default async function NotesPage() {
  const { user, base, q } = await gate()
  if (!user) return <Login face={FACE} />
  const [journal, o, f] = await Promise.all([getDoc('journal'), loadOverview(), loadFrame()])
  const notes = await loadNotes(journal?.body ?? '')
  return (
    <Shell base={base} q={q} user={user} f={f} current="notes">
      <NotesIndex notes={notes} o={o} base={base} now={f.now} />
    </Shell>
  )
}
