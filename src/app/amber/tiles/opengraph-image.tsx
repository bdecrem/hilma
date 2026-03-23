import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'TILES — living pattern'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  const colors = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81', '#FF8A65']
  const hexes: { x: number; y: number; c: string }[] = []
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 14; col++) {
      hexes.push({
        x: col * 90 + (row % 2 === 0 ? 0 : 45),
        y: row * 80,
        c: colors[(col + row * 2) % colors.length],
      })
    }
  }
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexWrap: 'wrap',
        background: '#FFE0DD', position: 'relative', overflow: 'hidden',
      }}>
        {hexes.map((h, i) => (
          <div key={i} style={{
            position: 'absolute', left: h.x, top: h.y,
            width: 70, height: 70, borderRadius: '50%',
            background: h.c, opacity: 0.7,
            display: 'flex',
          }} />
        ))}
        <div style={{
          position: 'absolute', bottom: 40, left: 40,
          color: 'rgba(0,0,0,0.1)', fontSize: 24,
          fontFamily: 'monospace', letterSpacing: '0.3em',
        }}>
          TILES
        </div>
      </div>
    ),
    { ...size }
  )
}
