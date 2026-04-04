import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'bloom — amber'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// DLA-style crystal branches: manually positioned cells mimicking aggregation
const CELL = 6

// Generate a deterministic branching tree of cells
// Returns array of {x, y, colorIdx}
function buildCrystal(
  cx: number,
  cy: number,
  dist: number,
  angle: number,
  length: number,
  cells: { x: number; y: number; d: number }[]
) {
  if (length <= 0) return
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  for (let i = 0; i < length; i++) {
    const x = Math.round(cx + cos * i * CELL)
    const y = Math.round(cy + sin * i * CELL)
    cells.push({ x, y, d: dist + i })
    // Occasional side branches
    if (i > 2 && i % 4 === 0 && length > 4) {
      buildCrystal(x, y, dist + i, angle + 0.55, Math.floor(length * 0.55), cells)
      buildCrystal(x, y, dist + i, angle - 0.55, Math.floor(length * 0.45), cells)
    }
  }
}

const cells: { x: number; y: number; d: number }[] = []

// Main arms radiating from center
const cx = 600, cy = 315
const arms = 6
for (let a = 0; a < arms; a++) {
  const angle = (a / arms) * Math.PI * 2 + 0.15
  buildCrystal(cx, cy, 0, angle, 22, cells)
}
// Extra fill arms
for (let a = 0; a < arms; a++) {
  const angle = (a / arms) * Math.PI * 2 + 0.15 + Math.PI / arms
  buildCrystal(cx, cy, 0, angle, 14, cells)
}

// Colors by distance cycling
const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
function colorForDist(d: number) {
  return CITRUS[Math.floor((d / 60) * CITRUS.length) % CITRUS.length]
}

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: 'linear-gradient(135deg, #C1E1C1, #F9D423)',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Crystal cells */}
        {cells.map((cell, i) => {
          const color = colorForDist(cell.d)
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: cell.x - CELL / 2,
                top: cell.y - CELL / 2,
                width: CELL,
                height: CELL,
                background: color,
                opacity: 0.88,
                boxShadow: `0 0 ${CELL * 2}px ${color}`,
              }}
            />
          )
        })}

        {/* Center glow */}
        <div
          style={{
            position: 'absolute',
            left: cx - 20,
            top: cy - 20,
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: '#FFFFFF',
            opacity: 0.7,
            boxShadow: '0 0 40px #FFFFFF',
            display: 'flex',
          }}
        />

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
              fontSize: 80,
              fontWeight: 700,
              color: '#2D5A27',
              letterSpacing: '-2px',
              fontFamily: 'monospace',
            }}
          >
            bloom
          </div>
          <div
            style={{
              fontSize: 22,
              color: '#2D5A27',
              fontFamily: 'monospace',
              opacity: 0.6,
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
