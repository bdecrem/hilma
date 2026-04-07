import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L28 — amber escalation'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Generate a stylized DLA-like branching structure using recursive SVG lines
type Line = { x1: number; y1: number; x2: number; y2: number; depth: number }

function branch(
  lines: Line[],
  x: number, y: number,
  angle: number,
  length: number,
  depth: number,
  maxDepth: number
) {
  if (depth > maxDepth || length < 3) return
  const x2 = x + Math.cos(angle) * length
  const y2 = y + Math.sin(angle) * length
  lines.push({ x1: x, y1: y, x2, y2, depth })
  const spread = 0.6 + depth * 0.08
  const branches = depth < 2 ? 3 : 2
  for (let b = 0; b < branches; b++) {
    const offset = (b / (branches - 1) - 0.5) * spread * 2
    branch(lines, x2, y2, angle + offset, length * 0.68, depth + 1, maxDepth)
  }
}

function buildCoral(cx: number, cy: number): Line[] {
  const lines: Line[] = []
  const arms = 7
  for (let a = 0; a < arms; a++) {
    const angle = (a / arms) * Math.PI * 2 - Math.PI / 2
    branch(lines, cx, cy, angle, 90, 0, 5)
  }
  return lines
}

function depthColor(depth: number): string {
  // deep leaf green → lime → cream → white
  const stops = ['#2D5A27', '#B4E33D', '#FFF8E7', '#FFFFFF']
  return stops[Math.min(depth, stops.length - 1)]
}

function depthWidth(depth: number): number {
  return Math.max(1, 4 - depth * 0.6)
}

export default function Image() {
  const lines = buildCoral(600, 315)

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: 'linear-gradient(135deg, #F9D423 0%, #FC913A 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'monospace',
        }}
      >
        {/* Coral structure */}
        <svg
          style={{ position: 'absolute', left: 0, top: 0, width: 1200, height: 630 }}
          viewBox="0 0 1200 630"
        >
          {lines.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke={depthColor(l.depth)}
              strokeWidth={depthWidth(l.depth)}
              opacity={0.85}
              strokeLinecap="round"
            />
          ))}
          {/* Center seed dot */}
          <circle cx={600} cy={315} r={6} fill="#2D5A27" opacity={0.9} />
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
          <div style={{ fontSize: 72, fontWeight: 700, color: '#2D5A27', lineHeight: 1 }}>L28</div>
          <div style={{ fontSize: 22, color: '#2D5A27', opacity: 0.8 }}>
            every branch, chosen by accident.
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
          {['#2D5A27', '#B4E33D', '#FFF8E7', '#FF4E50', '#FC913A'].map((c, i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: c,
                opacity: 0.8,
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
            opacity: 0.45,
          }}
        >
          diffusion-limited aggregation
        </div>
      </div>
    ),
    { ...size }
  )
}
