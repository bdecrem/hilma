import { ImageResponse } from 'next/og'
import { ogFont } from '@/lib/og-fonts'

export const runtime = 'nodejs'
export const alt = 'MRD: tracing every law the Migrant Rights Database cites'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const PAPER = '#f5f1e8', INK = '#1a1712', MUTE = '#7a7366', BLUE = '#3d3bff', RED = '#ff4b1f', TRACK = '#e8e1d2'

// 45 tiles in a 9×5 grid, a static picture of the dashboard's country grid
const tiles = Array.from({ length: 45 }, (_, i) => ((i * 37) % 100) / 100)

export default async function Image() {
  const black = await ogFont('inter-tight/InterTight-900.ttf')
  const semi = await ogFont('inter-tight/InterTight-600.ttf')
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: PAPER, color: INK, fontFamily: 'Inter Tight', padding: '64px 72px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: 560 }}>
          <div style={{ display: 'flex', fontSize: 22, fontWeight: 600, letterSpacing: 3, color: MUTE }}>MRD · SOURCE LAW CRAWL</div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40, fontSize: 64, fontWeight: 900, lineHeight: 1.02, letterSpacing: -2 }}>
            <span>Every law behind the</span><span>Migrant Rights</span><span>Database,</span><span style={{ color: BLUE }}>traced to its source.</span>
          </div>
          <div style={{ display: 'flex', marginTop: 32, fontSize: 26, fontWeight: 600, color: MUTE }}>45 countries · 66 indicators · 2,970 citations</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', width: 470, marginLeft: 42, marginTop: 70, gap: 8, alignContent: 'flex-start' }}>
          {tiles.map((t, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', width: 44, height: 64, border: `2px solid ${TRACK}`, borderRadius: 6, padding: 5 }}>
              <div style={{ display: 'flex', height: 5, borderRadius: 5, background: TRACK, overflow: 'hidden' }}>
                <div style={{ display: 'flex', width: `${Math.round(t * 75)}%`, background: BLUE }} />
                <div style={{ display: 'flex', width: `${Math.round((1 - t) * 20)}%`, background: RED }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: 'Inter Tight', data: black, weight: 900 }, { name: 'Inter Tight', data: semi, weight: 600 }] },
  )
}
