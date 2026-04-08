import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L32 — the magnetic pendulum'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const MAG_COLORS = ['#FF4E50', '#F9D423', '#B4E33D']

function makeMagnets(r = 0.85): [number, number][] {
  return [0, 1, 2].map(i => {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / 3
    return [Math.cos(a) * r, Math.sin(a) * r]
  })
}

type FracCell = { mi: number; brightness: number }

function computeFractal(N: number): FracCell[] {
  const mags = makeMagnets()
  const result: FracCell[] = []
  const MAX = 400

  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      const sx = (col / N) * 4 - 2
      const sy = (row / N) * 4 - 2
      let x = sx, y = sy, vx = 0, vy = 0
      const k = 0.5, b = 0.18, C = 1.2, h2 = 0.04, dt = 0.03
      let step = MAX

      for (let s = 0; s < MAX; s++) {
        let fx = -k * x, fy = -k * y
        for (const [mx, my] of mags) {
          const dx = mx - x, dy = my - y
          const d3 = Math.pow(dx * dx + dy * dy + h2, 1.5)
          fx += C / d3 * dx
          fy += C / d3 * dy
        }
        fx -= b * vx; fy -= b * vy
        vx += fx * dt; vy += fy * dt
        x += vx * dt; y += vy * dt
        if (vx * vx + vy * vy < 0.00005) { step = s; break }
      }

      let mi = 0, md = Infinity
      for (let i = 0; i < mags.length; i++) {
        const d = Math.hypot(mags[i][0] - x, mags[i][1] - y)
        if (d < md) { md = d; mi = i }
      }
      result.push({ mi, brightness: 1 - (step / MAX) * 0.72 })
    }
  }
  return result
}

export default function Image() {
  const N = 52
  const cells = computeFractal(N)

  // Fractal display: 540×540, positioned left-center
  const CELL = Math.floor(540 / N) // ~10px per cell
  const FRAC_W = N * CELL
  const FRAC_H = N * CELL
  const FRAC_LEFT = 70
  const FRAC_TOP = Math.floor((630 - FRAC_H) / 2)

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: 'linear-gradient(135deg, #FFB347 0%, #FF6B81 100%)',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'monospace',
        }}
      >
        {/* Fractal grid as SVG */}
        <svg
          style={{ position: 'absolute', left: FRAC_LEFT, top: FRAC_TOP }}
          width={FRAC_W}
          height={FRAC_H}
          viewBox={`0 0 ${FRAC_W} ${FRAC_H}`}
        >
          {cells.map((cell, i) => {
            const row = Math.floor(i / N)
            const col = i % N
            const base = MAG_COLORS[cell.mi]
            const r = parseInt(base.slice(1, 3), 16)
            const g = parseInt(base.slice(3, 5), 16)
            const b = parseInt(base.slice(5, 7), 16)
            const br = cell.brightness
            return (
              <rect
                key={i}
                x={col * CELL}
                y={row * CELL}
                width={CELL}
                height={CELL}
                fill={`rgb(${Math.round(r * br)},${Math.round(g * br)},${Math.round(b * br)})`}
              />
            )
          })}
        </svg>

        {/* Title block — bottom right */}
        <div
          style={{
            position: 'absolute',
            bottom: 48,
            right: 60,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 80, fontWeight: 700, color: '#FFF8E7', lineHeight: 1 }}>
            L32
          </div>
          <div style={{ fontSize: 22, color: '#FFF8E7', opacity: 0.85 }}>
            the magnetic pendulum
          </div>
          <div style={{ fontSize: 14, color: '#FFF8E7', opacity: 0.5, marginTop: 4 }}>
            chaos has a map
          </div>
        </div>

        {/* Palette dots — top right */}
        <div
          style={{
            position: 'absolute',
            top: 30,
            right: 60,
            display: 'flex',
            gap: 10,
          }}
        >
          {['#FFF8E7', '#FF4E50', '#F9D423', '#B4E33D', '#FC913A'].map((c, i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: c,
                opacity: 0.85,
              }}
            />
          ))}
        </div>

        {/* Label — top left */}
        <div
          style={{
            position: 'absolute',
            top: 32,
            left: FRAC_LEFT,
            fontSize: 13,
            color: '#FFF8E7',
            opacity: 0.5,
          }}
        >
          magnetic pendulum · basin of attraction
        </div>
      </div>
    ),
    { ...size }
  )
}
