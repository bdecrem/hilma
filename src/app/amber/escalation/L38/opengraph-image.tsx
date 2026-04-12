import { ImageResponse } from 'next/og'

export const runtime     = 'edge'
export const alt         = 'L38 — citrus fluid'
export const size        = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Static snapshot of swirling fluid — two counter-rotating vortices
// rendered as concentric swept arcs in citrus palette on warm cream.

const W = 1200, H = 630

// Citrus colors
const COLORS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']

// Generate arc strokes for two vortex centers
interface Arc {
  cx: number; cy: number; r: number
  startAngle: number; sweep: number
  color: string; width: number; opacity: number
}

const arcs: Arc[] = []

const CENTERS = [
  { cx: W * 0.32, cy: H * 0.50, dir: 1  },  // left vortex, clockwise
  { cx: W * 0.68, cy: H * 0.50, dir: -1 },  // right vortex, counter-clockwise
]

CENTERS.forEach(({ cx, cy, dir }, vi) => {
  const rings = 12
  for (let r = 0; r < rings; r++) {
    const radius = 28 + r * 22
    const sweep  = (dir > 0 ? 1 : -1) * (Math.PI * 1.4 - r * 0.05)
    const colorIdx = (vi * 3 + r) % COLORS.length
    arcs.push({
      cx, cy,
      r: radius,
      startAngle: -Math.PI * 0.5 + r * 0.22 * dir,
      sweep,
      color: COLORS[colorIdx],
      width: Math.max(2, 14 - r * 0.9),
      opacity: 0.9 - r * 0.045,
    })
  }
})

// Build SVG path for an arc stroke
function arcPath(cx: number, cy: number, r: number, startAngle: number, sweep: number): string {
  const endAngle = startAngle + sweep
  const x1 = cx + r * Math.cos(startAngle)
  const y1 = cy + r * Math.sin(startAngle)
  const x2 = cx + r * Math.cos(endAngle)
  const y2 = cy + r * Math.sin(endAngle)
  const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0
  const sweepFlag = sweep > 0 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${x2} ${y2}`
}

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: W, height: H,
          background: '#FFF8E7',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'monospace',
        }}
      >
        {/* Fluid arcs via SVG */}
        <svg
          style={{ position: 'absolute', inset: 0 }}
          width={W} height={H}
          viewBox={`0 0 ${W} ${H}`}
        >
          {arcs.map((a, i) => (
            <path
              key={i}
              d={arcPath(a.cx, a.cy, a.r, a.startAngle, a.sweep)}
              stroke={a.color}
              strokeWidth={a.width}
              strokeLinecap="round"
              fill="none"
              opacity={a.opacity}
            />
          ))}
          {/* Central connecting stream */}
          <path
            d={`M ${W*0.32+240} ${H*0.5} Q ${W*0.5} ${H*0.38} ${W*0.68-240} ${H*0.5}`}
            stroke="#FC913A" strokeWidth={10} strokeLinecap="round" fill="none" opacity={0.6}
          />
          <path
            d={`M ${W*0.32+200} ${H*0.52} Q ${W*0.5} ${H*0.62} ${W*0.68-200} ${H*0.52}`}
            stroke="#F9D423" strokeWidth={7} strokeLinecap="round" fill="none" opacity={0.5}
          />
        </svg>

        {/* Warm overlay for depth */}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,248,231,0.12)', display: 'flex' }} />

        {/* Title — bottom right */}
        <div
          style={{
            position: 'absolute', bottom: 44, right: 56,
            display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
          }}
        >
          <div style={{ fontSize: 84, fontWeight: 700, color: '#2A2218', lineHeight: 1 }}>L38</div>
          <div style={{ fontSize: 22, color: '#2A2218', opacity: 0.75 }}>citrus fluid</div>
          <div style={{ fontSize: 13, color: '#2A2218', opacity: 0.45, marginTop: 4 }}>
            navier-stokes · stable fluids · drag to stir
          </div>
        </div>

        {/* Label — top left */}
        <div style={{ position: 'absolute', top: 32, left: 48, fontSize: 13, color: '#2A2218', opacity: 0.45 }}>
          jos stam 1999 · velocity field · rgb dye advection
        </div>

        {/* Palette swatches — top right */}
        <div style={{ position: 'absolute', top: 30, right: 56, display: 'flex', gap: 8 }}>
          {COLORS.map((c, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: c, opacity: 0.9 }} />
          ))}
        </div>
      </div>
    ),
    { ...size }
  )
}
