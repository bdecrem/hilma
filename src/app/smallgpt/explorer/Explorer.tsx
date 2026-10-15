'use client'

// The embedding explorer. Data comes from apps/smallgpt/07-weights/export.py:
// public/smallgpt/explorer/emb.bin (int8 rows with a float32 scale each) and
// tokens.json (token text, counts, k-means cluster, 2-D and 3-D UMAP places).
// Neighbours are cosine similarity over the full 320 numbers, never the map.

import Script from 'next/script'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Data = {
  dim: number
  minCount: number
  tokens: string[]
  counts: number[]
  cluster: number[]
  xy: [number, number][]
  xyz: [number, number, number][]
  legend: { size: number; top: string[] }[]
}

type Plotly = {
  react: (el: HTMLElement, data: unknown[], layout: unknown, config: unknown) => Promise<unknown>
  purge: (el: HTMLElement) => void
}
type PlotEl = HTMLDivElement & {
  on?: (ev: string, fn: (e: { points: { customdata: number }[] }) => void) => void
  removeAllListeners?: (ev: string) => void
}

const BASE = '/smallgpt/explorer'
const PLOTLY = 'https://cdnjs.cloudflare.com/ajax/libs/plotly.js/3.1.0/plotly.min.js'
const COLOURS = [
  '#3d3bff', '#ff4b1f', '#16a34a', '#c026d3', '#b45309', '#0891b2', '#e11d48', '#4d7c0f',
  '#7c3aed', '#ea580c', '#0f766e', '#be185d', '#1d4ed8', '#a16207', '#15803d', '#9333ea',
  '#dc2626', '#0369a1', '#65a30d', '#db2777', '#4338ca', '#c2410c', '#047857', '#6d28d9',
]
const RARE = '#cfc5ae'

// A token as text people can read: the leading space shown as a dot, new lines as ⏎.
const show = (t: string) => t.replace(/^ /, '·').replace(/\n/g, '⏎')

export default function Explorer() {
  const [data, setData] = useState<Data | null>(null)
  const [unit, setUnit] = useState<Float32Array | null>(null) // rows scaled to length 1
  const [raw, setRaw] = useState<Float32Array | null>(null) // rows as the model has them
  const [plotly, setPlotly] = useState<Plotly | null>(null)
  const [view, setView] = useState<'2d' | '3d'>('2d')
  const [hideRare, setHideRare] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [miss, setMiss] = useState<{ q: string; like: number[] } | null>(null)
  const [arith, setArith] = useState({ a: 'woman', b: 'man', c: 'he' })
  const plotRef = useRef<PlotEl>(null)

  useEffect(() => {
    Promise.all([
      fetch(`${BASE}/tokens.json`).then((r) => r.json() as Promise<Data>),
      fetch(`${BASE}/emb.bin`).then((r) => r.arrayBuffer()),
    ]).then(([d, buf]) => {
      const n = d.tokens.length
      const scale = new Float32Array(buf, 0, n)
      const q = new Int8Array(buf, n * 4)
      const r = new Float32Array(n * d.dim)
      const u = new Float32Array(n * d.dim)
      for (let i = 0; i < n; i++) {
        let norm = 0
        for (let j = 0; j < d.dim; j++) {
          const v = q[i * d.dim + j] * scale[i]
          r[i * d.dim + j] = v
          norm += v * v
        }
        norm = Math.sqrt(norm) || 1
        for (let j = 0; j < d.dim; j++) u[i * d.dim + j] = r[i * d.dim + j] / norm
      }
      setData(d)
      setRaw(r)
      setUnit(u)
    })
  }, [])

  const usable = useMemo(() => {
    if (!data) return null
    return data.tokens.map((t, i) => data.counts[i] >= data.minCount && /\p{L}/u.test(t))
  }, [data])

  const keep = useCallback((i: number) => !hideRare || (usable?.[i] ?? true), [hideRare, usable])

  // Nearest rows to a vector, by cosine, over all 320 numbers.
  const nearest = useCallback(
    (v: Float32Array, k: number, skip: number[]) => {
      if (!data || !unit) return []
      const dim = data.dim
      let len = 0
      for (let j = 0; j < dim; j++) len += v[j] * v[j]
      len = Math.sqrt(len) || 1
      const sims: [number, number][] = []
      for (let i = 0; i < data.tokens.length; i++) {
        if (skip.includes(i) || !keep(i)) continue
        let s = 0
        for (let j = 0; j < dim; j++) s += unit[i * dim + j] * v[j]
        sims.push([s / len, i])
      }
      sims.sort((x, y) => y[0] - x[0])
      return sims.slice(0, k)
    },
    [data, unit, keep],
  )

  const row = useCallback(
    (i: number) => (raw && data ? raw.subarray(i * data.dim, (i + 1) * data.dim) : new Float32Array()),
    [raw, data],
  )

  // A typed word to a token: " word" first (a word inside a sentence), then "word" as written.
  const find = useCallback(
    (q: string) => {
      if (!data || !q.trim()) return null
      const w = q.trim()
      for (const t of [' ' + w, w]) {
        const i = data.tokens.indexOf(t)
        if (i >= 0) return i
      }
      return null
    },
    [data],
  )

  const neighbours = useMemo(() => (selected === null ? [] : nearest(row(selected), 20, [selected])), [selected, nearest, row])

  // Arithmetic takes whole words only (" word"), as step 7's script does: "king" alone is the piece in "making".
  const word = useCallback((q: string) => (data && q.trim() ? (i => (i < 0 ? null : i))(data.tokens.indexOf(' ' + q.trim())) : null), [data])

  const arithResult = useMemo(() => {
    const find = word
    const ia = find(arith.a), ib = find(arith.b), ic = find(arith.c)
    if (ia === null || ib === null || ic === null || !data) return { missing: [arith.a, arith.b, arith.c].filter((w) => find(w) === null), hits: [] as [number, number][] }
    const v = new Float32Array(data.dim)
    const A = row(ia), B = row(ib), C = row(ic)
    for (let j = 0; j < data.dim; j++) v[j] = A[j] - B[j] + C[j]
    return { missing: [] as string[], hits: nearest(v, 10, [ia, ib, ic]) }
  }, [arith, word, row, nearest, data])

  const search = (q: string) => {
    setQuery(q)
    const i = find(q)
    if (i !== null) {
      setSelected(i)
      setMiss(null)
      return
    }
    if (!data || !q.trim()) return setMiss(null)
    const w = q.trim().toLowerCase()
    const like = data.tokens
      .map((t, k) => [t, k] as const)
      .filter(([t, k]) => keep(k) && t.toLowerCase().includes(w))
      .sort((x, y) => data.counts[y[1]] - data.counts[x[1]])
      .slice(0, 10)
      .map(([, k]) => k)
    setMiss({ q: q.trim(), like })
  }

  // Draw the map: one trace per cluster (its colour and legend entry), rare tokens in grey, then the selection on top.
  useEffect(() => {
    const el = plotRef.current
    if (!plotly || !data || !el) return
    const three = view === '3d'
    const kind = three ? 'scatter3d' : 'scattergl'
    const at = (ids: number[]) =>
      three
        ? { x: ids.map((i) => data.xyz[i][0]), y: ids.map((i) => data.xyz[i][1]), z: ids.map((i) => data.xyz[i][2]) }
        : { x: ids.map((i) => data.xy[i][0]), y: ids.map((i) => data.xy[i][1]) }
    const groups = new Map<number, number[]>()
    data.tokens.forEach((_, i) => {
      if (!keep(i)) return
      const c = usable?.[i] ? data.cluster[i] : -1
      groups.set(c, [...(groups.get(c) ?? []), i])
    })
    const traces: unknown[] = [...groups.entries()]
      .sort((x, y) => x[0] - y[0])
      .map(([c, ids]) => ({
        type: kind,
        mode: 'markers',
        name: c < 0 ? 'rare or not a word' : data.legend[c].top.slice(0, 3).join(', '),
        ...at(ids),
        customdata: ids,
        text: ids.map((i) => show(data.tokens[i])),
        hovertemplate: '%{text}<extra></extra>',
        marker: { size: three ? 2.2 : 4, color: c < 0 ? RARE : COLOURS[c % COLOURS.length], opacity: 0.8 },
      }))
    // The selection is drawn as plain SVG in 2-D: WebGL text (scattergl) throws in Plotly 3.1.
    const pick = (ids: number[], colour: string, size: number, name: string) => ({
      type: three ? 'scatter3d' : 'scatter',
      mode: 'markers+text',
      name,
      showlegend: false,
      ...at(ids),
      customdata: ids,
      text: ids.map((i) => show(data.tokens[i])),
      textposition: 'top center',
      textfont: { size: 12, color: '#16121c' },
      hovertemplate: '%{text}<extra></extra>',
      marker: { size, color: colour, line: { color: '#16121c', width: 1.5 } },
    })
    if (selected !== null) {
      traces.push(pick(neighbours.map(([, i]) => i), '#ffc31f', three ? 4 : 9, 'neighbours'))
      traces.push(pick([selected], '#ff4b1f', three ? 7 : 15, 'selected'))
    }
    const axis = { showgrid: false, zeroline: false, showticklabels: false, title: { text: '' } }
    const layout = {
      paper_bgcolor: '#f7efdf',
      plot_bgcolor: '#fbf6ec',
      margin: { l: 0, r: 0, t: 0, b: 0 },
      dragmode: three ? 'orbit' : 'pan',
      hovermode: 'closest',
      showlegend: el.clientWidth > 700,
      legend: { font: { size: 11 }, bgcolor: 'rgba(247,239,223,0.85)', itemsizing: 'constant' },
      uirevision: view,
      xaxis: axis,
      yaxis: axis,
      scene: { xaxis: axis, yaxis: axis, zaxis: axis, bgcolor: '#fbf6ec', uirevision: view },
      font: { family: 'Instrument Sans, system-ui, sans-serif', color: '#16121c' },
    }
    plotly.react(el, traces, layout, { responsive: true, scrollZoom: true, displaylogo: false }).then(() => {
      el.removeAllListeners?.('plotly_click')
      el.on?.('plotly_click', (e) => {
        const i = e.points[0]?.customdata
        if (typeof i === 'number') {
          setSelected(i)
          setQuery(data.tokens[i].trim())
          setMiss(null)
        }
      })
    })
  }, [plotly, data, view, keep, usable, selected, neighbours])

  const choose = (i: number) => {
    setSelected(i)
    setQuery(data?.tokens[i].trim() ?? '')
    setMiss(null)
  }

  const ready = data && unit && plotly
  return (
    <>
      <Script src={PLOTLY} strategy="afterInteractive" onReady={() => setPlotly((window as unknown as { Plotly: Plotly }).Plotly)} />
      <div className="sgx-controls">
        <input
          className="sgx-search"
          type="search"
          placeholder="Type a word: Mac, modem, Monday…"
          value={query}
          onChange={(e) => search(e.target.value)}
          aria-label="Find a token"
        />
        <div className="sgx-toggle" role="group" aria-label="Map">
          <button className={view === '2d' ? 'on' : ''} onClick={() => setView('2d')}>
            2-D
          </button>
          <button className={view === '3d' ? 'on' : ''} onClick={() => setView('3d')}>
            3-D
          </button>
        </div>
        <label className="sgx-check">
          <input type="checkbox" checked={hideRare} onChange={(e) => setHideRare(e.target.checked)} /> hide rare tokens
        </label>
      </div>

      <div className="sgx-grid">
        <div className="sgx-map">
          {!ready && <p className="sgx-loading">Loading 8,192 tokens…</p>}
          <div ref={plotRef} className="sgx-plot" />
          <p className="sgx-hint">
            {view === '2d' ? 'Drag to pan, scroll or pinch to zoom, hover for the token, click to select.' : 'Drag to spin, scroll to zoom, click a dot to select.'}{' '}
            Colours are 24 clusters found automatically in the full 320 numbers.
          </p>
        </div>

        <aside className="sgx-side">
          <section>
            <h2>Nearest 20</h2>
            {selected !== null && data ? (
              <>
                <p className="sgx-sel">
                  <b>{show(data.tokens[selected])}</b> · seen {data.counts[selected].toLocaleString()} times in the test posts
                  {!data.tokens[selected].startsWith(' ') && /^\p{L}/u.test(data.tokens[selected]) && (
                    <> · no leading space: a piece used inside or at the start of words</>
                  )}
                </p>
                <ol className="sgx-list">
                  {neighbours.map(([s, i]) => (
                    <li key={i}>
                      <button onClick={() => choose(i)}>{show(data.tokens[i])}</button>
                      <span>{s.toFixed(2)}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : miss ? (
              <p className="sgx-note">
                “{miss.q}” isn’t one token in this vocabulary; the tokenizer splits it into pieces.
                {miss.like.length > 0 && (
                  <>
                    {' '}
                    Tokens that contain it:{' '}
                    {miss.like.map((i) => (
                      <button key={i} className="sgx-chip" onClick={() => choose(i)}>
                        {show(data!.tokens[i])}
                      </button>
                    ))}
                  </>
                )}
              </p>
            ) : (
              <p className="sgx-note">Search for a word or click a dot. The list is measured in all 320 dimensions, so it can disagree with the map.</p>
            )}
          </section>

          <section>
            <h2>Word arithmetic</h2>
            <div className="sgx-arith">
              <input value={arith.a} onChange={(e) => setArith({ ...arith, a: e.target.value })} aria-label="start from" />
              <span>−</span>
              <input value={arith.b} onChange={(e) => setArith({ ...arith, b: e.target.value })} aria-label="minus" />
              <span>+</span>
              <input value={arith.c} onChange={(e) => setArith({ ...arith, c: e.target.value })} aria-label="plus" />
            </div>
            {arithResult.missing.length > 0 ? (
              <p className="sgx-note">Not a whole-word token: {arithResult.missing.filter(Boolean).join(', ') || 'type three words'}.</p>
            ) : (
              <ol className="sgx-list">
                {arithResult.hits.map(([s, i]) => (
                  <li key={i}>
                    <button onClick={() => choose(i)}>{show(data!.tokens[i])}</button>
                    <span>{s.toFixed(2)}</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="sgx-note">
              Try Apple − Mac + PC, four − three + five, was − is + have. King and queen are split into pieces by this
              tokenizer, so king − man + woman can’t be asked.
            </p>
          </section>
        </aside>
      </div>
    </>
  )
}
