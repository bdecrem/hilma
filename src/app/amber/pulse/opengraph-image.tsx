import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'PULSE — resonance in citrus'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  const rings = [
    { r: 60, color: 'rgba(255,78,80,0.2)' },
    { r: 110, color: 'rgba(252,145,58,0.18)' },
    { r: 160, color: 'rgba(249,212,35,0.15)' },
    { r: 210, color: 'rgba(180,227,61,0.12)' },
    { r: 260, color: 'rgba(255,107,129,0.1)' },
  ]
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#FFECD2', position: 'relative',
      }}>
        {rings.map((ring, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: ring.r * 2, height: ring.r * 2,
            borderRadius: '50%',
            border: `${8 - i}px solid ${ring.color}`,
            display: 'flex',
          }} />
        ))}
        <div style={{
          position: 'absolute', bottom: 40, left: 40,
          color: 'rgba(0,0,0,0.1)', fontSize: 24,
          fontFamily: 'monospace', letterSpacing: '0.3em',
        }}>
          PULSE
        </div>
      </div>
    ),
    { ...size }
  )
}
