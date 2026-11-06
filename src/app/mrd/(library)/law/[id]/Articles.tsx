'use client'

/** Pull article / section numbers out of a citation's "Arts. 43(1), 56(e)" and offer each as a jump into the text. */
export function articleNumbers(s: string): string[] {
  const out: string[] = []
  const add = (x: string) => { if (!out.includes(x)) out.push(x) }
  // French codes: "L. 223-2; R. 221-11"
  for (const m of s.matchAll(/\b([LRD])\.?\s?(\d+(?:-\d+)+)/g)) add(`${m[1]}${m[2]}`)
  if (out.length) return out.slice(0, 10)
  for (const m of s.matchAll(/\d{1,4}/g)) {
    // skip sub-paragraphs and ranges' second halves: 43(1) → 43, 17-19 → 17
    const before = s.slice(0, m.index)
    if (/[(\-–.]$/.test(before)) continue
    add(m[0])
  }
  return out.slice(0, 10)
}

export function ArticleChips({ articles, enabled }: { articles: string; enabled: boolean }) {
  const nums = articleNumbers(articles)
  return (
    <div className="chips" style={{ alignItems: 'center' }}>
      <span className="label" style={{ fontSize: 12 }}>{articles}</span>
      {enabled && nums.map(n => (
        <button key={n} className="art" type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('mrd-find', { detail: { article: n } }))}>
          Go to {n.replace(/^([LRD])/, '$1. ')} ↓
        </button>
      ))}
    </div>
  )
}
