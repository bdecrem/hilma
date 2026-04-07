import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'grid — amber'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  // Isometric grid of cubes rendered in OG image
  // Using inline SVG for a clean isometric cube grid preview
  const N = 10
  const halfW = 48
  const qH = 24
  const cubeH = 60
  const originX = 600
  const originY = 200

  // Citrus colors by "height" (pre-baked for OG)
  const heights: number[][] = Array.from({ length: N }, (_, c) =>
    Array.from({ length: N }, (_, r) => {
      // Simulate a sine wave pattern
      const t = Math.sin((c + r) * 0.6) * 0.5 + 0.5
      return t
    })
  )

  const cells: { col: number; row: number; h: number }[] = []
  for (let c = 0; c < N; c++) {
    for (let r = 0; r < N; r++) {
      cells.push({ col: c, row: r, h: heights[c][r] })
    }
  }
  cells.sort((a, b) => (a.col + a.row) - (b.col + b.row))

  function heightToColor(t: number): string {
    // Interpolate mango → blood orange
    const r = Math.round(249 + (255 - 249) * t)
    const g = Math.round(212 + (78 - 212) * t)
    const b = Math.round(35 + (80 - 35) * t)
    return `rgb(${r},${g},${b})`
  }

  function heightToLeft(t: number): string {
    const r = Math.round((249 + (255 - 249) * t) * 0.68)
    const g = Math.round((212 + (78 - 212) * t) * 0.68)
    const b = Math.round((35 + (80 - 35) * t) * 0.68)
    return `rgb(${r},${g},${b})`
  }

  function heightToRight(t: number): string {
    const r = Math.round((249 + (255 - 249) * t) * 0.82)
    const g = Math.round((212 + (78 - 212) * t) * 0.82)
    const b = Math.round((35 + (80 - 35) * t) * 0.82)
    return `rgb(${r},${g},${b})`
  }

  const polys: React.ReactNode[] = cells.map(({ col, row, h }) => {
    const cx = originX + (col - row) * halfW
    const cy = originY + (col + row) * qH
    const topH = h * cubeH
    const groundY = cy

    const tx = cx, ty = cy - topH
    const rx = cx + halfW, ry = cy + qH - topH
    const bx = cx, by = cy + 2 * qH - topH
    const lx = cx - halfW, ly = cy + qH - topH

    const t = Math.max(0, Math.min(1, h))
    const key = `${col}-${row}`

    if (topH < 1) {
      return (
        <polygon
          key={key}
          points={`${tx},${ty} ${rx},${ry} ${bx},${by} ${lx},${ly}`}
          fill={heightToColor(0)}
          opacity={0.3}
        />
      )
    }

    return (
      <g key={key}>
        {/* Left face */}
        <polygon
          points={`${lx},${ly} ${bx},${by} ${bx},${groundY + 2 * qH} ${lx},${groundY + qH}`}
          fill={heightToLeft(t)}
        />
        {/* Right face */}
        <polygon
          points={`${rx},${ry} ${bx},${by} ${bx},${groundY + 2 * qH} ${rx},${groundY + qH}`}
          fill={heightToRight(t)}
        />
        {/* Top face */}
        <polygon
          points={`${tx},${ty} ${rx},${ry} ${bx},${by} ${lx},${ly}`}
          fill={heightToColor(t)}
          stroke={heightToColor(Math.min(1, t + 0.2))}
          strokeWidth={0.8}
          strokeOpacity={0.5}
        />
      </g>
    )
  })

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #FFECD2, #FC913A)',
          position: 'relative',
        }}
      >
        <svg
          width={1200}
          height={630}
          viewBox="0 0 1200 630"
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          {polys}
        </svg>
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            right: 48,
            fontFamily: 'monospace',
            fontSize: 20,
            color: '#D4A574',
            opacity: 0.7,
            display: 'flex',
          }}
        >
          amber / grid
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
