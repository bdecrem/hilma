import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L15 — strings'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  const colors = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81', '#FF8C42', '#E8D44D', '#FF4E50']
  const notes = ['G3', 'A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5']

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #FFFDE7, #FFECD2)',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Strings */}
        {colors.map((color, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 80,
              right: 80,
              top: 80 + i * 62,
              height: 4,
              background: color,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <div style={{
              position: 'absolute',
              left: -50,
              fontSize: 14,
              color: '#78716c',
              display: 'flex',
            }}>
              {notes[i]}
            </div>
          </div>
        ))}
        {/* Bridge lines */}
        <div style={{ position: 'absolute', left: 76, top: 70, width: 3, height: 510, background: '#2A221830', display: 'flex' }} />
        <div style={{ position: 'absolute', right: 76, top: 70, width: 3, height: 510, background: '#2A221830', display: 'flex' }} />
        {/* Title */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10, marginTop: 300 }}>
          <div style={{ fontSize: 72, fontWeight: 800, color: '#2A2218', letterSpacing: '-0.03em' }}>
            L15
          </div>
          <div style={{ fontSize: 24, color: '#78716c', marginTop: 4 }}>
            sound unlocked. tap the strings.
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
