import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'prism — amber'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: 'linear-gradient(135deg, #FFECD2, #FFFDE7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'monospace',
        }}
      >
        {/* Incoming white rays */}
        {[-60, -30, 0, 30, 60].map((offset, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 0,
              top: 315 + offset,
              width: 360,
              height: 2,
              background: 'rgba(255,255,240,0.6)',
              transform: 'rotate(4deg)',
              transformOrigin: 'left center',
            }}
          />
        ))}

        {/* Dispersed exit rays */}
        {[
          { color: '#FF4E50', angle: -30, opacity: 0.9 },
          { color: '#FC913A', angle: -18, opacity: 0.9 },
          { color: '#F9D423', angle: -6, opacity: 0.9 },
          { color: '#B4E33D', angle: 6, opacity: 0.9 },
          { color: '#FF6B81', angle: 20, opacity: 0.9 },
          { color: '#D4A574', angle: 32, opacity: 0.7 },
        ].map((ray, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 650,
              top: 315,
              width: 600,
              height: 3,
              background: ray.color,
              opacity: ray.opacity,
              transform: `rotate(${ray.angle}deg)`,
              transformOrigin: 'left center',
              boxShadow: `0 0 18px ${ray.color}`,
            }}
          />
        ))}

        {/* Prism triangle */}
        <svg
          width="220"
          height="200"
          viewBox="0 0 220 200"
          style={{ position: 'absolute', left: 460, top: 215 }}
        >
          <defs>
            <linearGradient id="glass" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.45)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.15)" />
            </linearGradient>
          </defs>
          <polygon
            points="110,10 210,190 10,190"
            fill="url(#glass)"
            stroke="rgba(255,255,255,0.85)"
            strokeWidth="3"
          />
          {/* highlight edge */}
          <line x1="110" y1="10" x2="210" y2="190" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
        </svg>

        {/* Title */}
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
          <div
            style={{
              fontSize: 52,
              fontWeight: 700,
              color: '#FF4E50',
              letterSpacing: '-1px',
              fontFamily: 'monospace',
              textShadow: '0 0 30px rgba(255,78,80,0.3)',
            }}
          >
            prism
          </div>
          <div style={{ fontSize: 20, color: '#FC913A', fontFamily: 'monospace', opacity: 0.8 }}>
            amber
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
