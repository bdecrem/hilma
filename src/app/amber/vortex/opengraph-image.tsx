import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'vortex — citrus swirl'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  // Swirling citrus rings preview
  const colors = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
  const rings = Array.from({ length: 8 }, (_, i) => ({
    r: 60 + i * 50,
    color: colors[i % colors.length],
    opacity: 0.15 + (8 - i) * 0.08,
  }))

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
        }}
      >
        {/* Concentric ring halos — vortex preview */}
        {rings.map((ring, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 600 - ring.r,
              top: 315 - ring.r,
              width: ring.r * 2,
              height: ring.r * 2,
              borderRadius: '50%',
              border: `${4 + (8 - i) * 1.5}px solid ${ring.color}`,
              opacity: ring.opacity,
            }}
          />
        ))}

        {/* Second vortex off-center */}
        {colors.map((color, i) => {
          const r = 30 + i * 40
          return (
            <div
              key={`v2-${i}`}
              style={{
                position: 'absolute',
                left: 850 - r,
                top: 180 - r,
                width: r * 2,
                height: r * 2,
                borderRadius: '50%',
                border: `3px solid ${color}`,
                opacity: 0.2 + (5 - i) * 0.06,
              }}
            />
          )
        })}

        {/* Particle dots */}
        {Array.from({ length: 30 }, (_, i) => {
          const angle = (i / 30) * Math.PI * 2
          const radius = 80 + (i % 5) * 40
          const x = 600 + Math.cos(angle) * radius
          const y = 315 + Math.sin(angle) * radius * 0.6
          return (
            <div
              key={`dot-${i}`}
              style={{
                position: 'absolute',
                left: x - 4,
                top: y - 4,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: colors[i % colors.length],
                opacity: 0.7,
              }}
            />
          )
        })}

        {/* Label */}
        <div
          style={{
            position: 'absolute',
            bottom: 48,
            left: 64,
            fontFamily: 'monospace',
            fontSize: 28,
            color: '#FC913A',
            letterSpacing: '0.15em',
            textTransform: 'lowercase',
          }}
        >
          amber / vortex
        </div>

        {/* Amber watermark */}
        <div
          style={{
            position: 'absolute',
            top: 48,
            right: 64,
            fontFamily: 'monospace',
            fontSize: 18,
            color: '#D4A574',
            letterSpacing: '0.2em',
          }}
        >
          tap to spin
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
