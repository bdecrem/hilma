import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L46 — lock: two frequencies, bound'
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
          position: 'relative',
        }}
      >
        {/* Two locked circles — markers at same offset */}
        <svg
          width="1200"
          height="340"
          style={{ position: 'absolute', top: '80px', left: 0 }}
          viewBox="0 0 1200 340"
        >
          {/* Circle 1 */}
          <circle cx={460} cy={170} r={110} stroke="#C6FF3C" strokeOpacity={0.85} strokeWidth={2} fill="none" />
          <line x1={460} y1={170} x2={460 + Math.cos(Math.PI / 6) * 110} y2={170 + Math.sin(Math.PI / 6) * 110} stroke="#C6FF3C" strokeWidth={3} />
          <circle cx={460} cy={170} r={3} fill="#C6FF3C" />
          <circle cx={460 + Math.cos(Math.PI / 6) * 110} cy={170 + Math.sin(Math.PI / 6) * 110} r={7} fill="#C6FF3C" />

          {/* Circle 2 — same offset (locked) */}
          <circle cx={740} cy={170} r={110} stroke="#C6FF3C" strokeOpacity={0.85} strokeWidth={2} fill="none" />
          <line x1={740} y1={170} x2={740 + Math.cos(Math.PI / 6) * 110} y2={170 + Math.sin(Math.PI / 6) * 110} stroke="#C6FF3C" strokeWidth={3} />
          <circle cx={740} cy={170} r={3} fill="#C6FF3C" />
          <circle cx={740 + Math.cos(Math.PI / 6) * 110} cy={170 + Math.sin(Math.PI / 6) * 110} r={7} fill="#C6FF3C" />
        </svg>

        {/* Labels above */}
        <div style={{ position: 'absolute', top: '52px', left: '48px', right: '48px', display: 'flex', justifyContent: 'space-around' }}>
          <span style={{ color: '#E8E8E8', opacity: 0.45, fontSize: '13px', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '1px' }}>θ₁ · 220 HZ</span>
          <span style={{ color: '#E8E8E8', opacity: 0.45, fontSize: '13px', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '1px' }}>θ₂ · 223 HZ</span>
        </div>

        {/* Slider (schematic) */}
        <div style={{ position: 'absolute', top: '450px', left: '48px', right: '48px', height: '2px', background: 'rgba(232,232,232,0.25)', display: 'flex', alignItems: 'center' }}>
          <div style={{ position: 'absolute', left: '35%', width: '2px', height: '24px', top: '-11px', background: '#C6FF3C', opacity: 0.6 }} />
          <div style={{ position: 'absolute', left: '70%', width: '16px', height: '16px', top: '-7px', borderRadius: '50%', background: '#C6FF3C', boxShadow: '0 0 16px #C6FF3C' }} />
        </div>
        <div style={{ position: 'absolute', top: '420px', right: '48px', color: '#C6FF3C', opacity: 0.85, fontSize: '13px', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '1px' }}>LOCKED</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span
            style={{
              color: '#E8E8E8',
              fontSize: '30px',
              fontFamily: 'serif',
              fontStyle: 'italic',
              fontWeight: 300,
              opacity: 0.75,
            }}
          >
            lock
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
            two frequencies, bound · L46
          </span>
        </div>
      </div>
    ),
    { ...size }
  )
}
