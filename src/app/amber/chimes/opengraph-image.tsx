import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'chimes — five citrus bells, pentatonic, tap to ring'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  const COLORS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
  const SIZES = [120, 105, 92, 80, 70]

  return new ImageResponse(
    <div style={{
      width: 1200, height: 630,
      background: 'radial-gradient(circle at center, #2a1f16 0%, #1a1410 50%, #0b0806 100%)',
      display: 'flex', position: 'relative', fontFamily: 'monospace',
    }}>
      {/* Beam */}
      <div style={{
        position: 'absolute', left: 60, top: 90, width: 1080, height: 18,
        background: '#3a2a1c',
      }} />
      {/* Bells with ropes */}
      {[0, 1, 2, 3, 4].map(i => {
        const x = 200 + i * 200
        const sz = SIZES[i]
        return (
          <div key={i} style={{ position: 'absolute', left: 0, top: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Rope */}
            <div style={{
              position: 'absolute', left: x, top: 108, width: 2, height: 230,
              background: 'rgba(255,248,231,0.55)',
            }} />
            {/* Bell */}
            <div style={{
              position: 'absolute',
              left: x - sz / 2,
              top: 338,
              width: sz, height: sz,
              background: COLORS[i],
              borderRadius: `${sz}px ${sz}px 12px 12px / ${sz * 0.7}px ${sz * 0.7}px 12px 12px`,
            }} />
          </div>
        )
      })}
      {/* Title */}
      <div style={{
        position: 'absolute', bottom: 40, left: 50,
        display: 'flex', flexDirection: 'column',
      }}>
        <span style={{ fontSize: 56, color: '#FFF8E7' }}>chimes</span>
        <span style={{ fontSize: 18, color: 'rgba(255,248,231,0.5)', marginTop: 4 }}>
          tap a bell. make a melody.
        </span>
      </div>
    </div>,
    { ...size },
  )
}
