import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'track 01 — hallman minimal, 126 bpm'
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
        <svg
          width="1200"
          height="630"
          viewBox="0 0 1200 630"
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          {/* Main cream ring */}
          <circle cx={600} cy={280} r={140} stroke="#E8E8E8" strokeOpacity={0.6} strokeWidth={2} fill="none" />
          <circle cx={600} cy={280} r={98} stroke="#E8E8E8" strokeOpacity={0.2} strokeWidth={1} fill="none" />
          {/* Hat flecks */}
          {Array.from({ length: 14 }).map((_, i) => {
            const angle = (i / 14) * Math.PI * 2 + (i * 0.37)
            const dist = (0.75 + (i * 0.0713) % 0.6) * 140
            const x = 600 + Math.cos(angle) * dist
            const y = 280 + Math.sin(angle) * dist
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={2.5}
                fill="#E8E8E8"
                fillOpacity={0.45 + (i * 0.11) % 0.4}
              />
            )
          })}
          {/* Lime core */}
          <circle cx={600} cy={280} r={40} fill="#C6FF3C" fillOpacity={0.85} filter="url(#glow)" />
          <circle cx={600} cy={280} r={56} stroke="#C6FF3C" strokeOpacity={0.55} strokeWidth={2} fill="none" />
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="14" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          {/* Progress hairline */}
          <line x1={48} y1={540} x2={1152} y2={540} stroke="#E8E8E8" strokeOpacity={0.2} strokeWidth={1} />
          <line x1={48} y1={540} x2={800} y2={540} stroke="#C6FF3C" strokeOpacity={0.75} strokeWidth={2} />
        </svg>
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
            track 01
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
            hallman — minimal, 126 bpm
          </span>
        </div>
      </div>
    ),
    { ...size }
  )
}
