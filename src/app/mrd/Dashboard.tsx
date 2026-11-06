'use client'

import { useEffect, useMemo, useState } from 'react'

type Country = { iso: string; name: string; citations: number; extracted: number; laws: number; found: number; missing: number }
type Recent = { name: string; country: string; iso: string; kind: string; status: string; domain: string | null; url: string | null; year: number | null; at: string }
type Run = { step: string; status: string; done: number; total: number; calls: number; searches: number; cost_usd: number; note: string | null; started_at: string; updated_at: string }
type Data = {
  now: string
  citations: { total: number; extracted: number }
  laws: number
  links: number
  by_status: Record<string, number>
  by_kind: Record<string, number>
  texts: { count: number; chars: number; official: number }
  countries: Country[]
  recent: Recent[]
  runs: Run[]
}

const KIND_LABEL: Record<string, string> = {
  statute: 'Statutes', court_decision: 'Court decisions', decree: 'Decrees', regulation: 'Regulations',
  treaty: 'Treaties', administrative_guidance: 'Guidance', constitution: 'Constitutions',
  executive_order: 'Executive orders', other: 'Other',
}
const STATUS_LABEL: Record<string, string> = {
  pending: 'waiting', found: 'found', not_found: 'not found', paywalled: 'paywalled', error: 'error', skipped: 'skipped',
}
const POLL_MS = 5000

const fmt = (n: number) => n.toLocaleString('en-US')
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

export default function Dashboard() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch('/api/mrd/stats', { cache: 'no-store' })
        const j = await r.json()
        if (!alive) return
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        setData(j); setError(null); setFetchedAt(Date.now())
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    }
    load()
    const poll = setInterval(load, POLL_MS)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => { alive = false; clearInterval(poll); clearInterval(tick) }
  }, [])

  const runs = useMemo(() => Object.fromEntries((data?.runs ?? []).map(r => [r.step, r])), [data])
  const spent = (data?.runs ?? []).reduce((a, r) => a + Number(r.cost_usd), 0)
  const searches = (data?.runs ?? []).reduce((a, r) => a + r.searches, 0)
  const lastBeat = (data?.runs ?? []).map(r => r.updated_at).sort().at(-1)
  const active = lastBeat ? now - new Date(lastBeat).getTime() < 60_000 && (data?.runs ?? []).some(r => r.status === 'running') : false

  if (!data) {
    return (
      <main className="wrap">
        <p className="eyebrow">MRD · source law crawl</p>
        <p className="loading">{error ? `Can't reach the database: ${error}` : 'Loading…'}</p>
      </main>
    )
  }

  const st = data.by_status
  const found = st.found ?? 0
  const missing = (st.not_found ?? 0) + (st.paywalled ?? 0) + (st.error ?? 0)
  const pending = (st.pending ?? 0)
  const kinds = Object.entries(data.by_kind).sort((a, b) => b[1] - a[1])
  const kindMax = Math.max(1, ...kinds.map(k => k[1]))
  const extract = runs.extract
  const find = runs.find

  return (
    <main className="wrap">
      <header className="top">
        <div className="eyebrow">
          <span>MRD · source law crawl</span>
          <span className={`live ${active ? 'on' : ''}`}>
            <i />{active ? 'running' : 'idle'} · updated {fetchedAt ? ago(new Date(fetchedAt).toISOString(), now) : '—'}
          </span>
        </div>
        <h1>Every law behind the Migrant Rights Database, <em>traced to its source.</em></h1>
        <p className="lede">
          Cornell&apos;s Migrant Rights Database scores 45 countries on 66 indicators and backs each answer with a citation.
          This crawl reads those {fmt(data.citations.total)} citations, names every statute, regulation and court decision
          they rely on, and goes looking for the official text.
        </p>
        {error && <p className="warn">Last refresh failed: {error}</p>}
      </header>

      <section className="stats">
        <Stat label="Citations read" value={fmt(data.citations.extracted)} sub={`of ${fmt(data.citations.total)}`} />
        <Stat label="Laws identified" value={fmt(data.laws)} sub={`${fmt(data.links)} links to indicators`} />
        <Stat label="Texts stored" value={fmt(data.texts.count)} sub={data.texts.count ? `${fmt(data.texts.official)} from official sites` : 'search not started'} />
        <Stat label="Spent" value={`$${spent.toFixed(2)}`} sub={`${fmt(searches)} web searches`} />
      </section>

      <section className="steps">
        <Step n={1} title="Read the citations" run={extract} now={now}
          done={data.citations.extracted} total={data.citations.total}
          detail="Haiku lists every legal instrument each citation names, with articles and quotes." />
        <div className="step">
          <div className="step-head">
            <span className="num">2</span>
            <h2>Find the official text</h2>
            <span className="state">{find ? find.status : 'not started'}{find ? ` · ${ago(find.updated_at, now)}` : ''}</span>
          </div>
          <div className="bar stacked" aria-label={`${found} found, ${missing} missing, ${pending} waiting`}>
            <span className="found" style={{ width: `${pct(found, data.laws)}%` }} />
            <span className="missing" style={{ width: `${pct(missing, data.laws)}%` }} />
          </div>
          <div className="legend">
            <span><i className="found" />{fmt(found)} found</span>
            <span><i className="missing" />{fmt(missing)} not found</span>
            <span><i className="pending" />{fmt(pending)} waiting</span>
          </div>
          <p className="detail">Search official law portals and court sites, pick the right document, download it and keep the full text.</p>
        </div>
      </section>

      <div className="cols">
        <section className="panel">
          <h3>Countries</h3>
          <div className="grid">
            {data.countries.map(c => {
              const read = pct(c.extracted, c.citations)
              return (
                <div key={c.iso} className={`tile ${read === 100 ? 'read' : read > 0 ? 'reading' : ''}`} title={`${c.name}: ${c.extracted}/${c.citations} citations read, ${c.laws} laws, ${c.found} found`}>
                  <span className="cname">{c.name}</span>
                  <span className="cnum">{c.laws || '·'}</span>
                  <span className="mini">
                    {c.laws > 0
                      ? <><b className="found" style={{ width: `${pct(c.found, c.laws)}%` }} /><b className="missing" style={{ width: `${pct(c.missing, c.laws)}%` }} /></>
                      : <b className="readbar" style={{ width: `${read}%` }} />}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="note">Number = laws identified. Bar = share found, or citations read before any laws appear.</p>
        </section>

        <div className="side">
          <section className="panel">
            <h3>What the citations rely on</h3>
            <ul className="kinds">
              {kinds.map(([k, n]) => (
                <li key={k}>
                  <span className="klabel">{KIND_LABEL[k] ?? k}</span>
                  <span className="kbar"><b style={{ width: `${(n / kindMax) * 100}%` }} /></span>
                  <span className="kn">{fmt(n)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <h3>Latest</h3>
            <ol className="feed">
              {data.recent.map((r, i) => (
                <li key={`${r.iso}-${r.name}-${i}`}>
                  <span className={`dot ${r.status}`} />
                  <div>
                    <p className="fname">
                      {r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.name}</a> : r.name}
                      {r.year && !r.name.includes(String(r.year)) ? <span className="fyear"> {r.year}</span> : null}
                    </p>
                    <p className="fmeta">{r.country} · {KIND_LABEL[r.kind]?.replace(/s$/, '').toLowerCase() ?? r.kind} · {STATUS_LABEL[r.status] ?? r.status}{r.domain ? ` · ${r.domain}` : ''} · {ago(r.at, now)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      <footer className="foot">
        Source: migrantrightsinitiative.org (Cornell Law School). Data lives in its own Supabase project; scripts in apps/mrd.
      </footer>
    </main>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="stat">
      <p className="slabel">{label}</p>
      <p className="svalue">{value}</p>
      <p className="ssub">{sub}</p>
    </div>
  )
}

function Step({ n, title, run, now, done, total, detail }: { n: number; title: string; run?: Run; now: number; done: number; total: number; detail: string }) {
  return (
    <div className="step">
      <div className="step-head">
        <span className="num">{n}</span>
        <h2>{title}</h2>
        <span className="state">{run ? run.status : 'not started'}{run ? ` · ${ago(run.updated_at, now)}` : ''}</span>
      </div>
      <div className="bar"><span className="fill" style={{ width: `${pct(done, total)}%` }} /></div>
      <div className="legend"><span>{fmt(done)} / {fmt(total)}</span><span>{pct(done, total)}%</span></div>
      <p className="detail">{detail}</p>
    </div>
  )
}
