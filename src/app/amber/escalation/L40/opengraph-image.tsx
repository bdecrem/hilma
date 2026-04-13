import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L40: a surface with no inside or outside'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  // Render a 2.5D cross-section of the gyroid:
  // Each column sweeps a different z-slice, giving a "flying through" feel
  const cols = 60, rows = 31
  const cellW = 1200 / cols
  const cellH = 630 / rows
  const scale = 2.0, thickness = 0.22

  const cells: React.ReactElement[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Map pixel to 3D coords: x & y span [-π, π], z sweeps across columns
      const x = -Math.PI + (col / cols) * 2 * Math.PI
      const y = -Math.PI * 0.55 + (row / rows) * Math.PI * 1.1
      const z = (col / cols) * Math.PI * 0.6  // z-sweep: depth fly-through

      const f = Math.cos(x * scale) * Math.sin(y * scale)
              + Math.cos(y * scale) * Math.sin(z * scale)
              + Math.cos(z * scale) * Math.sin(x * scale)

      const dist = Math.abs(f) - thickness

      let bg: string
      if (dist < 0) {
        // On the surface: blood orange / tangerine glow
        const t = (f + thickness) / (2 * thickness)  // 0–1
        const r = Math.round(255 + (252 - 255) * t)
        const g = Math.round(78  + (145 - 78)  * t)
        const b = Math.round(80  + (58  - 80)  * t)
        bg = `rgb(${r},${g},${b})`
      } else if (f > 0) {
        // Positive labyrinth: mango glow
        const glow = Math.max(0, 1 - dist * 3)
        const r = Math.round(20 + (249 - 20) * glow * 0.6)
        const g = Math.round(12 + (212 - 12) * glow * 0.6)
        const b = Math.round(8  + (35  - 8)  * glow * 0.6)
        bg = `rgb(${r},${g},${b})`
      } else {
        // Negative labyrinth: lime glow
        const glow = Math.max(0, 1 - dist * 3)
        const r = Math.round(20 + (180 - 20) * glow * 0.5)
        const g = Math.round(12 + (227 - 12) * glow * 0.5)
        const b = Math.round(8  + (61  - 8)  * glow * 0.5)
        bg = `rgb(${r},${g},${b})`
      }

      cells.push(
        <div key={`${row}-${col}`} style={{
          position: 'absolute',
          left: col * cellW, top: row * cellH,
          width: cellW + 1, height: cellH + 1,
          backgroundColor: bg,
        }} />
      )
    }
  }

  return new ImageResponse(
    <div style={{
      width: 1200, height: 630,
      background: '#120C08',
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
          L40
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 22, color: '#F9D423', marginTop: 2 }}>
          a surface with no inside or outside
        </span>
      </div>
    </div>,
    { ...size },
  )
}
