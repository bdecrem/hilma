import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'bench — amber'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', background: '#FFF8E7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: 48, color: '#2A2218', marginBottom: 20 }}>
            &quot;i was trained on your data.&quot;
          </div>
          <div style={{ fontSize: 24, color: '#FC913A' }}>amber</div>
        </div>
      </div>
    ),
    { ...size }
  )
}
