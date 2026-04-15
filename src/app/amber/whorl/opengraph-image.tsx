import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'whorl — biometric topography'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  // Five citrus rings, rendered as SVG concentric shapes for OG
  const rings = [
    { cx: 280, cy: 280, color: '#FF4E50', count: 8 },  // blood orange whorl
    { cx: 800, cy: 180, color: '#FC913A', count: 7 },  // tangerine loop
    { cx: 580, cy: 460, color: '#F9D423', count: 6 },  // mango whorl
    { cx: 130, cy: 410, color: '#B4E33D', count: 6 },  // lime arch
    { cx: 1020, cy: 390, color: '#FF6B81', count: 7 }, // grapefruit loop
  ]

  return new ImageResponse(
    <div
      style={{
        width: '1200px',
        height: '630px',
        background: 'linear-gradient(135deg, #FFECD2, #FFF8E7)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'flex-start',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'monospace',
      }}
    >
      {/* SVG fingerprint rings */}
      <svg
        width="1200"
        height="630"
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        {rings.map((ring, ri) =>
          Array.from({ length: ring.count }, (_, j) => {
            const radius = 28 + j * 30
            const opacity = 0.85 - j * 0.09
            // Loop = oval, whorl = circle, arch = wide ellipse
            const rx = ri === 1 ? radius * 1.4 : ri === 4 ? radius * 1.3 : ri === 3 ? radius * 0.75 : radius
            const ry = ri === 1 ? radius * 0.8 : ri === 4 ? radius * 0.85 : ri === 3 ? radius * 1.3 : radius
            const rotate = ri === 1 ? -25 : ri === 4 ? 15 : ri === 3 ? -40 : 0
            return (
              <ellipse
                key={`${ri}-${j}`}
                cx={ring.cx}
                cy={ring.cy}
                rx={rx}
                ry={ry}
                stroke={ring.color}
                strokeWidth="2.4"
                fill="none"
                opacity={opacity}
                transform={`rotate(${rotate}, ${ring.cx}, ${ring.cy})`}
              />
            )
          })
        )}
        {/* Amber dots at each center */}
        {rings.map((ring, ri) => (
          <circle key={`dot-${ri}`} cx={ring.cx} cy={ring.cy} r="5" fill="#D4A574" />
        ))}
      </svg>

      {/* Label */}
      <div
        style={{
          position: 'absolute',
          bottom: '44px',
          left: '52px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <span style={{ fontSize: '52px', fontWeight: 700, color: '#2D2D2D', letterSpacing: '-1px' }}>
          whorl
        </span>
        <span style={{ fontSize: '20px', color: '#888', letterSpacing: '2px', textTransform: 'uppercase' }}>
          biometric topography
        </span>
      </div>
    </div>,
    { width: 1200, height: 630 }
  )
}
