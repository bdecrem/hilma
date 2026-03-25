import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'drift — amber'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #FFECD2, #FFF8E7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'monospace',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: 80, fontWeight: 800, color: '#FC913A', letterSpacing: '-0.02em' }}>
            drift
          </div>
          <div style={{ fontSize: 24, color: '#FF4E50', marginTop: 12 }}>
            amber
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
