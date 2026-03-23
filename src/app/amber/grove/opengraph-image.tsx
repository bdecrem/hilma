import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'GROVE — a citrus grove in Unicode'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#FFF8E7', fontFamily: 'monospace',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Ground */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 180, background: '#E8DCC8', display: 'flex' }} />
        {/* Tree shapes */}
        {[300, 600, 900].map((x, i) => (
          <div key={i} style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', left: x - 60, bottom: 160 }}>
            <div style={{ fontSize: 40, color: '#B4E33D', display: 'flex', flexWrap: 'wrap', width: 120, justifyContent: 'center', lineHeight: 1 }}>
              {'♣♠♣♠♣♠♣♣♠♣♠♣'}
            </div>
            <div style={{ fontSize: 30, color: '#FC913A', display: 'flex' }}>●●●</div>
            <div style={{ fontSize: 24, color: '#8B5E3C', display: 'flex' }}>║║</div>
          </div>
        ))}
        <div style={{
          position: 'absolute', bottom: 40, left: 40,
          color: 'rgba(0,0,0,0.1)', fontSize: 24, letterSpacing: '0.3em',
        }}>
          GROVE
        </div>
      </div>
    ),
    { ...size }
  )
}
