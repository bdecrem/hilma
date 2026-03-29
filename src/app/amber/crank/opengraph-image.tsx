import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'crank — a tiny gear machine'
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
          background: 'linear-gradient(135deg, #FFECD2, #FFFDE7)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Decorative gears */}
        <div style={{ display: 'flex', position: 'absolute', top: 80, left: 120 }}>
          <div
            style={{
              width: 200,
              height: 200,
              borderRadius: '50%',
              background: '#FC913A',
              border: '6px solid #2A2218',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 50,
                height: 50,
                borderRadius: '50%',
                background: '#FFF8E7',
                border: '4px solid #2A2218',
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', position: 'absolute', top: 200, left: 280 }}>
          <div
            style={{
              width: 140,
              height: 140,
              borderRadius: '50%',
              background: '#FF4E50',
              border: '6px solid #2A2218',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 35,
                height: 35,
                borderRadius: '50%',
                background: '#FFF8E7',
                border: '4px solid #2A2218',
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', position: 'absolute', top: 120, right: 200 }}>
          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: '50%',
              background: '#B4E33D',
              border: '6px solid #2A2218',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: '#FFF8E7',
                border: '4px solid #2A2218',
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', position: 'absolute', bottom: 100, right: 140 }}>
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              background: '#F9D423',
              border: '6px solid #2A2218',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: '#FFF8E7',
                border: '4px solid #2A2218',
              }}
            />
          </div>
        </div>
        {/* Title */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            zIndex: 10,
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: '#2A2218',
              letterSpacing: '-0.03em',
            }}
          >
            crank
          </div>
          <div
            style={{
              fontSize: 28,
              color: '#78716c',
              marginTop: 8,
            }}
          >
            drag the gear. spin the machine.
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
