import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L42: not alive or dead. something in between. tap to seed it.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Render a synthetic Lenia snapshot — ring-shaped creatures glowing on dark ground.
// We simulate the Lenia kernel response field analytically rather than running the CA,
// computing what a snapshot looks like around 3 mature "orbium" creatures.
export default function OG() {
  const COLS = 80, ROWS = 42
  const cellW = 1200 / COLS
  const cellH = 630 / ROWS

  // Three creature centers (normalized [0,1])
  const creatures = [
    { cx: 0.22, cy: 0.42, r: 0.10 },
    { cx: 0.68, cy: 0.32, r: 0.10 },
    { cx: 0.50, cy: 0.72, r: 0.10 },
  ]

  function stateAt(col: number, row: number): number {
    const nx = (col + 0.5) / COLS
    const ny = (row + 0.5) / ROWS
    let v = 0
    for (const { cx, cy, r } of creatures) {
      // Toroidal distance
      let dx = Math.abs(nx - cx); if (dx > 0.5) dx = 1 - dx
      let dy = Math.abs(ny - cy); if (dy > 0.5) dy = 1 - dy
      const d = Math.sqrt(dx * dx + dy * dy)
      // Lenia ring profile: Gaussian peak at d=r
      const rn = d / r
      const ring = Math.exp(-((rn - 0.5) ** 2) / (2 * 0.2 ** 2))
      // Core brightness at center
      const core = Math.exp(-(d ** 2) / (2 * (r * 0.25) ** 2)) * 0.25
      v = Math.max(v, ring + core)
    }
    return Math.min(1, v)
  }

  function lut(v: number): string {
    // Dark espresso → deep green → lime → mango → blood orange
    if (v < 0.12) {
      const t = v / 0.12
      const r = Math.round(18 + 14 * t), g = Math.round(10 + 10 * t), b = Math.round(6 + 8 * t)
      return `rgb(${r},${g},${b})`
    } else if (v < 0.35) {
      const t = (v - 0.12) / 0.23
      const r = Math.round(32 + 13 * t), g = Math.round(20 + 70 * t), b = Math.round(14 + 6 * t)
      return `rgb(${r},${g},${b})`
    } else if (v < 0.6) {
      const t = (v - 0.35) / 0.25
      const r = Math.round(45 + (180 - 45) * t), g = Math.round(90 + (227 - 90) * t), b = Math.round(20 + (61 - 20) * t)
      return `rgb(${r},${g},${b})`
    } else if (v < 0.82) {
      const t = (v - 0.6) / 0.22
      const r = Math.round(180 + (249 - 180) * t), g = Math.round(227 + (212 - 227) * t), b = Math.round(61 + (35 - 61) * t)
      return `rgb(${r},${g},${b})`
    } else {
      const t = (v - 0.82) / 0.18
      const r = Math.round(249 + (255 - 249) * t), g = Math.round(212 + (78 - 212) * t), b = Math.round(35 + (80 - 35) * t)
      return `rgb(${r},${g},${b})`
    }
  }

  const cells: React.ReactElement[] = []
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const v = stateAt(col, row)
      cells.push(
        <div key={`${row}-${col}`} style={{
          position: 'absolute',
          left: col * cellW, top: row * cellH,
          width: cellW + 0.5, height: cellH + 0.5,
          backgroundColor: lut(v),
        }} />
      )
    }
  }

  return new ImageResponse(
    <div style={{
      width: 1200, height: 630,
      background: '#120A06',
      display: 'flex',
      position: 'relative',
    }}>
      {cells}
      {/* Label */}
      <div style={{
        position: 'absolute',
        bottom: 40, left: 50,
        display: 'flex', flexDirection: 'column',
      }}>
        <span style={{ fontFamily: 'monospace', fontSize: 64, color: '#FC913A', fontWeight: 'bold' }}>
          L42
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 22, color: '#F9D423', marginTop: 4 }}>
          not alive or dead. something in between.
        </span>
      </div>
    </div>,
    { ...size },
  )
}
