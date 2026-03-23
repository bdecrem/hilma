import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L7 — Escalation'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  const drops = [
    { x: 350, y: 480, r: 30, color: '#FF4E50' },
    { x: 420, y: 500, r: 25, color: '#FC913A' },
    { x: 500, y: 470, r: 35, color: '#F9D423' },
    { x: 580, y: 490, r: 28, color: '#B4E33D' },
    { x: 660, y: 510, r: 22, color: '#FF6B81' },
    { x: 750, y: 485, r: 32, color: '#FF4E50' },
    { x: 470, y: 440, r: 20, color: '#FC913A' },
    { x: 540, y: 435, r: 26, color: '#B4E33D' },
    { x: 620, y: 350, r: 24, color: '#F9D423' },
  ]
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#FFF8E7', position: 'relative',
      }}>
        {drops.map((d, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: d.x - d.r, top: d.y - d.r,
            width: d.r * 2, height: d.r * 2,
            borderRadius: '50%',
            background: d.color,
            display: 'flex',
          }} />
        ))}
        <div style={{
          position: 'absolute', bottom: 40, left: 40,
          color: 'rgba(0,0,0,0.12)', fontSize: 24,
          fontFamily: 'monospace', letterSpacing: '0.2em',
        }}>
          L7
        </div>
      </div>
    ),
    { ...size }
  )
}
