import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'field — something moves through here'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  const lines = []
  for (let i = 0; i < 80; i++) {
    const x = 60 + Math.random() * 1080
    const baseY = 140 + Math.random() * 360
    const len = 30 + Math.random() * 55
    const sway = Math.sin(i * 0.43) * 12
    const isLime = i === 37
    lines.push({ x, baseY, len, sway, isLime })
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#0C1424',
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
          viewBox="0 0 1200 630"
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          {lines.map((l, i) => (
            <line
              key={i}
              x1={l.x}
              y1={l.baseY}
              x2={l.x + l.sway}
              y2={l.baseY - l.len}
              stroke={l.isLime ? '#C6FF3C' : '#E8E8E8'}
              strokeOpacity={l.isLime ? 0.85 : 0.2 + (i % 5) * 0.06}
              strokeWidth={l.isLime ? 2 : 1}
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
            field
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
            something moves through here
          </span>
        </div>
      </div>
    ),
    { ...size }
  )
}
