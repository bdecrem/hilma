import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const W = 1200
  const H = 630

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          background: '#1A110A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          padding: 60,
        }}
      >
        {/* the pass */}
        <div
          style={{
            width: 760,
            background: '#EFE7D8',
            color: '#2C2117',
            padding: '40px 46px',
            display: 'flex',
            flexDirection: 'column',
            borderLeft: '10px solid #FF7A1A',
            boxShadow: '0 22px 60px rgba(0,0,0,0.45)',
            transform: 'rotate(-1.5deg)',
          }}
        >
          <div
            style={{
              fontSize: 14,
              letterSpacing: 6,
              color: '#7a6a57',
              marginBottom: 10,
              display: 'flex',
            }}
          >
            FORM LP-001 · DEPARTMENT OF DELAY
          </div>
          <div
            style={{
              fontSize: 46,
              fontWeight: 700,
              letterSpacing: 6,
              color: '#2C2117',
              marginBottom: 24,
              display: 'flex',
            }}
          >
            OFFICIAL LATE PASS
          </div>

          <div style={{ fontSize: 16, letterSpacing: 5, color: '#7a6a57', marginBottom: 6, display: 'flex' }}>
            REASON FOR DELAY
          </div>
          <div
            style={{
              fontSize: 40,
              fontStyle: 'italic',
              fontWeight: 400,
              color: '#2C2117',
              lineHeight: 1.3,
              borderBottom: '2px dashed #2C2117',
              paddingBottom: 22,
              display: 'flex',
            }}
          >
            a song came on and I had to wait for the bridge.
          </div>

          <div
            style={{
              marginTop: 28,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 14, letterSpacing: 5, color: '#7a6a57', display: 'flex' }}>
                AUTHORIZED BY
              </div>
              <div style={{ fontSize: 38, fontStyle: 'italic', color: '#2C2117', display: 'flex', marginTop: 4 }}>
                amber
              </div>
            </div>
            <div
              style={{
                border: '4px solid #FF7A1A',
                color: '#FF7A1A',
                padding: '10px 22px',
                transform: 'rotate(-7deg)',
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: 5,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              GRANTED
              <div style={{ fontSize: 12, letterSpacing: 4, marginTop: 4, opacity: 0.85, display: 'flex' }}>
                AMBER INDUSTRIES
              </div>
            </div>
          </div>
        </div>

        {/* header label top-left */}
        <div
          style={{
            position: 'absolute',
            top: 40,
            left: 60,
            color: '#FF7A1A',
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: 6,
            display: 'flex',
          }}
        >
          AMBER INDUSTRIES · DEPARTMENT OF DELAY
        </div>

        {/* a. mark bottom-right */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            right: 60,
            color: '#E8E8E8',
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 4,
            display: 'flex',
          }}
        >
          a.<span style={{ color: '#FF7A1A', marginLeft: 2 }}>·</span>
        </div>
      </div>
    ),
    size,
  )
}
