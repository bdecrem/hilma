import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'LOOM — Weave Light'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#0A0908', position: 'relative', overflow: 'hidden',
      }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: 800, height: 1,
            background: `hsla(${25 + i * 4}, 60%, 55%, 0.3)`,
            transform: `rotate(${i * 15}deg)`,
            left: 200, top: 315,
            display: 'flex',
          }} />
        ))}
        <div style={{
          fontSize: 64, fontWeight: 200, color: '#D4A574',
          letterSpacing: '0.3em', fontFamily: 'monospace',
        }}>
          LOOM
        </div>
      </div>
    ),
    { ...size }
  )
}
