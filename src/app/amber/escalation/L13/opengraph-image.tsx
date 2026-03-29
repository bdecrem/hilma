import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L13: flow — amber escalation'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #FFECD2, #FFFDE7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: 120, fontWeight: 800, color: '#FC913A' }}>L13</div>
          <div style={{ fontSize: 32, color: '#FF4E50', marginTop: 8 }}>flow</div>
        </div>
      </div>
    ),
    { ...size }
  )
}
