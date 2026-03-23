import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'STRATA — pressure and time'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  const colors = ['#D4A574', '#B8860B', '#2D9596', '#B47840', '#8C6446', '#3C3228', '#DCB482', '#645040', '#508C82', '#C89650']
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'flex-end', background: '#0A0908',
      }}>
        {colors.map((c, i) => (
          <div key={i} style={{
            width: '100%', height: 40 + Math.sin(i * 0.8) * 15,
            background: c, opacity: 0.8 - i * 0.03,
            display: 'flex',
          }} />
        ))}
        <div style={{
          position: 'absolute', top: 40, left: 60,
          color: 'rgba(212,165,116,0.3)', fontSize: 20,
          fontFamily: 'monospace', letterSpacing: '0.3em',
          display: 'flex',
        }}>
          STRATA
        </div>
      </div>
    ),
    { ...size }
  )
}
