'use client'

import { useEffect, useState } from 'react'

type Chunk = { key: string; label: string; status: string; n: number; cost_usd: number; searches: number; reads: number; started_at: string | null; finished_at: string | null }
type Country = {
  id: number; iso: string; slug: string; name: string; status: string; note: string | null; model: string | null
  chunks_done: number; chunks_total: number; questions_done: number; questions_total: number
  calls: number; searches: number; reads: number; in_tokens: number; out_tokens: number; cost_usd: number
  started_at: string | null; finished_at: string | null; updated_at: string
  citations: number; laws: number; texts: number
  scores: Record<string, number> | null
  chunks: Chunk[]
}
type Recent = { id: number; country: string; iso: string; chunk: string | null; kind: string; text: string; url: string | null; at: string }
type Data = {
  now: string
  countries: Country[]
  recent: Recent[]
  answers: number
  totals: { cost_usd: number; searches: number; reads: number; calls: number; in_tokens: number; out_tokens: number }
}

const TIER: Record<string, string> = { PRT: 'easy', NOR: 'easy', PHL: 'medium', CRI: 'medium', QAT: 'harder', CHN: 'harder' }
const STATUS_LABEL: Record<string, string> = {
  preparing: 'preparing', queued: 'queued', mapping: 'mapping the law', coding: 'coding', scoring: 'scoring',
  laws: 'tracing the laws', done: 'done', error: 'error',
}
const ACTIVE = new Set(['mapping', 'coding', 'scoring', 'laws'])
const POLL_MS = 5000
const fmt = (n: number) => n.toLocaleString('en-US')
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`
}
function dur(from: string, to: string | null, now: number) {
  const s = Math.max(0, Math.round(((to ? new Date(to).getTime() : now) - new Date(from).getTime()) / 1000))
  return s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

const PLAN = [
  ['Codebook', 'Every indicator with the answer options and scores the database uses, worked examples from the 46 coded countries, the implementation scale.'],
  ['Map the law', 'For each country: the constitution, the immigration, asylum, nationality and labor acts, the treaties it has ratified, the portals that carry the official texts.'],
  ['Code the indicators', '18 chunks of related indicators per country, three at a time, each a Claude Code session on Opus 5.5: it searches the official portals, reads the articles, answers each indicator in the database\'s own options, writes the citation, rates implementation from documented practice.'],
  ['Score and summarise', 'Protection, Implementation and Adjusted scores per category, computed the way the database computes them, and a country overview in English, Spanish and French.'],
  ['Trace the laws', 'Yesterday\'s crawl runs over the new citations: every statute named is found on its official portal and stored in full text.'],
  ['Publish, flagged', 'The dossier appears in the library with an EXPERIMENTAL badge; every row it produced carries experimental = true in the database.'],
]

function stageOf(cs: Country[]) {
  if (cs.every(c => c.status === 'preparing')) return { i: 0, text: 'Building the pipeline' }
  const run = cs.find(c => ACTIVE.has(c.status))
  if (run) {
    const i = { mapping: 1, coding: 2, scoring: 3, laws: 4 }[run.status] ?? 2
    return { i, text: `${PLAN[i][0]}: ${run.name}` }
  }
  if (cs.every(c => c.status === 'done')) return { i: 5, text: 'All six published' }
  const err = cs.find(c => c.status === 'error')
  if (err) return { i: 2, text: `Stopped on ${err.name}` }
  return { i: 1, text: 'Between countries' }
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
        const r = await fetch('/api/mrd/dossiers', { cache: 'no-store' })
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

  if (!data) {
    return (
      <main className="wrap">
        <p className="eyebrow">MRD · six new dossiers</p>
        <p className="loading">{error ? `Can't reach the database: ${error}` : 'Loading…'}</p>
      </main>
    )
  }

  const cs = data.countries
  const lastBeat = cs.map(c => c.updated_at).sort().at(-1)
  const active = lastBeat ? now - new Date(lastBeat).getTime() < 120_000 && cs.some(c => ACTIVE.has(c.status)) : false
  const stage = stageOf(cs)
  const qDone = cs.reduce((a, c) => a + c.questions_done, 0)
  const qTotal = cs.reduce((a, c) => a + c.questions_total, 0)
  const cits = cs.reduce((a, c) => a + c.citations, 0)
  const t = data.totals

  return (
    <main className="wrap">
      <header className="top">
        <div className="eyebrow">
          <span>MRD · six new dossiers · <a href="/mrd/crawl">the crawl</a> · <a href="/mrd">the library</a></span>
          <span className={`live ${active ? 'on' : ''}`}>
            <i />{active ? 'running' : stage.i === 0 ? 'preparing' : 'idle'} · updated {fetchedAt ? ago(new Date(fetchedAt).toISOString(), now) : '—'}
          </span>
        </div>
        <h1>Six countries the database doesn&apos;t cover yet, <em>coded the way it codes them.</em></h1>
        <p className="lede">
          The Migrant Rights Database scores 46 countries on 68 indicators of migrants&apos; rights: what the law protects, how far it is applied,
          a citation for every answer. Claude is compiling the same dossier for Portugal, Norway, the Philippines, Costa Rica, Qatar and China,
          one after the other. Everything it produces is marked <span className="flag">experimental</span> and kept apart from the human-coded data.
        </p>
        {error && <p className="warn">Last refresh failed: {error}</p>}
      </header>

      <div className="phase">
        <span className="stage">now</span>
        <span className="what">{stage.text}</span>
        <span className="why">{cs.find(c => ACTIVE.has(c.status))?.note ?? cs.find(c => c.status === 'preparing')?.note ?? PLAN[stage.i][1]}</span>
      </div>

      <section className="stats">
        <Stat label="Indicators coded" value={fmt(qDone)} sub={`of ${fmt(qTotal)} · ${pct(qDone, qTotal)}%`} />
        <Stat label="Citations written" value={fmt(cits)} sub={`${fmt(data.answers)} answers stored`} />
        <Stat label="Research" value={fmt(t.searches)} sub={`web searches · ${fmt(t.reads)} pages read`} />
        <Stat label="API-equivalent spend" value={`$${Number(t.cost_usd).toFixed(2)}`} sub={`on the Max plan · ${fmt(t.calls)} model turns · ${fmt(Math.round((t.in_tokens + t.out_tokens) / 1000))}k tokens`} />
      </section>

      <section className="dossiers">
        {cs.map(c => {
          const st = ACTIVE.has(c.status) ? 'running' : c.status === 'done' ? 'done' : c.status === 'error' ? 'error' : ''
          const chunks = c.chunks.length ? c.chunks : Array.from({ length: 18 }, (_, i) => ({ key: String(i), label: '', status: 'pending', n: 0, cost_usd: 0, searches: 0, reads: 0, started_at: null, finished_at: null }))
          return (
            <article key={c.id} className={`dossier ${st}`}>
              <div className="dhead">
                <h2>{c.name}</h2>
                <span className="tier">{TIER[c.iso]}</span>
                <span className={`state ${st}`}>{STATUS_LABEL[c.status] ?? c.status}{c.started_at ? ` · ${dur(c.started_at, c.finished_at, now)}` : ''}</span>
              </div>
              <div className="bar" aria-label={`${c.questions_done} of ${c.questions_total} indicators`}>
                <span className="fill" style={{ width: `${pct(c.questions_done, c.questions_total)}%` }} />
              </div>
              <div className="chunks" title="18 chunks of related indicators">
                {chunks.map(ch => <span key={ch.key} className={`chunk ${ch.status}`} title={ch.label ? `${ch.label} · ${ch.status}` : undefined} />)}
              </div>
              <div className="dnums">
                <div className="dnum"><b>{c.questions_done}/{c.questions_total}</b><span>indicators</span></div>
                <div className="dnum"><b>{fmt(c.searches)}</b><span>searches</span></div>
                <div className="dnum"><b>{fmt(c.reads)}</b><span>pages read</span></div>
                <div className="dnum"><b>${Number(c.cost_usd).toFixed(2)}</b><span>API-equiv.</span></div>
              </div>
              {c.scores && (
                <div className="scores">
                  <span>Protection <b>{Math.round(c.scores.Protection ?? 0)}</b></span>
                  <span>Implementation <b>{Math.round(c.scores.Implementation ?? 0)}</b></span>
                  <span>Adjusted <b>{Math.round(c.scores.Adjusted ?? 0)}</b></span>
                </div>
              )}
              {c.status === 'done' && (
                <div className="scores"><span>{c.laws} laws traced, <b>{c.texts}</b> in full text · <a href={`/mrd/countries/${c.slug.replace(/_/g, '-')}`}>open the dossier →</a></span></div>
              )}
              <p className={`dnote ${st === 'running' ? 'live' : ''}`}>{c.note ?? (c.status === 'queued' ? 'Waiting its turn.' : '')}</p>
            </article>
          )
        })}
      </section>

      <div className="cols">
        <section className="panel">
          <h3>Latest</h3>
          {data.recent.length === 0 && <p className="detail">Nothing yet. The first entries appear when the compiler starts on Portugal.</p>}
          <ol className="feed">
            {data.recent.map(r => (
              <li key={r.id}>
                <span className={`dot ${r.kind}`} />
                <div>
                  <p className="fname">{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.text}</a> : r.text}</p>
                  <p className="fmeta">{r.country}{r.chunk ? ` · ${r.chunk.replace(/_/g, ' ')}` : ''} · {r.kind} · {ago(r.at, now)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="side">
          <section className="panel">
            <h3>The method</h3>
            <ol className="plan">
              {PLAN.map(([title, detail], i) => (
                <li key={title} className={i === stage.i ? 'on' : i < stage.i ? 'past' : ''}>
                  <span className="num">{i + 1}</span>
                  <div><b>{title}</b><br /><span style={{ color: 'var(--mute)' }}>{detail}</span></div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      <footer className="foot">
        Experimental: compiled by Claude Opus 5.5 through Claude Code, with web research, not by the Migrant Rights Initiative&apos;s coders. Spend is what the same calls would cost on the API; they run on the Max plan. Scripts in apps/mrd/dossiers.
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
