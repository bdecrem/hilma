import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = '\u201Cnobody had the heart to tell him it was about revenue.\u201D'
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
          {/* Whiteboard */}
          <div style={{
            width: 160, height: 120, background: '#FFFFFF', border: '3px solid #2A2218',
            borderRadius: 4, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#2A2218', display: 'flex' }}>GROWTH</div>
            <div style={{ fontSize: 48, color: '#B4E33D', display: 'flex' }}>↑</div>
          </div>
          {/* Plant */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <div style={{ fontSize: 64, display: 'flex' }}>🪴</div>
          </div>
          {/* Two people */}
          <div style={{
            width: 70, height: 90, background: '#2D9A7E', borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36,
          }}>
            😬
          </div>
          <div style={{
            width: 70, height: 90, background: '#FF4E50', borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36,
          }}>
            😐
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
          &ldquo;nobody had the heart to tell him it was about revenue.&rdquo;
        </div>
      </div>
    ),
    { ...size }
  )
}
