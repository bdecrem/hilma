import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: 'linear-gradient(135deg, #ffd3ea 0%, #e9ddff 50%, #c9fff0 100%)', color: '#3b2a5a', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, padding: '0 0 0 96px' }}>
          <div style={{ display: 'flex', fontSize: 22, letterSpacing: '0.1em', color: '#7b5cff', textTransform: 'uppercase', fontWeight: 700 }}>Daily call · style 2</div>
          <div style={{ display: 'flex', fontSize: 120, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 10, lineHeight: 1, color: '#ff4fa3' }}>Candy</div>
          <div style={{ display: 'flex', fontSize: 30, color: '#7a6a99', marginTop: 24, maxWidth: 560, lineHeight: 1.35 }}>Pastel sky, jelly buttons, a gummy parrot. Talk, three things, cards, keep the streak.</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 40 }}>
            {['#ff4fa3', '#7b5cff', '#ffd93d', '#5ff0c0'].map((c) => (
              <div key={c} style={{ display: 'flex', width: 44, height: 44, borderRadius: 999, background: c, boxShadow: '0 6px 0 rgba(0,0,0,0.12)' }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 460 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 380, height: 380, borderRadius: 999, background: '#fff', boxShadow: '0 20px 50px rgba(123,92,255,0.3)' }}>
            <svg width="270" height="270" viewBox="0 0 120 120">
              <ellipse cx="34" cy="34" rx="8" ry="18" transform="rotate(-38 34 34)" fill="#9b7cff" />
              <ellipse cx="48" cy="23" rx="8" ry="20" transform="rotate(-14 48 23)" fill="#8b68ff" />
              <ellipse cx="62" cy="25" rx="7" ry="17" transform="rotate(12 62 25)" fill="#7b5cff" />
              <circle cx="62" cy="66" r="42" fill="#ff5aa8" />
              <ellipse cx="46" cy="44" rx="14" ry="8" transform="rotate(-30 46 44)" fill="#fff" opacity="0.55" />
              <circle cx="40" cy="82" r="10" fill="#ffb6d9" />
              <ellipse cx="74" cy="58" rx="16" ry="18" fill="#fff" />
              <circle cx="77" cy="60" r="8" fill="#3b2a5a" />
              <circle cx="80" cy="56" r="3" fill="#fff" />
              <path d="M88 64 C106 62 112 78 103 93 C99 86 93 81 86 79 Z" fill="#ffd93d" />
              <path d="M86 79 C93 81 99 86 103 93 C96 95 90 93 85 88 Z" fill="#f0b400" />
            </svg>
          </div>
        </div>
      </div>
    ),
    size,
  )
}
