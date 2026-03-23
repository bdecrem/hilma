import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'bore — tunnel service for AI agents'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(180deg, #1a1a18, #2a2218)',
        fontFamily: 'monospace',
      }}>
        <div style={{ fontSize: 80, fontWeight: 800, color: '#FFF', letterSpacing: '-0.02em' }}>
          bore
        </div>
        <div style={{ fontSize: 22, color: 'rgba(255,255,255,0.3)', marginTop: 16 }}>
          expose localhost to the internet. one command.
        </div>
        <div style={{
          marginTop: 40, background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12, padding: '16px 32px',
          fontSize: 18, color: '#FC913A',
        }}>
          $ npx bore-tunnel http 3000
        </div>
      </div>
    ),
    { ...size }
  )
}
