import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'kaleid — living kaleidoscope'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  const segments = 12
  const cx = 600
  const cy = 315
  const shapes: { x: number; y: number; r: number; color: string }[] = []
  const colors = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81', '#FF8C42']

  for (let s = 0; s < segments; s++) {
    const angle = (s / segments) * Math.PI * 2
    for (let d = 60; d < 260; d += 50) {
      shapes.push({
        x: cx + Math.cos(angle) * d,
        y: cy + Math.sin(angle) * d,
        r: 12 + (d / 260) * 10,
        color: colors[s % colors.length],
      })
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #FFFDE7, #FFECD2)',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {shapes.map((s, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: s.x - s.r,
              top: s.y - s.r,
              width: s.r * 2,
              height: s.r * 2,
              borderRadius: '50%',
              background: s.color,
              opacity: 0.7,
              display: 'flex',
            }}
          />
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10 }}>
          <div style={{ fontSize: 72, fontWeight: 800, color: '#2A2218', letterSpacing: '-0.03em' }}>
            kaleid
          </div>
          <div style={{ fontSize: 26, color: '#78716c', marginTop: 8 }}>
            touch and drag. 12-fold symmetry.
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
