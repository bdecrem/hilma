import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = "Hi, I'm Bart"

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
        <div style={{ fontSize: '160px', lineHeight: 1 }}>👋</div>
        <div style={{ fontSize: '84px', fontWeight: 800 }}>Hey, I&#39;m Bart</div>
        <div style={{ fontSize: '34px', fontWeight: 600, color: '#D64A22' }}>
          AI &amp; human flourishing · CASBS
        </div>
      </div>
    ),
    size
  )
}
