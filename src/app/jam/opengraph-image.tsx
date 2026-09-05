import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Jambot — talk to a groovebox'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// 16-step grid, 4 voices. Math: 16 cells × 56px + 15 gaps × 10px = 1046px wide.
// Left margin (1200 − 1046) / 2 = 77px. Rows: 4 × 56 + 3 × 10 = 254px tall.
const CELL = 56
const GAP = 10
const ROWS: { name: string; steps: number[]; color: string }[] = [
  { name: 'kick', steps: [0, 4, 8, 12], color: '#ffb02e' },
  { name: 'snare', steps: [4, 12], color: '#ff5c7a' },
  { name: 'ch', steps: [2, 6, 10, 14], color: '#5ee0ff' },
  { name: 'acid', steps: [0, 3, 6, 7, 10, 13, 14], color: '#b6ff3d' },
]

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#0d0e12',
          color: '#f2f2f5',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '64px 77px',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 28 }}>
          <div style={{ fontSize: 112, fontWeight: 800, letterSpacing: -5, lineHeight: 1 }}>JAMBOT</div>
          <div style={{ fontSize: 40, color: '#9a9ba6', letterSpacing: -1 }}>talk to a groovebox</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
          {ROWS.map((row) => (
            <div key={row.name} style={{ display: 'flex', gap: GAP }}>
              {Array.from({ length: 16 }, (_, i) => {
                const on = row.steps.includes(i)
                return (
                  <div
                    key={i}
                    style={{
                      width: CELL,
                      height: CELL,
                      borderRadius: 10,
                      background: on ? row.color : '#1a1c24',
                      boxShadow: on ? `0 0 24px ${row.color}66` : 'none',
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28, color: '#9a9ba6' }}>
          <div>“techno beat at 128, add acid bass, make the kick punchier”</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#ffb02e', fontWeight: 700 }}>
            <svg width="26" height="26" viewBox="0 0 20 20">
              <path d="M6 3.5v13l11-6.5z" fill="#ffb02e" />
            </svg>
            128 BPM
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
