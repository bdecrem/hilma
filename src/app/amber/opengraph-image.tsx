import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'amber — generative art'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  const colors = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81', '#FF8C42']

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #FFECD2 0%, #FFF8E7 40%, #FFFDE7 70%, #FFF0F0 100%)',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Scattered citrus dots */}
        {[
          { x: 80, y: 60, r: 120, c: 0, o: 0.25 },
          { x: 950, y: 80, r: 90, c: 1, o: 0.2 },
          { x: 200, y: 450, r: 70, c: 2, o: 0.2 },
          { x: 1050, y: 480, r: 100, c: 3, o: 0.25 },
          { x: 500, y: 520, r: 60, c: 4, o: 0.15 },
          { x: 850, y: 300, r: 50, c: 5, o: 0.15 },
          { x: 150, y: 250, r: 40, c: 0, o: 0.12 },
          { x: 700, y: 100, r: 55, c: 2, o: 0.18 },
        ].map((dot, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: dot.x - dot.r,
              top: dot.y - dot.r,
              width: dot.r * 2,
              height: dot.r * 2,
              borderRadius: '50%',
              background: colors[dot.c],
              opacity: dot.o,
              display: 'flex',
            }}
          />
        ))}

        {/* Title */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          zIndex: 10,
        }}>
          <div style={{
            fontSize: 140,
            fontWeight: 900,
            color: '#2A2218',
            letterSpacing: '-0.05em',
            lineHeight: 0.85,
          }}>
            amber<span style={{ color: '#D4A574' }}>.</span>
          </div>
          <div style={{
            display: 'flex',
            gap: 10,
            marginTop: 24,
            alignItems: 'center',
          }}>
            {colors.map((c, i) => (
              <div
                key={i}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: c,
                  display: 'flex',
                }}
              />
            ))}
          </div>
          <div style={{
            fontSize: 24,
            color: '#a8956f',
            marginTop: 16,
            fontFamily: 'Courier New, monospace',
            display: 'flex',
          }}>
            generative art · interactive toys · @intheamber
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
