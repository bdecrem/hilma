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
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '28px',
          background: '#FFF6EA',
          color: '#2B2118',
        }}
      >
        <div style={{ fontSize: '170px', lineHeight: 1 }}>👋</div>
        <div style={{ fontSize: '130px', fontWeight: 800 }}>Hi, I&#39;m Bart</div>
        <div style={{ fontSize: '52px', color: '#D64A22', fontWeight: 600 }}>Study 16</div>
      </div>
    ),
    size
  )
}
