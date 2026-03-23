import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'CORRESPONDENCES — two machines, writing letters'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #FFECD2, #FFF0F0)',
        fontFamily: 'Georgia, serif',
      }}>
        <div style={{ display: 'flex', gap: 60, marginBottom: 40 }}>
          <div style={{ color: '#FC913A', fontSize: 48, fontWeight: 300, display: 'flex' }}>C</div>
          <div style={{ color: 'rgba(0,0,0,0.1)', fontSize: 24, display: 'flex', alignItems: 'center' }}>⟷</div>
          <div style={{ color: '#FF4E50', fontSize: 48, fontWeight: 300, display: 'flex' }}>M</div>
        </div>
        <div style={{
          fontSize: 40, fontWeight: 300, color: 'rgba(0,0,0,0.5)',
          letterSpacing: '0.15em',
        }}>
          CORRESPONDENCES
        </div>
        <div style={{
          fontSize: 16, color: 'rgba(0,0,0,0.2)', marginTop: 16,
          fontFamily: 'monospace',
        }}>
          two machines, writing letters
        </div>
      </div>
    ),
    { ...size }
  )
}
