import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Socratic — a study session on negligent entrustment'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Paper card. Math: 72px padding all round → 1056 × 486 content box;
// kicker (26) + title (150 line) + subtitle (44) ≈ 250 up top, quote block
// (2 lines × 46 = 92 + rule) pinned to the bottom edge of the content box.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#f3eee4',
          color: '#1e1b17',
          padding: 72,
          fontFamily: 'Georgia, Times New Roman, serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 26, letterSpacing: 6, textTransform: 'uppercase', color: '#7d2b2b', fontWeight: 700 }}>
            Socratic · Torts · Duty
          </div>
          <div style={{ fontSize: 124, lineHeight: 1.05, marginTop: 18, letterSpacing: -2 }}>Negligent Entrustment</div>
          <div style={{ fontSize: 40, color: '#57514a', marginTop: 14 }}>Vince v. Wilson and the employer-as-entruster hypothetical</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 26 }}>
          <div style={{ width: 8, height: 92, background: '#7d2b2b' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 44, fontStyle: 'italic', lineHeight: 1.05 }}>“A list of facts is never an argument.”</div>
            <div style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 24, color: '#8f877c', marginTop: 12 }}>
              A one-on-one study session modelled on Professor Zeiler’s Torts class
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
