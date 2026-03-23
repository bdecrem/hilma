import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L2 — Escalation'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#0A0908',
      }}>
        <div style={{
          width: 300, height: 2, background: '#D4A574',
          transform: 'rotate(15deg)',
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', bottom: 40, left: 40,
          color: 'rgba(212,165,116,0.3)', fontSize: 24,
          fontFamily: 'monospace', letterSpacing: '0.2em',
        }}>
          L2
        </div>
      </div>
    ),
    { ...size }
  )
}
