import { ImageResponse } from 'next/og'

export const runtime     = 'edge'
export const alt         = 'L37 — chemical spirals'
export const size        = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Static snapshot of the Hodgepodge Machine after convergence.
// Two spiral centers rendered as a pixel mosaic in citrus colors.

const W = 1200, H = 630
// Mosaic grid: 80 × 42 cells, each 15 × 15 px
const COLS = 80, ROWS = 42
const CW = W / COLS, CH = H / ROWS   // ~15 × 15

// Six-stop citrus palette (state 0..1 → color)
const PALETTE: [number, number, number][] = [
  [255, 248, 231],  // warm cream
  [249, 212,  35],  // mango
  [252, 145,  58],  // tangerine
  [255,  78,  80],  // blood orange
  [255, 107, 129],  // grapefruit
  [180, 227,  61],  // lime zest
]

function stateToHex(t: number): string {
  // t ∈ [0, 1]
  const idx = t * (PALETTE.length - 1)
  const lo  = Math.floor(idx)
  const hi  = Math.min(lo + 1, PALETTE.length - 1)
  const f   = idx - lo
  const r   = (PALETTE[lo][0] + (PALETTE[hi][0] - PALETTE[lo][0]) * f) | 0
  const g   = (PALETTE[lo][1] + (PALETTE[hi][1] - PALETTE[lo][1]) * f) | 0
  const b   = (PALETTE[lo][2] + (PALETTE[hi][2] - PALETTE[lo][2]) * f) | 0
  return `rgb(${r},${g},${b})`
}

// Two spiral centers in normalized grid coords
const CENTERS = [
  { cx: 0.30, cy: 0.50, freq: 2.5, phase: 0.0 },
  { cx: 0.70, cy: 0.50, freq: 2.5, phase: Math.PI * 0.9 },
]

// Compute state at grid cell (col, row) as superposition of two spirals
function cellState(col: number, row: number): number {
  const nx = col / (COLS - 1)
  const ny = row / (ROWS - 1)
  let val = 0
  for (const { cx, cy, freq, phase } of CENTERS) {
    const dx   = nx - cx
    const dy   = (ny - cy) * (W / H)   // aspect-correct
    const dist = Math.sqrt(dx * dx + dy * dy)
    const angle = Math.atan2(dy, dx)
    // Spiral: phase advances with both distance and angle
    val += Math.sin(dist * freq * Math.PI * 6 - angle * 2 + phase)
  }
  // Normalize val ∈ [-2, 2] → [0, 1]
  return Math.max(0, Math.min(1, (val + 2) / 4))
}

// Pre-compute all cell colors
const cells: { col: number; row: number; color: string }[] = []
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    cells.push({ col, row, color: stateToHex(cellState(col, row)) })
  }
}

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          background: '#FFF8E7',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'monospace',
        }}
      >
        {/* Mosaic cells */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexWrap: 'wrap' }}>
          {cells.map(({ col, row, color }) => (
            <div
              key={`${col}-${row}`}
              style={{
                width:  CW,
                height: CH,
                background: color,
                flexShrink: 0,
              }}
            />
          ))}
        </div>

        {/* Translucent overlay for title readability */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(255,248,231,0.18)',
            display: 'flex',
          }}
        />

        {/* Title block — bottom right */}
        <div
          style={{
            position: 'absolute',
            bottom: 44,
            right: 56,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 84, fontWeight: 700, color: '#2A2218', lineHeight: 1 }}>
            L37
          </div>
          <div style={{ fontSize: 22, color: '#2A2218', opacity: 0.75 }}>
            chemical spirals
          </div>
          <div style={{ fontSize: 13, color: '#2A2218', opacity: 0.45, marginTop: 4 }}>
            one rule per cell · pinwheels everywhere
          </div>
        </div>

        {/* Label — top left */}
        <div
          style={{
            position: 'absolute',
            top: 32,
            left: 48,
            fontSize: 13,
            color: '#2A2218',
            opacity: 0.45,
          }}
        >
          hodgepodge machine · bz reaction · cellular automaton
        </div>

        {/* Palette swatch — top right */}
        <div
          style={{
            position: 'absolute',
            top: 30,
            right: 56,
            display: 'flex',
            gap: 8,
          }}
        >
          {PALETTE.map(([r, g, b], i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: `rgb(${r},${g},${b})`,
                opacity: 0.9,
              }}
            />
          ))}
        </div>
      </div>
    ),
    { ...size }
  )
}
