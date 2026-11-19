import type { Issue } from '@/lib/venture/board'

// Words and small pieces every board page shares.
export const REPO = 'https://github.com/bdecrem/hilma/commit/'
export const STATUS: Record<Issue['status'], string> = { open: 'Next up', in_progress: 'Doing', waiting: 'Waiting on Bart', done: 'Done', dropped: 'Dropped' }
export const STATUS_ORDER: Issue['status'][] = ['open', 'in_progress', 'waiting', 'done', 'dropped']
/** A person's name as the thread shows it: the board's accounts capitalised, the lead as Kit. */
export const person = (who: string) => (who === 'lead' || who === 'kit' ? 'Kit' : who.charAt(0).toUpperCase() + who.slice(1))

export function Status({ s }: { s: Issue['status'] }) {
  return (
    <span className={`bd-st ${s}`}>
      <span className={`bd-dot ${s}`} />
      {STATUS[s]}
    </span>
  )
}

/** Plain text with line breaks kept (by CSS) and bare https links made links. */
export function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g)
  return (
    <>
      {parts.map((p, n) =>
        /^https?:\/\//.test(p) ? (
          <a key={n} href={p} rel="noopener" target="_blank">
            {p}
          </a>
        ) : (
          p
        ),
      )}
    </>
  )
}
