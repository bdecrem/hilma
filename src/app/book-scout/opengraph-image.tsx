import { ImageResponse } from 'next/og'

export const alt = 'Dog-Ear — new books worth folding down a corner for'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          position: 'relative',
          background: '#f3ead7',
          padding: '78px',
          fontFamily: 'Georgia, serif',
        }}
      >
        {/* dog-ear fold, top-right */}
        <div style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderLeft: '120px solid transparent', borderTop: '120px solid #b03a26' }} />
        <div style={{ display: 'flex', fontSize: 26, letterSpacing: 8, textTransform: 'uppercase', color: '#b03a26', fontFamily: 'monospace' }}>
          A reading list
        </div>
        <div style={{ display: 'flex', fontSize: 132, fontWeight: 700, color: '#231d15', marginTop: 8, lineHeight: 1 }}>
          Dog-Ear
        </div>
        <div style={{ display: 'flex', fontSize: 32, fontStyle: 'italic', color: '#6f6552', marginTop: 26, maxWidth: 940, lineHeight: 1.35 }}>
          New books worth folding down a corner for — picked by real booksellers, with a few from Claude.
        </div>
      </div>
    ),
    { ...size },
  )
}
