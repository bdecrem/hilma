import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'things i\'m building'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

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
          backgroundColor: '#fafafa',
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: '#292524',
            letterSpacing: '-0.02em',
          }}
        >
          things i&apos;m building
        </div>
      </div>
    ),
    { ...size }
  )
}
