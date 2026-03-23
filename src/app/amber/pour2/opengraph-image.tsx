import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'POUR — acrylic pour art'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #FFECD2, #FFF8E7, #FFF0F0)',
        position: 'relative', overflow: 'hidden',
      }}>
        {Array.from({ length: 40 }).map((_, i) => {
          const colors = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81', '#FFFFFF']
          return (
            <div key={i} style={{
              position: 'absolute',
              left: 100 + (i * 73 % 1000),
              top: 100 + (i * 47 % 430),
              width: 20 + (i % 5) * 15,
              height: 20 + (i % 5) * 15,
              borderRadius: '50%',
              background: colors[i % colors.length],
              opacity: 0.4 + (i % 3) * 0.15,
              display: 'flex',
            }} />
          )
        })}
        <div style={{
          color: 'rgba(42,34,24,0.15)', fontSize: 64,
          fontFamily: 'monospace', letterSpacing: '0.3em',
        }}>
          POUR
        </div>
      </div>
    ),
    { ...size }
  )
}
