import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L39: every point contains a universe'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  // Compute a coarse Mandelbrot grid for the OG image
  const cols = 24, rows = 12
  const cellW = 1200 / cols, cellH = 630 / rows
  const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81', '#FFF8E7']

  const cells = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cr = -2.2 + (x / cols) * 3.2
      const ci = -1.1 + (y / rows) * 2.2
      let zr = 0, zi = 0, iter = 0
      while (iter < 30 && zr * zr + zi * zi <= 4) {
        const t = zr * zr - zi * zi + cr
        zi = 2 * zr * zi + ci
        zr = t
        iter++
      }
      const color = iter >= 30 ? '#140C08' : CITRUS[iter % CITRUS.length]
      cells.push(
        <div key={`${x}-${y}`} style={{
          position: 'absolute',
          left: x * cellW,
          top: y * cellH,
          width: cellW + 1,
          height: cellH + 1,
          backgroundColor: color,
        }} />
      )
    }
  }

  return new ImageResponse(
    <div style={{
      width: 1200, height: 630,
      background: '#140C08',
      display: 'flex',
      position: 'relative',
    }}>
      {cells}
      <div style={{
        position: 'absolute',
        bottom: 40, left: 50,
        display: 'flex', flexDirection: 'column',
      }}>
        <span style={{ fontFamily: 'monospace', fontSize: 60, color: '#FC913A' }}>L39</span>
        <span style={{ fontFamily: 'monospace', fontSize: 22, color: '#F9D423', marginTop: 4 }}>
          every point contains a universe
        </span>
      </div>
    </div>,
    { ...size },
  )
}
