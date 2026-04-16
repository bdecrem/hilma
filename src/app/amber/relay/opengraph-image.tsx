import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'relay — a signal, passed along'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#0A0A0A',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: '48px',
        }}
      >
        {/* Five relay dots across the middle */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '80px',
            position: 'absolute',
            top: '240px',
            left: '0',
            right: '0',
          }}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: i === 2 ? '#C6FF3C' : '#E8E8E8',
                  boxShadow: i === 2 ? '0 0 20px #C6FF3C' : 'none',
                }}
              />
              <div
                style={{
                  width: '40px',
                  height: '60px',
                  border: `1.5px solid ${i === 2 ? '#C6FF3C' : 'rgba(232,232,232,0.3)'}`,
                  borderRadius: '2px',
                }}
              />
            </div>
          ))}
          {/* Connecting lines */}
          {[0, 1, 2, 3].map((i) => (
            <div
              key={`line-${i}`}
              style={{
                position: 'absolute',
                top: '6px',
                left: `${180 + i * 136}px`,
                width: '80px',
                height: '1px',
                background: 'rgba(232,232,232,0.2)',
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span
            style={{
              color: '#E8E8E8',
              fontSize: '28px',
              fontFamily: 'serif',
              fontStyle: 'italic',
              fontWeight: 300,
              opacity: 0.7,
            }}
          >
            relay
          </span>
          <span
            style={{
              color: '#E8E8E8',
              fontSize: '13px',
              fontFamily: 'monospace',
              fontWeight: 700,
              letterSpacing: '1px',
              opacity: 0.4,
            }}
          >
            a signal, passed along
          </span>
        </div>
      </div>
    ),
    { ...size }
  )
}
