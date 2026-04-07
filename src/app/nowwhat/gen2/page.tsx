'use client'

import { useEffect, useState, useCallback } from 'react'

interface Candidate {
  id: string
  concept: string
  name: string
  grid: number[][]
  fillPercent: number
  createdAt: string
  approved?: boolean
}

function GridPreview({ grid, size = 6 }: { grid: number[][]; size?: number }) {
  const rows = grid.length
  const cols = grid[0]?.length || 0
  const w = cols * size
  const h = rows * size

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ imageRendering: 'pixelated' }}>
      <rect width={w} height={h} fill="#111" rx="2" />
      {grid.map((row, r) =>
        row.map((cell, c) =>
          cell ? (
            <rect
              key={`${r}-${c}`}
              x={c * size + 1}
              y={r * size + 1}
              width={size - 2}
              height={size - 2}
              fill="rgba(255,255,255,0.75)"
              rx="0.5"
            />
          ) : null
        )
      )}
    </svg>
  )
}

function StatusBadge({ approved }: { approved?: boolean }) {
  if (approved === true) return <span className="text-green-400 text-[10px] font-medium tracking-wide">APPROVED</span>
  if (approved === false) return <span className="text-red-400 text-[10px] font-medium tracking-wide">REJECTED</span>
  return <span className="text-neutral-500 text-[10px] tracking-wide">PENDING</span>
}

export default function Gen2Dashboard() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [stats, setStats] = useState({ total: 0, approved: 0, rejected: 0, pending: 0 })
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [loading, setLoading] = useState(true)
  const [howExpanded, setHowExpanded] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [seedCount, setSeedCount] = useState<number | null>(null)
  const [seedSources, setSeedSources] = useState<string[]>([])
  const [seedWords, setSeedWords] = useState<string[]>([])
  const [showWords, setShowWords] = useState(false)

  const fetchData = useCallback(() => {
    fetch('/api/nowwhat/gen2')
      .then(r => r.json())
      .then(data => {
        const c = (data.candidates || []) as Candidate[]
        setCandidates(c)
        setStats({
          total: c.length,
          approved: c.filter(x => x.approved === true).length,
          rejected: c.filter(x => x.approved === false).length,
          pending: c.filter(x => x.approved === undefined).length,
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchData()
    fetch('/api/nowwhat/gen2/words').then(r => r.json()).then(d => { setSeedCount(d.count); setSeedWords(d.words || []) }).catch(() => {})
    const interval = setInterval(fetchData, 4000)
    return () => clearInterval(interval)
  }, [fetchData])

  const regenerateSeeds = async () => {
    setSeeding(true)
    setSeedSources([])
    try {
      const res = await fetch('/api/nowwhat/gen2/words', { method: 'POST' })
      const data = await res.json()
      setSeedCount(data.count || 0)
      setSeedSources(data.sources || [])
      setSeedWords(data.words || [])
      setShowWords(false)
    } catch { /* silent */ }
    setSeeding(false)
  }

  const judge = async (id: string, approved: boolean) => {
    await fetch('/api/nowwhat/gen2', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, approved }),
    })
    fetchData()
  }

  const filtered = candidates
    .filter(c => {
      if (filter === 'pending') return c.approved === undefined
      if (filter === 'approved') return c.approved === true
      if (filter === 'rejected') return c.approved === false
      return true
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return (
    <div className="min-h-dvh bg-[#0a0a0a] text-neutral-300" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-light text-white tracking-wide">Dashboard</h1>
        </div>

        {/* How this works */}
        <div className="mb-8 text-sm text-neutral-400 leading-relaxed">
          <span>
            The big question behind <a href="/nowwhat" className="underline underline-offset-2 decoration-neutral-600 hover:text-neutral-200 transition-colors">Now what?</a> is how humanity thrives after AGI arrives.{' '}
          </span>
          {!howExpanded ? (
            <button
              onClick={() => setHowExpanded(true)}
              className="text-neutral-500 hover:text-neutral-300 transition-colors"
            >[...]</button>
          ) : (
            <span>
              It starts by pulling recent articles from the web — stories about AGI, democracy, creativity, meaning — and extracting concrete, visual concepts from them: <em>campfire</em>, <em>paper crane</em>, <em>raised fist</em>. An AI then draws each concept as a tiny pixel silhouette. Each drawing enters a physics simulation where momentum tries to assemble it and entropy tries to tear it apart. Most attempts fail. The shapes that survive land here, waiting for a human to decide if they&apos;re worth keeping. The ones you approve join the living display on the{' '}
              <a href="/nowwhat" className="underline underline-offset-2 decoration-neutral-600 hover:text-neutral-200 transition-colors">homepage</a>.
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="flex gap-6 mb-6 text-sm">
          <div><span className="text-neutral-500">total</span> <span className="text-white">{stats.total}</span></div>
          <div><span className="text-neutral-500">pending</span> <span className="text-yellow-400/70">{stats.pending}</span></div>
          <div><span className="text-neutral-500">approved</span> <span className="text-green-400/70">{stats.approved}</span></div>
          <div><span className="text-neutral-500">rejected</span> <span className="text-red-400/70">{stats.rejected}</span></div>
        </div>

        {/* Seed words */}
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={regenerateSeeds}
            disabled={seeding}
            className={`px-4 py-2 rounded-lg text-xs tracking-wide transition-all ${
              seeding
                ? 'bg-white/[0.03] text-neutral-600 cursor-wait'
                : 'bg-white/[0.06] text-neutral-300 hover:bg-white/[0.12] hover:text-white active:scale-95'
            }`}
          >
            {seeding ? 'dreaming up new words...' : 'new seed words'}
          </button>
          {seedCount !== null && (
            <button
              onClick={() => setShowWords(!showWords)}
              className="text-neutral-600 text-[11px] hover:text-neutral-400 transition-colors"
            >{seedCount} concepts in the pool</button>
          )}
        </div>
        {showWords && seedWords.length > 0 && (
          <div className="mb-6 -mt-4 text-[11px] text-neutral-500 leading-relaxed">
            {seedWords.join(' · ')}
          </div>
        )}
        {seedSources.length > 0 && (
          <div className="mb-6 -mt-4 text-[10px] text-neutral-600 leading-relaxed">
            <span className="text-neutral-500">sourced from: </span>
            {seedSources.map((s, i) => (
              <span key={i}>
                {s.startsWith('http') ? (
                  <a href={s} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-neutral-700 hover:text-neutral-400 transition-colors">
                    {new URL(s).hostname}
                  </a>
                ) : s}
                {i < seedSources.length - 1 ? ', ' : ''}
              </span>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 mb-6">
          {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded text-xs transition-colors ${
                filter === f
                  ? 'bg-white/10 text-white'
                  : 'bg-white/[0.03] text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Grid of candidates */}
        {loading ? (
          <div className="text-neutral-500 text-sm">loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-neutral-500 text-sm">
            no shapes yet — open <a href="/nowwhat/alive2" className="underline text-neutral-400">/nowwhat/alive2</a> to start generating
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(c => (
              <div
                key={c.id}
                className={`rounded-lg border p-4 transition-colors ${
                  c.approved === true
                    ? 'border-green-400/20 bg-green-400/[0.03]'
                    : c.approved === false
                    ? 'border-red-400/10 bg-red-400/[0.02] opacity-50'
                    : 'border-white/[0.06] bg-white/[0.02]'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-white text-sm font-light">{c.name}</div>
                    <div className="text-neutral-500 text-[11px]">&ldquo;{c.concept}&rdquo; &middot; {c.fillPercent}%</div>
                  </div>
                  <StatusBadge approved={c.approved} />
                </div>

                <div className="mb-3 flex justify-center">
                  <GridPreview grid={c.grid} size={7} />
                </div>

                {c.approved === undefined && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => judge(c.id, true)}
                      className="flex-1 px-3 py-1.5 rounded text-xs bg-green-400/10 text-green-400 hover:bg-green-400/20 transition-colors"
                    >
                      approve
                    </button>
                    <button
                      onClick={() => judge(c.id, false)}
                      className="flex-1 px-3 py-1.5 rounded text-xs bg-red-400/10 text-red-400 hover:bg-red-400/20 transition-colors"
                    >
                      reject
                    </button>
                  </div>
                )}

                <div className="text-neutral-600 text-[10px] mt-2">
                  {new Date(c.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Links */}
        <div className="mt-8 pt-6 border-t border-neutral-800 flex gap-4 text-xs text-neutral-500">
          <a href="/nowwhat/alive2" className="hover:text-neutral-300 transition-colors underline underline-offset-2">alive2</a>
          <a href="/nowwhat/judge" className="hover:text-neutral-300 transition-colors underline underline-offset-2">old judge</a>
          <a href="/nowwhat" className="hover:text-neutral-300 transition-colors underline underline-offset-2">landing page</a>
        </div>
      </div>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400&display=swap');`}</style>
    </div>
  )
}
