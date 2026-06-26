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

// Riso-ish indie-bookstore palette: kraft paper, ink, a stamp red and a catalog blue.
const T = {
  paper: '#f3ead7', card: '#fbf6e9', ink: '#231d15', soft: '#6f6552', faint: '#9c9078',
  rule: '#d8c8a8', red: '#b03a26', redInk: '#8f2f1f', blue: '#28425e',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"Courier New", ui-monospace, SFMono-Regular, monospace',
}

const kindle = (b: { title: string; author: string }) =>
  `https://www.amazon.com/s?k=${encodeURIComponent(b.title + ' ' + b.author)}&i=digital-text`

// Rubber-stamp style link to the Kindle search.
function Stamp({ b, color }: { b: { title: string; author: string }; color: string }) {
  return (
    <a href={kindle(b)} target="_blank" rel="noreferrer" style={{
      display: 'inline-block', marginTop: 14, fontFamily: T.mono, fontSize: 12, fontWeight: 700,
      letterSpacing: '.12em', textTransform: 'uppercase', color, textDecoration: 'none',
      border: `1.5px solid ${color}`, padding: '7px 12px', borderRadius: 2,
    }}>Find on Kindle →</a>
  )
}

// Card-catalog divider: a mono label with a rule running through it.
function Divider({ label, sub, color }: { label: string; sub?: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 40, marginBottom: 8 }}>
      <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ flex: 1, borderTop: `1.5px solid ${color}`, opacity: 0.4 }} />
      {sub && <span style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: '.1em', color: T.faint, whiteSpace: 'nowrap' }}>{sub}</span>}
    </div>
  )
}

export default function DogEarPage() {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [key, setKey] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [showTools, setShowTools] = useState(false)
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
      const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'x-book-scout-key': key }, body: body ? JSON.stringify(body) : undefined })
      if (r.status === 401) { setErr('Wrong key.'); setUnlocked(false); localStorage.removeItem('bookScoutKey'); return false }
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || 'Save failed'); return false }
      setErr(''); setDirty(true); await load(); return true
    } finally { setBusy(false) }
  }

  const unlock = () => { if (!key.trim()) return; localStorage.setItem('bookScoutKey', key.trim()); setUnlocked(true); setErr('') }

  const rerun = async () => {
    setErr('')
    const r = await fetch('/api/book-scout/run', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-book-scout-key': key } })
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || 'Could not start run'); return }
    const { run_id } = await r.json()
    setDirty(false)
    setRun({ id: run_id, status: 'running', message: 'Scouting the human sources… (a few minutes)' })
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
    const r = await fetch('/api/book-scout/email-digest', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-book-scout-key': key }, body: JSON.stringify({ digest_id: digestId }) })
    if (r.status === 401) { setEmailMsg(''); setErr('Unlock first.'); return }
    if (!r.ok) { const j = await r.json().catch(() => ({})); setEmailMsg(`Failed: ${j.error || 'error'}`); return }
    const j = await r.json()
    setEmailMsg(`Mailed to ${j.to} ✓`)
  }

  if (!data) {
    return <main style={{ background: T.paper, minHeight: '100dvh', color: T.faint, fontFamily: T.mono, padding: 40 }}>{err || 'Loading…'}</main>
  }

  const digest = data.digests.find((d) => d.id === selDigest) || data.digests[0]
  const genreLabel = data.genres.find((g) => g.slug === data.config.genre)?.label || data.config.genre
  const inputStyle: React.CSSProperties = { fontFamily: T.mono, fontSize: 13, padding: '8px 10px', borderRadius: 2, border: `1.5px solid ${T.rule}`, background: '#fff', color: T.ink }
  const stampBtn: React.CSSProperties = { fontFamily: T.mono, fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#fff', background: T.red, border: 'none', padding: '9px 14px', borderRadius: 2, cursor: 'pointer' }
  const ghostBtn: React.CSSProperties = { fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: T.soft, background: 'transparent', border: `1.5px solid ${T.rule}`, padding: '5px 9px', borderRadius: 2, cursor: 'pointer' }

  return (
    <main style={{ background: T.paper, minHeight: '100dvh', color: T.ink, fontFamily: T.serif, padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' }}>
      <div style={{ maxWidth: 660, margin: '0 auto', padding: '34px 20px 64px' }}>

        {/* Masthead */}
        <div style={{ position: 'relative', borderBottom: `2px solid ${T.ink}`, paddingBottom: 16 }}>
          {/* dog-ear fold, top-right */}
          <div style={{ position: 'absolute', top: -6, right: -2, width: 0, height: 0, borderLeft: '22px solid transparent', borderTop: `22px solid ${T.red}` }} />
          <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', color: T.red }}>A reading list</div>
          <h1 style={{ fontFamily: T.serif, fontSize: 52, fontWeight: 700, letterSpacing: '-.01em', margin: '2px 0 0', lineHeight: 1 }}>Dog-Ear</h1>
          <p style={{ fontSize: 17, fontStyle: 'italic', color: T.soft, margin: '12px 0 0', lineHeight: 1.45 }}>
            New books worth folding down a corner for — chosen by real critics and booksellers, with a few from Claude based on your own shelf.
          </p>
        </div>

        {/* current issue line */}
        {digest && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontFamily: T.mono, fontSize: 12, letterSpacing: '.08em', color: T.soft }}>
              {digest.month_label.toUpperCase()} · {genreLabel.toUpperCase()}
            </div>
            <button onClick={() => setShowTools((v) => !v)} style={{ ...ghostBtn, border: 'none' }}>{showTools ? '× close tools' : '✦ curator tools'}</button>
          </div>
        )}

        {err && <div style={{ marginTop: 12, fontFamily: T.mono, fontSize: 13, color: T.redInk }}>{err}</div>}

        {/* Curator tools (hidden by default) */}
        {showTools && (
          <div style={{ marginTop: 14, padding: 16, background: T.card, border: `1.5px solid ${T.rule}`, borderRadius: 3 }}>
            {!unlocked ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: T.mono, fontSize: 12, color: T.soft }}>KEY:</span>
                <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="curator key" style={inputStyle} onKeyDown={(e) => e.key === 'Enter' && unlock()} />
                <button onClick={unlock} style={stampBtn}>Unlock</button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                  <span style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: '.08em', color: T.soft }}>GENRE</span>
                  <select value={data.config.genre} disabled={busy} onChange={(e) => write('/api/book-scout/config', 'PUT', { genre: e.target.value })} style={inputStyle}>
                    {data.genres.map((g) => <option key={g.slug} value={g.slug}>{g.label}</option>)}
                  </select>
                  {data.digests.length > 1 && (
                    <select value={selDigest} onChange={(e) => setSelDigest(e.target.value)} style={inputStyle}>
                      {data.digests.map((d) => <option key={d.id} value={d.id}>{d.month_label} · {d.genre}</option>)}
                    </select>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button onClick={rerun} disabled={busy || run?.status === 'running'} style={stampBtn}>Re-run scout</button>
                  <button onClick={() => digest && emailDigest(digest.id)} disabled={!digest} style={{ ...stampBtn, background: T.blue }}>✉ Email this issue</button>
                  <button onClick={() => { setUnlocked(false); localStorage.removeItem('bookScoutKey') }} style={ghostBtn}>lock</button>
                </div>
                {dirty && !run && <div style={{ marginTop: 8, fontFamily: T.mono, fontSize: 12, color: T.soft }}>Genre/sources changed — re-run to refresh the list.</div>}
                {run && <div style={{ marginTop: 8, fontFamily: T.mono, fontSize: 12, color: run.status === 'error' ? T.redInk : T.soft }}>{run.status === 'running' ? '⏳ ' : run.status === 'done' ? '✓ ' : '⚠ '}{run.message}</div>}
                {emailMsg && <div style={{ marginTop: 6, fontFamily: T.mono, fontSize: 12, color: T.soft }}>{emailMsg}</div>}

                {/* sources */}
                <div style={{ marginTop: 18, borderTop: `1.5px solid ${T.rule}`, paddingTop: 12 }}>
                  <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: '.1em', color: T.soft, marginBottom: 6 }}>SOURCES · green = used for {genreLabel.toLowerCase()}</div>
                  {data.sources.map((s) => {
                    const used = s.active && (() => { const tags = s.genre.split(',').map((t) => t.trim().toLowerCase()); return tags.includes('general') || tags.includes(data.config.genre.toLowerCase()) })()
                    return (
                      <div key={s.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '7px 0', borderTop: `1px solid ${T.rule}`, opacity: s.active ? 1 : 0.45 }}>
                        <span style={{ marginTop: 6, width: 7, height: 7, borderRadius: 4, background: used ? '#4a7a44' : '#cbbb98', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <a href={s.url} target="_blank" rel="noreferrer" style={{ color: T.ink, fontSize: 14, textDecoration: 'none' }}>{s.name}</a>
                          <span style={{ marginLeft: 6, fontFamily: T.mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: T.red }}>{s.type}</span>
                        </div>
                        <button onClick={() => write(`/api/book-scout/sources/${s.id}`, 'PATCH', { active: !s.active })} disabled={busy} style={ghostBtn}>{s.active ? 'mute' : 'on'}</button>
                        <button onClick={() => { if (confirm(`Remove "${s.name}"?`)) write(`/api/book-scout/sources/${s.id}`, 'DELETE') }} disabled={busy} style={{ ...ghostBtn, color: T.redInk }}>del</button>
                      </div>
                    )
                  })}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12 }}>
                    <input placeholder="name" value={newSrc.name} onChange={(e) => setNewSrc({ ...newSrc, name: e.target.value })} style={inputStyle} />
                    <input placeholder="url" value={newSrc.url} onChange={(e) => setNewSrc({ ...newSrc, url: e.target.value })} style={inputStyle} />
                    <div style={{ display: 'flex', gap: 7 }}>
                      <select value={newSrc.type} onChange={(e) => setNewSrc({ ...newSrc, type: e.target.value })} style={inputStyle}>
                        {['critic', 'editorial', 'bookseller', 'librarian', 'aggregator'].map((t) => <option key={t}>{t}</option>)}
                      </select>
                      <input placeholder="genres (comma, or general)" value={newSrc.genre} onChange={(e) => setNewSrc({ ...newSrc, genre: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
                    </div>
                    <button disabled={busy || !newSrc.name || !newSrc.url} style={ghostBtn}
                      onClick={async () => { if (await write('/api/book-scout/sources', 'POST', newSrc)) setNewSrc({ name: '', url: '', type: 'editorial', genre: data.config.genre }) }}>+ add source</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ---- THE PICKS ---- */}
        {digest ? (
          <>
            <Divider label="Staff Picks" sub={`${digest.books.length} · on Kindle now`} color={T.red} />
            <div style={{ fontFamily: T.mono, fontSize: 11.5, color: T.faint, lineHeight: 1.5 }}>Recommended by real critics & booksellers — never by an algorithm.</div>
            {digest.books.map((b, i) => (
              <article key={i} style={{ padding: '20px 0', borderBottom: i === digest.books.length - 1 ? 'none' : `1px solid ${T.rule}` }}>
                <h3 style={{ fontFamily: T.serif, fontSize: 21, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>{b.title}</h3>
                <div style={{ fontFamily: T.mono, fontSize: 12, letterSpacing: '.04em', color: T.soft, marginTop: 5 }}>{b.author.toUpperCase()} · {b.pub_date}</div>
                <p style={{ fontSize: 16, lineHeight: 1.5, color: '#36302a', margin: '11px 0 0' }}>{b.one_line}</p>
                {b.sources.map((s, j) => (
                  <div key={j} style={{ marginTop: 11, paddingLeft: 14, borderLeft: `2px solid ${T.red}` }}>
                    <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase', color: T.redInk }}>{s.name}</div>
                    <div style={{ fontSize: 15, fontStyle: 'italic', color: '#3a342d', marginTop: 3, lineHeight: 1.45 }}>“{s.said.replace(/^["“”]|["“”]$/g, '')}”</div>
                  </div>
                ))}
                <Stamp b={b} color={T.red} />
              </article>
            ))}

            <Divider label="Claude Code Picks" sub={`${digest.claude_picks?.length || 0} · from your shelf`} color={T.blue} />
            <div style={{ fontFamily: T.mono, fontSize: 11.5, color: T.faint, lineHeight: 1.5 }}>Claude’s own picks, read off your fiction library — recent, available, and not already yours.</div>
            {digest.claude_picks && digest.claude_picks.length > 0 ? (
              digest.claude_picks.map((p, i) => (
                <article key={i} style={{ padding: '20px 0', borderBottom: i === digest.claude_picks.length - 1 ? 'none' : `1px solid ${T.rule}` }}>
                  <h3 style={{ fontFamily: T.serif, fontSize: 21, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>{p.title}</h3>
                  <div style={{ fontFamily: T.mono, fontSize: 12, letterSpacing: '.04em', color: T.soft, marginTop: 5 }}>{p.author.toUpperCase()} · {p.pub_date}</div>
                  <p style={{ fontSize: 16, lineHeight: 1.5, color: '#36302a', margin: '11px 0 0' }}>{p.one_line}</p>
                  <div style={{ marginTop: 11, paddingLeft: 14, borderLeft: `2px solid ${T.blue}` }}>
                    <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase', color: T.blue }}>Why it’s on your shelf</div>
                    <div style={{ fontSize: 15, color: '#3a342d', marginTop: 3, lineHeight: 1.45 }}>{p.why}</div>
                  </div>
                  <Stamp b={p} color={T.blue} />
                </article>
              ))
            ) : (
              <div style={{ marginTop: 14, padding: 16, background: T.card, border: `1.5px dashed ${T.rule}`, borderRadius: 3, fontFamily: T.mono, fontSize: 13, color: T.soft, lineHeight: 1.5 }}>
                None on this issue yet — Claude reads your shelf at the start of each month (and on a re-run) to set these.
              </div>
            )}
          </>
        ) : <div style={{ marginTop: 30, fontFamily: T.mono, color: T.faint }}>No issues yet.</div>}

        <div style={{ marginTop: 44, paddingTop: 16, borderTop: `2px solid ${T.ink}`, fontFamily: T.mono, fontSize: 11, letterSpacing: '.05em', color: T.faint }}>
          Dog-Ear · a new issue in your inbox every month{data.config.deliver_to ? ` · ${data.config.deliver_to}` : ''}
        </div>
      </div>
    </main>
  )
}
