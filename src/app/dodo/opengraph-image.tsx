import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Dodo — learn it, keep it'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Butter paper, a flash-card panel, marigold accent — the site in one frame.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FBF5E6',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: '#FFFDF7',
            border: '2px solid #E3D9C2',
            borderRadius: 44,
            padding: '64px 84px',
            boxShadow: '0 24px 60px rgba(51,56,62,0.12)',
          }}
        >
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: 5,
              color: '#B97A14',
              marginBottom: 22,
            }}
          >
            DODO · FLASH CARDS
          </div>
          <div
            style={{
              fontSize: 96,
              fontWeight: 700,
              color: '#33383E',
              lineHeight: 1.05,
              letterSpacing: -3,
            }}
          >
            Learn it.
          </div>
          <div
            style={{
              fontSize: 96,
              fontWeight: 700,
              color: '#DD9420',
              lineHeight: 1.05,
              letterSpacing: -3,
              marginBottom: 30,
            }}
          >
            Keep it.
          </div>
          <div style={{ fontSize: 30, color: '#606C75' }}>
            An open-source AI learning companion for iPhone
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
