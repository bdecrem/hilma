import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'orbit — amber generative art'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: 'linear-gradient(135deg, #FFECD2 0%, #FFFDE7 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Orbital rings */}
        {[180, 260, 340].map((r, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: r * 2,
              height: r * 2,
              borderRadius: '50%',
              border: `${i === 1 ? 2.5 : 1.5}px solid ${['#FF4E50', '#FC913A', '#F9D423'][i]}`,
              opacity: 0.35,
            }}
          />
        ))}

        {/* Citrus bodies */}
        {[
          { x: 600, y: 315, r: 28, c: '#FC913A' },
          { x: 600 + 180, y: 315, r: 14, c: '#FF4E50' },
          { x: 600 - 260, y: 315 - 40, r: 18, c: '#F9D423' },
          { x: 600 + 60, y: 315 - 340, r: 11, c: '#B4E33D' },
          { x: 600 - 80, y: 315 + 180, r: 16, c: '#FF6B81' },
        ].map((b, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: b.x - b.r,
              top: b.y - b.r,
              width: b.r * 2,
              height: b.r * 2,
              borderRadius: '50%',
              background: b.c,
              boxShadow: `0 0 ${b.r * 2}px ${b.c}88`,
            }}
          />
        ))}

        {/* Title */}
        <div
          style={{
            position: 'absolute',
            bottom: 56,
            left: 64,
            fontFamily: 'monospace',
            fontSize: 52,
            fontWeight: 700,
            color: '#FF4E50',
            letterSpacing: -1,
          }}
        >
          orbit
        </div>

        {/* Amber watermark */}
        <div
          style={{
            position: 'absolute',
            bottom: 30,
            right: 54,
            fontFamily: 'monospace',
            fontSize: 14,
            color: '#D4A574',
            opacity: 0.7,
          }}
        >
          amber
        </div>
      </div>
    ),
    { ...size }
  )
}
