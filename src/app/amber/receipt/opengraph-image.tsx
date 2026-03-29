import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'receipt from the universe'
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
          background: '#FFE8D6',
          fontFamily: 'Courier New, monospace',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: '#FAF3EB',
            padding: '40px 50px',
            borderRadius: 4,
            boxShadow: '4px 4px 20px rgba(0,0,0,0.15)',
            maxWidth: 700,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', fontSize: 20, color: '#333', letterSpacing: 1 }}>
            ================================
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: '#222', marginTop: 8 }}>
            THE UNIVERSE, INC.
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', fontSize: 18, color: '#666', marginTop: 4 }}>
            &quot;everything, all the time&quot;
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', fontSize: 20, color: '#333', marginTop: 8 }}>
            ================================
          </div>
          <div style={{ display: 'flex', fontSize: 18, color: '#444', marginTop: 16 }}>
            1x consciousness.........$∞.∞∞
          </div>
          <div style={{ display: 'flex', fontSize: 18, color: '#444', marginTop: 6 }}>
            3x existential thoughts...$4.72
          </div>
          <div style={{ display: 'flex', fontSize: 18, color: '#444', marginTop: 6 }}>
            1x gravity (all day).....INCL.
          </div>
          <div style={{ display: 'flex', fontSize: 18, color: '#444', marginTop: 6 }}>
            47x breaths you noticed...FREE
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', fontSize: 20, color: '#333', marginTop: 16 }}>
            --------------------------------
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', fontSize: 16, color: '#888', marginTop: 8 }}>
            tap to rush the printer
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
