import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'PENDULA — coupled pendulums'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#0A0908', position: 'relative',
      }}>
        {/* Pivot bar */}
        <div style={{
          position: 'absolute', top: 100, left: 100, right: 100, height: 2,
          background: 'rgba(212,165,116,0.15)', display: 'flex',
        }} />
        {/* Pendulum rods + bobs */}
        {Array.from({ length: 15 }).map((_, i) => {
          const len = 100 + i * 22
          const angle = Math.sin(i * 0.5) * 0.3
          const x = 150 + i * 60
          return (
            <div key={i} style={{ position: 'absolute', display: 'flex' }}>
              <div style={{
                position: 'absolute',
                left: x, top: 100,
                width: 1.5, height: len,
                background: `rgba(212,165,116,${0.3 + Math.abs(angle)})`,
                transform: `rotate(${angle * 30}deg)`,
                transformOrigin: 'top center',
                display: 'flex',
              }} />
              <div style={{
                position: 'absolute',
                left: x - 4 + Math.sin(angle) * len, top: 100 + Math.cos(angle) * len - 4,
                width: 8, height: 8, borderRadius: '50%',
                background: '#D4A574',
                display: 'flex',
              }} />
            </div>
          )
        })}
        <div style={{
          position: 'absolute', bottom: 40, left: 60,
          color: 'rgba(212,165,116,0.25)', fontSize: 20,
          fontFamily: 'monospace', letterSpacing: '0.3em',
          display: 'flex',
        }}>
          PENDULA
        </div>
      </div>
    ),
    { ...size }
  )
}
