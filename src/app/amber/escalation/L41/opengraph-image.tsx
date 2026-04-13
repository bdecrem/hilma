import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L41: tap to drop a stone. watch the waves find each other.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    <div style={{
      width: 1200, height: 630,
      background: 'linear-gradient(135deg, #FFECD2, #FFF0F0)',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'flex-end', padding: 50,
      fontFamily: 'monospace', position: 'relative',
    }}>
      {/* Wavy lines suggesting 3D water */}
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: 80, top: 80 + i * 28,
          width: 1040, height: 2,
          background: ['#2D5A27', '#B4E33D', '#FFF8E7', '#F9D423', '#FC913A', '#FF4E50'][i % 6],
          opacity: 0.25 + (i / 14) * 0.45,
          borderRadius: 1,
        }} />
      ))}
      <span style={{ fontSize: 64, color: '#2A2218' }}>L41</span>
      <span style={{ fontSize: 22, color: '#2A2218', opacity: 0.6, marginTop: 8 }}>
        tap to drop a stone. watch the waves find each other.
      </span>
    </div>,
    { ...size },
  )
}
