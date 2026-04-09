import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L34 — physarum / slime mold'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Generate static slime mold network paths for the OG image.
// We simulate a simplified physarum by tracing Bezier curves between
// randomly seeded food nodes, creating an organic mycelium look.

type Node = { x: number; y: number }

function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

function buildNetwork(W: number, H: number): { nodes: Node[]; edges: [number, number][] } {
  const rng = seededRandom(34)

  // Place 10 food nodes across the canvas
  const nodes: Node[] = [
    { x: W * 0.5,  y: H * 0.5 },   // center anchor
    { x: W * 0.15, y: H * 0.2 },
    { x: W * 0.75, y: H * 0.15 },
    { x: W * 0.88, y: H * 0.55 },
    { x: W * 0.65, y: H * 0.82 },
    { x: W * 0.28, y: H * 0.78 },
    { x: W * 0.08, y: H * 0.62 },
    { x: W * 0.42, y: H * 0.28 },
    { x: W * 0.58, y: H * 0.68 },
    { x: W * 0.82, y: H * 0.35 },
  ]
  void rng // seed used above; keep deterministic

  // Connect each non-center node to center + nearest neighbor
  const edges: [number, number][] = []
  for (let i = 1; i < nodes.length; i++) {
    edges.push([0, i])  // all connect to center
  }
  // Add cross-connections for denser network
  edges.push([1, 7], [7, 2], [2, 9], [9, 3], [3, 8], [8, 4], [4, 5], [5, 6])

  return { nodes, edges }
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

export default function Image() {
  const W = 1200, H = 630
  const { nodes, edges } = buildNetwork(W, H)

  // Build SVG paths: each edge is a quadratic Bezier with a perpendicular control point
  const paths: string[] = []
  const rng = seededRandom(777)

  for (const [i, j] of edges) {
    const a = nodes[i], b = nodes[j]
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    const dx = b.x - a.x, dy = b.y - a.y
    const len = Math.sqrt(dx * dx + dy * dy)
    const perp = (rng() - 0.5) * len * 0.35
    const cx = mx + (-dy / len) * perp
    const cy = my + (dx / len) * perp
    paths.push(`M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`)
  }

  // Secondary thinner branches off main network
  const branches: string[] = []
  const branchSeeds: [number, number, number][] = [
    [1, 0.3, -0.4], [2, 0.6, 0.3], [3, 0.4, -0.3], [4, 0.7, 0.4],
    [5, 0.5, -0.3], [6, 0.3, 0.5], [7, 0.6, -0.4], [8, 0.4, 0.3],
  ]
  for (const [ni, px, py] of branchSeeds) {
    const n = nodes[ni]
    const tx = n.x + px * 60
    const ty = n.y + py * 60
    const cx = (n.x + tx) / 2 + (rng() - 0.5) * 40
    const cy = (n.y + ty) / 2 + (rng() - 0.5) * 40
    branches.push(`M ${n.x.toFixed(1)} ${n.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`)
  }

  // Background colors: bg1=#FFB347 (warm amber), bg2=#FF6B81 (grapefruit pink)
  const bg1 = '#FFB347', bg2 = '#FF6B81'

  // Trail colors: lime → tangerine → blood orange
  const trailColors = ['#B4E33D', '#FC913A', '#FF4E50']

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
        {/* Network SVG */}
        <svg
          style={{ position: 'absolute', inset: 0 }}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
        >
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {/* Wide glow layer */}
          {paths.map((d, idx) => (
            <path
              key={`glow-${idx}`}
              d={d}
              fill="none"
              stroke={trailColors[idx % trailColors.length]}
              strokeWidth={lerp(6, 10, (idx % 3) / 2)}
              strokeOpacity={0.18}
              strokeLinecap="round"
            />
          ))}

          {/* Mid layer */}
          {paths.map((d, idx) => (
            <path
              key={`mid-${idx}`}
              d={d}
              fill="none"
              stroke={trailColors[idx % trailColors.length]}
              strokeWidth={lerp(2.5, 4.5, (idx % 3) / 2)}
              strokeOpacity={0.75}
              strokeLinecap="round"
            />
          ))}

          {/* Fine branches */}
          {branches.map((d, idx) => (
            <path
              key={`branch-${idx}`}
              d={d}
              fill="none"
              stroke={trailColors[(idx + 1) % trailColors.length]}
              strokeWidth={1.4}
              strokeOpacity={0.45}
              strokeLinecap="round"
            />
          ))}

          {/* Food nodes */}
          {nodes.map((n, idx) => (
            <g key={`node-${idx}`}>
              <circle cx={n.x} cy={n.y} r={idx === 0 ? 16 : 9} fill="#FF4E50" opacity={0.25} />
              <circle cx={n.x} cy={n.y} r={idx === 0 ? 8 : 5} fill="#FF4E50" opacity={0.9} />
            </g>
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
          <div style={{ fontSize: 84, fontWeight: 700, color: '#FFF8E7', lineHeight: 1 }}>
            L34
          </div>
          <div style={{ fontSize: 21, color: '#FFF8E7', opacity: 0.85 }}>
            physarum / slime mold
          </div>
          <div style={{ fontSize: 13, color: '#FFF8E7', opacity: 0.5, marginTop: 4 }}>
            the network finds the path
          </div>
        </div>

        {/* Palette dots */}
        <div
          style={{
            position: 'absolute',
            top: 30,
            right: 56,
            display: 'flex',
            gap: 10,
          }}
        >
          {['#FFF8E7', '#B4E33D', '#FC913A', '#FF4E50', '#FFB347'].map((c, i) => (
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

        {/* Label — top left */}
        <div
          style={{
            position: 'absolute',
            top: 32,
            left: 48,
            fontSize: 13,
            color: '#FFF8E7',
            opacity: 0.5,
          }}
        >
          slime mold · emergent network · agent simulation
        </div>
      </div>
    ),
    { ...size }
  )
}
