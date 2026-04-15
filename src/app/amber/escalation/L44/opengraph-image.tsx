import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L44: the Ising model — two states, one rule, a phase transition'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  // Render a static Ising-like domain pattern as the background.
  // 60×32 grid of pixels. Near-critical pattern: blobs of blood orange and
  // lime zest with fractal-ish boundaries — made from thresholded sine sums.
  const COLS = 60
  const ROWS = 32
  const cellW = 20    // 1200 / 60
  const cellH = 19    // ≈ 630 / 32

  const ORANGE = '#FF4E50'  // blood orange (spin up)
  const LIME   = '#B4E33D'  // lime zest   (spin down)

  // Build domain-like pattern: multi-frequency sine sum thresholded at 0
  // Tuned to give large coherent blobs (as seen near Tc)
  const cells: React.ReactElement[] = []
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const nx = x / COLS
      const ny = y / ROWS
      const v = Math.sin(nx * 7.1 + ny * 4.3 + 0.5) * 0.45
              + Math.sin(nx * 2.8 - ny * 6.9 + 1.2) * 0.30
              + Math.sin(nx * 11.3 + ny * 1.7 - 0.3) * 0.20
              + Math.sin(nx * 4.5 + ny * 9.1 + 2.1) * 0.15
      cells.push(
        <div key={`${y}-${x}`} style={{
          position: 'absolute',
          left: x * cellW,
          top: y * cellH,
          width: cellW + 1,
          height: cellH + 1,
          background: v > 0.08 ? ORANGE : LIME,
        }} />,
      )
    }
  }

  return new ImageResponse(
    <div style={{
      width: 1200,
      height: 630,
      background: '#FFF8E7',
      display: 'flex',
      position: 'relative',
      fontFamily: 'monospace',
    }}>
      {/* Domain pattern */}
      {cells}

      {/* Bottom-left text panel with gradient backing */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 180,
        background: 'linear-gradient(to top, rgba(255,248,231,0.95) 60%, transparent)',
        display: 'flex',
        alignItems: 'flex-end',
        paddingBottom: 40,
        paddingLeft: 52,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 72, color: '#2A2218', fontWeight: 'bold', lineHeight: 1 }}>
            L44
          </span>
          <span style={{ fontSize: 22, color: '#2A2218', opacity: 0.55, marginTop: 6 }}>
            two states. one rule. the phase transition.
          </span>
        </div>
      </div>
    </div>,
    { ...size },
  )
}
