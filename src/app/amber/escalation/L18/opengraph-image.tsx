import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L18 — amber escalation'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  // Theremin: glowing trails across a warm gradient canvas
  const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']

  // Fake trail paths — three voices arcing across the canvas
  const trails = [
    { color: '#FF4E50', label: 'low · quiet', x1: 80, y1: 380, x2: 380, y2: 200, cx: 230, cy: 120 },
    { color: '#FC913A', label: 'mid · bold', x1: 300, y1: 460, x2: 750, y2: 180, cx: 520, cy: 80 },
    { color: '#B4E33D', label: 'high · bright', x1: 600, y1: 400, x2: 1100, y2: 160, cx: 860, cy: 100 },
  ]

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200, height: 630,
          background: 'linear-gradient(135deg, #FFF0F0, #FFFDE7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'monospace',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Pitch guide lines */}
        {[0,1,2,3,4,5,6,7,8,9,10,11].map(i => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${(i / 11) * 100}%`,
              top: 0,
              width: 1,
              height: '100%',
              background: 'rgba(80,40,20,0.06)',
            }}
          />
        ))}

        {/* Glow orbs at trail endpoints */}
        {trails.map((t, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: t.x2 - 40,
              top: t.y2 - 40,
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${t.color}CC 0%, ${t.color}44 40%, transparent 70%)`,
            }}
          />
        ))}

        {/* Colored dot cores */}
        {trails.map((t, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: t.x2 - 12,
              top: t.y2 - 12,
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: '#FFFFFF',
              border: `5px solid ${t.color}`,
            }}
          />
        ))}

        {/* Title block */}
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 64, fontWeight: 700, color: '#FF4E50', lineHeight: 1 }}>L18</div>
          <div style={{ fontSize: 22, color: '#FC913A', opacity: 0.85 }}>drag to sing. four voices. the screen is the instrument.</div>
        </div>

        {/* Color band key */}
        <div
          style={{
            position: 'absolute',
            top: 30,
            right: 40,
            display: 'flex',
            gap: 10,
          }}
        >
          {CITRUS.map((c, i) => (
            <div
              key={i}
              style={{
                width: 16, height: 16, borderRadius: '50%',
                background: c,
                opacity: 0.7,
              }}
            />
          ))}
        </div>
      </div>
    ),
    { ...size }
  )
}
