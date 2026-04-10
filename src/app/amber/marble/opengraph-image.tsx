import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'marble — amber'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Marble veins: horizontal bands of citrus color that simulate paper marbling
// Each vein is a sinusoidal ribbon — approximated as a rotated, blurred strip
const VEINS = [
  // [top, height, color, rotation, opacity]
  { top: -30,  h: 160, color: '#FF4E50', rot: 3,  op: 0.88 },  // blood orange
  { top: 80,   h: 100, color: '#F9D423', rot: -2, op: 0.82 },  // mango
  { top: 155,  h: 130, color: '#FC913A', rot: 4,  op: 0.85 },  // tangerine
  { top: 250,  h: 80,  color: '#B4E33D', rot: -3, op: 0.78 },  // lime
  { top: 300,  h: 110, color: '#FF4E50', rot: 2,  op: 0.80 },  // blood orange
  { top: 380,  h: 90,  color: '#FF6B81', rot: -4, op: 0.82 },  // grapefruit
  { top: 440,  h: 140, color: '#F9D423', rot: 3,  op: 0.85 },  // mango
  { top: 540,  h: 100, color: '#FC913A', rot: -2, op: 0.80 },  // tangerine
  { top: 600,  h: 120, color: '#B4E33D', rot: 4,  op: 0.78 },  // lime
]

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: 'linear-gradient(160deg, #FFFDE7 0%, #FFECD2 50%, #FFF0F0 100%)',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Marble veins — rotated gradient bands */}
        {VEINS.map((v, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: -100,
              top: v.top,
              width: 1400,
              height: v.h,
              background: `linear-gradient(90deg,
                transparent 0%,
                ${v.color}${Math.round(v.op * 80).toString(16).padStart(2,'0')} 15%,
                ${v.color}${Math.round(v.op * 200).toString(16).padStart(2,'0')} 40%,
                ${v.color}${Math.round(v.op * 220).toString(16).padStart(2,'0')} 60%,
                ${v.color}${Math.round(v.op * 80).toString(16).padStart(2,'0')} 85%,
                transparent 100%
              )`,
              transform: `rotate(${v.rot}deg)`,
              transformOrigin: 'center left',
              display: 'flex',
            }}
          />
        ))}

        {/* White highlight streaks for marbling realism */}
        {[120, 280, 420, 560].map((top, i) => (
          <div
            key={`hl-${i}`}
            style={{
              position: 'absolute',
              left: -100,
              top,
              width: 1400,
              height: 12,
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 30%, rgba(255,255,255,0.70) 50%, rgba(255,255,255,0.55) 70%, transparent 100%)',
              transform: `rotate(${(i % 2 === 0 ? 2 : -2)}deg)`,
              transformOrigin: 'center left',
              display: 'flex',
            }}
          />
        ))}

        {/* Warm vignette overlay — edges darken slightly to frame */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at center, transparent 50%, rgba(180,100,30,0.12) 100%)',
            display: 'flex',
          }}
        />

        {/* Title */}
        <div
          style={{
            position: 'absolute',
            bottom: 50,
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
              fontSize: 96,
              fontWeight: 700,
              color: 'rgba(80, 30, 10, 0.85)',
              letterSpacing: '-4px',
              fontFamily: 'monospace',
              textShadow: '0 2px 20px rgba(255,255,255,0.8)',
              display: 'flex',
            }}
          >
            marble
          </div>
          <div
            style={{
              fontSize: 22,
              color: 'rgba(80, 30, 10, 0.50)',
              fontFamily: 'monospace',
              letterSpacing: '3px',
              display: 'flex',
            }}
          >
            amber
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
