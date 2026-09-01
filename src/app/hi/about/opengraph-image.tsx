import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Bart Decrem'

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
          gap: '24px',
          background: '#FFF6EA',
          color: '#2B2118',
        }}
      >
        <div style={{ fontSize: '120px', fontWeight: 800 }}>Bart Decrem</div>
        <div style={{ fontSize: '44px', color: '#D64A22', fontWeight: 600 }}>
          AI &times; human flourishing
        </div>
      </div>
    ),
    size
  )
}
