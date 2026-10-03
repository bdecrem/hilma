import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'osai: Open Source AI, the working notes'
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
          background: '#f4f5f7',
          color: '#1c2027',
          padding: '56px 64px',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 26, color: '#155e63', fontWeight: 700, letterSpacing: 1 }}>osai</div>
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, lineHeight: 1.05, marginTop: 18, maxWidth: 1000 }}>
            Open Source AI, the working notes.
          </div>
          <div style={{ display: 'flex', fontSize: 28, color: '#5b6370', marginTop: 18 }}>
            The one-pager, the public-benefit AI map, and an assistant that has read both.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ROWS.map((r) => (
            <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 24 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <div
                    key={n}
                    style={{
                      width: 34,
                      height: 14,
                      borderRadius: 3,
                      background: n <= r.room ? '#c2410c' : 'transparent',
                      border: '1.5px solid #c2410c',
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
