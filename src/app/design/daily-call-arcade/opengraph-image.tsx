import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const GRID = ['....C.C.....', '...CCCC.....', '...RRRRR....', '..RRRRRRR...', '.RRRRRWWRB..', '.RRRRRWKRBB.', '.RRRRRRRRB..', '.RPPRRRRR...', '.RPPRRRR....', '..RRRRR.....', '...RRR......']
const PX: Record<string, string> = { C: '#19e6ff', R: '#ff2fd2', P: '#ff7ae6', W: '#fff', K: '#0f1030', B: '#ffe600' }

export default function OgImage() {
  const rects: React.ReactNode[] = []
  GRID.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] !== '.') rects.push(<rect key={`${x}${y}`} x={x * 10} y={y * 10} width="10" height="10" fill={PX[row[x]]} />)
  })
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#06061a', color: '#fff', fontFamily: 'system-ui, sans-serif', backgroundImage: 'linear-gradient(rgba(25,230,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(25,230,255,0.08) 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, padding: '0 0 0 96px' }}>
          <div style={{ display: 'flex', fontSize: 22, letterSpacing: '0.14em', color: '#19e6ff', textTransform: 'uppercase', fontWeight: 700 }}>Daily call · style 1</div>
          <div style={{ display: 'flex', fontSize: 112, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 10, lineHeight: 1, textTransform: 'uppercase', color: '#ffe600' }}>Arcade</div>
          <div style={{ display: 'flex', fontSize: 30, color: '#b9bbea', marginTop: 24, maxWidth: 560, lineHeight: 1.35 }}>Neon on deep space. Talk, three things, cards, keep the streak.</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 40 }}>
            {['#ff2fd2', '#19e6ff', '#ffe600', '#7dff5a'].map((c) => (
              <div key={c} style={{ display: 'flex', width: 40, height: 40, borderRadius: 8, background: c }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 460 }}>
          <svg width="340" height="340" viewBox="0 0 120 120" shapeRendering="crispEdges">
            {rects}
          </svg>
        </div>
      </div>
    ),
    size,
  )
}
