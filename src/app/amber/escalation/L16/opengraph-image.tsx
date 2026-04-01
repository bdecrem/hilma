import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L16 — amber escalation'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  const colors = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D']
  const names = ['kick', 'snare', 'hat', 'clap']

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200, height: 630,
          background: 'linear-gradient(135deg, #FFECD2, #FFFDE7)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          fontFamily: 'monospace',
          gap: 12,
        }}
      >
        {/* Grid preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2, 3].map(row => (
            <div key={row} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ width: 50, fontSize: 14, color: '#999', textAlign: 'right' }}>{names[row]}</div>
              {Array.from({ length: 8 }).map((_, col) => {
                const active = (row + col) % 3 === 0 || (row === 0 && col % 2 === 0)
                return (
                  <div
                    key={col}
                    style={{
                      width: 52, height: 52, borderRadius: 8,
                      background: active ? colors[row] : 'rgba(0,0,0,0.06)',
                      opacity: active ? 0.8 : 1,
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>

        {/* Title */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 20 }}>
          <div style={{ fontSize: 48, fontWeight: 700, color: '#FF4E50' }}>L16</div>
          <div style={{ fontSize: 18, color: '#FC913A', opacity: 0.8 }}>they learned to keep time.</div>
        </div>
      </div>
    ),
    { ...size }
  )
}
