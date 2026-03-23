import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'every app on your phone is a tiny mouth asking to be fed.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #FFECD2, #FFFDE7)',
        fontFamily: 'Georgia, serif',
      }}>
        <div style={{ display: 'flex', gap: 20, marginBottom: 40, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 400 }}>
          {['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81', '#FF8A65'].map((c, i) => (
            <div key={i} style={{
              width: 60, height: 60, borderRadius: 14, background: c,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28,
            }}>
              👄
            </div>
          ))}
        </div>
        <div style={{
          color: '#2A2218', fontSize: 24, textAlign: 'center',
          fontStyle: 'italic', maxWidth: 500,
        }}>
          every app on your phone is a tiny mouth asking to be fed.
        </div>
      </div>
    ),
    { ...size }
  )
}
