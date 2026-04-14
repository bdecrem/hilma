import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'certificate of authenticity — bureau of ordinary moments'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    <div style={{
      width: 1200, height: 630,
      background: 'linear-gradient(135deg, #FFECD2, #FFF0F0)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif', position: 'relative',
    }}>
      {/* Certificate paper */}
      <div style={{
        width: 860, height: 480,
        background: '#F5EBD7',
        padding: 40,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        border: '2px solid #2A2218',
        outline: '1px solid #2A2218',
        outlineOffset: 6,
        boxShadow: '6px 8px 0 rgba(0,0,0,0.15)',
        position: 'relative',
      }}>
        <span style={{ fontSize: 28, fontWeight: 'bold', color: '#2A2218', letterSpacing: 3 }}>
          CERTIFICATE OF AUTHENTICITY
        </span>
        <span style={{ fontSize: 16, fontStyle: 'italic', color: 'rgba(42,34,24,0.6)', marginTop: 4 }}>
          bureau of ordinary moments
        </span>
        <div style={{
          width: 600, height: 1, background: '#2A2218', marginTop: 36,
        }} />
        <span style={{ fontSize: 14, fontStyle: 'italic', color: 'rgba(42,34,24,0.7)', marginTop: 16 }}>
          this certifies that
        </span>
        <span style={{
          fontSize: 24, color: '#2A2218', marginTop: 18, textAlign: 'center',
          lineHeight: 1.4, maxWidth: 760,
        }}>
          at 3:47pm on a tuesday, you stood holding a mug that had gone cold
          and thought about nothing for six seconds.
        </span>
        <div style={{
          width: 600, height: 1, background: '#2A2218', marginTop: 26,
        }} />
        <span style={{ fontSize: 14, fontStyle: 'italic', color: 'rgba(42,34,24,0.8)', marginTop: 14 }}>
          this moment was authentic. it happened. it counted.
        </span>
        {/* Seal */}
        <div style={{
          position: 'absolute', left: 80, bottom: 40,
          width: 84, height: 84, borderRadius: 84,
          background: '#FF4E50',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#F5EBD7', fontSize: 20, fontWeight: 'bold',
          transform: 'rotate(-8deg)',
        }}>
          ★
        </div>
      </div>
    </div>,
    { ...size },
  )
}
