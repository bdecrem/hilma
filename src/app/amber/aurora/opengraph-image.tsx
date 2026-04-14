import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Aurora — citrus curtains of light by amber'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Approximate star positions (seeded, not random)
const STARS = [
  { x: 80,  y: 45,  r: 2 }, { x: 210, y: 28,  r: 1.5 },
  { x: 340, y: 60,  r: 2 }, { x: 490, y: 20,  r: 1 },
  { x: 600, y: 55,  r: 2 }, { x: 720, y: 32,  r: 1.5 },
  { x: 850, y: 18,  r: 2 }, { x: 960, y: 48,  r: 1 },
  { x: 1080,y: 30,  r: 1.5}, { x: 160, y: 85,  r: 1 },
  { x: 420, y: 92,  r: 1.5}, { x: 670, y: 78,  r: 1 },
  { x: 900, y: 88,  r: 2 }, { x: 1140,y: 70,  r: 1 },
  { x: 55,  y: 110, r: 1 }, { x: 270, y: 120, r: 1.5},
  { x: 530, y: 105, r: 1 }, { x: 780, y: 115, r: 2 },
  { x: 1020,y: 100, r: 1 },
]

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: 'linear-gradient(180deg, #060402 0%, #0b0605 60%, #140a06 100%)',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Stars */}
        {STARS.map((s, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              display: 'flex',
              left: s.x - s.r,
              top: s.y - s.r,
              width: s.r * 2,
              height: s.r * 2,
              borderRadius: '50%',
              background: 'rgba(255,245,220,0.7)',
            }}
          />
        ))}

        {/* Blood orange band */}
        <div style={{
          position: 'absolute', display: 'flex',
          width: '110%', height: '70px',
          background: 'rgba(255,78,80,0.65)',
          top: '105px', left: '-5%',
          filter: 'blur(18px)',
          borderRadius: '50%',
          transform: 'rotate(-2deg)',
        }} />
        <div style={{
          position: 'absolute', display: 'flex',
          width: '110%', height: '22px',
          background: 'rgba(255,78,80,0.85)',
          top: '136px', left: '-5%',
          filter: 'blur(6px)',
          transform: 'rotate(-2deg)',
        }} />

        {/* Tangerine band */}
        <div style={{
          position: 'absolute', display: 'flex',
          width: '115%', height: '65px',
          background: 'rgba(252,145,58,0.6)',
          top: '200px', left: '-8%',
          filter: 'blur(16px)',
          borderRadius: '50%',
          transform: 'rotate(2.5deg)',
        }} />
        <div style={{
          position: 'absolute', display: 'flex',
          width: '115%', height: '20px',
          background: 'rgba(252,145,58,0.8)',
          top: '227px', left: '-8%',
          filter: 'blur(5px)',
          transform: 'rotate(2.5deg)',
        }} />

        {/* Mango band */}
        <div style={{
          position: 'absolute', display: 'flex',
          width: '112%', height: '72px',
          background: 'rgba(249,212,35,0.55)',
          top: '295px', left: '-6%',
          filter: 'blur(20px)',
          borderRadius: '50%',
          transform: 'rotate(-1.5deg)',
        }} />
        <div style={{
          position: 'absolute', display: 'flex',
          width: '112%', height: '22px',
          background: 'rgba(249,212,35,0.78)',
          top: '324px', left: '-6%',
          filter: 'blur(6px)',
          transform: 'rotate(-1.5deg)',
        }} />

        {/* Lime band */}
        <div style={{
          position: 'absolute', display: 'flex',
          width: '113%', height: '62px',
          background: 'rgba(180,227,61,0.58)',
          top: '390px', left: '-7%',
          filter: 'blur(17px)',
          borderRadius: '50%',
          transform: 'rotate(1.8deg)',
        }} />
        <div style={{
          position: 'absolute', display: 'flex',
          width: '113%', height: '19px',
          background: 'rgba(180,227,61,0.82)',
          top: '417px', left: '-7%',
          filter: 'blur(5px)',
          transform: 'rotate(1.8deg)',
        }} />

        {/* Grapefruit band */}
        <div style={{
          position: 'absolute', display: 'flex',
          width: '110%', height: '68px',
          background: 'rgba(255,107,129,0.6)',
          top: '480px', left: '-5%',
          filter: 'blur(19px)',
          borderRadius: '50%',
          transform: 'rotate(-2.5deg)',
        }} />
        <div style={{
          position: 'absolute', display: 'flex',
          width: '110%', height: '21px',
          background: 'rgba(255,107,129,0.82)',
          top: '509px', left: '-5%',
          filter: 'blur(6px)',
          transform: 'rotate(-2.5deg)',
        }} />

        {/* Label */}
        <div
          style={{
            position: 'absolute',
            bottom: 44,
            right: 56,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 6,
          }}
        >
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              color: 'rgba(255,245,220,0.75)',
              fontFamily: 'monospace',
              letterSpacing: '-2px',
            }}
          >
            aurora
          </div>
          <div
            style={{
              fontSize: 20,
              color: 'rgba(212,165,116,0.6)',
              fontFamily: 'monospace',
              letterSpacing: '4px',
            }}
          >
            amber
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
