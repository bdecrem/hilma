import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'knot — amber'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
const N = 280
const CX = 600
const CY = 315
const SCALE = 155

function project(t: number) {
  const rx = 0.5
  const ry = 0.25
  const r = Math.cos(3 * t) + 2
  let x = r * Math.cos(2 * t)
  let y = r * Math.sin(2 * t)
  let z = -Math.sin(3 * t)
  // Rotate X
  const y2 = y * Math.cos(rx) - z * Math.sin(rx)
  const z2 = y * Math.sin(rx) + z * Math.cos(rx)
  y = y2
  z = z2
  // Rotate Y
  const x2 = x * Math.cos(ry) + z * Math.sin(ry)
  const z3 = -x * Math.sin(ry) + z * Math.cos(ry)
  const depth = z3 + 6
  const s = SCALE / depth
  return { sx: CX + x2 * s, sy: CY - y * s, depth }
}

interface Seg {
  x0: number
  y0: number
  x1: number
  y1: number
  depth: number
  color: string
  nearness: number
}

const segs: Seg[] = []
for (let i = 0; i < N; i++) {
  const t0 = (i / N) * 2 * Math.PI
  const t1 = ((i + 1) / N) * 2 * Math.PI
  const p0 = project(t0)
  const p1 = project(t1)
  const depth = (p0.depth + p1.depth) / 2
  const nearness = Math.max(0, Math.min(1, 1 - (depth - 4) / 4))
  const ci = Math.floor((i / N) * CITRUS.length * 2) % CITRUS.length
  segs.push({
    x0: p0.sx,
    y0: p0.sy,
    x1: p1.sx,
    y1: p1.sy,
    depth,
    color: CITRUS[ci],
    nearness,
  })
}

// Sort back-to-front
const sorted = [...segs].sort((a, b) => b.depth - a.depth)

// Render each segment as a rotated div (line)
function segToDiv(seg: Seg, idx: number) {
  const dx = seg.x1 - seg.x0
  const dy = seg.y1 - seg.y0
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 0.5) return null
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI
  const mx = (seg.x0 + seg.x1) / 2
  const my = (seg.y0 + seg.y1) / 2
  const w = 3 + 9 * seg.nearness
  const alpha = 0.35 + 0.65 * seg.nearness
  const alphaHex = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')

  return (
    <div
      key={idx}
      style={{
        position: 'absolute',
        left: mx - len / 2,
        top: my - w / 2,
        width: len,
        height: w,
        background: seg.color + alphaHex,
        borderRadius: w / 2,
        transform: `rotate(${angle}deg)`,
        transformOrigin: `${len / 2}px ${w / 2}px`,
      }}
    />
  )
}

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: 'linear-gradient(135deg, #FF4E50, #4A1942)',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {sorted.map((seg, i) => segToDiv(seg, i))}

        {/* Title */}
        <div
          style={{
            position: 'absolute',
            bottom: 48,
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <div
            style={{
              fontSize: 88,
              fontWeight: 700,
              color: '#FFFFFF',
              letterSpacing: '-2px',
              fontFamily: 'monospace',
              opacity: 0.9,
            }}
          >
            knot
          </div>
          <div
            style={{
              fontSize: 22,
              color: '#D4A574',
              fontFamily: 'monospace',
              opacity: 0.75,
            }}
          >
            amber
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
