import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L1 — Escalation'
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
          width: 80, height: 80, borderRadius: '50%',
          background: 'radial-gradient(circle, #D4A574, #B8860B)',
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', bottom: 40, left: 40,
          color: 'rgba(212,165,116,0.3)', fontSize: 24,
          fontFamily: 'monospace', letterSpacing: '0.2em',
        }}>
          L1
        </div>
      </div>
    ),
    { ...size }
  )
}
