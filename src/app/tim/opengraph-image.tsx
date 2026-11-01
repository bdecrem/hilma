import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Hi Tim'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f7efdf',
          color: '#16121c',
          fontSize: 220,
          fontWeight: 700,
          letterSpacing: '-0.02em',
        }}
      >
        Hi Tim
      </div>
    ),
    size,
  )
}
