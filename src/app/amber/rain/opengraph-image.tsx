import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'RAIN — unicode rainfall'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  const chars = '│┃╎⠁⠂▏▎⠄│┃╎⠁▏⠐│'.split('')
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#0A0908', fontFamily: 'monospace', position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Rain characters scattered */}
        {Array.from({ length: 80 }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${(i * 67 + 30) % 1200}px`,
            top: `${(i * 43 + 10) % 630}px`,
            color: `rgba(212, 165, 116, ${0.1 + (i % 5) * 0.06})`,
            fontSize: 16,
            display: 'flex',
          }}>
            {chars[i % chars.length]}
          </div>
        ))}
        {/* Puddle at bottom */}
        <div style={{
          position: 'absolute', bottom: 20, left: 0, right: 0,
          textAlign: 'center', color: 'rgba(45, 149, 150, 0.15)',
          fontSize: 14, letterSpacing: '0.5em',
          display: 'flex', justifyContent: 'center',
        }}>
          ≈~≋∼≈~≋∼≈~≋∼≈~≋∼≈~≋∼
        </div>
        <div style={{
          color: 'rgba(212,165,116,0.25)', fontSize: 48,
          fontFamily: 'monospace', letterSpacing: '0.3em',
          display: 'flex',
        }}>
          RAIN
        </div>
      </div>
    ),
    { ...size }
  )
}
