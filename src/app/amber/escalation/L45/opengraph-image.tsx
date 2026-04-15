import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L45 · threshold — the moment something spans'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Deterministic PRNG for a stable OG render
function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0
  return () => {
    s = (s * 1103515245 + 12345) >>> 0
    return ((s >>> 16) & 0x7fff) / 0x7fff
  }
}

export default function OG() {
  const N = 36  // coarser for OG
  const P = 0.605  // just above p_c — spanning cluster exists
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const

  const rand = rng(7)
  const filled: boolean[] = Array(N * N)
  for (let i = 0; i < N * N; i++) filled[i] = rand() < P

  // Flood-fill to find spanning component
  const comp = new Int16Array(N * N).fill(-1)
  let nextId = 0
  let spanId = -1
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const idx = y * N + x
      if (comp[idx] !== -1 || !filled[idx]) continue
      comp[idx] = nextId
      const stack: number[] = [idx]
      let top = (y === 0), bot = (y === N - 1)
      while (stack.length > 0) {
        const k = stack.pop()!
        const ky = (k / N) | 0
        const kx = k - ky * N
        if (ky === 0) top = true
        if (ky === N - 1) bot = true
        for (const [dy, dx] of DIRS) {
          const ny = ky + dy, nx = kx + dx
          if (ny < 0 || ny >= N || nx < 0 || nx >= N) continue
          const n = ny * N + nx
          if (comp[n] !== -1 || !filled[n]) continue
          comp[n] = nextId
          stack.push(n)
        }
      }
      if (spanId === -1 && top && bot) spanId = nextId
      nextId++
    }
  }

  const cellSize = 12
  const gridSize = cellSize * N
  const gx = (1200 - gridSize) / 2
  const gy = 60

  const cells: React.ReactElement[] = []
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const idx = y * N + x
      if (!filled[idx]) continue
      const isSpan = comp[idx] === spanId
      cells.push(
        <div
          key={`${y}-${x}`}
          style={{
            position: 'absolute',
            left: gx + x * cellSize,
            top: gy + y * cellSize,
            width: cellSize - 1,
            height: cellSize - 1,
            background: isSpan ? '#C6FF3C' : '#E8E8E8',
            opacity: isSpan ? 0.95 : 0.55,
          }}
        />
      )
    }
  }

  return new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        background: '#0A0A0A',
        display: 'flex',
        position: 'relative',
        fontFamily: 'monospace',
      }}
    >
      {cells}
      {/* Museum label */}
      <div style={{
        position: 'absolute',
        left: 60,
        bottom: 40,
        display: 'flex',
        flexDirection: 'column',
      }}>
        <span style={{
          fontFamily: 'Georgia, serif',
          fontSize: 56,
          fontStyle: 'italic',
          fontWeight: 300,
          color: '#E8E8E8',
          lineHeight: 1,
        }}>
          threshold
        </span>
        <span style={{
          fontFamily: 'monospace',
          fontSize: 14,
          fontWeight: 700,
          color: 'rgba(232, 232, 232, 0.55)',
          marginTop: 10,
          letterSpacing: 1,
        }}>
          the moment something spans
        </span>
      </div>
      {/* Bottom-right spec */}
      <div style={{
        position: 'absolute',
        right: 60,
        bottom: 28,
        fontFamily: 'monospace',
        fontSize: 12,
        fontWeight: 700,
        color: 'rgba(232, 232, 232, 0.35)',
        letterSpacing: 1,
      }}>
        L45 · percolation · 04.15.26
      </div>
    </div>,
    { ...size },
  )
}
