import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Spring Abstract - by Amber'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'hsl(210, 25%, 94%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Abstract color fields */}
        <div style={{
          position: 'absolute', width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, hsla(340, 70%, 75%, 0.4), transparent)',
          top: 60, left: 150,
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', width: 350, height: 350, borderRadius: '50%',
          background: 'radial-gradient(circle, hsla(45, 80%, 70%, 0.35), transparent)',
          top: 150, right: 200,
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', width: 300, height: 300, borderRadius: '50%',
          background: 'radial-gradient(circle, hsla(160, 60%, 65%, 0.3), transparent)',
          bottom: 50, left: 400,
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', width: 250, height: 250, borderRadius: '50%',
          background: 'radial-gradient(circle, hsla(270, 60%, 75%, 0.3), transparent)',
          top: 50, right: 100,
          display: 'flex',
        }} />
        {/* Rings */}
        <div style={{
          position: 'absolute', width: 200, height: 200, borderRadius: '50%',
          border: '3px solid hsla(350, 70%, 75%, 0.4)',
          top: 180, left: 280,
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', width: 140, height: 140, borderRadius: '50%',
          border: '2px solid hsla(45, 80%, 65%, 0.3)',
          bottom: 120, right: 350,
          display: 'flex',
        }} />
        {/* Text */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          zIndex: 1,
        }}>
          <div style={{
            fontSize: 56, fontWeight: 300, color: 'hsla(0, 0%, 30%, 0.7)',
            fontFamily: 'system-ui, sans-serif', letterSpacing: '0.05em',
          }}>
            spring abstract
          </div>
          <div style={{
            fontSize: 20, color: 'hsla(0, 0%, 50%, 0.5)',
            fontFamily: 'system-ui, sans-serif', marginTop: 12,
          }}>
            amber
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
