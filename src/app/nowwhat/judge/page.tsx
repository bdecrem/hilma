'use client'

import { useEffect, useState, useCallback } from 'react'

interface Winner {
  id: string
  name: string
  reason: string
  grid: number[][]
  createdAt: string
  fillPercent: number
  humanApproved?: boolean
  sonnetReason?: string
}

function GridPreview({ grid }: { grid: number[][] }) {
  const rows = grid.length
  const cols = grid[0]?.length || 0
  const cellSize = 8
  const w = cols * cellSize
  const h = rows * cellSize

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ imageRendering: 'pixelated' }}>
      <rect width={w} height={h} fill="#000" />
      {grid.map((row, r) =>
        row.map((cell, c) =>
          cell ? (
            <rect
              key={`${r}-${c}`}
              x={c * cellSize + 1}
              y={r * cellSize + 1}
              width={cellSize - 2}
              height={cellSize - 2}
              fill="rgba(255,255,255,0.8)"
            />
          ) : null
        )
      )}
    </svg>
  )
}

function StatusBadge({ winner }: { winner: Winner }) {
  if (winner.humanApproved === true) return <span style={{ color: '#4f4', fontSize: 11 }}>SONNET APPROVED</span>
  if (winner.humanApproved === false) return <span style={{ color: '#f44', fontSize: 11 }}>SONNET REJECTED</span>
  return <span style={{ color: '#aa8', fontSize: 11 }}>HAIKU ONLY</span>
}

export default function JudgePage() {
  const [winners, setWinners] = useState<Winner[]>([])
  const [stats, setStats] = useState({ evaluated: 0, accepted: 0 })
  const [loading, setLoading] = useState(true)

  const fetchWinners = useCallback(() => {
    fetch('/api/nowwhat/winners')
      .then(r => r.json())
      .then(data => {
        setWinners(data.winners || [])
        setStats({ evaluated: data.totalEvaluated || 0, accepted: data.totalAccepted || 0 })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchWinners()
    const interval = setInterval(fetchWinners, 5000)
    return () => clearInterval(interval)
  }, [fetchWinners])

  const judge = async (id: string, approved: boolean) => {
    await fetch(`/api/nowwhat/winners/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ humanApproved: approved }),
    })
    fetchWinners()
  }

  const pending = winners.filter(w => w.humanApproved === undefined)
  const approved = winners.filter(w => w.humanApproved === true)
  const rejected = winners.filter(w => w.humanApproved === false)

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#0a0a0a',
      color: '#ccc',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      padding: '3vh 4vw',
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400&display=swap');`}</style>

      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 300, color: '#fff', letterSpacing: '0.08em', margin: 0 }}>
          Now What? — Human Judge
        </h1>
        <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
          {stats.evaluated} evaluated by AI &middot; {stats.accepted} accepted &middot; {approved.length} human-approved &middot; {pending.length} pending
        </p>
      </div>

      {loading && <p style={{ color: '#666' }}>Loading...</p>}

      {pending.length > 0 && (
        <Section title="Pending Review">
          {pending.map(w => (
            <Card key={w.id} winner={w} onJudge={judge} />
          ))}
        </Section>
      )}

      {approved.length > 0 && (
        <Section title="Approved">
          {approved.map(w => (
            <Card key={w.id} winner={w} onJudge={judge} />
          ))}
        </Section>
      )}

      {rejected.length > 0 && (
        <Section title="Rejected">
          {rejected.map(w => (
            <Card key={w.id} winner={w} onJudge={judge} />
          ))}
        </Section>
      )}

      {!loading && winners.length === 0 && (
        <p style={{ color: '#444', fontSize: 14, marginTop: 40 }}>
          No AI-accepted shapes yet. Keep /nowwhat/alive running.
        </p>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 14, fontWeight: 400, color: '#888', letterSpacing: '0.06em', marginBottom: 16, textTransform: 'uppercase' }}>
        {title}
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
        {children}
      </div>
    </div>
  )
}

function Card({ winner, onJudge }: { winner: Winner; onJudge: (id: string, approved: boolean) => void }) {
  return (
    <div style={{
      background: '#141414',
      border: '1px solid #222',
      borderRadius: 6,
      padding: 16,
      width: 240,
    }}>
      <div style={{ marginBottom: 10 }}>
        <GridPreview grid={winner.grid} />
      </div>
      <div style={{ fontSize: 14, color: '#fff', fontWeight: 400, marginBottom: 4 }}>
        {winner.name}
      </div>
      <div style={{ fontSize: 11, color: '#666', marginBottom: 4, lineHeight: 1.4 }}>
        <span style={{ color: '#555' }}>Haiku:</span> {winner.reason}
      </div>
      {winner.sonnetReason && (
        <div style={{ fontSize: 11, color: winner.humanApproved ? '#5a5' : '#a55', marginBottom: 4, lineHeight: 1.4 }}>
          <span style={{ color: '#555' }}>Sonnet:</span> {winner.sonnetReason}
        </div>
      )}
      <div style={{ fontSize: 10, color: '#444', marginBottom: 10 }}>
        {new Date(winner.createdAt).toLocaleString()} &middot; {winner.fillPercent}% fill &middot; <StatusBadge winner={winner} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onJudge(winner.id, true)}
          style={{
            flex: 1,
            padding: '6px 0',
            background: winner.humanApproved === true ? '#1a3a1a' : '#1a1a1a',
            border: `1px solid ${winner.humanApproved === true ? '#3a5' : '#333'}`,
            borderRadius: 4,
            color: winner.humanApproved === true ? '#4f4' : '#888',
            fontSize: 11,
            cursor: 'pointer',
            letterSpacing: '0.05em',
          }}
        >
          APPROVE
        </button>
        <button
          onClick={() => onJudge(winner.id, false)}
          style={{
            flex: 1,
            padding: '6px 0',
            background: winner.humanApproved === false ? '#3a1a1a' : '#1a1a1a',
            border: `1px solid ${winner.humanApproved === false ? '#a53' : '#333'}`,
            borderRadius: 4,
            color: winner.humanApproved === false ? '#f44' : '#888',
            fontSize: 11,
            cursor: 'pointer',
            letterSpacing: '0.05em',
          }}
        >
          REJECT
        </button>
      </div>
    </div>
  )
}
