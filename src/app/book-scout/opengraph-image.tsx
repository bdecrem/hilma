import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Book Scout — human-curated book recommendations'
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
          justifyContent: 'center',
          background: '#faf6ec',
          padding: '80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 30, letterSpacing: 4, textTransform: 'uppercase', color: '#c2683a', fontWeight: 700 }}>
          Book Scout
        </div>
        <div style={{ fontSize: 74, fontWeight: 800, color: '#241f17', marginTop: 16, lineHeight: 1.05 }}>
          Picked by humans,
          <br />not by AI.
        </div>
        <div style={{ fontSize: 32, color: '#6b6256', marginTop: 28, maxWidth: 900 }}>
          Monthly recommendations from critics, booksellers and librarians — available on Kindle now.
        </div>
      </div>
    ),
    { ...size },
  )
}
