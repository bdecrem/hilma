'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Hit = { page: number; at: number; len: number; before: string; match: string; after: string }
type Found = { total: number; hits: Hit[]; best: number; label: string }

/** The full text, a page at a time, with search inside it. Offsets come from /api/mrd/law/[id]/find and match the paged text exactly. */
export default function Reader({ id, first, pages, chars, q, lang }: { id: string; first: string; pages: number; chars: number; q: string; lang?: string }) {
  const [texts, setTexts] = useState<Record<number, string>>({ 0: first })
  const [pg, setPg] = useState(0)
  const [input, setInput] = useState(q)
  const [found, setFound] = useState<Found | null>(null)
  const [active, setActive] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [list, setList] = useState(false)
  const box = useRef<HTMLElement>(null)
  const scrollTo = useRef<'hit' | 'top' | null>(null)
  const seq = useRef(0)

  const load = useCallback(async (n: number) => {
    if (texts[n] !== undefined) return
    const r = await fetch(`/api/mrd/law/${id}/text?page=${n}`)
    if (!r.ok) return
    const j = (await r.json()) as { text: string }
    setTexts(t => ({ ...t, [n]: j.text }))
  }, [id, texts])

  const goPage = async (n: number) => {
    await load(n)
    scrollTo.current = 'top'
    setPg(n)
  }

  const show = useCallback(async (f: Found, i: number) => {
    const h = f.hits[i]
    if (!h) return
    await load(h.page)
    scrollTo.current = 'hit'
    setPg(h.page)
    setActive(i)
  }, [load])

  const run = useCallback(async (params: string, label: string, jump: boolean) => {
    const my = ++seq.current
    setBusy(true)
    const r = await fetch(`/api/mrd/law/${id}/find?${params}`)
    const j = r.ok ? ((await r.json()) as { total: number; hits: Hit[]; best: number }) : { total: 0, hits: [], best: 0 }
    if (my !== seq.current) return
    setBusy(false)
    const f = { ...j, label }
    setFound(f)
    setActive(-1)
    if (jump && f.hits.length) await show(f, f.best ?? 0)
  }, [id, show])

  // typing searches after a pause
  useEffect(() => {
    const s = input.trim()
    if (s.length < 2) { setFound(null); setActive(-1); return }
    const t = setTimeout(() => run(`q=${encodeURIComponent(s)}`, s, true), s === q.trim() ? 0 : 450)
    return () => clearTimeout(t)
  }, [input]) // eslint-disable-line react-hooks/exhaustive-deps

  // "Go to 43" buttons in the citations above
  useEffect(() => {
    const on = (e: Event) => {
      const n = (e as CustomEvent<{ article: string }>).detail.article
      setInput('')
      setList(true)
      box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setTimeout(() => run(`article=${encodeURIComponent(n)}`, `article ${n}`, true), 0)
    }
    window.addEventListener('mrd-find', on)
    return () => window.removeEventListener('mrd-find', on)
  }, [run])

  useEffect(() => {
    if (scrollTo.current === 'hit') {
      const el = box.current?.querySelector('mark.on')
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (scrollTo.current === 'top') {
      box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    scrollTo.current = null
  }, [pg, active, texts])

  const text = texts[pg]
  const body = useMemo(() => {
    if (text === undefined) return null
    if (!found) return text
    const marks = found.hits.map((h, i) => ({ ...h, i })).filter(h => h.page === pg).sort((a, b) => a.at - b.at)
    const out: React.ReactNode[] = []
    let cur = 0
    for (const m of marks) {
      if (m.at < cur) continue
      out.push(text.slice(cur, m.at))
      out.push(<mark key={m.i} className={m.i === active ? 'on' : undefined}>{text.slice(m.at, m.at + m.len)}</mark>)
      cur = m.at + m.len
    }
    out.push(text.slice(cur))
    return out
  }, [text, found, pg, active])

  const n = found?.hits.length ?? 0
  const step = (d: number) => found && n && show(found, active < 0 ? 0 : (active + d + n) % n)

  return (
    <section className="reader" id="text" ref={box}>
      <div className="sec-h" style={{ borderTop: 0, marginBottom: 0 }}>
        <h2>Full text</h2>
        <span className="muted" style={{ fontSize: 14 }}>{Math.round(chars / 6.2).toLocaleString('en-US')} words{pages > 1 ? ` · ${pages} pages` : ''}</span>
      </div>
      <div className="rbar">
        <div className="search">
          <input type="search" value={input} onChange={e => setInput(e.target.value)} placeholder="Find in this text"
            aria-label="Find in this text" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1) } }} />
        </div>
        <div className="nav" aria-live="polite">
          {busy ? <span>Searching…</span> : found ? (
            n ? <>
              <button className="ico" onClick={() => step(-1)} aria-label="Previous match">‹</button>
              <span>{active < 0 ? '–' : active + 1} of {found.total > n ? `${n}+` : n}</span>
              <button className="ico" onClick={() => step(1)} aria-label="Next match">›</button>
              <button className={`pill ghost${list ? ' on' : ''}`} onClick={() => setList(!list)} style={{ marginLeft: 6 }}>{list ? 'Hide list' : 'List'}</button>
            </> : <span>No match for {found.label}</span>
          ) : null}
        </div>
        {pages > 1 && (
          <div className="nav" style={{ marginLeft: 'auto' }}>
            <button className="ico" disabled={pg === 0} onClick={() => goPage(pg - 1)} aria-label="Previous page">‹</button>
            <span><span className="wide">Page </span>{pg + 1}<span className="wide"> of </span><span className="narrow">/</span>{pages}</span>
            <button className="ico" disabled={pg >= pages - 1} onClick={() => goPage(pg + 1)} aria-label="Next page">›</button>
          </div>
        )}
      </div>
      {list && found && n > 0 && (
        <ul className="hitlist">
          {found.hits.map((h, i) => (
            <li key={i}>
              <button className={i === active ? 'on' : undefined} onClick={() => show(found, i)}>
                {pages > 1 && <em>p. {h.page + 1}</em>}…{h.before}<mark>{h.match}</mark>{h.after}…
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="doc" lang={lang}>{body ?? 'Loading…'}</div>
      {pages > 1 && (
        <div className="pgfoot">
          <button className="pill ghost" disabled={pg === 0} aria-disabled={pg === 0} onClick={() => goPage(pg - 1)}>Previous page</button>
          <span>{pg + 1} / {pages}</span>
          <button className="pill ghost" disabled={pg >= pages - 1} aria-disabled={pg >= pages - 1} onClick={() => goPage(pg + 1)}>Next page</button>
        </div>
      )}
    </section>
  )
}
