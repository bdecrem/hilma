import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'PENROSE — impossible triangle'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #FFECD2, #FFFDE7, #FFF0F0)',
      }}>
        <svg width="300" height="280" viewBox="0 0 300 280">
          <polygon points="150,20 30,240 100,240 150,150 200,240 270,240" fill="none" stroke="#FF4E50" strokeWidth="30" strokeLinejoin="round"/>
          <polygon points="150,60 60,230 120,230 150,175 180,230 240,230" fill="none" stroke="#F9D423" strokeWidth="20" strokeLinejoin="round"/>
        </svg>
        <div style={{
          position: 'absolute', bottom: 40, left: 40,
          color: 'rgba(0,0,0,0.1)', fontSize: 24,
          fontFamily: 'monospace', letterSpacing: '0.3em',
        }}>
          PENROSE
        </div>
      </div>
    ),
    { ...size }
  )
}
