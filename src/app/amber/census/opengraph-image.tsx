import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'CENSUS — of invisible things'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  const items = [
    { num: '4,291', label: 'lies told this second' },
    { num: '12,847', label: 'people who just forgot what they were about to say' },
    { num: '891.2m', label: 'chairs currently being sat in wrong' },
    { num: '7.4b', label: 'tabs open that will never be read' },
  ]
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', background: '#0A0908', padding: '60px 80px',
        fontFamily: 'monospace',
      }}>
        <div style={{ color: 'rgba(212,165,116,0.15)', fontSize: 14, marginBottom: 40, display: 'flex', letterSpacing: '0.2em' }}>
          CENSUS OF INVISIBLE THINGS
        </div>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 20, marginBottom: 24, alignItems: 'baseline' }}>
            <div style={{ color: `rgba(212,165,116,${0.7 - i * 0.1})`, fontSize: 36, minWidth: 200, textAlign: 'right', display: 'flex', justifyContent: 'flex-end' }}>
              {item.num}
            </div>
            <div style={{ color: 'rgba(212,165,116,0.25)', fontSize: 16, display: 'flex' }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>
    ),
    { ...size }
  )
}
