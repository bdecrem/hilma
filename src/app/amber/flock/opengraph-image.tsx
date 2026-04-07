import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'flock — amber'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: 'linear-gradient(135deg, #F9D423 0%, #FC913A 50%, #FF4E50 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Simulated boid trails — diagonal streams */}
        {[
          { x: 120, y: 80, angle: 25, color: '#FF4E50', len: 180 },
          { x: 180, y: 140, angle: 20, color: '#FC913A', len: 220 },
          { x: 250, y: 200, angle: 15, color: '#FF6B81', len: 160 },
          { x: 400, y: 100, angle: 35, color: '#F9D423', len: 200 },
          { x: 480, y: 170, angle: 30, color: '#B4E33D', len: 240 },
          { x: 600, y: 80, angle: -10, color: '#FF4E50', len: 190 },
          { x: 700, y: 150, angle: -20, color: '#FC913A', len: 210 },
          { x: 820, y: 90, angle: -30, color: '#FF6B81', len: 170 },
          { x: 900, y: 200, angle: 10, color: '#F9D423', len: 230 },
          { x: 1000, y: 120, angle: -15, color: '#B4E33D', len: 185 },
          { x: 150, y: 380, angle: -25, color: '#FF6B81', len: 195 },
          { x: 280, y: 440, angle: -20, color: '#FC913A', len: 215 },
          { x: 420, y: 360, angle: 40, color: '#F9D423', len: 175 },
          { x: 560, y: 420, angle: 35, color: '#B4E33D', len: 205 },
          { x: 680, y: 380, angle: -35, color: '#FF4E50', len: 220 },
          { x: 800, y: 450, angle: 20, color: '#FC913A', len: 160 },
          { x: 950, y: 380, angle: -25, color: '#FF6B81', len: 200 },
          { x: 1050, y: 460, angle: 15, color: '#F9D423', len: 185 },
        ].map((b, i) => {
          const rad = (b.angle * Math.PI) / 180
          const ex = b.x + Math.cos(rad) * b.len
          const ey = b.y + Math.sin(rad) * b.len
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: b.x,
                top: b.y,
                width: b.len,
                height: 3,
                background: b.color + '99',
                borderRadius: 4,
                transform: `rotate(${b.angle}deg)`,
                transformOrigin: 'left center',
              }}
            />
          )
        })}

        {/* Boid shapes at trail tips */}
        {[
          { x: 290, y: 112, color: '#FF4E50' },
          { x: 388, y: 213, color: '#FC913A' },
          { x: 580, y: 115, color: '#FF6B81' },
          { x: 700, y: 212, color: '#F9D423' },
          { x: 870, y: 100, color: '#B4E33D' },
          { x: 320, y: 425, color: '#FC913A' },
          { x: 500, y: 520, color: '#FF4E50' },
          { x: 730, y: 415, color: '#F9D423' },
          { x: 920, y: 500, color: '#B4E33D' },
        ].map((b, i) => (
          <div
            key={`dot-${i}`}
            style={{
              position: 'absolute',
              left: b.x - 10,
              top: b.y - 6,
              width: 20,
              height: 12,
              background: b.color,
              borderRadius: '60% 60% 40% 40% / 60% 60% 40% 40%',
              transform: 'rotate(-15deg)',
            }}
          />
        ))}

        {/* Center text */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,248,231,0.18)',
            borderRadius: 24,
            padding: '36px 72px',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 96,
              fontWeight: 700,
              color: '#FFF8E7',
              letterSpacing: -2,
              lineHeight: 1,
              textShadow: '0 2px 24px #FF4E5088',
            }}
          >
            flock
          </div>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 22,
              color: '#FFF8E7CC',
              marginTop: 16,
              letterSpacing: 4,
            }}
          >
            amber
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
