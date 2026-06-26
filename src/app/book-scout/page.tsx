'use client'

import { useEffect, useState, useCallback } from 'react'

type Source = { id: string; name: string; url: string; type: string; notes: string; genre: string; active: boolean }
type BookSrc = { name: string; said: string }
type Book = { title: string; author: string; pub_date: string; one_line: string; sources: BookSrc[] }
type Digest = { id: string; month_label: string; genre: string; books: Book[]; created_at: string }
type Config = { genre: string; reference_books: string; deliver_to: string; notes: string }
type Data = { config: Config; sources: Source[]; digests: Digest[] }

const C = {
  bg: '#faf6ec', card: '#fffdf7', ink: '#241f17', sub: '#6b6256', faint: '#8a7f6d',
  accent: '#c2683a', line: '#ece4d3', quoteBar: '#d9c7a3',
}

function kindle(b: Book) {
  return `https://www.amazon.com/s?k=${encodeURIComponent(b.title + ' ' + b.author)}&i=digital-text`
}

export default function BookScoutPage() {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [key, setKey] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [selDigest, setSelDigest] = useState<string>('')
  const [genreDraft, setGenreDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [newSrc, setNewSrc] = useState({ name: '', url: '', type: 'editorial', genre: 'thrillers' })

  const load = useCallback(async () => {
    const r = await fetch('/api/book-scout/data', { cache: 'no-store' })
    if (!r.ok) { setErr('Could not load data'); return }
    const d: Data = await r.json()
    setData(d)
    setGenreDraft(d.config.genre)
    if (d.digests.length && !selDigest) setSelDigest(d.digests[0].id)
  }, [selDigest])

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('bookScoutKey') : ''
    if (saved) { setKey(saved); setUnlocked(true) }
    load()
  }, [load])

  const write = async (path: string, method: string, body?: unknown) => {
    setBusy(true)
    try {
      const r = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-book-scout-key': key },
        body: body ? JSON.stringify(body) : undefined,
      })
      if (r.status === 401) { setErr('Wrong key — edits rejected.'); setUnlocked(false); localStorage.removeItem('bookScoutKey'); return false }
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || 'Save failed'); return false }
      setErr('')
      await load()
      return true
    } finally { setBusy(false) }
  }

  const unlock = () => {
    if (!key.trim()) return
    localStorage.setItem('bookScoutKey', key.trim())
    setUnlocked(true); setErr('')
  }

  if (!data) {
    return <main style={{ background: C.bg, minHeight: '100dvh', color: C.faint, fontFamily: 'system-ui', padding: 40 }}>{err || 'Loading…'}</main>
  }

  const digest = data.digests.find((d) => d.id === selDigest) || data.digests[0]
  const thrillerSrc = data.sources.filter((s) => s.genre === 'thrillers')
  const generalSrc = data.sources.filter((s) => s.genre === 'general')
  const otherSrc = data.sources.filter((s) => s.genre !== 'thrillers' && s.genre !== 'general')

  const SourceRow = (s: Source) => (
    <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderTop: `1px solid ${C.line}`, opacity: s.active ? 1 : 0.45 }}>
      <div style={{ flex: 1 }}>
        <a href={s.url} target="_blank" rel="noreferrer" style={{ color: C.ink, fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>{s.name}</a>
        <span style={{ marginLeft: 8, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: C.accent, fontWeight: 700 }}>{s.type}</span>
        {s.notes && <div style={{ fontSize: 13, color: C.faint, marginTop: 2 }}>{s.notes}</div>}
      </div>
      {unlocked && (
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={() => write(`/api/book-scout/sources/${s.id}`, 'PATCH', { active: !s.active })} disabled={busy}
            style={btnGhost}>{s.active ? 'mute' : 'unmute'}</button>
          <button onClick={() => { if (confirm(`Remove "${s.name}"?`)) write(`/api/book-scout/sources/${s.id}`, 'DELETE') }} disabled={busy}
            style={{ ...btnGhost, color: '#a3402a' }}>delete</button>
        </div>
      )}
    </div>
  )

  return (
    <main style={{ background: C.bg, minHeight: '100dvh', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif', padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 18px 60px' }}>

        <div style={{ fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase', color: C.accent, fontWeight: 700 }}>Book Scout</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: C.ink, margin: '4px 0 8px' }}>Control panel</h1>
        <p style={{ fontSize: 15, color: C.sub, lineHeight: 1.5, margin: 0 }}>
          Books picked by human critics, booksellers and librarians — never by AI. The monthly digest pulls from the sources below and only surfaces titles available on Kindle now.
        </p>

        {/* Unlock */}
        <div style={{ marginTop: 20, padding: 14, background: C.card, borderRadius: 10, border: `1px solid ${C.line}` }}>
          {unlocked ? (
            <div style={{ fontSize: 13, color: C.sub }}>🔓 Editing unlocked. <button onClick={() => { setUnlocked(false); localStorage.removeItem('bookScoutKey') }} style={{ ...btnGhost, marginLeft: 6 }}>lock</button></div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: C.sub }}>🔒 Enter key to edit:</span>
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="key"
                style={inputStyle} onKeyDown={(e) => e.key === 'Enter' && unlock()} />
              <button onClick={unlock} style={btnSolid}>Unlock</button>
            </div>
          )}
        </div>

        {err && <div style={{ marginTop: 14, color: '#a3402a', fontSize: 14 }}>{err}</div>}

        {/* Genre */}
        <Section title="Genre">
          {unlocked ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={genreDraft} onChange={(e) => setGenreDraft(e.target.value)} style={{ ...inputStyle, width: 200 }} />
              <button onClick={() => write('/api/book-scout/config', 'PUT', { genre: genreDraft })} disabled={busy || genreDraft === data.config.genre} style={btnSolid}>Save</button>
            </div>
          ) : (
            <div style={{ fontSize: 22, fontWeight: 700, color: C.ink, textTransform: 'capitalize' }}>{data.config.genre}</div>
          )}
          {data.config.reference_books && <div style={{ marginTop: 8, fontSize: 14, color: C.sub }}>Reference books: {data.config.reference_books}</div>}
        </Section>

        {/* Results */}
        <Section title="Results">
          {data.digests.length > 1 && (
            <select value={selDigest} onChange={(e) => setSelDigest(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }}>
              {data.digests.map((d) => <option key={d.id} value={d.id}>{d.month_label} — {d.genre} ({d.books.length})</option>)}
            </select>
          )}
          {digest ? (
            <>
              <div style={{ fontSize: 13, color: C.faint, marginBottom: 6 }}>{digest.month_label} · {digest.books.length} books available on Kindle now</div>
              {digest.books.map((b, i) => (
                <div key={i} style={{ padding: '20px 0', borderTop: i === 0 ? 'none' : `1px solid ${C.line}` }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>{b.title}</div>
                  <div style={{ fontSize: 14, color: C.faint, marginTop: 2 }}>{b.author} · {b.pub_date}</div>
                  <div style={{ fontSize: 15, color: '#4a4438', marginTop: 8, lineHeight: 1.5 }}>{b.one_line}</div>
                  {b.sources.map((s, j) => (
                    <div key={j} style={{ marginTop: 8, paddingLeft: 12, borderLeft: `3px solid ${C.quoteBar}` }}>
                      <div style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: 14, color: '#3a352c', marginTop: 2 }}>{s.said}</div>
                    </div>
                  ))}
                  <a href={kindle(b)} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 12, fontSize: 14, fontWeight: 600, color: '#fff', background: C.accent, textDecoration: 'none', padding: '8px 14px', borderRadius: 6 }}>Find on Kindle →</a>
                </div>
              ))}
            </>
          ) : <div style={{ color: C.faint }}>No digests yet.</div>}
        </Section>

        {/* Sources */}
        <Section title="Sources">
          <p style={{ fontSize: 13, color: C.faint, margin: '0 0 8px' }}>The humans the agent listens to. Muted sources are skipped.</p>
          {thrillerSrc.length > 0 && <SubHead>Thrillers</SubHead>}
          {thrillerSrc.map(SourceRow)}
          {generalSrc.length > 0 && <SubHead>General</SubHead>}
          {generalSrc.map(SourceRow)}
          {otherSrc.length > 0 && <SubHead>Other</SubHead>}
          {otherSrc.map(SourceRow)}

          {unlocked && (
            <div style={{ marginTop: 18, padding: 14, background: C.card, borderRadius: 10, border: `1px solid ${C.line}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Add a source</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input placeholder="Name (e.g. The Strand staff picks)" value={newSrc.name} onChange={(e) => setNewSrc({ ...newSrc, name: e.target.value })} style={inputStyle} />
                <input placeholder="URL" value={newSrc.url} onChange={(e) => setNewSrc({ ...newSrc, url: e.target.value })} style={inputStyle} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={newSrc.type} onChange={(e) => setNewSrc({ ...newSrc, type: e.target.value })} style={inputStyle}>
                    {['critic', 'editorial', 'bookseller', 'librarian', 'aggregator'].map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <input placeholder="genre" value={newSrc.genre} onChange={(e) => setNewSrc({ ...newSrc, genre: e.target.value })} style={inputStyle} />
                </div>
                <button disabled={busy || !newSrc.name || !newSrc.url} style={btnSolid}
                  onClick={async () => { if (await write('/api/book-scout/sources', 'POST', newSrc)) setNewSrc({ name: '', url: '', type: 'editorial', genre: data.config.genre }) }}>Add source</button>
              </div>
            </div>
          )}
        </Section>

        <div style={{ marginTop: 36, fontSize: 12, color: C.faint }}>Delivered monthly to {data.config.deliver_to || 'you'}.</div>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 30 }}>
      <h2 style={{ fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase', color: C.accent, fontWeight: 700, margin: '0 0 12px' }}>{title}</h2>
      {children}
    </section>
  )
}
function SubHead({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', color: C.faint, fontWeight: 700, marginTop: 16 }}>{children}</div>
}

const inputStyle: React.CSSProperties = { fontSize: 14, padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.quoteBar}`, background: '#fff', color: C.ink, fontFamily: 'inherit' }
const btnSolid: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#fff', background: C.accent, border: 'none', padding: '8px 14px', borderRadius: 6, cursor: 'pointer' }
const btnGhost: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: C.sub, background: 'transparent', border: `1px solid ${C.quoteBar}`, padding: '4px 8px', borderRadius: 5, cursor: 'pointer' }
