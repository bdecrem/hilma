import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L5 — Escalation'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  const colors = ['#D4A574', '#FF6B6B', '#FFA62B', '#A8E6CF', '#FFE66D']
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#2D1B69', position: 'relative',
      }}>
        {colors.map((c, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: 400 + Math.cos(i * 1.26) * 150,
            top: 250 + Math.sin(i * 1.26) * 100,
            width: 20 + i * 4, height: 20 + i * 4,
            borderRadius: i % 3 === 0 ? '50%' : i % 3 === 1 ? '0' : '50% 0 50% 0',
            background: c,
            opacity: 0.8,
            display: 'flex',
          }} />
        ))}
        <div style={{
          position: 'absolute', bottom: 40, left: 40,
          color: 'rgba(255,255,255,0.25)', fontSize: 24,
          fontFamily: 'monospace', letterSpacing: '0.2em',
        }}>
          L5
        </div>
      </div>
    ),
    { ...size }
  )
}
