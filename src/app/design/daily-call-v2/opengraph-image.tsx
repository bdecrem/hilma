import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Paper, the palette as a row of dots, and the parrot in its sunflower disc.
export default function OgImage() {
  const ink = '#16121C'
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#FFF4E3', color: ink, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, padding: '0 0 0 96px' }}>
          <div style={{ display: 'flex', fontSize: 20, letterSpacing: '0.08em', color: '#9a93a3', textTransform: 'uppercase', fontWeight: 700 }}>Design artifact · v2</div>
          <div style={{ display: 'flex', fontSize: 100, fontWeight: 800, letterSpacing: '-0.04em', marginTop: 14, lineHeight: 1 }}>Daily call</div>
          <div style={{ display: 'flex', fontSize: 30, color: '#5b5565', marginTop: 26, lineHeight: 1.35, maxWidth: 560 }}>
            Talk for three minutes. Say three things back. Clear your cards. Keep the streak.
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 44 }}>
            {['#FF4B1F', '#3D3BFF', '#FFC31F', '#B6F23A', '#16121C'].map((c) => (
              <div key={c} style={{ display: 'flex', width: 44, height: 44, borderRadius: 999, background: c, border: `2px solid ${ink}` }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 460 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 380, height: 380, borderRadius: 999, background: '#FFC31F', border: `3px solid ${ink}` }}>
            <svg width="260" height="260" viewBox="0 0 120 120">
              <ellipse cx="34" cy="34" rx="7" ry="17" transform="rotate(-38 34 34)" fill="#3D3BFF" />
              <ellipse cx="48" cy="24" rx="7" ry="19" transform="rotate(-14 48 24)" fill="#3D3BFF" />
              <ellipse cx="62" cy="26" rx="6" ry="16" transform="rotate(12 62 26)" fill="#3D3BFF" />
              <circle cx="62" cy="66" r="40" fill="#FF4B1F" />
              <circle cx="40" cy="80" r="9" fill="#ff8a6a" />
              <ellipse cx="74" cy="58" rx="15" ry="17" fill="#fff" />
              <circle cx="77" cy="60" r="7" fill="#16121C" />
              <circle cx="80" cy="57" r="2.4" fill="#fff" />
              <path d="M88 64 C106 62 111 78 102 92 C98 85 92 80 86 78 Z" fill="#FFC31F" stroke="#16121C" strokeWidth="1.5" />
              <path d="M86 78 C92 80 98 85 102 92 C95 94 89 92 85 87 Z" fill="#e2a600" />
            </svg>
          </div>
        </div>
      </div>
    ),
    size,
  )
}
