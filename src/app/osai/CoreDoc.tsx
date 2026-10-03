import type { Block, CoreDoc as Doc } from '@/lib/osai/core'
import { inlines } from '@/lib/osai/core'

function Inline({ text }: { text: string }) {
  return (
    <>
      {inlines(text).map((t, i) =>
        t.kind === 'link' ? <a key={i} href={t.href} target="_blank" rel="noreferrer">{t.text}</a> : t.kind === 'em' ? <em key={i}>{t.text}</em> : t.kind === 'strong' ? <strong key={i}>{t.text}</strong> : <span key={i}>{t.text}</span>,
      )}
    </>
  )
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'p':
      return <p><Inline text={block.text} /></p>
    case 'list':
      return (
        <ul>
          {block.items.map((it, i) => <li key={i}><Inline text={it} /></li>)}
        </ul>
      )
    case 'note':
      return (
        <div className="note">
          <span className="label">{block.label.replace(/:$/, '')}</span>
          <span><Inline text={block.text} /></span>
        </div>
      )
    case 'proscons':
      return (
        <div className="proscons">
          <div>
            <div className="label">Pros</div>
            <ul>{block.pros.map((it, i) => <li key={i}><span className="pm">+</span><span><Inline text={it} /></span></li>)}</ul>
          </div>
          <div>
            <div className="label">Cons</div>
            <ul>{block.cons.map((it, i) => <li key={i}><span className="pm">−</span><span><Inline text={it} /></span></li>)}</ul>
          </div>
        </div>
      )
  }
}

export default function CoreDoc({ doc, stamp }: { doc: Doc; stamp: string | null }) {
  return (
    <article className="osai-core">
      <div className="eyebrow">The one-pager</div>
      <h1 style={{ marginTop: 8 }}>{doc.title || 'Open Source AI'}</h1>
      {doc.lede && <p className="lede"><Inline text={doc.lede} /></p>}
      {stamp && <div className="stamp eyebrow">From the Pages document · exported {stamp}</div>}
      {doc.sections.map((s, i) => (
        <section key={i}>
          {s.heading && <h2>{s.heading}</h2>}
          {s.blocks.map((b, j) => <BlockView key={j} block={b} />)}
        </section>
      ))}
    </article>
  )
}
