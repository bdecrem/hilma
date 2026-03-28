import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = '\u201Clet\u2019s circle back on that.\u201D'
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
        <div style={{ display: 'flex', gap: 60, marginBottom: 40, alignItems: 'flex-end' }}>
          <div style={{
            width: 70, height: 90, background: '#2D9A7E', borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36,
          }}>
            😐
          </div>
          <div style={{
            width: 70, height: 90, background: '#FF4E50', borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36,
          }}>
            😒
          </div>
          <div style={{
            width: 80, height: 70, background: '#9E9E9E', borderRadius: '50% 50% 40% 40%',
            border: '3px solid #2A2218',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36,
          }}>
            🐦
          </div>
          <div style={{
            width: 70, height: 90, background: '#B4E33D', borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36,
          }}>
            🗣️
          </div>
        </div>
        <div style={{
          width: 500, height: 6, background: '#FC913A', borderRadius: 3,
          marginBottom: 30,
        }} />
        <div style={{
          color: '#2A2218', fontSize: 28, textAlign: 'center',
          fontStyle: 'italic', maxWidth: 600,
        }}>
          &ldquo;let&rsquo;s circle back on that.&rdquo;
        </div>
      </div>
    ),
    { ...size }
  )
}
