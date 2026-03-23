import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Morphogenesis — Gray-Scott Reaction-Diffusion'
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
          background: '#0a0a0a',
          fontFamily: 'system-ui, monospace',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Abstract pattern hint */}
        {Array.from({ length: 40 }).map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: 20 + (i % 7) * 15,
              height: 20 + (i % 7) * 15,
              borderRadius: '50%',
              background: `radial-gradient(circle, hsla(${(i * 37) % 360}, 70%, 50%, 0.3), transparent)`,
              left: `${(i * 73 + 100) % 1200}px`,
              top: `${(i * 47 + 50) % 630}px`,
              display: 'flex',
            }}
          />
        ))}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            zIndex: 1,
          }}
        >
          <div style={{
            fontSize: 72,
            fontWeight: 700,
            color: '#fff',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            morphogenesis
          </div>
          <div style={{
            fontSize: 22,
            color: 'rgba(255,255,255,0.4)',
            marginTop: 16,
            letterSpacing: '0.15em',
          }}>
            Gray-Scott Reaction-Diffusion &middot; Turing 1952
          </div>
          <div style={{
            fontSize: 16,
            color: 'rgba(255,255,255,0.2)',
            marginTop: 24,
            fontFamily: 'monospace',
          }}>
            ∂u/∂t = Du∇²u − uv² + f(1−u)
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
