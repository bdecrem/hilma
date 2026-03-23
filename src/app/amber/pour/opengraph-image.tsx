import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'POUR — tilt to paint'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #FFECD2, #FFFDE7, #FFF0F0)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Vessel */}
        <div style={{
          width: 100, height: 140, background: '#FFF', border: '4px solid #2A2218',
          borderRadius: '4px 4px 12px 12px', transform: 'rotate(25deg)',
          display: 'flex', alignItems: 'flex-end', overflow: 'hidden',
          position: 'absolute', top: 100, left: 500,
        }}>
          <div style={{ width: '100%', height: '60%', background: '#FC913A', opacity: 0.7, display: 'flex' }} />
        </div>
        {/* Splashes at bottom */}
        {[
          { x: 400, r: 30, c: '#FF4E50' },
          { x: 500, r: 25, c: '#FC913A' },
          { x: 600, r: 35, c: '#F9D423' },
          { x: 550, r: 20, c: '#B4E33D' },
          { x: 700, r: 28, c: '#FF6B81' },
          { x: 450, r: 22, c: '#FC913A' },
        ].map((s, i) => (
          <div key={i} style={{
            position: 'absolute', bottom: 40 + Math.random() * 30,
            left: s.x, width: s.r * 2, height: s.r * 2,
            borderRadius: '50%', background: s.c, opacity: 0.5,
            display: 'flex',
          }} />
        ))}
        <div style={{
          position: 'absolute', bottom: 40, left: 40,
          color: 'rgba(0,0,0,0.1)', fontSize: 24,
          fontFamily: 'monospace', letterSpacing: '0.3em',
        }}>
          POUR
        </div>
      </div>
    ),
    { ...size }
  )
}
