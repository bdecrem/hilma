import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'crack — amber'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Deterministic crack-like lines using sine waves and branching paths
function crackPath(x1: number, y1: number, x2: number, y2: number, wobble: number): string {
  const segments = 8
  const dx = (x2 - x1) / segments
  const dy = (y2 - y1) / segments
  const pts = [`${x1},${y1}`]
  for (let i = 1; i < segments; i++) {
    const px = x1 + dx * i + Math.sin(i * 1.7 + wobble) * 12
    const py = y1 + dy * i + Math.cos(i * 2.3 + wobble) * 10
    pts.push(`${Math.round(px)},${Math.round(py)}`)
  }
  pts.push(`${x2},${y2}`)
  return `M ${pts.join(' L ')}`
}

const CRACKS = [
  // Main cracks radiating from center-left
  { d: crackPath(0, 200, 580, 340, 0.5),    color: '#FC913A', w: 2.5 },
  { d: crackPath(580, 340, 900, 180, 1.2),  color: '#FF4E50', w: 2.0 },
  { d: crackPath(580, 340, 780, 500, 2.1),  color: '#FC913A', w: 1.8 },
  // Branch from top
  { d: crackPath(300, 0, 580, 340, 0.8),    color: '#F9D423', w: 2.0 },
  { d: crackPath(580, 340, 950, 430, 1.8),  color: '#B4E33D', w: 1.5 },
  // Secondary cracks
  { d: crackPath(200, 0, 400, 200, 1.4),    color: '#FF6B81', w: 1.2 },
  { d: crackPath(400, 200, 580, 340, 0.3),  color: '#FF6B81', w: 1.0 },
  { d: crackPath(780, 500, 1100, 580, 2.8), color: '#F9D423', w: 1.2 },
  { d: crackPath(900, 180, 1200, 250, 1.5), color: '#FF4E50', w: 1.5 },
  { d: crackPath(950, 430, 1200, 400, 0.9), color: '#B4E33D', w: 1.0 },
  // Fine hairline cracks
  { d: crackPath(150, 630, 580, 340, 3.1),  color: '#FC913A', w: 0.8 },
  { d: crackPath(1050, 0, 780, 280, 2.4),   color: '#F9D423', w: 0.8 },
  { d: crackPath(780, 280, 900, 180, 1.1),  color: '#FF6B81', w: 0.7 },
  { d: crackPath(780, 280, 700, 420, 0.6),  color: '#B4E33D', w: 0.7 },
]

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: 'linear-gradient(135deg, #FF6B81, #FC913A)',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'monospace',
        }}
      >
        {/* Crack network as SVG */}
        <svg
          width="1200"
          height="630"
          viewBox="0 0 1200 630"
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          {/* Colored glow layer */}
          {CRACKS.map((c, i) => (
            <path
              key={`glow-${i}`}
              d={c.d}
              stroke={c.color}
              strokeWidth={c.w * 4}
              fill="none"
              opacity="0.35"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {/* White hot core */}
          {CRACKS.map((c, i) => (
            <path
              key={`core-${i}`}
              d={c.d}
              stroke="#FFFEF5"
              strokeWidth={c.w * 0.7}
              fill="none"
              opacity="0.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>

        {/* Title */}
        <div
          style={{
            position: 'absolute',
            bottom: 52,
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: '#FFF8E7',
              letterSpacing: '-2px',
              fontFamily: 'monospace',
            }}
          >
            crack
          </div>
          <div style={{ fontSize: 22, color: '#FFF8E7', fontFamily: 'monospace', opacity: 0.65 }}>
            amber
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
