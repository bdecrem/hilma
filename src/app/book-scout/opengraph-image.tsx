import { ImageResponse } from 'next/og'

export const alt = 'Book Scout — book recommendations picked by humans, not AI'
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
          justifyContent: 'space-between',
          background: '#faf6ec',
          padding: '72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 30, letterSpacing: 6, textTransform: 'uppercase', color: '#c2683a', fontWeight: 700 }}>
            Book Scout
          </div>
          <div style={{ display: 'flex', fontSize: 90, fontWeight: 800, color: '#241f17', marginTop: 18, lineHeight: 1.02 }}>
            Picked by humans,
          </div>
          <div style={{ display: 'flex', fontSize: 90, fontWeight: 800, color: '#c2683a', lineHeight: 1.02 }}>
            not by AI.
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 34, color: '#6b6256', lineHeight: 1.3, maxWidth: 1000 }}>
          Monthly recommendations from critics, booksellers and librarians — available on Kindle now.
        </div>
      </div>
    ),
    { ...size },
  )
}
