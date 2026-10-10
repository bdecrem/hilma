import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#fffdf5', color: '#111', fontFamily: 'system-ui, sans-serif', backgroundImage: 'radial-gradient(rgba(17,17,17,0.12) 1.5px, transparent 2px)', backgroundSize: '12px 12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, padding: '0 0 0 96px' }}>
          <div style={{ display: 'flex', fontSize: 22, letterSpacing: '0.1em', color: '#ff3b30', textTransform: 'uppercase', fontWeight: 800 }}>Daily call · style 3</div>
          <div style={{ display: 'flex', fontSize: 120, fontWeight: 900, letterSpacing: '-0.02em', marginTop: 10, lineHeight: 1, textTransform: 'uppercase', color: '#111', textShadow: '6px 6px 0 #ffd60a' }}>Sticker</div>
          <div style={{ display: 'flex', fontSize: 30, color: '#444', marginTop: 28, maxWidth: 560, lineHeight: 1.35 }}>Fat outlines, hard shadows, die-cut stickers. Talk, three things, cards, keep the streak.</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 40 }}>
            {['#ff3b30', '#2962ff', '#ffd60a', '#30d158'].map((c) => (
              <div key={c} style={{ display: 'flex', width: 44, height: 44, borderRadius: 10, background: c, border: '3px solid #111', boxShadow: '4px 4px 0 #111' }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 460 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 380, height: 380, borderRadius: 40, background: '#fff', border: '4px solid #111', boxShadow: '12px 12px 0 #111', transform: 'rotate(-4deg)' }}>
            <svg width="280" height="280" viewBox="0 0 120 120">
              <ellipse cx="34" cy="34" rx="7" ry="17" transform="rotate(-38 34 34)" fill="#2962ff" stroke="#111" strokeWidth="3.5" />
              <ellipse cx="48" cy="24" rx="7" ry="19" transform="rotate(-14 48 24)" fill="#2962ff" stroke="#111" strokeWidth="3.5" />
              <ellipse cx="62" cy="26" rx="6" ry="16" transform="rotate(12 62 26)" fill="#2962ff" stroke="#111" strokeWidth="3.5" />
              <circle cx="62" cy="66" r="40" fill="#ff3b30" stroke="#111" strokeWidth="3.5" />
              <circle cx="40" cy="80" r="8" fill="#ff8a80" />
              <ellipse cx="74" cy="58" rx="15" ry="17" fill="#fff" stroke="#111" strokeWidth="3" />
              <circle cx="77" cy="60" r="7" fill="#111" />
              <circle cx="80" cy="57" r="2.4" fill="#fff" />
              <path d="M88 64 C106 62 111 78 102 92 C98 85 92 80 86 78 Z" fill="#ffd60a" stroke="#111" strokeWidth="3.5" strokeLinejoin="round" />
              <path d="M86 78 C92 80 98 85 102 92 C95 94 89 92 85 87 Z" fill="#e0b800" stroke="#111" strokeWidth="3" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    ),
    size,
  )
}
