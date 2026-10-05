import { hostOf, type Resource } from '@/lib/osai/resources'

export default function Resources({ items }: { items: Resource[] }) {
  return (
    <article className="osai-res">
      <div className="eyebrow">Open Source AI</div>
      <h1 style={{ marginTop: 8 }}>Resources</h1>
      <p className="lede">
        The reading behind the memo: the industry case for open weights, the safety consensus, the definitions and scorecards, and the institutions in the room. The assistant has read all of it.
      </p>
      {items.length === 0 ? (
        <p className="blurb" style={{ marginTop: 28 }}>Nothing here yet.</p>
      ) : (
        <ol className="list">
          {items.map((r, i) => (
            <li key={r.url} className="entry">
              <span className="idx" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <div className="text">
                <h2>
                  <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
                </h2>
                {r.byline && <p className="byline">{r.byline}</p>}
                {r.blurb.map((p, j) => (
                  <p key={j} className="blurb">{p}</p>
                ))}
                <a className="go" href={r.url} target="_blank" rel="noreferrer">{hostOf(r.url)} ↗</a>
              </div>
            </li>
          ))}
        </ol>
      )}
    </article>
  )
}
