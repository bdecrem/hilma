import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = '"it says here you have experience being everywhere at once?"'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#FFF8E7', fontFamily: 'Georgia, serif',
      }}>
        <div style={{ display: 'flex', gap: 80, marginBottom: 40, alignItems: 'center' }}>
          <div style={{
            width: 80, height: 100, background: '#2D9A7E', borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#FFDAB9', fontSize: 40,
          }}>
            🤨
          </div>
          <div style={{
            width: 120, height: 80, background: '#FFF', borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
            border: '3px solid #2A2218',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 30,
          }}>
            😰
          </div>
        </div>
        <div style={{
          color: '#2A2218', fontSize: 28, textAlign: 'center',
          fontStyle: 'italic', maxWidth: 600,
        }}>
          &ldquo;it says here you have experience being everywhere at once?&rdquo;
        </div>
      </div>
    ),
    { ...size }
  )
}
