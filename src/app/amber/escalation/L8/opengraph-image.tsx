import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L8 — Escalation'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  const nodes = [
    { x: 400, y: 250, r: 20, color: '#FF4E50' },
    { x: 550, y: 200, r: 16, color: '#FC913A' },
    { x: 650, y: 320, r: 22, color: '#F9D423' },
    { x: 500, y: 380, r: 18, color: '#B4E33D' },
    { x: 750, y: 230, r: 14, color: '#FF6B81' },
    { x: 350, y: 370, r: 20, color: '#FC913A' },
  ]
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#FFF8E7', position: 'relative',
      }}>
        <svg width="1200" height="630" style={{ position: 'absolute' }}>
          <line x1="400" y1="250" x2="550" y2="200" stroke="rgba(252,145,58,0.2)" strokeWidth="2" />
          <line x1="550" y1="200" x2="650" y2="320" stroke="rgba(252,145,58,0.15)" strokeWidth="2" />
          <line x1="400" y1="250" x2="500" y2="380" stroke="rgba(252,145,58,0.2)" strokeWidth="2" />
          <line x1="650" y1="320" x2="750" y2="230" stroke="rgba(252,145,58,0.15)" strokeWidth="2" />
          <line x1="500" y1="380" x2="350" y2="370" stroke="rgba(252,145,58,0.2)" strokeWidth="2" />
        </svg>
        {nodes.map((n, i) => (
          <div key={i} style={{
            position: 'absolute', left: n.x - n.r, top: n.y - n.r,
            width: n.r * 2, height: n.r * 2, borderRadius: '50%',
            background: n.color, display: 'flex',
          }} />
        ))}
        <div style={{
          position: 'absolute', bottom: 40, left: 40,
          color: 'rgba(0,0,0,0.1)', fontSize: 24,
          fontFamily: 'monospace', letterSpacing: '0.2em',
        }}>
          L8
        </div>
      </div>
    ),
    { ...size }
  )
}
