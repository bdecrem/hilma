import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L6 — Escalation'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  const rings = [
    { r: 60, color: '#FF4E50' },
    { r: 100, color: '#FC913A' },
    { r: 140, color: '#F9D423' },
    { r: 180, color: '#FF6B81' },
    { r: 220, color: '#B4E33D' },
  ]
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#1A120B', position: 'relative',
      }}>
        {rings.map((ring, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: ring.r * 2, height: ring.r * 2,
            borderRadius: '50%',
            border: `${6 - i * 0.5}px solid ${ring.color}`,
            opacity: 0.8,
            display: 'flex',
          }} />
        ))}
        <div style={{
          position: 'absolute', bottom: 40, left: 40,
          color: 'rgba(255,248,231,0.25)', fontSize: 24,
          fontFamily: 'monospace', letterSpacing: '0.2em',
        }}>
          L6
        </div>
      </div>
    ),
    { ...size }
  )
}
