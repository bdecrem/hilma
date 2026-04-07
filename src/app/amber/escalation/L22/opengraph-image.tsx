import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L22 — amber escalation'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  // Organic blob clusters that evoke reaction-diffusion coral/spot patterns
  // Laid out in a loose scatter — dense center-right, sparse upper-left
  const blobs = [
    // Large anchor blobs
    { cx: 720, cy: 280, r: 58, color: '#FF4E50', opacity: 0.85 },
    { cx: 840, cy: 200, r: 42, color: '#FC913A', opacity: 0.8 },
    { cx: 650, cy: 370, r: 36, color: '#FF4E50', opacity: 0.7 },
    { cx: 930, cy: 310, r: 30, color: '#FC913A', opacity: 0.75 },
    { cx: 780, cy: 430, r: 26, color: '#FF4E50', opacity: 0.65 },
    // Secondary cluster (upper-left)
    { cx: 260, cy: 160, r: 34, color: '#FC913A', opacity: 0.6 },
    { cx: 180, cy: 240, r: 22, color: '#FF4E50', opacity: 0.55 },
    { cx: 340, cy: 210, r: 18, color: '#FC913A', opacity: 0.5 },
    // Scattered small blobs
    { cx: 500, cy: 140, r: 20, color: '#FF4E50', opacity: 0.5 },
    { cx: 420, cy: 430, r: 16, color: '#FC913A', opacity: 0.55 },
    { cx: 1000, cy: 180, r: 22, color: '#FF4E50', opacity: 0.5 },
    { cx: 1050, cy: 420, r: 18, color: '#FC913A', opacity: 0.45 },
    { cx: 140, cy: 400, r: 14, color: '#FF4E50', opacity: 0.4 },
    { cx: 580, cy: 480, r: 12, color: '#FC913A', opacity: 0.45 },
    { cx: 880, cy: 500, r: 14, color: '#FF4E50', opacity: 0.4 },
    // Micro dots — the "noise" texture
    { cx: 310, cy: 330, r: 8, color: '#FC913A', opacity: 0.35 },
    { cx: 460, cy: 280, r: 6, color: '#FF4E50', opacity: 0.3 },
    { cx: 680, cy: 160, r: 7, color: '#FC913A', opacity: 0.35 },
    { cx: 970, cy: 460, r: 8, color: '#FF4E50', opacity: 0.3 },
    { cx: 100, cy: 320, r: 6, color: '#FC913A', opacity: 0.3 },
  ]

  // Connective filaments — thin arcs between clusters, like coral branches
  const filaments = [
    { x1: 720, y1: 280, x2: 840, y2: 200 },
    { x1: 840, y1: 200, x2: 930, y2: 310 },
    { x1: 720, y1: 280, x2: 650, y2: 370 },
    { x1: 650, y1: 370, x2: 780, y2: 430 },
    { x1: 260, y1: 160, x2: 180, y2: 240 },
    { x1: 260, y1: 160, x2: 340, y2: 210 },
  ]

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: 'linear-gradient(135deg, #E0BBE4 0%, #FFECD2 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'monospace',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background texture: faint grid suggesting the simulation grid */}
        <svg
          style={{ position: 'absolute', inset: 0, width: 1200, height: 630, opacity: 0.06 }}
          viewBox="0 0 1200 630"
        >
          {Array.from({ length: 30 }, (_, i) => (
            <line key={`v${i}`} x1={i * 40} y1={0} x2={i * 40} y2={630} stroke="#FF4E50" strokeWidth={0.5} />
          ))}
          {Array.from({ length: 16 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={i * 40} x2={1200} y2={i * 40} stroke="#FF4E50" strokeWidth={0.5} />
          ))}
        </svg>

        {/* Connective filaments */}
        <svg
          style={{ position: 'absolute', inset: 0, width: 1200, height: 630 }}
          viewBox="0 0 1200 630"
        >
          {filaments.map((f, i) => (
            <line
              key={i}
              x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2}
              stroke="#FF4E50"
              strokeWidth={1.5}
              opacity={0.25}
            />
          ))}
        </svg>

        {/* Organic blobs */}
        <svg
          style={{ position: 'absolute', inset: 0, width: 1200, height: 630 }}
          viewBox="0 0 1200 630"
        >
          {blobs.map((b, i) => (
            <circle
              key={i}
              cx={b.cx}
              cy={b.cy}
              r={b.r}
              fill={b.color}
              opacity={b.opacity}
            />
          ))}
          {/* Glow halos on the large blobs */}
          {blobs.slice(0, 5).map((b, i) => (
            <circle
              key={`glow${i}`}
              cx={b.cx}
              cy={b.cy}
              r={b.r * 1.8}
              fill={b.color}
              opacity={0.12}
            />
          ))}
        </svg>

        {/* Title block */}
        <div
          style={{
            position: 'absolute',
            bottom: 48,
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 72, fontWeight: 700, color: '#FF4E50', lineHeight: 1 }}>L22</div>
          <div style={{ fontSize: 22, color: '#FC913A', opacity: 0.9 }}>
            drag to seed. the chemistry decides the pattern.
          </div>
        </div>

        {/* Citrus dot row */}
        <div
          style={{
            position: 'absolute',
            top: 28,
            right: 40,
            display: 'flex',
            gap: 10,
          }}
        >
          {['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81'].map((c, i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: c,
                opacity: 0.75,
              }}
            />
          ))}
        </div>

        {/* Preset labels — subtle, top-left */}
        <div
          style={{
            position: 'absolute',
            top: 28,
            left: 40,
            display: 'flex',
            gap: 20,
            opacity: 0.35,
            fontSize: 13,
            color: '#2D5A27',
          }}
        >
          <span>coral</span>
          <span>spots</span>
          <span>maze</span>
        </div>
      </div>
    ),
    { ...size }
  )
}
