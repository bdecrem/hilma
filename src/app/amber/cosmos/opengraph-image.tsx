import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'COSMOS — Gravitational Music Synthesizer'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(ellipse at center, #0a0514 0%, #000 100%)',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Stars */}
        {Array.from({ length: 60 }).map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: 2 + (i % 3),
              height: 2 + (i % 3),
              borderRadius: '50%',
              background: `rgba(255,255,255,${0.2 + (i % 5) * 0.15})`,
              left: `${(i * 97 + 30) % 1200}px`,
              top: `${(i * 53 + 20) % 630}px`,
              display: 'flex',
            }}
          />
        ))}
        {/* Bodies with glow */}
        {[
          { x: 520, y: 280, r: 40, h: 30, glow: 120 },
          { x: 700, y: 200, r: 18, h: 200, glow: 60 },
          { x: 400, y: 380, r: 14, h: 280, glow: 50 },
          { x: 800, y: 350, r: 22, h: 140, glow: 70 },
          { x: 350, y: 200, r: 10, h: 180, glow: 40 },
        ].map((b, i) => (
          <div key={i} style={{ position: 'absolute', display: 'flex' }}>
            <div style={{
              position: 'absolute',
              left: b.x - b.glow, top: b.y - b.glow,
              width: b.glow * 2, height: b.glow * 2,
              borderRadius: '50%',
              background: `radial-gradient(circle, hsla(${b.h}, 80%, 60%, 0.3), transparent 70%)`,
              display: 'flex',
            }} />
            <div style={{
              position: 'absolute',
              left: b.x - b.r, top: b.y - b.r,
              width: b.r * 2, height: b.r * 2,
              borderRadius: '50%',
              background: `radial-gradient(circle at 35% 35%, hsl(${b.h}, 70%, 75%), hsl(${b.h}, 80%, 45%))`,
              display: 'flex',
            }} />
          </div>
        ))}
        {/* Connection lines */}
        <svg width="1200" height="630" style={{ position: 'absolute', top: 0, left: 0 }}>
          <line x1="520" y1="280" x2="700" y2="200" stroke="rgba(100,140,255,0.15)" strokeWidth="1" />
          <line x1="520" y1="280" x2="400" y2="380" stroke="rgba(100,140,255,0.1)" strokeWidth="1" />
          <line x1="700" y1="200" x2="800" y2="350" stroke="rgba(100,140,255,0.08)" strokeWidth="1" />
        </svg>
        {/* Text */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
          <div style={{
            fontSize: 80,
            fontWeight: 200,
            color: '#fff',
            letterSpacing: '0.3em',
          }}>
            COSMOS
          </div>
          <div style={{
            fontSize: 16,
            color: 'rgba(255,255,255,0.3)',
            marginTop: 16,
            letterSpacing: '0.2em',
          }}>
            gravitational music synthesizer
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
