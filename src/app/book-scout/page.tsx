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
type Me = { user: User | null; library_count?: number; claude_picks?: ClaudePick[]; picks_month?: string | null }

const T = {
  paper: '#f3ead7', card: '#fbf6e9', ink: '#231d15', soft: '#6f6552', faint: '#9c9078',
  rule: '#d8c8a8', red: '#b03a26', redInk: '#8f2f1f', blue: '#28425e', green: '#4a7a44',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"Courier New", ui-monospace, SFMono-Regular, monospace',
}

const kindle = (b: { title: string; author: string }) =>
  `https://www.amazon.com/s?k=${encodeURIComponent(b.title + ' ' + b.author)}&i=digital-text`

function Stamp({ b, color }: { b: { title: string; author: string }; color: string }) {
  return (
    <a href={kindle(b)} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 14, fontFamily: T.mono, fontSize: 12, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color, textDecoration: 'none', border: `1.5px solid ${color}`, padding: '7px 12px', borderRadius: 2 }}>Find on Kindle →</a>
  )
}
function Divider({ label, sub, color }: { label: string; sub?: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 40, marginBottom: 8 }}>
      <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ flex: 1, borderTop: `1.5px solid ${color}`, opacity: 0.4 }} />
      {sub && <span style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: '.1em', color: T.faint, whiteSpace: 'nowrap' }}>{sub}</span>}
    </div>
  )
}
function StaffCard({ b, last }: { b: Book; last: boolean }) {
  return (
    <article style={{ padding: '20px 0', borderBottom: last ? 'none' : `1px solid ${T.rule}` }}>
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
  )
}
function PickCard({ p, last }: { p: ClaudePick; last: boolean }) {
  return (
    <article style={{ padding: '20px 0', borderBottom: last ? 'none' : `1px solid ${T.rule}` }}>
      <h3 style={{ fontFamily: T.serif, fontSize: 21, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>{p.title}</h3>
      <div style={{ fontFamily: T.mono, fontSize: 12, letterSpacing: '.04em', color: T.soft, marginTop: 5 }}>{p.author.toUpperCase()} · {p.pub_date}</div>
      <p style={{ fontSize: 16, lineHeight: 1.5, color: '#36302a', margin: '11px 0 0' }}>{p.one_line}</p>
      <div style={{ marginTop: 11, paddingLeft: 14, borderLeft: `2px solid ${T.blue}` }}>
        <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase', color: T.blue }}>Why it’s on your shelf</div>
        <div style={{ fontSize: 15, color: '#3a342d', marginTop: 3, lineHeight: 1.45 }}>{p.why}</div>
      </div>
      <Stamp b={p} color={T.blue} />
    </article>
  )
}

export default function DogEarPage() {
  const [me, setMe] = useState<Me | null>(null)
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  // auth form
  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  // admin tools
  const [showTools, setShowTools] = useState(false)
  const [newSrc, setNewSrc] = useState({ name: '', url: '', type: 'editorial', genre: 'thrillers' })
  const [run, setRun] = useState<{ id: string; status: string; message: string } | null>(null)
  const runPoll = useRef<ReturnType<typeof setInterval> | null>(null)
  const picksPoll = useRef<ReturnType<typeof setInterval> | null>(null)
  const [genBusy, setGenBusy] = useState(false)

  const loadMe = useCallback(async () => {
    const r = await fetch('/api/book-scout/auth/me', { cache: 'no-store' })
    setMe(await r.json())
  }, [])
  const loadData = useCallback(async () => {
    const r = await fetch('/api/book-scout/data', { cache: 'no-store' })
    if (r.ok) setData(await r.json())
  }, [])

  useEffect(() => {
    loadMe(); loadData()
    return () => { if (runPoll.current) clearInterval(runPoll.current); if (picksPoll.current) clearInterval(picksPoll.current) }
  }, [loadMe, loadData])

  const submitAuth = async () => {
    setErr(''); setBusy(true)
    try {
      const r = await fetch(`/api/book-scout/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }) })
      const j = await r.json()
      if (!r.ok) { setErr(j.error || 'Failed'); return }
      setPw(''); await loadMe()
    } finally { setBusy(false) }
  }
  const logout = async () => { await fetch('/api/book-scout/auth/logout', { method: 'POST' }); setMe({ user: null }); setShowTools(false) }

  const uploadFile = async (file: File) => {
    setErr(''); setMsg('Reading…'); setBusy(true)
    try {
      const text = await file.text()
      const r = await fetch('/api/book-scout/library/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, filename: file.name }) })
      const j = await r.json()
      if (!r.ok) { setMsg(''); setErr(j.error || 'Upload failed'); return }
      setMsg(`Loaded ${j.count} books.`); await loadMe()
    } finally { setBusy(false) }
  }

  const genPicks = async () => {
    setErr(''); setGenBusy(true)
    const before = me?.picks_month ?? null
    const r = await fetch('/api/book-scout/my-picks', { method: 'POST' })
    const j = await r.json()
    if (!r.ok) { setGenBusy(false); setErr(j.error || 'Could not start'); return }
    setMsg('Claude is reading your shelf… (a few minutes)')
    if (picksPoll.current) clearInterval(picksPoll.current)
    let n = 0
    picksPoll.current = setInterval(async () => {
      n++
      const rr = await fetch('/api/book-scout/auth/me', { cache: 'no-store' })
      const mm: Me = await rr.json()
      setMe(mm)
      if ((mm.picks_month && mm.picks_month !== before) || n > 60) {
        if (picksPoll.current) clearInterval(picksPoll.current)
        setGenBusy(false); setMsg((mm.claude_picks?.length || 0) > 0 ? 'Your picks are ready.' : 'No picks this time — try again.')
      }
    }, 6000)
  }

  // admin write (session-based, no key)
  const adminWrite = async (path: string, method: string, body?: unknown) => {
    setBusy(true)
    try {
      const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || 'Save failed'); return false }
      setErr(''); await loadData(); return true
    } finally { setBusy(false) }
  }
  const rerun = async () => {
    setErr('')
    const r = await fetch('/api/book-scout/run', { method: 'POST' })
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || 'Could not start'); return }
    const { run_id } = await r.json()
    setRun({ id: run_id, status: 'running', message: 'Scouting the human sources…' })
    if (runPoll.current) clearInterval(runPoll.current)
    runPoll.current = setInterval(async () => {
      const s = await fetch(`/api/book-scout/run/${run_id}`, { cache: 'no-store' }); if (!s.ok) return
      const st = await s.json(); setRun({ id: run_id, status: st.status, message: st.message })
      if (st.status !== 'running') { if (runPoll.current) clearInterval(runPoll.current); if (st.status === 'done') loadData() }
    }, 5000)
  }
  const emailIssue = async () => {
    const id = data?.digests[0]?.id; if (!id) return
    setMsg('Mailing…')
    const r = await fetch('/api/book-scout/email-digest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ digest_id: id }) })
    const j = await r.json(); setMsg(r.ok ? `Mailed ✓` : `Failed: ${j.error || ''}`)
  }

  const inputStyle: React.CSSProperties = { fontFamily: T.mono, fontSize: 13, padding: '9px 11px', borderRadius: 2, border: `1.5px solid ${T.rule}`, background: '#fff', color: T.ink, width: '100%', boxSizing: 'border-box' }
  const stampBtn: React.CSSProperties = { fontFamily: T.mono, fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#fff', background: T.red, border: 'none', padding: '10px 16px', borderRadius: 2, cursor: 'pointer' }
  const ghostBtn: React.CSSProperties = { fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: T.soft, background: 'transparent', border: `1.5px solid ${T.rule}`, padding: '6px 10px', borderRadius: 2, cursor: 'pointer' }

  const user = me?.user || null
  const digest = data?.digests[0]
  const myPicks = me?.claude_picks || []

  return (
    <main style={{ background: T.paper, minHeight: '100dvh', color: T.ink, fontFamily: T.serif, padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' }}>
      <div style={{ maxWidth: 660, margin: '0 auto', padding: '34px 20px 64px' }}>

        {/* Masthead */}
        <div style={{ position: 'relative', borderBottom: `2px solid ${T.ink}`, paddingBottom: 16 }}>
          <div style={{ position: 'absolute', top: -6, right: -2, width: 0, height: 0, borderLeft: '22px solid transparent', borderTop: `22px solid ${T.red}` }} />
          <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', color: T.red }}>A reading list</div>
          <h1 style={{ fontFamily: T.serif, fontSize: 52, fontWeight: 700, letterSpacing: '-.01em', margin: '2px 0 0', lineHeight: 1 }}>Dog-Ear</h1>
          <p style={{ fontSize: 17, fontStyle: 'italic', color: T.soft, margin: '12px 0 0', lineHeight: 1.45 }}>
            New books worth folding down a corner for — chosen by real critics and booksellers, with a few from Claude based on your own shelf.
          </p>
        </div>

        {err && <div style={{ marginTop: 12, fontFamily: T.mono, fontSize: 13, color: T.redInk }}>{err}</div>}
        {msg && <div style={{ marginTop: 8, fontFamily: T.mono, fontSize: 12, color: T.soft }}>{msg}</div>}

        {/* ---- ACCOUNT BAR ---- */}
        {me && (user ? (
          <div style={{ marginTop: 16, padding: 14, background: T.card, border: `1.5px solid ${T.rule}`, borderRadius: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontFamily: T.mono, fontSize: 12, color: T.soft }}>SIGNED IN · {user.email}{user.is_admin ? ' · admin' : ''}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {user.is_admin && <button onClick={() => setShowTools((v) => !v)} style={ghostBtn}>{showTools ? '× tools' : '✦ curator tools'}</button>}
                <button onClick={logout} style={ghostBtn}>sign out</button>
              </div>
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.rule}`, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: T.mono, fontSize: 12, color: T.soft }}>YOUR SHELF: {me.library_count || 0} books</span>
              <label style={{ ...ghostBtn, cursor: 'pointer' }}>
                upload .csv / .md
                <input type="file" accept=".csv,.md,.txt,.markdown" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f) }} />
              </label>
              <button onClick={genPicks} disabled={genBusy || !me.library_count} style={{ ...stampBtn, background: T.blue }}>{genBusy ? 'generating…' : 'Generate my picks'}</button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 16, padding: 16, background: T.card, border: `1.5px solid ${T.rule}`, borderRadius: 3 }}>
            <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: '.1em', color: T.red, marginBottom: 10 }}>{mode === 'signup' ? 'JOIN — FREE MONTHLY ISSUE' : 'SIGN IN'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
              <input placeholder="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
              <input placeholder="password (8+ chars)" type="password" value={pw} onChange={(e) => setPw(e.target.value)} style={inputStyle} onKeyDown={(e) => e.key === 'Enter' && submitAuth()} />
              <button onClick={submitAuth} disabled={busy} style={stampBtn}>{mode === 'signup' ? 'Create account' : 'Sign in'}</button>
            </div>
            <button onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setErr('') }} style={{ ...ghostBtn, border: 'none', marginTop: 10, paddingLeft: 0 }}>
              {mode === 'signup' ? 'have an account? sign in' : 'new here? create an account'}
            </button>
            <p style={{ fontFamily: T.mono, fontSize: 11, color: T.faint, lineHeight: 1.6, margin: '8px 0 0' }}>We email one issue a month. Upload your reading list and Claude adds picks just for you.</p>
          </div>
        ))}

        {/* ---- ADMIN CURATOR TOOLS ---- */}
        {user?.is_admin && showTools && data && (
          <div style={{ marginTop: 14, padding: 16, background: T.card, border: `1.5px solid ${T.rule}`, borderRadius: 3 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
              <span style={{ fontFamily: T.mono, fontSize: 11, color: T.soft }}>GENRE</span>
              <select value={data.config.genre} disabled={busy} onChange={(e) => adminWrite('/api/book-scout/config', 'PUT', { genre: e.target.value })} style={{ ...inputStyle, width: 'auto' }}>
                {data.genres.map((g) => <option key={g.slug} value={g.slug}>{g.label}</option>)}
              </select>
              <button onClick={rerun} disabled={busy || run?.status === 'running'} style={stampBtn}>Re-run staff picks</button>
              <button onClick={emailIssue} style={{ ...stampBtn, background: T.blue }}>✉ Email issue</button>
            </div>
            {run && <div style={{ fontFamily: T.mono, fontSize: 12, color: run.status === 'error' ? T.redInk : T.soft }}>{run.status === 'running' ? '⏳ ' : run.status === 'done' ? '✓ ' : '⚠ '}{run.message}</div>}
            <div style={{ marginTop: 12, borderTop: `1px solid ${T.rule}`, paddingTop: 10 }}>
              <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: '.1em', color: T.soft, marginBottom: 6 }}>SOURCES</div>
              {data.sources.map((s) => (
                <div key={s.id} style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '6px 0', borderTop: `1px solid ${T.rule}`, opacity: s.active ? 1 : 0.45 }}>
                  <a href={s.url} target="_blank" rel="noreferrer" style={{ flex: 1, color: T.ink, fontSize: 14, textDecoration: 'none' }}>{s.name}<span style={{ marginLeft: 6, fontFamily: T.mono, fontSize: 10, textTransform: 'uppercase', color: T.red }}>{s.type}</span></a>
                  <button onClick={() => adminWrite(`/api/book-scout/sources/${s.id}`, 'PATCH', { active: !s.active })} disabled={busy} style={ghostBtn}>{s.active ? 'mute' : 'on'}</button>
                  <button onClick={() => { if (confirm(`Remove "${s.name}"?`)) adminWrite(`/api/book-scout/sources/${s.id}`, 'DELETE') }} disabled={busy} style={{ ...ghostBtn, color: T.redInk }}>del</button>
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12 }}>
                <input placeholder="name" value={newSrc.name} onChange={(e) => setNewSrc({ ...newSrc, name: e.target.value })} style={inputStyle} />
                <input placeholder="url" value={newSrc.url} onChange={(e) => setNewSrc({ ...newSrc, url: e.target.value })} style={inputStyle} />
                <div style={{ display: 'flex', gap: 7 }}>
                  <select value={newSrc.type} onChange={(e) => setNewSrc({ ...newSrc, type: e.target.value })} style={{ ...inputStyle, width: 'auto' }}>
                    {['critic', 'editorial', 'bookseller', 'librarian', 'aggregator'].map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <input placeholder="genres (comma, or general)" value={newSrc.genre} onChange={(e) => setNewSrc({ ...newSrc, genre: e.target.value })} style={inputStyle} />
                </div>
                <button disabled={busy || !newSrc.name || !newSrc.url} style={ghostBtn} onClick={async () => { if (await adminWrite('/api/book-scout/sources', 'POST', newSrc)) setNewSrc({ name: '', url: '', type: 'editorial', genre: data.config.genre }) }}>+ add source</button>
              </div>
            </div>
          </div>
        )}

        {/* ---- STAFF PICKS (shared) ---- */}
        {digest ? (
          <>
            <Divider label="Staff Picks" sub={`${digest.month_label} · ${digest.genre}`} color={T.red} />
            <div style={{ fontFamily: T.mono, fontSize: 11.5, color: T.faint, lineHeight: 1.5 }}>Recommended by real critics &amp; booksellers — never by an algorithm.</div>
            {digest.books.map((b, i) => <StaffCard key={i} b={b} last={i === digest.books.length - 1} />)}
          </>
        ) : <div style={{ marginTop: 30, fontFamily: T.mono, color: T.faint }}>This month’s staff picks are coming soon.</div>}

        {/* ---- CLAUDE CODE PICKS (per-user) ---- */}
        <Divider label="Your Claude Code Picks" sub={user ? `${myPicks.length} · from your shelf` : 'members only'} color={T.blue} />
        {user ? (
          myPicks.length > 0 ? (
            myPicks.map((p, i) => <PickCard key={i} p={p} last={i === myPicks.length - 1} />)
          ) : (
            <div style={{ marginTop: 12, padding: 16, background: T.card, border: `1.5px dashed ${T.rule}`, borderRadius: 3, fontFamily: T.mono, fontSize: 13, color: T.soft, lineHeight: 1.6 }}>
              {me?.library_count ? 'Hit “Generate my picks” above — Claude reads your shelf and finds recent books you don’t own yet.' : 'Upload your reading list (.csv or .md) above, then generate picks tailored to your shelf.'}
            </div>
          )
        ) : (
          <div style={{ marginTop: 12, padding: 16, background: T.card, border: `1.5px dashed ${T.rule}`, borderRadius: 3, fontFamily: T.mono, fontSize: 13, color: T.soft, lineHeight: 1.6 }}>
            Create an account and upload your reading list — Claude reads your shelf and picks recent books you don’t own yet.
          </div>
        )}

        <div style={{ marginTop: 44, paddingTop: 16, borderTop: `2px solid ${T.ink}`, fontFamily: T.mono, fontSize: 11, letterSpacing: '.05em', color: T.faint }}>
          Dog-Ear · a new issue in your inbox every month
        </div>
      </div>
    </main>
  )
}
