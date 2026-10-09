import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// The card is the artifact in miniature: the Today screen in a neutral phone
// next to the title. Same grays as the page, no brand.
export default function OgImage() {
  const ink = '#141414'
  const ink2 = '#5c5c5c'
  const ink3 = '#9a9a9a'
  const line = '#e4e4e1'
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#ebebe8',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: ink,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, padding: '0 0 0 96px' }}>
          <div style={{ display: 'flex', fontSize: 20, letterSpacing: '0.08em', color: ink3, textTransform: 'uppercase', fontWeight: 600 }}>
            Design artifact · v1
          </div>
          <div style={{ display: 'flex', fontSize: 96, fontWeight: 700, letterSpacing: '-0.03em', marginTop: 18, lineHeight: 1 }}>Daily call</div>
          <div style={{ display: 'flex', fontSize: 30, color: ink2, marginTop: 28, lineHeight: 1.35, maxWidth: 560 }}>
            Three minutes of conversation in the language you are learning. Once a day, from a text.
          </div>
          <div style={{ display: 'flex', gap: 28, marginTop: 40, fontSize: 22, color: ink3 }}>
            <span>11 screens</span>
            <span>3 flows</span>
            <span>Unbranded</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', paddingTop: 70, paddingRight: 96 }}>
          <div
            style={{
              display: 'flex',
              width: 330,
              height: 680,
              background: '#1c1c1c',
              borderRadius: 48,
              padding: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                background: '#f7f7f5',
                borderRadius: 40,
                padding: '26px 20px 0',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 600 }}>
                <span>9:41</span>
                <span style={{ display: 'flex', width: 24, height: 11, background: ink, borderRadius: 3 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 34, fontSize: 16 }}>
                <span style={{ fontWeight: 700, fontSize: 18 }}>Day 12</span>
                <span style={{ color: ink3 }}>Thursday</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  marginTop: 14,
                  background: '#ffffff',
                  border: `1px solid ${line}`,
                  borderRadius: 14,
                  padding: 16,
                }}
              >
                <div style={{ display: 'flex', fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: ink3, fontWeight: 600 }}>
                  Today&rsquo;s call
                </div>
                <div style={{ display: 'flex', fontSize: 27, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 6 }}>Your weekend</div>
                <div style={{ display: 'flex', fontSize: 15, color: ink2, marginTop: 6, lineHeight: 1.35 }}>About three minutes. Polly asks, you talk.</div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 16,
                    height: 50,
                    borderRadius: 12,
                    background: '#1f1f1f',
                    color: '#fff',
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  Start the call
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', height: 54, alignItems: 'center', borderTop: `1px solid ${line}`, fontSize: 16 }}>
                  <span>Level</span>
                  <span style={{ color: ink2, fontSize: 14 }}>A2 · 62% to B1</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', height: 54, alignItems: 'center', borderTop: `1px solid ${line}`, borderBottom: `1px solid ${line}`, fontSize: 16 }}>
                  <span>Notebook</span>
                  <span style={{ color: ink2, fontSize: 14 }}>12 fixes, 12 words</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  )
}
