import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { loadFrame } from '@/lib/venture/board'
import { getDoc, isSlug } from '@/lib/venture/interview'
import { FACE, gate } from '../../gate'
import Login from '../../Login'
import Shell from '../../Shell'
import { ago } from '../../time'
import '../../../company.css'

// A private note (the plan, a review, the builders' rules...) shown inside the board, behind the
// same sign-in (app.kochitolabs.com/notes/<slug>). The notes live in venture_docs, mirrored from
// apps/venture/private/ by sync.mjs; this public repo holds none of them. Links to another note
// stay inside the board; links to the voice pages carry the key.
export const dynamic = 'force-dynamic'
export const viewport: Viewport = { themeColor: '#f6ecd9', viewportFit: 'cover' }
export const metadata: Metadata = { title: 'Ola · a note', robots: { index: false, follow: false }, icons: { icon: '/kochito/kit/kit-icon.png' } }

export default async function Note({ params }: { params: Promise<{ slug: string }> }) {
  const { user, base, q } = await gate()
  if (!user) return <Login face={FACE} />
  const { slug } = await params
  if (!isSlug(slug) || slug === 'journal') notFound()
  const [doc, frame] = await Promise.all([getDoc(slug), loadFrame()])
  if (!doc) notFound()
  const href = (h?: string) => {
    if (!h) return h
    const m = h.match(/^(?:https?:\/\/ola\.cx)?\/venture\/doc\/([a-z0-9-]+)/)
    if (m) return `${base}/notes/${m[1]}`
    if (/^(?:https?:\/\/ola\.cx)?\/venture\//.test(h) && !h.includes('k=')) return `${h}${h.includes('?') ? '&' : '?'}${q.slice(1)}`
    return h
  }
  return (
    <Shell base={base} q={q} user={user} notes={frame.notes} open={frame.open} current="note" slug={slug}>
      <article className="kb-sec kb-first kb-note">
        <p className="ko-mono kb-crumb">
          a note · updated {ago(doc.updated_at, new Date().toISOString())}
        </p>
        <div className="kb-md">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href: h, children }) => <a href={href(h)}>{children}</a>,
              table: ({ children }) => (
                <div className="kb-md-table">
                  <table>{children}</table>
                </div>
              ),
            }}
          >
            {doc.body}
          </ReactMarkdown>
        </div>
      </article>
    </Shell>
  )
}
