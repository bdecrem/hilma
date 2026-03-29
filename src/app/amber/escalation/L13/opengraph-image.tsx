import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L13 — liquid citrus'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #FFFDE7, #FFECD2)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Blob shapes */}
        <div style={{ display: 'flex', position: 'absolute', top: 80, left: 200 }}>
          <div style={{ width: 220, height: 220, borderRadius: '50%', background: '#FC913A', opacity: 0.8 }} />
        </div>
        <div style={{ display: 'flex', position: 'absolute', top: 140, left: 300 }}>
          <div style={{ width: 180, height: 180, borderRadius: '50%', background: '#F9D423', opacity: 0.8 }} />
        </div>
        <div style={{ display: 'flex', position: 'absolute', top: 200, right: 250 }}>
          <div style={{ width: 200, height: 200, borderRadius: '50%', background: '#FF4E50', opacity: 0.7 }} />
        </div>
        <div style={{ display: 'flex', position: 'absolute', bottom: 100, left: 400 }}>
          <div style={{ width: 160, height: 160, borderRadius: '50%', background: '#B4E33D', opacity: 0.8 }} />
        </div>
        <div style={{ display: 'flex', position: 'absolute', bottom: 120, right: 350 }}>
          <div style={{ width: 140, height: 140, borderRadius: '50%', background: '#FF6B81', opacity: 0.7 }} />
        </div>
        {/* Title */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10 }}>
          <div style={{ fontSize: 80, fontWeight: 800, color: '#2A2218', letterSpacing: '-0.03em' }}>
            L13
          </div>
          <div style={{ fontSize: 28, color: '#78716c', marginTop: 8 }}>
            tap to drop. watch them merge.
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
