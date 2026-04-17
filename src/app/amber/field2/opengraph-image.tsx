import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'field — something moves through here'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  const lines = []
  for (let i = 0; i < 120; i++) {
    const depth = i < 35 ? 0 : i < 80 ? 1 : 2
    const scale = [0.5, 0.75, 1.0][depth]
    const x = 50 + Math.random() * 1100
    const baseY = 100 + Math.random() * 380
    const len = (25 + Math.random() * 50) * scale
    const sway = Math.sin(i * 0.38 + depth * 0.5) * 14 * scale
    const isLime = [37, 39, 41].includes(i)
    const alpha = isLime ? 0.85 : [0.12, 0.2, 0.3][depth] + (i % 7) * 0.03
    lines.push({ x, baseY, len, sway, isLime, alpha, depth })
  }
  lines.sort((a, b) => a.depth - b.depth)

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
              strokeOpacity={l.alpha}
              strokeWidth={l.isLime ? 2 : [0.6, 0.9, 1.3][l.depth]}
            />
          ))}
          {/* Constellation lines between lime blades */}
          <line x1={lines[37]?.x ?? 0} y1={(lines[37]?.baseY ?? 0) - 20} x2={lines[39]?.x ?? 0} y2={(lines[39]?.baseY ?? 0) - 20} stroke="#C6FF3C" strokeOpacity={0.18} strokeWidth={0.5} />
          <line x1={lines[39]?.x ?? 0} y1={(lines[39]?.baseY ?? 0) - 20} x2={lines[41]?.x ?? 0} y2={(lines[41]?.baseY ?? 0) - 20} stroke="#C6FF3C" strokeOpacity={0.18} strokeWidth={0.5} />
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
