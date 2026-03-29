import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'spore — amber'
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
          fontFamily: 'monospace',
        }}
      >
        {/* Decorative spore branches — static SVG-like elements */}
        {/* Colony 1 — blood orange, left */}
        <div style={{
          position: 'absolute', left: 180, top: 220,
          width: 300, height: 300, display: 'flex',
        }}>
          {[0,1,2,3,4,5].map(i => {
            const angle = (Math.PI * 2 * i) / 6
            const len = 80 + (i % 3) * 30
            const x2 = Math.cos(angle) * len
            const y2 = Math.sin(angle) * len
            return (
              <div key={i} style={{
                position: 'absolute',
                left: 150,
                top: 150,
                width: Math.sqrt(x2*x2 + y2*y2),
                height: 2 + (i % 2),
                background: '#FF4E50',
                opacity: 0.75,
                transformOrigin: '0 50%',
                transform: `rotate(${angle}rad)`,
                borderRadius: 2,
              }} />
            )
          })}
          <div style={{
            position: 'absolute', left: 143, top: 143,
            width: 14, height: 14, borderRadius: '50%',
            background: '#FF4E50', opacity: 0.9
          }} />
        </div>

        {/* Colony 2 — mango, center-right */}
        <div style={{
          position: 'absolute', left: 700, top: 160,
          width: 300, height: 300, display: 'flex',
        }}>
          {[0,1,2,3,4,5,6,7].map(i => {
            const angle = (Math.PI * 2 * i) / 8 + 0.3
            const len = 60 + (i % 4) * 25
            const x2 = Math.cos(angle) * len
            const y2 = Math.sin(angle) * len
            return (
              <div key={i} style={{
                position: 'absolute',
                left: 150,
                top: 150,
                width: Math.sqrt(x2*x2 + y2*y2),
                height: 1.5 + (i % 2) * 0.5,
                background: '#FC913A',
                opacity: 0.72,
                transformOrigin: '0 50%',
                transform: `rotate(${angle}rad)`,
                borderRadius: 2,
              }} />
            )
          })}
          <div style={{
            position: 'absolute', left: 143, top: 143,
            width: 14, height: 14, borderRadius: '50%',
            background: '#FC913A', opacity: 0.9
          }} />
        </div>

        {/* Colony 3 — lime, bottom center */}
        <div style={{
          position: 'absolute', left: 480, top: 320,
          width: 280, height: 280, display: 'flex',
        }}>
          {[0,1,2,3,4].map(i => {
            const angle = (Math.PI * 2 * i) / 5 + 0.7
            const len = 70 + (i % 3) * 20
            const x2 = Math.cos(angle) * len
            const y2 = Math.sin(angle) * len
            return (
              <div key={i} style={{
                position: 'absolute',
                left: 140,
                top: 140,
                width: Math.sqrt(x2*x2 + y2*y2),
                height: 2,
                background: '#B4E33D',
                opacity: 0.75,
                transformOrigin: '0 50%',
                transform: `rotate(${angle}rad)`,
                borderRadius: 2,
              }} />
            )
          })}
          <div style={{
            position: 'absolute', left: 133, top: 133,
            width: 14, height: 14, borderRadius: '50%',
            background: '#B4E33D', opacity: 0.9
          }} />
        </div>

        {/* Title */}
        <div style={{
          position: 'absolute',
          bottom: 60,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: '-2px',
            color: '#FF4E50',
            fontFamily: 'monospace',
          }}>
            spore
          </div>
          <div style={{
            fontSize: 20,
            color: '#D4A574',
            fontFamily: 'monospace',
            opacity: 0.8,
          }}>
            tap to plant. watch it grow.
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
