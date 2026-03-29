import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'FILAMENT — slime mold transport network'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  // Simulate a network of food nodes connected by filaments
  const nodes = [
    { x: 200, y: 300, c: '#FF4E50' },
    { x: 500, y: 150, c: '#FC913A' },
    { x: 800, y: 350, c: '#F9D423' },
    { x: 400, y: 480, c: '#B4E33D' },
    { x: 1000, y: 200, c: '#FF6B81' },
    { x: 650, y: 500, c: '#FC913A' },
    { x: 300, y: 120, c: '#FF4E50' },
  ]

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        background: 'linear-gradient(135deg, #FFECD2, #FFFDE7)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Filament connections as lines */}
        <svg width="1200" height="630" style={{ position: 'absolute', top: 0, left: 0 }}>
          {nodes.map((a, i) =>
            nodes.slice(i + 1).map((b, j) => (
              <line
                key={`${i}-${j}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="#FC913A" strokeWidth="2" opacity="0.25"
              />
            ))
          )}
        </svg>
        {/* Scattered trail dots */}
        {Array.from({ length: 60 }).map((_, i) => {
          const ni = i % nodes.length
          const ni2 = (i + 1) % nodes.length
          const t = (i * 17 % 100) / 100
          return (
            <div key={`d${i}`} style={{
              position: 'absolute',
              left: nodes[ni].x + (nodes[ni2].x - nodes[ni].x) * t + ((i * 7) % 40) - 20,
              top: nodes[ni].y + (nodes[ni2].y - nodes[ni].y) * t + ((i * 11) % 30) - 15,
              width: 4, height: 4, borderRadius: '50%',
              background: nodes[ni].c, opacity: 0.4,
              display: 'flex',
            }} />
          )
        })}
        {/* Food nodes */}
        {nodes.map((n, i) => (
          <div key={i} style={{
            position: 'absolute', left: n.x - 16, top: n.y - 16,
            width: 32, height: 32, borderRadius: '50%',
            background: n.c,
            boxShadow: `0 0 20px ${n.c}60`,
            display: 'flex',
          }} />
        ))}
        <div style={{
          position: 'absolute', bottom: 40, left: 40,
          color: 'rgba(0,0,0,0.08)', fontSize: 24,
          fontFamily: 'monospace', letterSpacing: '0.3em',
          display: 'flex',
        }}>
          FILAMENT
        </div>
      </div>
    ),
    { ...size }
  )
}
