import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L30 — the butterfly of chaos'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Pre-compute Lorenz attractor points for OG image
function computeLorenz(steps: number, dt: number): Array<{ x: number; y: number; vel: number }> {
  let x = 0.1, y = 0, z = 25
  const sigma = 10, rho = 28, beta = 8 / 3
  const points = []

  for (let i = 0; i < steps; i++) {
    const dx = sigma * (y - x)
    const dy = x * (rho - z) - y
    const dz = x * y - beta * z
    x += dx * dt
    y += dy * dt
    z += dz * dt
    if (i > 500) {  // skip transient
      const vel = Math.sqrt(dx * dx + dy * dy + dz * dz)
      points.push({ x, y: z - 25, vel })  // use x-z plane for butterfly silhouette
    }
  }
  return points
}

function velToColor(vel: number): string {
  const t = Math.min(vel / 40, 1)
  const cols = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
  return cols[Math.floor(t * (cols.length - 1))]
}

export default function Image() {
  const raw = computeLorenz(4000, 0.008)

  // Map to OG canvas (1100×540, centered at 550,270)
  const W = 1100, H = 520
  const cx = 550, cy = 260
  const scaleX = 13, scaleY = 8

  const dots = raw.map(p => ({
    sx: cx + p.x * scaleX,
    sy: cy - p.y * scaleY,
    color: velToColor(p.vel),
  }))

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: 'linear-gradient(135deg, #FC913A 0%, #FF4E50 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'monospace',
        }}
      >
        {/* Attractor points as SVG */}
        <svg
          style={{ position: 'absolute', left: 50, top: 55 }}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
        >
          {dots.map((d, i) => (
            <circle
              key={i}
              cx={d.sx}
              cy={d.sy}
              r={1.4}
              fill={d.color}
              opacity={0.7}
            />
          ))}
        </svg>

        {/* Title block */}
        <div
          style={{
            position: 'absolute',
            bottom: 44,
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 72, fontWeight: 700, color: '#FFF8E7', lineHeight: 1 }}>L30</div>
          <div style={{ fontSize: 22, color: '#FFF8E7', opacity: 0.8 }}>
            the butterfly of chaos
          </div>
        </div>

        {/* Citrus dots top-right */}
        <div
          style={{
            position: 'absolute',
            top: 28,
            right: 40,
            display: 'flex',
            gap: 10,
          }}
        >
          {['#FFF8E7', '#F9D423', '#B4E33D', '#FF6B81', '#2D5A27'].map((c, i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: c,
                opacity: 0.85,
              }}
            />
          ))}
        </div>

        {/* Label */}
        <div
          style={{
            position: 'absolute',
            top: 30,
            left: 40,
            fontSize: 13,
            color: '#FFF8E7',
            opacity: 0.5,
          }}
        >
          lorenz attractor · 3D perspective
        </div>
      </div>
    ),
    { ...size }
  )
}
