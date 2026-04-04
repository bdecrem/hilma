import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L24 — amber escalation'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  // Static snapshot of epicycles mid-spin
  // 5 concentric orbit rings centered at (600, 315), plus a frozen trail arc

  // Arm data: [cx, cy, r_orbit, spoke_x, spoke_y, color]
  // Computed manually as if t=0.18 (partway through one cycle)
  const arms = [
    { ox: 600, oy: 315, r: 90,  tx: 600 + 90  * Math.cos(1 * 0.18 * Math.PI * 2 - Math.PI/2), ty: 315 + 90  * Math.sin(1 * 0.18 * Math.PI * 2 - Math.PI/2), color: '#FF4E50' },
    { ox: 0,   oy: 0,   r: 30,  tx: 0,  ty: 0,  color: '#FC913A' },
    { ox: 0,   oy: 0,   r: 18,  tx: 0,  ty: 0,  color: '#F9D423' },
    { ox: 0,   oy: 0,   r: 13,  tx: 0,  ty: 0,  color: '#B4E33D' },
    { ox: 0,   oy: 0,   r: 10,  tx: 0,  ty: 0,  color: '#FF6B81' },
  ]

  // Recompute chain positions properly
  const t0 = 0.18
  const PI2 = Math.PI * 2
  const freqs = [1, 3, 5, 7, 9]
  const phase = -Math.PI / 2
  const radii = [90, 30, 18, 13, 10]
  const colors = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']

  let cx = 600, cy = 315
  const pts: { x: number; y: number }[] = [{ x: cx, y: cy }]
  for (let i = 0; i < 5; i++) {
    const angle = freqs[i] * t0 * PI2 + phase
    cx += radii[i] * Math.cos(angle)
    cy += radii[i] * Math.sin(angle)
    pts.push({ x: cx, y: cy })
  }

  // Trail: sample 80 points of the Fourier curve
  const trailPts: { x: number; y: number }[] = []
  for (let s = 0; s < 80; s++) {
    const tt = s / 80
    let tx2 = 600, ty2 = 315
    for (let i = 0; i < 5; i++) {
      const angle = freqs[i] * tt * PI2 + phase
      tx2 += radii[i] * Math.cos(angle)
      ty2 += radii[i] * Math.sin(angle)
    }
    trailPts.push({ x: tx2, y: ty2 })
  }
  const trailD = 'M ' + trailPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: 'linear-gradient(135deg, #0D3B66 0%, #B4E33D 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'monospace',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <svg
          style={{ position: 'absolute', inset: 0, width: 1200, height: 630 }}
          viewBox="0 0 1200 630"
        >
          {/* Orbit rings */}
          {pts.slice(0, 5).map((p, i) => (
            <circle
              key={`orbit${i}`}
              cx={p.x}
              cy={p.y}
              r={radii[i]}
              fill="none"
              stroke={colors[i]}
              strokeWidth={1}
              opacity={0.18}
            />
          ))}

          {/* Trail */}
          <path
            d={trailD}
            fill="none"
            stroke="#FC913A"
            strokeWidth={2.5}
            opacity={0.75}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Arm spokes */}
          {pts.slice(0, 5).map((from, i) => {
            const to = pts[i + 1]
            return (
              <line
                key={`spoke${i}`}
                x1={from.x} y1={from.y}
                x2={to.x} y2={to.y}
                stroke={colors[i]}
                strokeWidth={2}
                opacity={0.7}
              />
            )
          })}

          {/* Pivot dots */}
          {pts.slice(0, 5).map((p, i) => (
            <circle
              key={`pivot${i}`}
              cx={p.x}
              cy={p.y}
              r={3.5}
              fill={colors[i]}
              opacity={0.55}
            />
          ))}

          {/* Tip glow */}
          <circle
            cx={pts[5].x}
            cy={pts[5].y}
            r={22}
            fill="#FF4E50"
            opacity={0.25}
          />
          <circle
            cx={pts[5].x}
            cy={pts[5].y}
            r={6}
            fill="#FF4E50"
            opacity={0.9}
          />
        </svg>

        {/* Title block */}
        <div
          style={{
            position: 'absolute',
            bottom: 48,
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 72, fontWeight: 700, color: '#FC913A', lineHeight: 1 }}>L24</div>
          <div style={{ fontSize: 22, color: '#FFF8E7', opacity: 0.9 }}>
            every curve is just circles spinning at different speeds.
          </div>
        </div>

        {/* Citrus dots */}
        <div
          style={{
            position: 'absolute',
            top: 28,
            right: 40,
            display: 'flex',
            gap: 10,
          }}
        >
          {['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81'].map((c, i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: c,
                opacity: 0.75,
              }}
            />
          ))}
        </div>

        {/* Subtle label */}
        <div
          style={{
            position: 'absolute',
            top: 30,
            left: 40,
            fontSize: 13,
            color: '#FFF8E7',
            opacity: 0.35,
          }}
        >
          fourier · epicycles
        </div>
      </div>
    ),
    { ...size }
  )
}
