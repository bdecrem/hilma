import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'terrace — amber'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const BANDS = [
  { color: '#B4E33D', y: 0,   h: 126 },
  { color: '#F9D423', y: 126, h: 126 },
  { color: '#FC913A', y: 252, h: 126 },
  { color: '#FF6B81', y: 378, h: 126 },
  { color: '#FF4E50', y: 504, h: 126 },
]

// Wavy contour line as an SVG path approximation
const wavePathD = (y: number, amplitude: number, phase: number) => {
  const pts = []
  for (let x = 0; x <= 1200; x += 30) {
    const wy = y + Math.sin((x / 1200) * Math.PI * 6 + phase) * amplitude
          + Math.sin((x / 1200) * Math.PI * 11 + phase * 1.7) * (amplitude * 0.4)
    pts.push(`${x},${wy}`)
  }
  return `M ${pts.join(' L ')}`
}

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: '#FF4E50',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'monospace',
        }}
      >
        {/* Citrus elevation bands as angled fills */}
        {BANDS.map((band, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 0,
              top: band.y,
              width: 1200,
              height: band.h,
              background: band.color,
            }}
          />
        ))}

        {/* Wavy contour lines via SVG */}
        <svg
          width="1200"
          height="630"
          viewBox="0 0 1200 630"
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          {[
            { y: 126, amp: 28, phase: 0 },
            { y: 252, amp: 22, phase: 1.2 },
            { y: 378, amp: 32, phase: 2.5 },
            { y: 504, amp: 18, phase: 0.8 },
          ].map((line, i) => (
            <path
              key={i}
              d={wavePathD(line.y, line.amp, line.phase)}
              stroke="#FFF8E7"
              strokeWidth="3"
              fill="none"
              opacity="0.85"
            />
          ))}
          {/* Secondary finer contours */}
          {[
            { y: 63,  amp: 14, phase: 0.5 },
            { y: 189, amp: 18, phase: 1.8 },
            { y: 315, amp: 12, phase: 3.1 },
            { y: 441, amp: 20, phase: 1.4 },
            { y: 567, amp: 10, phase: 2.2 },
          ].map((line, i) => (
            <path
              key={i}
              d={wavePathD(line.y, line.amp, line.phase)}
              stroke="#FFF8E7"
              strokeWidth="1.5"
              fill="none"
              opacity="0.45"
            />
          ))}
        </svg>

        {/* Title */}
        <div
          style={{
            position: 'absolute',
            bottom: 56,
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
              fontSize: 64,
              fontWeight: 700,
              color: '#FFF8E7',
              letterSpacing: '-2px',
              fontFamily: 'monospace',
              textShadow: '0 0 40px rgba(0,0,0,0.3)',
            }}
          >
            terrace
          </div>
          <div style={{ fontSize: 22, color: '#FFF8E7', fontFamily: 'monospace', opacity: 0.7 }}>
            amber
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
