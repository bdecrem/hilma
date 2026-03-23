import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L10 — Escalation'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #FFECD2, #FFFDE7)', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 200, top: 200, width: 30, height: 30, borderRadius: '50%', background: '#FF4E50', display: 'flex' }} />
        <div style={{ position: 'absolute', left: 900, top: 150, width: 100, height: 3, background: '#FC913A', transform: 'rotate(20deg)', display: 'flex' }} />
        <div style={{ position: 'absolute', left: 550, top: 300, width: 0, height: 0, borderLeft: '15px solid transparent', borderRight: '15px solid transparent', borderBottom: '26px solid #F9D423', display: 'flex' }} />
        {[1, 2, 3].map(i => (
          <div key={i} style={{ position: 'absolute', left: 600, top: 315, width: i * 50, height: i * 50, borderRadius: '50%', border: `2px solid ${['#FF4E50', '#FC913A', '#B4E33D'][i - 1]}`, opacity: 0.4, display: 'flex' }} />
        ))}
        <div style={{ position: 'absolute', bottom: 40, left: 40, color: 'rgba(0,0,0,0.08)', fontSize: 24, fontFamily: 'monospace', letterSpacing: '0.2em' }}>L10</div>
      </div>
    ),
    { ...size }
  )
}
