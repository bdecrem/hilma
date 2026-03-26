import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'synapses — amber'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #FFF8E7, #FFECD2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: 80, fontWeight: 800, color: '#FF4E50' }}>synapses</div>
          <div style={{ fontSize: 24, color: '#FC913A', marginTop: 12 }}>tap a node. watch the thought travel.</div>
        </div>
      </div>
    ),
    { ...size }
  )
}
