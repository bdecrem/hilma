import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'elements — amber'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const PX = 8 // og pixel size
const COLS = 150 // 1200 / 8

// deterministic noise
function n(i: number, salt: number): number {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return v - Math.floor(v)
}

const SAND_SHADES = ['#B98A52', '#C79A63', '#D4A574', '#E4C290']
const PLANT_SHADES = ['#5E8A14', '#86B226', '#A8E22E']

export default function Image() {
  // dune silhouette: two gaussian bumps + noise, drawn as pixel columns
  const columns: { x: number; h: number; c: string }[] = []
  for (let x = 0; x < COLS; x++) {
    const g1 = 200 * Math.exp(-((x - 48) ** 2) / (2 * 22 ** 2))
    const g2 = 120 * Math.exp(-((x - 108) ** 2) / (2 * 16 ** 2))
    const h = Math.max(PX, Math.round((g1 + g2 + 14 + n(x, 1) * 18) / PX) * PX)
    columns.push({ x, h, c: SAND_SHADES[Math.floor(n(x, 2) * 4)] })
  }

  // falling grains scattered above the dunes
  const grains = Array.from({ length: 26 }, (_, i) => ({
    x: Math.floor(n(i, 3) * COLS) * PX,
    y: Math.floor(n(i, 4) * 40) * PX + 60,
    c: SAND_SHADES[Math.floor(n(i, 5) * 4)],
  }))

  // a plant sprig on the small dune + a few fire pixels on the big one
  const plant = Array.from({ length: 7 }, (_, i) => ({
    x: (104 + Math.floor(n(i, 6) * 3)) * PX,
    y: 630 - 130 - i * PX,
    c: PLANT_SHADES[Math.floor(n(i, 7) * 3)],
  }))
  const fire = Array.from({ length: 9 }, (_, i) => ({
    x: (44 + Math.floor(n(i, 8) * 6)) * PX,
    y: 630 - 210 - Math.floor(n(i, 9) * 5) * PX,
    c: i % 3 === 0 ? '#FFAE42' : '#FF7A1A',
  }))

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: 'flex',
          background: '#0A0A0A',
          position: 'relative',
        }}
      >
        {columns.map((col, i) => (
          <div
            key={'c' + i}
            style={{
              position: 'absolute',
              left: col.x * PX,
              bottom: 0,
              width: PX,
              height: col.h,
              background: col.c,
            }}
          />
        ))}
        {grains.map((g, i) => (
          <div
            key={'g' + i}
            style={{ position: 'absolute', left: g.x, top: g.y, width: PX, height: PX, background: g.c }}
          />
        ))}
        {plant.map((p, i) => (
          <div
            key={'p' + i}
            style={{ position: 'absolute', left: p.x, top: p.y, width: PX, height: PX, background: p.c }}
          />
        ))}
        {fire.map((f, i) => (
          <div
            key={'f' + i}
            style={{ position: 'absolute', left: f.x, top: f.y, width: PX, height: PX, background: f.c }}
          />
        ))}

        <div
          style={{
            position: 'absolute',
            top: 48,
            left: 56,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontFamily: 'monospace',
              fontWeight: 700,
              color: '#E8E8E8',
              letterSpacing: 6,
              display: 'flex',
            }}
          >
            elements<span style={{ color: '#C6FF3C' }}>.</span>
          </div>
          <div style={{ fontSize: 26, color: '#888888', marginTop: 14, fontStyle: 'italic' }}>
            everything falls, eventually.
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 36,
            right: 56,
            fontSize: 22,
            fontFamily: 'monospace',
            color: '#555555',
            letterSpacing: 4,
            display: 'flex',
          }}
        >
          intheamber.com/elements
        </div>
      </div>
    ),
    { ...size }
  )
}
