import { ImageResponse } from 'next/og'
import { Plate } from '../lib/raster'
import { proofMarks, decodePress, defaultPress } from '../lib/model'
import { encodePNG } from '../lib/png'

// The share card: a proof pulled from the master in the link (or the one the
// press ships with), by the same rasterizer the browser prints with.

export const runtime = 'nodejs'

async function googleFont(query: string) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${query}`)).text()
  const m = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)
  if (!m) throw new Error(`no ttf for ${query}`)
  return (await fetch(m[1])).arrayBuffer()
}

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get('s')
  const press = decodePress(code) ?? defaultPress()
  const plate = new Plate(432)
  plate.paper()
  for (const m of proofMarks(press)) plate.mark(m)
  const src = `data:image/png;base64,${encodePNG(plate.w, plate.h, plate.data).toString('base64')}`

  const fonts: { name: string; data: ArrayBuffer; weight?: 400; style?: 'normal' | 'italic' }[] = []
  try {
    const [display, mono, serif] = await Promise.all([
      googleFont('Archivo+Black'),
      googleFont('DM+Mono'),
      googleFont('Instrument+Serif:ital@1'),
    ])
    fonts.push({ name: 'Archivo Black', data: display, weight: 400 })
    fonts.push({ name: 'DM Mono', data: mono, weight: 400 })
    fonts.push({ name: 'Instrument Serif', data: serif, weight: 400, style: 'italic' })
  } catch {}

  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: 'flex', background: '#ff4b1f', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 65, top: 66, fontFamily: "Archivo Black", fontSize: 184, color: "#3d3bff", lineHeight: 1 }}>DRUM</div>
        <div style={{ position: 'absolute', left: 58, top: 72, fontFamily: "Archivo Black", fontSize: 184, color: "#16121c", lineHeight: 1 }}>DRUM</div>
        <div style={{ position: 'absolute', left: 62, top: 300, display: 'flex', flexDirection: 'column', fontFamily: 'Instrument Serif', fontStyle: 'italic', fontSize: 58, color: '#f7efdf', lineHeight: 1.05 }}>
          <div>a four-color stencil</div>
          <div>duplicator that plays</div>
        </div>
        <div style={{ position: 'absolute', left: 64, top: 470, display: 'flex', flexDirection: 'column', fontFamily: 'DM Mono', fontSize: 19, color: '#16121c', lineHeight: 1.5 }}>
          <div>{code ? 'A MASTER, SHARED. OPEN IT AND PRESS START.' : 'PUNCH THE STENCIL. SQUEEZE THE INK. TURN THE DRUM.'}</div>
          <div>DESIGNED AND BUILT BY CLAUDE OPUS 5.5</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          width={432}
          height={576}
          alt=""
          style={{ position: 'absolute', right: 92, top: 27, transform: 'rotate(2.2deg)', boxShadow: '9px 11px 0 rgba(22,18,28,0.3)' }}
        />
      </div>
    ),
    { width: 1200, height: 630, fonts, headers: { 'cache-control': 'public, max-age=86400, s-maxage=86400' } },
  )
}
