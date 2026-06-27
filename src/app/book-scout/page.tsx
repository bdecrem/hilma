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
type User = { id: string; email: string; is_admin: boolean }
type Me = { user: User | null; library_count?: number; claude_picks?: ClaudePick[]; picks_month?: string | null; has_profile?: boolean }

const C = {
  paper: '#f3ece0', ink: '#3b372f', amber: '#e8a13c', caramel: '#b4793a',
  muted: '#6f6a5e', soft: '#8a8475', body: '#544f44', faint: '#a59f90',
  dash: '#cfc6b4', line: '#ddd4c4', avatarBg: '#f3e0c2', card: '#f8f2e7',
}
const FONT = "var(--font-shantell), ui-rounded, 'Segoe UI', system-ui, sans-serif"
const HAND = "var(--font-caveat), 'Shantell Sans', cursive"

const kindle = (b: { title: string; author: string }) =>
  `https://www.amazon.com/s?k=${encodeURIComponent(b.title + ' ' + b.author)}&i=digital-text`

// ── the dog-over-a-book logo (from the Claude Design mock) ──
function DogLogo({ w = 68 }: { w?: number }) {
  return (
    <svg width={w} height={w * 48 / 68} viewBox="28 70 144 100" fill="none" style={{ overflow: 'visible', flex: 'none' }}>
      <defs><filter id="dl" x="-25%" y="-25%" width="150%" height="150%">
        <feTurbulence type="fractalNoise" baseFrequency="0.019" numOctaves="2" seed="5" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="3" /></filter></defs>
      <g filter="url(#dl)" stroke={C.ink} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M72 78 C52 82 48 116 58 132 C70 122 76 102 78 86 C78 80 76 78 72 78 Z" fill={C.amber} strokeWidth="3.6" />
        <path d="M128 78 C148 82 152 116 142 132 C130 122 124 102 122 86 C122 80 124 78 128 78 Z" fill={C.amber} strokeWidth="3.6" />
        <path d="M68 130 C62 100 82 84 100 84 C118 84 138 100 132 130" />
        <circle cx="86" cy="112" r="3.4" fill={C.ink} stroke="none" />
        <circle cx="114" cy="112" r="3.4" fill={C.ink} stroke="none" />
        <path d="M34 128 L166 128 L166 162 L34 162 Z" />
        <path d="M100 128 L100 162" strokeWidth="2.4" />
        <path d="M74 128 C74 121 88 121 88 128" strokeWidth="3" />
        <path d="M112 128 C112 121 126 121 126 128" strokeWidth="3" />
        <path d="M96 126 L104 126 L100 131 Z" fill={C.ink} strokeWidth="1.5" />
      </g>
    </svg>
  )
}
function AvatarMark({ active }: { active?: boolean }) {
  return (
    <svg width="36" height="36" viewBox="0 0 60 60" fill="none" style={{ overflow: 'visible' }}>
      <defs><filter id="avf" x="-25%" y="-25%" width="150%" height="150%">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="4" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" /></filter>
        <clipPath id="avc"><circle cx="30" cy="30" r="25" /></clipPath></defs>
      <g filter="url(#avf)">
        <circle cx="30" cy="30" r="25" fill={active ? C.amber : C.avatarBg} />
        <g clipPath="url(#avc)" stroke={C.ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <circle cx="30" cy="25" r="9" /><path d="M14 50 C16 38 24 33 30 33 C36 33 44 38 46 50" />
        </g>
        <circle cx="30" cy="30" r="25" stroke={C.ink} strokeWidth="2.8" fill="none" />
      </g>
    </svg>
  )
}

function Badge({ n }: { n: number }) {
  return (
    <div style={{ width: 42, height: 50, background: C.amber, clipPath: 'polygon(0 0, 70% 0, 100% 30%, 100% 100%, 0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: n > 9 ? 17 : 20, color: C.ink }}>{n}</div>
  )
}

// short curator quote with a "more" toggle
function Quote({ name, said }: { name: string; said: string }) {
  const [open, setOpen] = useState(false)
  const clean = said.replace(/^["“”]|["“”]$/g, '')
  const long = clean.length > 96
  return (
    <div style={{ marginTop: 9, fontSize: 14.5, lineHeight: 1.5, color: C.body }}>
      <span style={{ fontWeight: 600, color: C.caramel }}>{name.split(' (')[0]}: </span>
      <span style={{ fontStyle: 'italic' }}>“{open || !long ? clean : clean.slice(0, 96).trimEnd() + '…'}”</span>
      {long && <button onClick={() => setOpen(!open)} style={{ marginLeft: 6, font: 'inherit', fontSize: 13, color: C.caramel, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>{open ? 'less' : 'more'}</button>}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontWeight: 700, fontSize: 24, margin: '46px 0 0', color: C.ink }}>{children}</h2>
}

export default function DogEarPage() {
  const [me, setMe] = useState<Me | null>(null)
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [acct, setAcct] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [showTools, setShowTools] = useState(false)
  const [newSrc, setNewSrc] = useState({ name: '', url: '', type: 'editorial', genre: 'thrillers' })
  const [run, setRun] = useState<{ id: string; status: string; message: string } | null>(null)
  const [genBusy, setGenBusy] = useState(false)
  const runPoll = useRef<ReturnType<typeof setInterval> | null>(null)
  const picksPoll = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadMe = useCallback(async () => { const r = await fetch('/api/book-scout/auth/me', { cache: 'no-store' }); setMe(await r.json()) }, [])
  const loadData = useCallback(async () => { const r = await fetch('/api/book-scout/data', { cache: 'no-store' }); if (r.ok) setData(await r.json()) }, [])

  useEffect(() => {
    loadMe(); loadData()
    return () => { if (runPoll.current) clearInterval(runPoll.current); if (picksPoll.current) clearInterval(picksPoll.current) }
  }, [loadMe, loadData])

  const submitAuth = async () => {
    setErr(''); setBusy(true)
    try {
      const r = await fetch(`/api/book-scout/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }) })
      const j = await r.json(); if (!r.ok) { setErr(j.error || 'Failed'); return }
      setPw(''); await loadMe()
    } finally { setBusy(false) }
  }
  const logout = async () => { await fetch('/api/book-scout/auth/logout', { method: 'POST' }); setMe({ user: null }); setShowTools(false); setAcct(false) }

  const uploadFile = async (file: File) => {
    setErr(''); setMsg('reading…'); setBusy(true)
    try {
      const text = await file.text()
      const r = await fetch('/api/book-scout/library/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, filename: file.name }) })
      const j = await r.json(); if (!r.ok) { setMsg(''); setErr(j.error || 'upload failed'); return }
      setMsg(`loaded ${j.count} books — building your taste profile…`); await loadMe()
    } finally { setBusy(false) }
  }
  const genPicks = async () => {
    setErr(''); setGenBusy(true)
    const before = me?.picks_month ?? null
    const r = await fetch('/api/book-scout/my-picks', { method: 'POST' })
    const j = await r.json(); if (!r.ok) { setGenBusy(false); setErr(j.error || 'could not start'); return }
    setMsg('claude is reading your shelf… (a few minutes)')
    if (picksPoll.current) clearInterval(picksPoll.current)
    let n = 0
    picksPoll.current = setInterval(async () => {
      n++; const mm: Me = await (await fetch('/api/book-scout/auth/me', { cache: 'no-store' })).json(); setMe(mm)
      if ((mm.picks_month && mm.picks_month !== before) || n > 60) {
        if (picksPoll.current) clearInterval(picksPoll.current)
        setGenBusy(false); setMsg((mm.claude_picks?.length || 0) > 0 ? 'your picks are ready ↓' : 'no picks this time — try again')
      }
    }, 6000)
  }
  const adminWrite = async (path: string, method: string, body?: unknown) => {
    setBusy(true)
    try {
      const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || 'save failed'); return false }
      setErr(''); await loadData(); return true
    } finally { setBusy(false) }
  }
  const rerun = async () => {
    setErr('')
    const r = await fetch('/api/book-scout/run', { method: 'POST' })
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || 'could not start'); return }
    const { run_id } = await r.json(); setRun({ id: run_id, status: 'running', message: 'scouting the booksellers…' })
    if (runPoll.current) clearInterval(runPoll.current)
    runPoll.current = setInterval(async () => {
      const s = await fetch(`/api/book-scout/run/${run_id}`, { cache: 'no-store' }); if (!s.ok) return
      const st = await s.json(); setRun({ id: run_id, status: st.status, message: st.message })
      if (st.status !== 'running') { if (runPoll.current) clearInterval(runPoll.current); if (st.status === 'done') loadData() }
    }, 5000)
  }
  const emailIssue = async () => {
    const id = data?.digests[0]?.id; if (!id) return
    setMsg('mailing…')
    const r = await fetch('/api/book-scout/email-digest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ digest_id: id }) })
    const j = await r.json(); setMsg(r.ok ? 'mailed ✓' : `failed: ${j.error || ''}`)
  }

  const user = me?.user || null
  const digest = data?.digests[0]
  const myPicks = me?.claude_picks || []
  const monthTag = (digest?.month_label || '').toLowerCase()

  const input: React.CSSProperties = { fontFamily: FONT, fontSize: 15, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${C.dash}`, background: '#fff', color: C.ink, width: '100%', boxSizing: 'border-box' }
  const pill: React.CSSProperties = { fontFamily: FONT, fontSize: 15, fontWeight: 600, color: C.ink, background: C.amber, border: 'none', padding: '10px 18px', borderRadius: 999, cursor: 'pointer' }
  const ghost: React.CSSProperties = { fontFamily: FONT, fontSize: 14, fontWeight: 600, color: C.caramel, background: 'transparent', border: `1.5px solid ${C.dash}`, padding: '7px 13px', borderRadius: 999, cursor: 'pointer' }
  const link: React.CSSProperties = { color: C.ink, textDecoration: 'none', fontWeight: 700 }

  return (
    <main style={{ minHeight: '100dvh', background: C.paper, color: C.ink, fontFamily: FONT, padding: '0 22px 80px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {/* ===== Header ===== */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '30px 0 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <DogLogo />
            <span style={{ fontWeight: 700, fontSize: 28, letterSpacing: '-.01em' }}>dog ear</span>
          </div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 15, fontWeight: 600 }}>
            <a href="#picks" style={{ color: C.ink, textDecoration: 'none' }}>picks</a>
            <div style={{ width: 1, height: 22, background: C.line }} />
            <button title={user ? user.email : 'sign in'} onClick={() => setAcct((v) => !v)} style={{ display: 'flex', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}>
              <AvatarMark active={!!user} />
            </button>
          </nav>
        </header>

        {/* ===== Account panel (tucked behind the avatar) ===== */}
        {acct && (
          <div style={{ background: C.card, border: `1.5px solid ${C.line}`, borderRadius: 16, padding: 18, marginBottom: 18 }}>
            {!user ? (
              <>
                <div style={{ fontFamily: HAND, fontWeight: 700, fontSize: 22, color: C.caramel }}>{mode === 'signup' ? 'join — a free issue each month' : 'welcome back'}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, maxWidth: 360, marginTop: 10 }}>
                  <input style={input} type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <input style={input} type="password" placeholder="password (8+)" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitAuth()} />
                  <button style={pill} disabled={busy} onClick={submitAuth}>{mode === 'signup' ? 'create account' : 'sign in'}</button>
                </div>
                <button onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setErr('') }} style={{ marginTop: 9, font: 'inherit', fontSize: 14, color: C.caramel, background: 'none', border: 'none', cursor: 'pointer' }}>
                  {mode === 'signup' ? 'have an account? sign in' : 'new here? create one'}
                </button>
                <p style={{ fontFamily: HAND, fontSize: 17, color: C.soft, margin: '10px 0 0' }}>upload your reading list and claude folds in picks just for you.</p>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: 14, color: C.soft }}>signed in · {user.email}{user.is_admin ? ' · admin' : ''}</span>
                  <button onClick={logout} style={ghost}>sign out</button>
                </div>
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${C.dash}`, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15 }}><b>your shelf:</b> {me?.library_count || 0} books</span>
                  <label style={{ ...ghost, cursor: 'pointer' }}>upload .csv / .md
                    <input type="file" accept=".csv,.md,.txt,.markdown" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f) }} />
                  </label>
                  <button onClick={genPicks} disabled={genBusy || !me?.library_count} style={pill}>{genBusy ? 'fetching…' : 'fetch my picks'}</button>
                </div>
                {user.is_admin && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${C.dash}` }}>
                    <button onClick={() => setShowTools((v) => !v)} style={ghost}>{showTools ? 'hide curator tools' : '✦ curator tools'}</button>
                    {showTools && data && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                          <span style={{ fontSize: 14, color: C.soft }}>genre</span>
                          <select value={data.config.genre} disabled={busy} onChange={(e) => adminWrite('/api/book-scout/config', 'PUT', { genre: e.target.value })} style={{ ...input, width: 'auto' }}>
                            {data.genres.map((g) => <option key={g.slug} value={g.slug}>{g.label}</option>)}
                          </select>
                          <button onClick={rerun} disabled={busy || run?.status === 'running'} style={pill}>re-run staff picks</button>
                          <button onClick={emailIssue} style={ghost}>✉ email issue</button>
                        </div>
                        {run && <div style={{ fontSize: 13, color: C.soft }}>{run.status === 'running' ? '⏳ ' : run.status === 'done' ? '✓ ' : '⚠ '}{run.message}</div>}
                        <div style={{ marginTop: 10, borderTop: `1px dashed ${C.dash}`, paddingTop: 10 }}>
                          {data.sources.map((s) => (
                            <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', opacity: s.active ? 1 : 0.45 }}>
                              <a href={s.url} target="_blank" rel="noreferrer" style={{ flex: 1, color: C.ink, fontSize: 14, textDecoration: 'none' }}>{s.name} <span style={{ fontSize: 11, color: C.caramel }}>{s.type}</span></a>
                              <button onClick={() => adminWrite(`/api/book-scout/sources/${s.id}`, 'PATCH', { active: !s.active })} disabled={busy} style={ghost}>{s.active ? 'mute' : 'on'}</button>
                              <button onClick={() => { if (confirm(`remove "${s.name}"?`)) adminWrite(`/api/book-scout/sources/${s.id}`, 'DELETE') }} disabled={busy} style={{ ...ghost, color: '#a3402a' }}>del</button>
                            </div>
                          ))}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                            <input style={input} placeholder="name" value={newSrc.name} onChange={(e) => setNewSrc({ ...newSrc, name: e.target.value })} />
                            <input style={input} placeholder="url" value={newSrc.url} onChange={(e) => setNewSrc({ ...newSrc, url: e.target.value })} />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <select style={{ ...input, width: 'auto' }} value={newSrc.type} onChange={(e) => setNewSrc({ ...newSrc, type: e.target.value })}>{['critic', 'editorial', 'bookseller', 'librarian', 'aggregator'].map((t) => <option key={t}>{t}</option>)}</select>
                              <input style={input} placeholder="genres (comma, or general)" value={newSrc.genre} onChange={(e) => setNewSrc({ ...newSrc, genre: e.target.value })} />
                            </div>
                            <button style={ghost} disabled={busy || !newSrc.name || !newSrc.url} onClick={async () => { if (await adminWrite('/api/book-scout/sources', 'POST', newSrc)) setNewSrc({ name: '', url: '', type: 'editorial', genre: data.config.genre }) }}>+ add source</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {(err || msg) && <div style={{ marginBottom: 14, fontSize: 14, color: err ? '#a3402a' : C.soft }}>{err || msg}</div>}

        <div style={{ borderTop: `1px solid ${C.line}` }} />

        {/* ===== Masthead ===== */}
        <section id="picks" style={{ padding: '50px 0 8px', textAlign: 'center' }}>
          {monthTag && <div style={{ fontFamily: HAND, fontWeight: 700, fontSize: 22, color: C.caramel, transform: 'rotate(-2deg)' }}>{monthTag}</div>}
          <h1 style={{ fontWeight: 700, fontSize: 'clamp(36px,6vw,56px)', lineHeight: 1.03, margin: '8px 0 0' }}>this month&rsquo;s picks</h1>
          <p style={{ fontFamily: HAND, fontWeight: 600, fontSize: 21, color: C.muted, margin: '12px auto 0', maxWidth: 440 }}>
            books we couldn&rsquo;t stop folding the corners of — chosen by real booksellers, with a few from claude for your shelf.
          </p>
        </section>

        {/* ===== Staff Picks ===== */}
        <SectionLabel>from the booksellers</SectionLabel>
        {digest && digest.books.length > 0 ? (
          <ol style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
            {digest.books.map((b, i) => (
              <li key={i} style={{ display: 'grid', gridTemplateColumns: '54px 1fr', gap: 20, padding: '24px 0', borderTop: `1px dashed ${C.dash}`, borderBottom: i === digest.books.length - 1 ? `1px dashed ${C.dash}` : undefined }}>
                <Badge n={i + 1} />
                <div>
                  {i === 0 && <div style={{ fontFamily: HAND, fontWeight: 700, fontSize: 17, color: C.caramel, marginBottom: 2 }}>★ this month&rsquo;s favorite</div>}
                  <a href={kindle(b)} target="_blank" rel="noreferrer" style={{ ...link, fontSize: 22, lineHeight: 1.2 }}>{b.title} →</a>
                  <div style={{ fontSize: 14, color: C.soft, margin: '3px 0 7px' }}>{b.author} · {b.pub_date}</div>
                  <p style={{ fontSize: 15.5, lineHeight: 1.6, color: C.body, margin: 0, maxWidth: 560 }}>{b.one_line}</p>
                  {b.sources[0] && <Quote name={b.sources[0].name} said={b.sources[0].said} />}
                </div>
              </li>
            ))}
          </ol>
        ) : <p style={{ fontFamily: HAND, fontSize: 19, color: C.soft }}>this month&rsquo;s picks are on their way.</p>}

        {/* ===== Claude Code Picks ===== */}
        <SectionLabel>picked for your shelf</SectionLabel>
        <p style={{ fontFamily: HAND, fontSize: 18, color: C.soft, margin: '2px 0 0' }}>claude&rsquo;s own picks, read off your reading list.</p>
        {user ? (
          myPicks.length > 0 ? (
            <ol style={{ margin: '10px 0 0', padding: 0, listStyle: 'none' }}>
              {myPicks.map((p, i) => (
                <li key={i} style={{ display: 'grid', gridTemplateColumns: '54px 1fr', gap: 20, padding: '24px 0', borderTop: `1px dashed ${C.dash}`, borderBottom: i === myPicks.length - 1 ? `1px dashed ${C.dash}` : undefined }}>
                  <Badge n={i + 1} />
                  <div>
                    <a href={kindle(p)} target="_blank" rel="noreferrer" style={{ ...link, fontSize: 22, lineHeight: 1.2 }}>{p.title} →</a>
                    <div style={{ fontSize: 14, color: C.soft, margin: '3px 0 7px' }}>{p.author} · {p.pub_date}</div>
                    <p style={{ fontSize: 15.5, lineHeight: 1.6, color: C.body, margin: 0, maxWidth: 560 }}>{p.one_line}</p>
                    <div style={{ marginTop: 9, fontSize: 14.5, lineHeight: 1.5 }}><span style={{ fontFamily: HAND, fontWeight: 700, fontSize: 17, color: C.caramel }}>why it&rsquo;s on your shelf — </span><span style={{ color: C.body }}>{p.why}</span></div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div style={{ marginTop: 12, padding: 18, background: C.card, border: `1.5px dashed ${C.dash}`, borderRadius: 16 }}>
              <p style={{ margin: 0, fontSize: 15.5, color: C.body }}>{me?.library_count ? 'open the avatar ↑ and hit “fetch my picks” — claude reads your shelf and finds recent books you don’t own yet.' : 'open the avatar ↑, upload your reading list (.csv or .md), and claude picks books just for you.'}</p>
            </div>
          )
        ) : (
          <div style={{ marginTop: 12, padding: 18, background: C.card, border: `1.5px dashed ${C.dash}`, borderRadius: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: 15.5, color: C.body, flex: 1, minWidth: 220 }}>make an account and upload your reading list — claude reads your shelf and picks recent books you don&rsquo;t own yet.</p>
            <button onClick={() => setAcct(true)} style={pill}>join free</button>
          </div>
        )}

        {/* ===== Footer ===== */}
        <footer style={{ marginTop: 56, textAlign: 'center' }}>
          <p style={{ fontFamily: HAND, fontWeight: 600, fontSize: 20, color: C.soft, margin: 0 }}>new picks every month — fetch them while they&rsquo;re warm.</p>
          <p style={{ fontSize: 13, color: C.faint, margin: '10px 0 0' }}>dog ear · a little library on the internet</p>
        </footer>
      </div>
    </main>
  )
}
