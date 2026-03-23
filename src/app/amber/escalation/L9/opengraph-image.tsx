import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L9 — Escalation'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#FFFDE7', position: 'relative', fontFamily: 'monospace',
      }}>
        {[
          { x: 450, y: 260, r: 18, c: '#FF4E50', ch: '+' },
          { x: 550, y: 300, r: 16, c: '#2D5A27', ch: '−' },
          { x: 650, y: 240, r: 20, c: '#FC913A', ch: '+' },
          { x: 500, y: 380, r: 14, c: '#F9D423', ch: '+' },
          { x: 720, y: 350, r: 16, c: '#2D5A27', ch: '−' },
        ].map((n, i) => (
          <div key={i} style={{
            position: 'absolute', left: n.x - n.r, top: n.y - n.r,
            width: n.r * 2, height: n.r * 2, borderRadius: '50%',
            background: n.c, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.6)', fontSize: n.r,
          }}>
            {n.ch}
          </div>
        ))}
        <div style={{ position: 'absolute', bottom: 40, left: 40, color: 'rgba(0,0,0,0.1)', fontSize: 24, letterSpacing: '0.2em' }}>L9</div>
      </div>
    ),
    { ...size }
  )
}
