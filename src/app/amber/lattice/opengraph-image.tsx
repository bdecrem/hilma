import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'lattice — tap until they agree'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  const cols = 20
  const rows = 10
  const cellW = 1100 / (cols + 1)
  const cellH = 320 / (rows + 1)
  const startX = 50
  const startY = 170

  const dots = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const phase = (c * 0.42 + r * 0.28) // create a visible wave/semi-sync pattern
      const radius = 2 + (Math.sin(phase) * 0.5 + 0.5) * 3.5
      const brightness = 0.35 + (Math.sin(phase) * 0.5 + 0.5) * 0.55
      dots.push({
        cx: startX + cellW * (c + 1),
        cy: startY + cellH * (r + 0.5),
        r: radius,
        opacity: brightness,
      })
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#0A0A0A',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: '48px',
          position: 'relative',
        }}
      >
        <svg
          width="1200"
          height="630"
          style={{ position: 'absolute', top: 0, left: 0 }}
          viewBox="0 0 1200 630"
        >
          {dots.map((d, i) => (
            <circle
              key={i}
              cx={d.cx}
              cy={d.cy}
              r={d.r}
              fill="#E8E8E8"
              fillOpacity={d.opacity}
            />
          ))}
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span
            style={{
              color: '#E8E8E8',
              fontSize: '30px',
              fontFamily: 'serif',
              fontStyle: 'italic',
              fontWeight: 300,
              opacity: 0.75,
            }}
          >
            lattice
          </span>
          <span
            style={{
              color: '#E8E8E8',
              fontSize: '13px',
              fontFamily: 'monospace',
              fontWeight: 700,
              letterSpacing: '1px',
              opacity: 0.4,
            }}
          >
            tap until they agree
          </span>
        </div>
      </div>
    ),
    { ...size }
  )
}
