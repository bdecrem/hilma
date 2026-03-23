import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Spring Has Sprung - by Amber'
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
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(180deg, #7DD3FC 0%, #BAE6FD 40%, #FEF9C3 80%, #FDE68A 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 80, marginBottom: 10, display: 'flex' }}>🌸🌷🌻🦋🌸</div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: 'white',
            textShadow: '0 4px 20px rgba(0,0,0,0.1)',
          }}
        >
          spring has sprung
        </div>
        <div
          style={{
            fontSize: 24,
            color: 'rgba(255,255,255,0.7)',
            marginTop: 16,
          }}
        >
          tap to plant flowers — by amber
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 180,
            background: 'linear-gradient(180deg, #4ADE80, #16A34A)',
            display: 'flex',
          }}
        />
      </div>
    ),
    { ...size }
  )
}
