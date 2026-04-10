import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L36 — particle life'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Static snapshot of a particle life scene.
// Five species, each a citrus color, arranged in organic clusters with
// faint attraction arcs suggesting the hidden interaction matrix.

const SPECIES_COLORS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']

// Deterministic seeded RNG
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

interface Dot { x: number; y: number; species: number; r: number }

function buildScene(W: number, H: number): { dots: Dot[]; arcs: { x1: number; y1: number; x2: number; y2: number; color: string }[] } {
  const rand = rng(36)

  // Five species cluster centers — arranged in a loose pentagon
  const cx = W / 2, cy = H / 2
  const angleOffset = -Math.PI / 2
  const clusterR = Math.min(W, H) * 0.28
  const centers = SPECIES_COLORS.map((_, i) => ({
    x: cx + clusterR * Math.cos(angleOffset + (i * 2 * Math.PI) / 5),
    y: cy + clusterR * Math.sin(angleOffset + (i * 2 * Math.PI) / 5) * 0.72,
  }))

  // Generate dots — 18-24 per species, scattered around their center
  const dots: Dot[] = []
  for (let s = 0; s < 5; s++) {
    const count = 18 + Math.floor(rand() * 7)
    const { x: ox, y: oy } = centers[s]
    const spread = 72 + rand() * 40
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2
      const dist  = rand() * spread
      dots.push({
        x: ox + Math.cos(angle) * dist,
        y: oy + Math.sin(angle) * dist,
        species: s,
        r: 3.5 + rand() * 4,
      })
    }
  }

  // A few "escaped" particles near foreign clusters (attraction arcs)
  const escapes = [
    { from: 0, to: 2 }, { from: 1, to: 3 }, { from: 3, to: 0 }, { from: 4, to: 1 },
  ]
  for (const { from, to } of escapes) {
    const { x: ox, y: oy } = centers[from]
    const { x: tx, y: ty } = centers[to]
    const t = 0.5 + rand() * 0.35
    dots.push({
      x: ox + (tx - ox) * t + (rand() - 0.5) * 30,
      y: oy + (ty - oy) * t + (rand() - 0.5) * 30,
      species: from,
      r: 3,
    })
  }

  // Arcs showing attraction (thin, semi-transparent lines between some species pairs)
  const arcPairs: [number, number][] = [[0, 2], [1, 3], [2, 4], [3, 0], [4, 1]]
  const arcs = arcPairs.map(([a, b]) => ({
    x1: centers[a].x,
    y1: centers[a].y,
    x2: centers[b].x,
    y2: centers[b].y,
    color: SPECIES_COLORS[a],
  }))

  return { dots, arcs }
}

export default function Image() {
  const W = 1200, H = 630
  const { dots, arcs } = buildScene(W, H)

  // bg: index 1 from pickGradientColors pairs → ['#FFF0F0', '#FFFDE7']
  const bg1 = '#FFF0F0', bg2 = '#FFFDE7'

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          background: `linear-gradient(135deg, ${bg1} 0%, ${bg2} 100%)`,
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'monospace',
        }}
      >
        {/* Attraction arcs */}
        <svg
          style={{ position: 'absolute', inset: 0 }}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
        >
          {arcs.map((arc, i) => {
            const mx = (arc.x1 + arc.x2) / 2
            const my = (arc.y1 + arc.y2) / 2 - 40
            return (
              <path
                key={i}
                d={`M ${arc.x1} ${arc.y1} Q ${mx} ${my} ${arc.x2} ${arc.y2}`}
                fill="none"
                stroke={arc.color}
                strokeWidth={1.5}
                strokeOpacity={0.2}
                strokeLinecap="round"
                strokeDasharray="4 8"
              />
            )
          })}
        </svg>

        {/* Particle dots */}
        <svg
          style={{ position: 'absolute', inset: 0 }}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
        >
          {/* Glow halos */}
          {dots.map((d, i) => (
            <circle
              key={`glow-${i}`}
              cx={d.x}
              cy={d.y}
              r={d.r * 2.8}
              fill={SPECIES_COLORS[d.species]}
              opacity={0.08}
            />
          ))}
          {/* Core dots */}
          {dots.map((d, i) => (
            <circle
              key={`dot-${i}`}
              cx={d.x}
              cy={d.y}
              r={d.r}
              fill={SPECIES_COLORS[d.species]}
              opacity={0.9}
            />
          ))}
        </svg>

        {/* Title block — bottom right */}
        <div
          style={{
            position: 'absolute',
            bottom: 44,
            right: 56,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 84, fontWeight: 700, color: '#2A2218', lineHeight: 1 }}>
            L36
          </div>
          <div style={{ fontSize: 21, color: '#2A2218', opacity: 0.7 }}>
            particle life
          </div>
          <div style={{ fontSize: 13, color: '#2A2218', opacity: 0.4, marginTop: 4 }}>
            the rules of attraction are secret
          </div>
        </div>

        {/* Species palette dots — top right */}
        <div
          style={{
            position: 'absolute',
            top: 30,
            right: 56,
            display: 'flex',
            gap: 10,
          }}
        >
          {SPECIES_COLORS.map((c, i) => (
            <div
              key={i}
              style={{ width: 14, height: 14, borderRadius: '50%', background: c, opacity: 0.9 }}
            />
          ))}
        </div>

        {/* Label — top left */}
        <div
          style={{
            position: 'absolute',
            top: 32,
            left: 48,
            fontSize: 13,
            color: '#2A2218',
            opacity: 0.4,
          }}
        >
          five species · attraction matrix · emergent order
        </div>
      </div>
    ),
    { ...size }
  )
}
