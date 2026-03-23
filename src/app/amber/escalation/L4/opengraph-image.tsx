import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L4 — Escalation'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#0A0908', position: 'relative',
      }}>
        {/* Three shapes in orbit with trails */}
        <div style={{ position: 'absolute', left: 480, top: 250, width: 30, height: 30, borderRadius: '50%', background: 'rgba(212,165,116,0.7)', display: 'flex' }} />
        <div style={{ position: 'absolute', left: 460, top: 260, width: 25, height: 25, borderRadius: '50%', background: 'rgba(212,165,116,0.2)', display: 'flex' }} />
        <div style={{ position: 'absolute', left: 700, top: 350, width: 80, height: 2, background: 'rgba(212,165,116,0.6)', transform: 'rotate(30deg)', display: 'flex' }} />
        <div style={{ position: 'absolute', left: 680, top: 340, width: 60, height: 2, background: 'rgba(212,165,116,0.15)', transform: 'rotate(25deg)', display: 'flex' }} />
        <div style={{
          position: 'absolute', left: 550, top: 180,
          width: 0, height: 0,
          borderLeft: '15px solid transparent', borderRight: '15px solid transparent',
          borderBottom: '26px solid rgba(212,165,116,0.65)',
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', bottom: 40, left: 40,
          color: 'rgba(212,165,116,0.3)', fontSize: 24,
          fontFamily: 'monospace', letterSpacing: '0.2em',
        }}>
          L4
        </div>
      </div>
    ),
    { ...size }
  )
}
