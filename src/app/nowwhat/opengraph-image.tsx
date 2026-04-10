import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Now what?'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const COLS = 30
const ROWS = 2
const CELL = 40
const PX = 4 // sub-pixel size within each tile pattern

function tileSvg(brightness: number, fill: string) {
  const v = Math.floor(brightness * 255)
  const color = `rgb(${v},${v},${v})`
  const PAD = 1
  const inner = CELL - PAD * 2
  const cellsPerSide = Math.floor(inner / PX)

  let pattern = ''
  if (fill === 'solid') {
    pattern = `<rect x="${PAD}" y="${PAD}" width="${inner}" height="${inner}" fill="${color}"/>`
  } else if (fill === 'checker') {
    for (let y = 0; y < cellsPerSide; y++) {
      for (let x = 0; x < cellsPerSide; x++) {
        if ((x + y) % 2 === 0) {
          pattern += `<rect x="${PAD + x * PX}" y="${PAD + y * PX}" width="${PX}" height="${PX}" fill="${color}"/>`
        }
      }
    }
  } else if (fill === 'stripe_h') {
    for (let y = 0; y < cellsPerSide; y++) {
      if (y % 2 === 0) {
        pattern += `<rect x="${PAD}" y="${PAD + y * PX}" width="${inner}" height="${PX}" fill="${color}"/>`
      }
    }
  } else if (fill === 'stripe_v') {
    for (let x = 0; x < cellsPerSide; x++) {
      if (x % 2 === 0) {
        pattern += `<rect x="${PAD + x * PX}" y="${PAD}" width="${PX}" height="${inner}" fill="${color}"/>`
      }
    }
  } else if (fill === 'dots') {
    const r = 2
    pattern = `
      <circle cx="${PAD + PX}" cy="${PAD + PX}" r="${r}" fill="${color}"/>
      <circle cx="${CELL - PAD - PX}" cy="${PAD + PX}" r="${r}" fill="${color}"/>
      <circle cx="${PAD + PX}" cy="${CELL - PAD - PX}" r="${r}" fill="${color}"/>
      <circle cx="${CELL - PAD - PX}" cy="${CELL - PAD - PX}" r="${r}" fill="${color}"/>
    `
  }

  // Bevel — light top/left, dark bottom/right
  const bevel = `
    <rect x="0" y="0" width="${CELL}" height="1" fill="rgb(255,255,255)" fill-opacity="0.16"/>
    <rect x="0" y="0" width="1" height="${CELL}" fill="rgb(255,255,255)" fill-opacity="0.16"/>
    <rect x="0" y="${CELL - 1}" width="${CELL}" height="1" fill="rgb(0,0,0)" fill-opacity="0.4"/>
    <rect x="${CELL - 1}" y="0" width="1" height="${CELL}" fill="rgb(0,0,0)" fill-opacity="0.4"/>
  `

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}">${pattern}${bevel}</svg>`
}

export default function OG() {
  const fills = ['solid', 'checker', 'stripe_h', 'stripe_v', 'dots']
  let seed = 7
  function rng() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }

  const tiles: string[] = []
  for (let i = 0; i < COLS * ROWS; i++) {
    const brightness = 0.08 + rng() * 0.18
    const fill = fills[Math.floor(rng() * fills.length)]
    tiles.push(tileSvg(brightness, fill))
  }

  const stripW = COLS * CELL
  const stripH = ROWS * CELL

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Title */}
        <div style={{
          display: 'flex',
          fontSize: 144,
          fontWeight: 300,
          color: '#fff',
          letterSpacing: '0.04em',
          lineHeight: 0.9,
          marginTop: -60,
        }}>
          Now what?
        </div>

        {/* Pixel tile strip — bottom */}
        <div style={{
          position: 'absolute',
          bottom: 50,
          left: (1200 - stripW) / 2,
          width: stripW,
          height: stripH,
          display: 'flex',
          flexWrap: 'wrap',
        }}>
          {tiles.map((svg, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
              width={CELL}
              height={CELL}
              alt=""
              style={{ display: 'flex' }}
            />
          ))}
        </div>
      </div>
    ),
    { ...size }
  )
}
