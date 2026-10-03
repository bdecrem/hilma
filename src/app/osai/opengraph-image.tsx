import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'osai: Open Source AI'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const ROWS: { name: string; room: number }[] = [
  { name: 'AI products made for the public', room: 5 },
  { name: 'Shared data, computers, and scorekeeping', room: 4 },
  { name: "AI's effect on jobs, rights, and democracy", room: 3 },
  { name: 'Open AI models anyone can rebuild', room: 3 },
  { name: 'Making AI safe', room: 1 },
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
          justifyContent: 'space-between',
          background: '#0f1115',
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1.5px)',
          backgroundSize: '24px 24px',
          color: '#e9ecf1',
          padding: '56px 64px',
          fontFamily: 'Helvetica, Arial, sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>
            osai
            <div style={{ width: 11, height: 11, borderRadius: 3, background: '#8fe9cb', marginTop: 6 }} />
          </div>
          <div style={{ display: 'flex', fontSize: 62, fontWeight: 700, lineHeight: 1.04, marginTop: 22, maxWidth: 1000, letterSpacing: -2 }}>
            Open Source AI, the working notes.
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: '#8b93a1', marginTop: 18 }}>
            The one-pager, the public-benefit AI map, and an assistant that has read both.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ROWS.map((r) => (
            <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 23 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <div
                    key={n}
                    style={{
                      width: 34,
                      height: 14,
                      borderRadius: 3,
                      background: n <= r.room ? '#f2a93b' : 'transparent',
                      border: '1.5px solid #f2a93b',
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex' }}>{r.name}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  )
}
