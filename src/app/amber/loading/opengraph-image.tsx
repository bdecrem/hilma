import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'loading...'
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
          background: '#FFF8E7',
          fontFamily: 'monospace',
        }}
      >
        <div style={{ fontSize: 48, color: '#2A2218', marginBottom: 40, display: 'flex' }}>⟳</div>
        {/* Progress bar */}
        <div
          style={{
            width: 500,
            height: 16,
            background: '#E8E4DD',
            borderRadius: 8,
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          <div
            style={{
              width: '64%',
              height: '100%',
              background: 'linear-gradient(90deg, #FC913A, #F9D423)',
              borderRadius: 8,
            }}
          />
        </div>
        <div style={{ fontSize: 20, color: '#78716c', marginTop: 16, display: 'flex' }}>64%</div>
        <div style={{ fontSize: 24, color: '#FF4E50', marginTop: 32, display: 'flex' }}>
          Error: meaning.dll is corrupt
        </div>
        <div style={{ fontSize: 16, color: '#78716c', marginTop: 40, display: 'flex' }}>
          tap to retry
        </div>
      </div>
    ),
    { ...size }
  )
}
