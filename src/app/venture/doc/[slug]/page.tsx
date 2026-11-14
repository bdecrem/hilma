import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getDoc, isSlug, keyOk } from '@/lib/venture/interview'

export const dynamic = 'force-dynamic'

// A private document from Claude to Bart (the ideas, the charter, a report):
// markdown in venture_docs, shown only behind the key. Relative links inside
// a doc keep the key, so one doc can point at another or at a call.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ k?: string }>
}) {
  const { slug } = await params
  const { k } = await searchParams
  if (!keyOk(k) || !isSlug(slug)) notFound()
  const doc = await getDoc(slug)
  if (!doc) notFound()
  const withKey = (href?: string) =>
    href && href.startsWith('/venture/') ? `${href}${href.includes('?') ? '&' : '?'}k=${encodeURIComponent(k!)}` : href
  return (
    <main className="vd-wrap">
      <div className="vi-kicker">Venture · {new Date(doc.updated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })}</div>
      <article className="vd">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => (
              <a href={withKey(href)} {...(href?.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>
                {children}
              </a>
            ),
            table: ({ children }) => (
              <div className="vd-table">
                <table>{children}</table>
              </div>
            ),
          }}
        >
          {doc.body}
        </ReactMarkdown>
      </article>
    </main>
  )
}
