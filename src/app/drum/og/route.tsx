import { ImageResponse } from 'next/og'
import { Plate } from '../lib/raster'
import { proofMarks, decodePress, defaultPress, type PressState } from '../lib/model'
import { encodePNG } from '../lib/png'

// The share card: three pulls of one master (the link's, or the one the press
// ships with), laid on the table. Starved, clean, flooded. No slogans; the
// only type is each sheet's colophon.

export const runtime = 'nodejs'

async function googleFont(query: string) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${query}`)).text()
  const m = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)
  if (!m) throw new Error(`no ttf for ${query}`)
  return (await fetch(m[1])).arrayBuffer()
}

const W = 336
const H = 448

function pull(p: PressState, dens: number, no: number) {
  const plate = new Plate(W)
  plate.paper()
  for (const m of proofMarks(p, dens, no)) plate.mark(m)
  return `data:image/png;base64,${encodePNG(plate.w, plate.h, plate.data).toString('base64')}`
}

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get('s')
  const press = decodePress(code) ?? defaultPress()
  const sheets = [
    { src: pull(press, 0.2, 1), no: '001', note: 'starved', x: 36, y: 92, rot: -2.4 },
    { src: pull(press, 1, 2), no: '002', note: 'four bars', x: 432, y: 70, rot: 0.6 },
    { src: pull(press, 1.35, 3), no: '003', note: 'flooded', x: 828, y: 100, rot: 2.1 },
  ]

  const fonts: { name: string; data: ArrayBuffer; weight?: 400 }[] = []
  try {
    const [display, mono] = await Promise.all([googleFont('Archivo+Black'), googleFont('DM+Mono')])
    fonts.push({ name: 'Archivo Black', data: display, weight: 400 })
    fonts.push({ name: 'DM Mono', data: mono, weight: 400 })
  } catch {}

  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: 'flex', background: '#b7b1a6', position: 'relative' }}>
        {sheets.map((s) => (
          <div
            key={s.no}
            style={{
              position: 'absolute',
              left: s.x,
              top: s.y,
              width: W,
              height: H,
              display: 'flex',
              transform: `rotate(${s.rot}deg)`,
              boxShadow: '7px 9px 0 rgba(29,27,30,0.24)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.src} width={W} height={H} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />
            <div style={{ position: 'absolute', left: W * 0.12, top: H * 0.895, display: 'flex', flexDirection: 'column', color: '#1d1b1e' }}>
              <div style={{ fontFamily: 'Archivo Black', fontSize: 10.5 }}>{`DRUM  No. ${s.no}`}</div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 6.4, marginTop: 2 }}>{`Am7 · 31 rpm · ${s.note} · printed by Claude Opus 5.5`}</div>
            </div>
          </div>
        ))}
      </div>
    ),
    { width: 1200, height: 630, fonts, headers: { 'cache-control': 'public, max-age=86400, s-maxage=86400' } },
  )
}
