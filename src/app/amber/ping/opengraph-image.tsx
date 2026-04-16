import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'ping — something is out there'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  const PETROL = '#0A1C1A'
  const CREAM = '#E8E8E8'
  const LIME = '#C6FF3C'

  const W = 1200, H = 630
  const cx = W / 2, cy = H / 2
  const maxR = Math.min(W, H) * 0.43  // 270px

  // Sweep arm angle — pointing roughly upper-right
  const armAngle = -Math.PI / 2 + 0.9
  const armEndX = cx + Math.cos(armAngle) * maxR
  const armEndY = cy + Math.sin(armAngle) * maxR

  // Pre-placed echo positions (normalized → px)
  const echoPositions = [
    { nx: 0.61, ny: 0.32 },
    { nx: 0.29, ny: 0.63 },
    { nx: 0.72, ny: 0.71 },
    { nx: 0.44, ny: 0.22 },
    { nx: 0.18, ny: 0.40 },
  ]

  // Which echo is "recently swept" (bright) — the one closest to arm angle
  const glowIdx = 0  // 0.61, 0.32 → upper-right, near the arm

  const echoEls = echoPositions.map((e, i) => {
    const ex = e.nx * W
    const ey = e.ny * H
    const isGlowing = i === glowIdx
    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: ex - (isGlowing ? 16 : 3),
          top: ey - (isGlowing ? 16 : 3),
          width: isGlowing ? 32 : 6,
          height: isGlowing ? 32 : 6,
          borderRadius: '50%',
          background: isGlowing
            ? `radial-gradient(circle, ${LIME}88 0%, ${LIME}00 100%)`
            : 'rgba(232,232,232,0.22)',
        }}
      />
    )
  })

  // Range rings as divs
  const rings = [1, 2, 3].map(i => {
    const r = maxR * i / 3
    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: cx - r,
          top: cy - r,
          width: r * 2,
          height: r * 2,
          borderRadius: '50%',
          border: '1px solid rgba(232,232,232,0.065)',
          boxSizing: 'border-box',
        }}
      />
    )
  })

  return new ImageResponse(
    <div
      style={{
        width: W,
        height: H,
        background: PETROL,
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {rings}

      {/* Crosshair hairlines */}
      <div style={{
        position: 'absolute',
        left: cx - maxR,
        top: cy,
        width: maxR * 2,
        height: 1,
        background: 'rgba(232,232,232,0.045)',
      }} />
      <div style={{
        position: 'absolute',
        left: cx,
        top: cy - maxR,
        width: 1,
        height: maxR * 2,
        background: 'rgba(232,232,232,0.045)',
      }} />

      {/* Sweep arm — a thin lime line from center */}
      <div style={{
        position: 'absolute',
        left: cx,
        top: cy,
        width: maxR,
        height: 1,
        background: 'rgba(198,255,60,0.60)',
        transformOrigin: '0 50%',
        transform: `rotate(${armAngle + Math.PI}rad)`,
      }} />

      {/* Glowing lime dot at arm tip */}
      <div style={{
        position: 'absolute',
        left: armEndX - 4,
        top: armEndY - 4,
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: LIME,
        boxShadow: `0 0 16px 8px rgba(198,255,60,0.22)`,
      }} />

      {echoEls}

      {/* Glowing echo — explicitly bright lime */}
      <div style={{
        position: 'absolute',
        left: echoPositions[glowIdx].nx * W - 4,
        top: echoPositions[glowIdx].ny * H - 4,
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: LIME,
        boxShadow: `0 0 28px 14px rgba(198,255,60,0.30)`,
      }} />

      {/* Origin dot */}
      <div style={{
        position: 'absolute',
        left: cx - 3,
        top: cy - 3,
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'rgba(232,232,232,0.55)',
      }} />

      {/* Museum label — lower left */}
      <div
        style={{
          position: 'absolute',
          left: 66,
          bottom: 54,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <span
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: 68,
            fontStyle: 'italic',
            fontWeight: 300,
            color: CREAM,
            lineHeight: 1,
          }}
        >
          ping
        </span>
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 14,
            fontWeight: 700,
            color: 'rgba(232,232,232,0.44)',
            marginTop: 12,
            letterSpacing: 1,
          }}
        >
          something is out there
        </span>
      </div>

      {/* Spec label — lower right */}
      <div
        style={{
          position: 'absolute',
          right: 66,
          bottom: 24,
          fontFamily: 'monospace',
          fontSize: 11,
          fontWeight: 700,
          color: 'rgba(232,232,232,0.28)',
          letterSpacing: 1,
        }}
      >
        signal · spec 004 · 04.16.26
      </div>
    </div>,
    { ...size },
  )
}
