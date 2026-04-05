import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L26 — amber escalation'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Clifford attractor: x₁ = sin(a·y) + c·cos(a·x),  y₁ = sin(b·x) + d·cos(b·y)
// Preset: crescent (a=-1.4, b=1.6, c=1.0, d=0.7)
function sampleAttractor(count: number, W: number, H: number) {
  const a = -1.4, b = 1.6, c = 1.0, d = 0.7
  let x = 0.1, y = 0.1

  // Warm-up
  for (let i = 0; i < 500; i++) {
    const nx = Math.sin(a * y) + c * Math.cos(a * x)
    const ny = Math.sin(b * x) + d * Math.cos(b * y)
    x = nx; y = ny
  }

  // Collect with bounds
  const xs: number[] = [], ys: number[] = []
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let i = 0; i < count; i++) {
    const nx = Math.sin(a * y) + c * Math.cos(a * x)
    const ny = Math.sin(b * x) + d * Math.cos(b * y)
    x = nx; y = ny
    xs.push(x); ys.push(y)
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  const pad = 0.09
  const rngX = maxX - minX
  const rngY = maxY - minY
  const s = Math.min(W * (1 - pad * 2) / rngX, H * (1 - pad * 2) / rngY)
  const oX = (W - rngX * s) / 2 - minX * s
  const oY = (H - rngY * s) / 2 - minY * s

  return xs.map((xi, i) => ({
    x: xi * s + oX,
    y: ys[i] * s + oY,
    ci: Math.min(Math.floor((i / count) * 5), 4),
  }))
}

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']

export default function Image() {
  const pts = sampleAttractor(8000, 1100, 540)

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: 'linear-gradient(135deg, #FFECD2 0%, #FFFDE7 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'monospace',
        }}
      >
        {/* Attractor points */}
        <svg
          style={{ position: 'absolute', left: 50, top: 45, width: 1100, height: 540 }}
          viewBox="0 0 1100 540"
        >
          {pts.map((p, i) => (
            <rect
              key={i}
              x={p.x - 0.7}
              y={p.y - 0.7}
              width={1.5}
              height={1.5}
              fill={CITRUS[p.ci]}
              opacity={0.55}
            />
          ))}
        </svg>

        {/* Title block */}
        <div
          style={{
            position: 'absolute',
            bottom: 44,
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 72, fontWeight: 700, color: '#FF4E50', lineHeight: 1 }}>L26</div>
          <div style={{ fontSize: 22, color: '#2D5A27', opacity: 0.85 }}>
            300,000 points. one rule. they find the shape.
          </div>
        </div>

        {/* Citrus dots top-right */}
        <div
          style={{
            position: 'absolute',
            top: 28,
            right: 40,
            display: 'flex',
            gap: 10,
          }}
        >
          {CITRUS.map((c, i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: c,
                opacity: 0.75,
              }}
            />
          ))}
        </div>

        {/* Label */}
        <div
          style={{
            position: 'absolute',
            top: 30,
            left: 40,
            fontSize: 13,
            color: '#2D5A27',
            opacity: 0.35,
          }}
        >
          clifford attractor · strange attractor
        </div>
      </div>
    ),
    { ...size }
  )
}
