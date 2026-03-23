import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'FLUX — Real-Time Fluid Dynamics'
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
          background: '#000',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: 80 + i * 12,
              height: 80 + i * 12,
              borderRadius: '50%',
              background: `radial-gradient(circle, hsla(${i * 24}, 90%, 55%, 0.25), transparent 70%)`,
              left: `${200 + Math.sin(i * 0.8) * 350}px`,
              top: `${150 + Math.cos(i * 0.6) * 200}px`,
              filter: 'blur(10px)',
              display: 'flex',
            }}
          />
        ))}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
          <div style={{
            fontSize: 96,
            fontWeight: 200,
            color: '#fff',
            letterSpacing: '0.25em',
          }}>
            FLUX
          </div>
          <div style={{
            fontSize: 18,
            color: 'rgba(255,255,255,0.3)',
            marginTop: 12,
            letterSpacing: '0.2em',
          }}>
            Navier-Stokes fluid dynamics
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
