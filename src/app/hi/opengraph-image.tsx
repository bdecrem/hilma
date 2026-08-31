import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'hi'

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '48px',
          background: '#FFF6EA',
          color: '#2B2118',
        }}
      >
        <div style={{ fontSize: '260px', lineHeight: 1 }}>👋</div>
        <div style={{ fontSize: '200px', fontWeight: 800 }}>hi</div>
      </div>
    ),
    size
  )
}
