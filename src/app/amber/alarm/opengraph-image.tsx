import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = '\u201Cevery morning I scream and they hate me for it.\u201D'
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
        <div style={{ display: 'flex', gap: 80, marginBottom: 40, alignItems: 'flex-end' }}>
          {/* Couch with alarm clock */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          }}>
            <div style={{ fontSize: 80, display: 'flex' }}>⏰</div>
            <div style={{
              width: 180, height: 60, background: '#2D9A7E', borderRadius: 8,
              border: '3px solid #2A2218',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, color: '#FFF8E7',
            }}>
              — couch —
            </div>
          </div>
          {/* Therapist */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          }}>
            <div style={{
              width: 80, height: 100, background: '#FC913A', borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 40,
            }}>
              🧑‍⚕️
            </div>
            <div style={{
              fontSize: 16, color: '#2A2218', display: 'flex',
            }}>
              📋
            </div>
          </div>
        </div>
        <div style={{
          width: 500, height: 6, background: '#FC913A', borderRadius: 3,
          marginBottom: 30,
        }} />
        <div style={{
          color: '#2A2218', fontSize: 26, textAlign: 'center',
          fontStyle: 'italic', maxWidth: 650,
        }}>
          &ldquo;every morning I scream and they hate me for it.&rdquo;
        </div>
      </div>
    ),
    { ...size }
  )
}
