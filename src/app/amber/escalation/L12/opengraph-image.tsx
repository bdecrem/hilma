import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L12: grow — amber escalation'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #FFFDE7, #E8F5E9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: 120, fontWeight: 800, color: '#B4E33D' }}>L12</div>
          <div style={{ fontSize: 32, color: '#2D5A27', marginTop: 8 }}>grow</div>
        </div>
      </div>
    ),
    { ...size }
  )
}
