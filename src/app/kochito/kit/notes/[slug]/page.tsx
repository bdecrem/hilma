import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadFrame } from '@/lib/venture/board'
import { getDoc, isSlug } from '@/lib/venture/interview'
import { FACE, gate } from '../../gate'
import Login from '../../Login'
import { boardViewport, meta } from '../../meta'
import Shell from '../../Shell'
import { ago } from '../../time'
import { NoteView } from '../../views/Notes'
import '../../../company.css'

// A private note (the plan, a review, the builders' rules...) inside the board, behind the same
// sign-in (app.kochitolabs.com/notes/<slug>), with a header on the body (views/Notes.tsx). The notes
// live in venture_docs, mirrored from apps/venture/private/ by sync.mjs; this public repo holds none
// of them. Links to another note stay inside the board; links to the voice pages carry the key.
export const dynamic = 'force-dynamic'
export const viewport = boardViewport
export const metadata: Metadata = meta('A note')

export default async function Note({ params }: { params: Promise<{ slug: string }> }) {
  const { user, base, q } = await gate()
  if (!user) return <Login face={FACE} />
  const { slug } = await params
  if (!isSlug(slug) || slug === 'journal') notFound()
  const [doc, f] = await Promise.all([getDoc(slug), loadFrame()])
  if (!doc) notFound()
  const mapHref = (h?: string) => {
    if (!h) return h
    const m = h.match(/^(?:https?:\/\/ola\.cx)?\/venture\/doc\/([a-z0-9-]+)/)
    if (m) return `${base}/notes/${m[1]}`
    if (/^(?:https?:\/\/ola\.cx)?\/venture\//.test(h) && !h.includes('k=')) return `${h}${h.includes('?') ? '&' : '?'}${q.slice(1)}`
    return h
  }
  return (
    <Shell base={base} q={q} user={user} f={f} current="notes">
      <NoteView title={doc.title || slug} updated={ago(doc.updated_at, f.now)} from={<>from Kit&rsquo;s private notes ({slug})</>} body={doc.body} base={base} mapHref={mapHref} />
    </Shell>
  )
}
