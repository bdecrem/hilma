'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

type Source = { id: string; name: string; url: string; type: string; notes: string; genre: string; active: boolean }
type BookSrc = { name: string; said: string }
type Book = { title: string; author: string; pub_date: string; one_line: string; sources: BookSrc[] }
type ClaudePick = { title: string; author: string; pub_date: string; one_line: string; why: string }
type Digest = { id: string; month_label: string; genre: string; books: Book[]; claude_picks: ClaudePick[]; created_at: string }
type Config = { genre: string; reference_books: string; deliver_to: string; notes: string }
type Genre = { slug: string; label: string; sort: number }
type Data = { config: Config; sources: Source[]; digests: Digest[]; genres: Genre[] }

const C = {
  bg: '#faf6ec', card: '#fffdf7', ink: '#241f17', sub: '#6b6256', faint: '#8a7f6d',
  accent: '#c2683a', line: '#ece4d3', quoteBar: '#d9c7a3',
}

const kindle = (b: { title: string; author: string }) =>
  `https://www.amazon.com/s?k=${encodeURIComponent(b.title + ' ' + b.author)}&i=digital-text`

const kBtn = (b: { title: string; author: string }) => (
  <a href={kindle(b)} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 12, fontSize: 14, fontWeight: 600, color: '#fff', background: C.accent, textDecoration: 'none', padding: '8px 14px', borderRadius: 6 }}>Find on Kindle →</a>
)

const sourceMatches = (sourceGenre: string, genre: string) => {
  const tags = sourceGenre.split(',').map((t) => t.trim().toLowerCase())
  return tags.includes('general') || tags.includes(genre.toLowerCase())
}

export default function BookScoutPage() {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [key, setKey] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [selDigest, setSelDigest] = useState('')
  const [busy, setBusy] = useState(false)
  const [newSrc, setNewSrc] = useState({ name: '', url: '', type: 'editorial', genre: 'thrillers' })
  const [dirty, setDirty] = useState(false)
  const [run, setRun] = useState<{ id: string; status: string; message: string } | null>(null)
  const [emailMsg, setEmailMsg] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/book-scout/data', { cache: 'no-store' })
    if (!r.ok) { setErr('Could not load data'); return }
    const d: Data = await r.json()
    setData(d)
    setSelDigest((prev) => prev || d.digests[0]?.id || '')
    setNewSrc((s) => ({ ...s, genre: s.genre || d.config.genre }))
  }, [])

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('bookScoutKey') : ''
    if (saved) { setKey(saved); setUnlocked(true) }
    load()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
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
      setErr(''); setDirty(true)
      await load()
      return true
    } finally { setBusy(false) }
  }

  const unlock = () => {
    if (!key.trim()) return
    localStorage.setItem('bookScoutKey', key.trim()); setUnlocked(true); setErr('')
  }

  const rerun = async () => {
    setErr('')
    const r = await fetch('/api/book-scout/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-book-scout-key': key },
    })
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || 'Could not start run'); return }
    const { run_id } = await r.json()
    setDirty(false)
    setRun({ id: run_id, status: 'running', message: 'Researching human sources… (this takes a few minutes)' })
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const s = await fetch(`/api/book-scout/run/${run_id}`, { cache: 'no-store' })
      if (!s.ok) return
      const st = await s.json()
      setRun({ id: run_id, status: st.status, message: st.message })
      if (st.status === 'done' || st.status === 'error') {
        if (pollRef.current) clearInterval(pollRef.current)
        if (st.status === 'done') { await load(); if (st.digest_id) setSelDigest(st.digest_id) }
      }
    }, 5000)
  }

  const emailDigest = async (digestId: string) => {
    setEmailMsg('Sending…')
    const r = await fetch('/api/book-scout/email-digest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-book-scout-key': key },
      body: JSON.stringify({ digest_id: digestId }),
    })
    if (r.status === 401) { setEmailMsg(''); setErr('Wrong key — unlock first.'); return }
    if (!r.ok) { const j = await r.json().catch(() => ({})); setEmailMsg(`Failed: ${j.error || 'error'}`); return }
    const j = await r.json()
    setEmailMsg(`Emailed to ${j.to} ✓`)
  }

  if (!data) {
    return <main style={{ background: C.bg, minHeight: '100dvh', color: C.faint, fontFamily: 'system-ui', padding: 40 }}>{err || 'Loading…'}</main>
  }

  const digest = data.digests.find((d) => d.id === selDigest) || data.digests[0]
  const genreLabel = data.genres.find((g) => g.slug === data.config.genre)?.label || data.config.genre

  return (
    <main style={{ background: C.bg, minHeight: '100dvh', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif', padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 18px 60px' }}>

        <div style={{ fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase', color: C.accent, fontWeight: 700 }}>Book Scout</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: C.ink, margin: '4px 0 8px' }}>Control panel</h1>
        <p style={{ fontSize: 15, color: C.sub, lineHeight: 1.5, margin: 0 }}>
          Books picked by human critics, booksellers and librarians — never by AI. The digest pulls from the sources below and only surfaces titles available on Kindle now.
        </p>

        {/* Unlock */}
        <div style={{ marginTop: 20, padding: 14, background: C.card, borderRadius: 10, border: `1px solid ${C.line}` }}>
          {unlocked ? (
            <div style={{ fontSize: 13, color: C.sub }}>🔓 Editing unlocked. <button onClick={() => { setUnlocked(false); localStorage.removeItem('bookScoutKey') }} style={btnGhost}>lock</button></div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: C.sub }}>🔒 Enter key to edit:</span>
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="key" style={inputStyle} onKeyDown={(e) => e.key === 'Enter' && unlock()} />
              <button onClick={unlock} style={btnSolid}>Unlock</button>
            </div>
          )}
        </div>

        {err && <div style={{ marginTop: 14, color: '#a3402a', fontSize: 14 }}>{err}</div>}

        {/* Rerun banner */}
        {unlocked && (dirty || run) && (
          <div style={{ marginTop: 16, padding: 14, background: '#fff4e9', borderRadius: 10, border: `1px solid ${C.quoteBar}` }}>
            {run ? (
              <div style={{ fontSize: 14, color: C.ink, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {run.status === 'running' && <span>⏳ {run.message}</span>}
                {run.status === 'done' && (
                  <>
                    <span>✅ Done — {run.message}. Results below are updated.</span>
                    <button onClick={() => digest && emailDigest(digest.id)} disabled={!digest} style={btnSolid}>✉ Email these results</button>
                  </>
                )}
                {run.status === 'error' && <><span>⚠️ Run failed: {run.message}</span> <button onClick={rerun} style={btnGhost}>retry</button></>}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, color: C.ink }}>You changed the genre or sources. Re-run the agent to refresh the results?</span>
                <button onClick={rerun} disabled={busy} style={btnSolid}>Re-run now</button>
              </div>
            )}
            {emailMsg && <div style={{ marginTop: 8, fontSize: 13, color: C.sub }}>{emailMsg}</div>}
          </div>
        )}

        {/* Genre */}
        <Section title="Genre">
          {unlocked ? (
            <select
              value={data.config.genre}
              disabled={busy}
              onChange={(e) => write('/api/book-scout/config', 'PUT', { genre: e.target.value })}
              style={{ ...inputStyle, fontSize: 16, padding: '10px 12px' }}
            >
              {data.genres.map((g) => <option key={g.slug} value={g.slug}>{g.label}</option>)}
            </select>
          ) : (
            <div style={{ fontSize: 22, fontWeight: 700, color: C.ink }}>{genreLabel}</div>
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
                  {kBtn(b)}
                </div>
              ))}

              {digest.claude_picks && digest.claude_picks.length > 0 && (
                <div style={{ marginTop: 30 }}>
                  <div style={{ fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase', color: '#5c6b4e', fontWeight: 700 }}>Claude Code Picks</div>
                  <p style={{ fontSize: 13, color: C.faint, margin: '4px 0 0' }}>AI picks based on your own fiction shelf — recent, available now, and not already owned.</p>
                  {digest.claude_picks.map((p, i) => (
                    <div key={i} style={{ padding: '18px 0', borderTop: `1px solid ${C.line}` }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>{p.title}</div>
                      <div style={{ fontSize: 14, color: C.faint, marginTop: 2 }}>{p.author} · {p.pub_date}</div>
                      <div style={{ fontSize: 15, color: '#4a4438', marginTop: 8, lineHeight: 1.5 }}>{p.one_line}</div>
                      <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '3px solid #b9c4a0' }}>
                        <div style={{ fontSize: 13, color: '#5c6b4e', fontWeight: 600 }}>Why it fits your shelf</div>
                        <div style={{ fontSize: 14, color: '#3a352c', marginTop: 2 }}>{p.why}</div>
                      </div>
                      {kBtn(p)}
                    </div>
                  ))}
                </div>
              )}

              {unlocked && (
                <div style={{ marginTop: 18 }}>
                  <button onClick={() => emailDigest(digest.id)} style={btnGhost}>✉ Email these results</button>
                  {emailMsg && <span style={{ marginLeft: 10, fontSize: 13, color: C.sub }}>{emailMsg}</span>}
                </div>
              )}
            </>
          ) : <div style={{ color: C.faint }}>No digests yet.</div>}
        </Section>

        {/* Sources */}
        <Section title="Sources">
          <p style={{ fontSize: 13, color: C.faint, margin: '0 0 10px' }}>
            The humans the agent listens to. A green dot marks sources used for the current genre ({genreLabel}). Muted sources are skipped.
          </p>
          {data.sources.map((s) => {
            const used = s.active && sourceMatches(s.genre, data.config.genre)
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderTop: `1px solid ${C.line}`, opacity: s.active ? 1 : 0.45 }}>
                <span title={used ? `used for ${genreLabel}` : 'not used for this genre'} style={{ marginTop: 6, flexShrink: 0, width: 8, height: 8, borderRadius: 4, background: used ? '#3f9d52' : '#d8cfbb' }} />
                <div style={{ flex: 1 }}>
                  <a href={s.url} target="_blank" rel="noreferrer" style={{ color: C.ink, fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>{s.name}</a>
                  <span style={{ marginLeft: 8, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: C.accent, fontWeight: 700 }}>{s.type}</span>
                  <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{s.genre.split(',').map((t) => t.trim()).join(' · ')}</div>
                  {s.notes && <div style={{ fontSize: 13, color: C.faint, marginTop: 2 }}>{s.notes}</div>}
                </div>
                {unlocked && (
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => write(`/api/book-scout/sources/${s.id}`, 'PATCH', { active: !s.active })} disabled={busy} style={btnGhost}>{s.active ? 'mute' : 'unmute'}</button>
                    <button onClick={() => { if (confirm(`Remove "${s.name}"?`)) write(`/api/book-scout/sources/${s.id}`, 'DELETE') }} disabled={busy} style={{ ...btnGhost, color: '#a3402a' }}>delete</button>
                  </div>
                )}
              </div>
            )
          })}

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
                  <input placeholder="genres (comma-separated, or 'general')" value={newSrc.genre} onChange={(e) => setNewSrc({ ...newSrc, genre: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
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

const inputStyle: React.CSSProperties = { fontSize: 14, padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.quoteBar}`, background: '#fff', color: C.ink, fontFamily: 'inherit' }
const btnSolid: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#fff', background: C.accent, border: 'none', padding: '8px 14px', borderRadius: 6, cursor: 'pointer' }
const btnGhost: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: C.sub, background: 'transparent', border: `1px solid ${C.quoteBar}`, padding: '4px 8px', borderRadius: 5, cursor: 'pointer' }
