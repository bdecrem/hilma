import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Plus Buddy - the Macintosh Plus mascot'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 60, background: '#1a0b2e', fontFamily: 'monospace' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 260, height: 330, background: '#efe6cf', border: '6px solid #222', borderRadius: 20, padding: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 200, height: 160, background: '#1b2a6b', borderRadius: 10, border: '10px solid #cfc4a6' }}>
            <div style={{ display: 'flex', gap: 50 }}>
              <div style={{ width: 12, height: 28, background: '#e8f0ff' }} />
              <div style={{ width: 12, height: 28, background: '#e8f0ff' }} />
            </div>
            <div style={{ width: 80, height: 30, borderBottom: '8px solid #e8f0ff', borderRadius: '0 0 40px 40px', marginTop: 10 }} />
          </div>
          <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', marginTop: 50 }}>
            <div style={{ width: 22, height: 22, borderRadius: 11, background: '#e03a3e' }} />
            <div style={{ width: 90, height: 12, background: '#222' }} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 96, color: '#fdb827', fontWeight: 700 }}>PLUS BUDDY</div>
          <div style={{ fontSize: 40, color: '#ff4fa3', marginTop: 10 }}>HELLO, 1986!</div>
          <div style={{ fontSize: 28, color: '#ffffffaa', marginTop: 20 }}>9600 baud of pure love</div>
        </div>
      </div>
    ),
    size,
  )
}
