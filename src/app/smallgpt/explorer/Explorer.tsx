'use client'

// The embedding explorer. Data comes from apps/smallgpt/07-weights/export.py:
// public/smallgpt/explorer/emb.bin (int8 rows with a float32 scale each) and
// tokens.json (token text, counts, k-means cluster, 2-D and 3-D UMAP places).
// Neighbours are cosine similarity over the full 320 numbers, never the map.

import Script from 'next/script'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
  relayout: (el: HTMLElement, update: unknown) => Promise<unknown>
  Plots: { resize: (el: HTMLElement) => void }
  purge: (el: HTMLElement) => void
}
type PlotEl = HTMLDivElement & {
  _fullLayout?: { xaxis: { range: number[] }; yaxis: { range: number[] } }
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

type Layer = { data: Data; unit: Float32Array; raw: Float32Array }

async function loadLayer(dir: string): Promise<Layer> {
  const [d, buf] = await Promise.all([
    fetch(`${dir}/tokens.json`).then((r) => r.json() as Promise<Data>),
    fetch(`${dir}/emb.bin`).then((r) => r.arrayBuffer()),
  ])
  const n = d.tokens.length
  const scale = new Float32Array(buf, 0, n)
  const q = new Int8Array(buf, n * 4)
  const raw = new Float32Array(n * d.dim)
  const unit = new Float32Array(n * d.dim)
  for (let i = 0; i < n; i++) {
    let norm = 0
    for (let j = 0; j < d.dim; j++) {
      const v = q[i * d.dim + j] * scale[i]
      raw[i * d.dim + j] = v
      norm += v * v
    }
    norm = Math.sqrt(norm) || 1
    for (let j = 0; j < d.dim; j++) unit[i * d.dim + j] = raw[i * d.dim + j] / norm
  }
  return { data: d, unit, raw }
}

// The k rows of one depth closest to row i of the same depth, by cosine.
function closest(l: Layer, i: number, k: number, keep: (j: number) => boolean): number[] {
  const dim = l.data.dim
  const v = l.unit.subarray(i * dim, (i + 1) * dim)
  const sims: [number, number][] = []
  for (let j = 0; j < l.data.tokens.length; j++) {
    if (j === i || !keep(j)) continue
    let s = 0
    for (let d = 0; d < dim; d++) s += l.unit[j * dim + d] * v[d]
    sims.push([s, j])
  }
  sims.sort((x, y) => y[0] - x[0])
  return sims.slice(0, k).map(([, j]) => j)
}

// The journey: rows per column and the height of one row, in px (the SVG links are drawn on the same grid).
const ROWS = 10
const ROW = 30

// A token as text people can read: the leading space shown as a dot, new lines as ⏎.
const show = (t: string) => t.replace(/^ /, '·').replace(/\n/g, '⏎')

type Props = {
  // One entry per depth to switch between; the token explorer has just one.
  sources?: { label: string; dir: string }[]
  // true: the entries are whole words (07-weights/export_words.py), not tokens
  words?: boolean
  start?: { a: string; b: string; c: string }
  hint?: string
}

export default function Explorer({
  sources = [{ label: '', dir: BASE }],
  words = false,
  start = { a: 'woman', b: 'man', c: 'he' },
  hint = 'Try Apple − Mac + PC, four − three + five, was − is + have. King and queen are split into pieces by this tokenizer, so king − man + woman can’t be asked.',
}: Props) {
  const [src, setSrc] = useState(0)
  // Every depth is loaded (the one on screen first) so the journey can compare them.
  const [layers, setLayers] = useState<(Layer | null)[]>(() => sources.map(() => null))
  const [plotly, setPlotly] = useState<Plotly | null>(null)
  const [view, setView] = useState<'2d' | '3d'>('2d')
  const [hideRare, setHideRare] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [miss, setMiss] = useState<{ q: string; like: number[] } | null>(null)
  const [arith, setArith] = useState(start)
  const plotRef = useRef<PlotEl>(null)
  // Each depth has its own map, so switching depth re-centres on the selected word at the same zoom.
  const recenter = useRef<{ w: number; h: number } | null>(null)
  const switchLayer = (k: number) => {
    if (k === src) return
    const l = plotRef.current?._fullLayout
    recenter.current =
      view === '2d' && selected !== null && l
        ? { w: l.xaxis.range[1] - l.xaxis.range[0], h: l.yaxis.range[1] - l.yaxis.range[0] }
        : null
    setSrc(k)
  }

  const dirs = sources.map((x) => x.dir).join('|')
  useEffect(() => {
    let alive = true
    ;(async () => {
      for (const [k, dir] of dirs.split('|').entries()) {
        const layer = await loadLayer(dir)
        if (!alive) return
        setLayers((prev) => prev.map((l, j) => (j === k ? layer : l)))
      }
    })()
    return () => {
      alive = false
    }
  }, [dirs])

  const data = layers[src]?.data ?? null
  const unit = layers[src]?.unit ?? null // rows scaled to length 1
  const raw = layers[src]?.raw ?? null // rows as the model has them

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
  // For whole words: as written, then ignoring capitals.
  const find = useCallback(
    (q: string) => {
      if (!data || !q.trim()) return null
      const w = q.trim()
      if (words) {
        const i = data.tokens.indexOf(w)
        if (i >= 0) return i
        const j = data.tokens.findIndex((t) => t.toLowerCase() === w.toLowerCase())
        return j >= 0 ? j : null
      }
      for (const t of [' ' + w, w]) {
        const i = data.tokens.indexOf(t)
        if (i >= 0) return i
      }
      return null
    },
    [data, words],
  )

  const neighbours = useMemo(() => (selected === null ? [] : nearest(row(selected), 20, [selected])), [selected, nearest, row])

  // The selected word's neighbours at every depth. All depths share one word list, so an index means the same word in each.
  // A word's fate is read from the first and last columns: gone (spelling that falls away), kept, or new (meaning that arrives).
  const journey = useMemo(() => {
    if (selected === null || sources.length < 2 || layers.some((l) => !l)) return null
    const cols = layers.map((l) => closest(l!, selected, ROWS, keep))
    const first = new Set(cols[0])
    const last = new Set(cols[cols.length - 1])
    const fate = (i: number) => (first.has(i) ? (last.has(i) ? 'kept' : 'gone') : last.has(i) ? 'new' : 'mid')
    return { cols, fate, gone: cols[0].filter((i) => !last.has(i)).length, arrived: cols[cols.length - 1].filter((i) => !first.has(i)).length }
  }, [selected, sources.length, layers, keep])
  const [hot, setHot] = useState<number | null>(null)

  // Arithmetic takes whole words only (" word"), as step 7's script does: "king" alone is the piece in "making".
  const word = useCallback(
    (q: string) => (words ? find(q) : data && q.trim() ? (i => (i < 0 ? null : i))(data.tokens.indexOf(' ' + q.trim())) : null),
    [data, words, find],
  )

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
    setSelected(null)
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
    // A fresh object per axis: Plotly writes the pan/zoom range back into these, so a shared one made x and y overwrite each other.
    const axis = () => ({ showgrid: false, zeroline: false, showticklabels: false, title: { text: '' } })
    const layout = {
      paper_bgcolor: '#f7efdf',
      plot_bgcolor: '#fbf6ec',
      margin: { l: 0, r: 0, t: 0, b: 0 },
      dragmode: three ? 'orbit' : 'pan',
      hovermode: 'closest',
      showlegend: el.clientWidth > 700,
      legend: { font: { size: 11 }, bgcolor: 'rgba(247,239,223,0.85)', itemsizing: 'constant' },
      uirevision: view,
      xaxis: axis(),
      yaxis: axis(),
      scene: { xaxis: axis(), yaxis: axis(), zaxis: axis(), bgcolor: '#fbf6ec', uirevision: view },
      font: { family: 'Instrument Sans, system-ui, sans-serif', color: '#16121c' },
    }
    plotly.react(el, traces, layout, { responsive: true, scrollZoom: true, displaylogo: false }).then(() => {
      if (recenter.current && selected !== null && !three) {
        const [cx, cy] = data.xy[selected]
        const { w, h } = recenter.current
        recenter.current = null
        plotly.relayout(el, { 'xaxis.range': [cx - w / 2, cx + w / 2], 'yaxis.range': [cy - h / 2, cy + h / 2] })
      }
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

  // Full screen shows the controls and the map only; the journey can fold away to its title.
  const appRef = useRef<HTMLDivElement>(null)
  const [full, setFull] = useState(false)
  useEffect(() => {
    const on = () => setFull(!!(document.fullscreenElement ?? (document as { webkitFullscreenElement?: Element }).webkitFullscreenElement))
    document.addEventListener('fullscreenchange', on)
    document.addEventListener('webkitfullscreenchange', on)
    return () => {
      document.removeEventListener('fullscreenchange', on)
      document.removeEventListener('webkitfullscreenchange', on)
    }
  }, [])
  const toggleFull = () => {
    const el = appRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null
    const doc = document as Document & { webkitExitFullscreen?: () => void }
    if (full) (doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.())
    else if (el) (el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.())
  }
  // Plotly only follows window resizes; entering or leaving full screen resizes the box, not always the window.
  useEffect(() => {
    if (plotly && plotRef.current) requestAnimationFrame(() => plotRef.current && plotly.Plots.resize(plotRef.current))
  }, [full, plotly])
  const [folded, setFolded] = useState(false)
  useEffect(() => {
    try {
      setFolded(localStorage.getItem('sgx:journey-folded') === '1')
    } catch {}
  }, [])
  const fold = () => {
    setFolded(!folded)
    try {
      localStorage.setItem('sgx:journey-folded', folded ? '0' : '1')
    } catch {}
  }

  const ready = data && unit && plotly
  return (
    <div className={`sgx-app${full ? ' is-full' : ''}`} ref={appRef}>
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
        {sources.length > 1 && (
          <div className="sgx-toggle" role="group" aria-label="Depth">
            {sources.map((x, k) => (
              <button key={x.dir} className={src === k ? 'on' : ''} onClick={() => switchLayer(k)}>
                {x.label}
              </button>
            ))}
          </div>
        )}
        {!words && (
          <label className="sgx-check">
            <input type="checkbox" checked={hideRare} onChange={(e) => setHideRare(e.target.checked)} /> hide rare tokens
          </label>
        )}
        <button className="sgx-full" onClick={toggleFull} title={full ? 'Exit full screen (Esc)' : 'Full screen map'}>
          {full ? (
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M6 1v5H1M10 1v5h5M6 15v-5H1M10 15v-5h5" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M1 6V1h5M15 6V1h-5M1 10v5h5M15 10v5h-5" />
            </svg>
          )}
          <span>{full ? 'Exit' : 'Full screen'}</span>
        </button>
      </div>

      {sources.length > 1 && selected !== null && data && (
        <section className={`sgx-journey${hot !== null ? ' has-hot' : ''}`} onMouseLeave={() => setHot(null)}>
          <div className="sgx-jtop">
            <h2>
              <b>{show(data.tokens[selected])}</b>, layer by layer
            </h2>
            <button className="sgx-fold" onClick={fold} aria-expanded={!folded}>
              <svg viewBox="0 0 16 16" aria-hidden className={folded ? 'down' : ''}>
                <path d="M3 10l5-5 5 5" />
              </svg>
              {folded ? 'Show' : 'Hide'}
            </button>
          </div>
          {folded ? null : journey ? (
            <>
              <p className="sgx-jsum">
                Its ten nearest words at each depth. <span className="gone">{journey.gone} of the ten at layer 0 are gone</span> by the
                last layer, <span className="new">{journey.arrived} arrive</span>, <span className="kept">{ROWS - journey.gone} stay</span>.
                Hover a word to follow it.
              </p>
              <div className="sgx-jgrid" style={{ ['--row' as string]: `${ROW}px` }}>
                {journey.cols.map((col, k) => (
                  <Fragment key={k}>
                    {k > 0 && (
                      <svg
                        className="sgx-jlinks"
                        style={{ gridColumn: 2 * k, gridRow: 2 }}
                        viewBox={`0 0 100 ${ROWS * ROW}`}
                        preserveAspectRatio="none"
                        aria-hidden
                      >
                        {col.map((i, b) => {
                          const a = journey.cols[k - 1].indexOf(i)
                          if (a < 0) return null
                          const y1 = a * ROW + ROW / 2
                          const y2 = b * ROW + ROW / 2
                          return (
                            <path
                              key={i}
                              className={`${journey.fate(i)}${hot === i ? ' hot' : ''}`}
                              d={`M0 ${y1} C50 ${y1} 50 ${y2} 100 ${y2}`}
                              vectorEffect="non-scaling-stroke"
                            />
                          )
                        })}
                      </svg>
                    )}
                    <button
                      className={`sgx-jhead${src === k ? ' on' : ''}`}
                      style={{ gridColumn: 2 * k + 1, gridRow: 1 }}
                      onClick={() => switchLayer(k)}
                      title="Show this layer on the map"
                    >
                      {sources[k].label}
                    </button>
                    <ol className="sgx-jcol" style={{ gridColumn: 2 * k + 1, gridRow: 2 }}>
                      {col.map((i) => (
                        <li
                          key={i}
                          className={`${journey.fate(i)}${hot === i ? ' hot' : ''}${journey.cols[k + 1]?.includes(i) ? ' cont' : ''}`}
                          onMouseEnter={() => setHot(i)}
                        >
                          <button onClick={() => choose(i)}>{show(data.tokens[i])}</button>
                        </li>
                      ))}
                    </ol>
                  </Fragment>
                ))}
              </div>
            </>
          ) : (
            <p className="sgx-note">Loading the other layers…</p>
          )}
        </section>
      )}

      <div className="sgx-grid">
        <div className="sgx-map">
          {!ready && <p className="sgx-loading">Loading…</p>}
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
                  <b>{show(data.tokens[selected])}</b> · {data.counts[selected].toLocaleString()} times in{' '}
                  {words ? 'all the posts' : 'the test posts'}
                  {!words && !data.tokens[selected].startsWith(' ') && /^\p{L}/u.test(data.tokens[selected]) && (
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
                {words
                  ? `“${miss.q}” isn’t among the ${data?.tokens.length.toLocaleString()} words here.`
                  : `“${miss.q}” isn’t one token in this vocabulary; the tokenizer splits it into pieces.`}
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
              <p className="sgx-note">
                {words ? 'Not in the list' : 'Not a whole-word token'}: {arithResult.missing.filter(Boolean).join(', ') || 'type three words'}.
              </p>
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
            <p className="sgx-note">{hint}</p>
          </section>
        </aside>
      </div>
    </div>
  )
}
