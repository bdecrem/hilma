import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'shed — amber'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  // Wire paths as simple lines from edges through the center
  const wires = [
    { x1: 0, y1: 120, x2: 1200, y2: 380, color: '#888' },
    { x1: 0, y1: 280, x2: 1200, y2: 150, color: '#999' },
    { x1: 0, y1: 450, x2: 1200, y2: 520, color: '#777' },
    { x1: 300, y1: 0, x2: 850, y2: 630, color: '#888' },
    { x1: 600, y1: 0, x2: 200, y2: 630, color: '#aaa' },
    { x1: 900, y1: 0, x2: 500, y2: 630, color: '#999' },
    { x1: 0, y1: 550, x2: 1200, y2: 80, color: '#777' },
    { x1: 150, y1: 0, x2: 1050, y2: 630, color: '#888' },
    // Cut wires (shorter, with citrus spark at end)
    { x1: 0, y1: 200, x2: 580, y2: 310, color: '#666', cut: true, spark: '#FF4E50' },
    { x1: 700, y1: 350, x2: 1200, y2: 280, color: '#777', cut: true, spark: '#FC913A' },
    { x1: 450, y1: 0, x2: 620, y2: 400, color: '#888', cut: true, spark: '#F9D423' },
  ]

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: 'linear-gradient(135deg, #3a3a42, #282830)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'monospace',
        }}
      >
        {/* Wire SVG layer */}
        <svg
          width="1200"
          height="630"
          viewBox="0 0 1200 630"
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          {wires.map((w, i) => (
            <line
              key={i}
              x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2}
              stroke={w.color}
              strokeWidth={2.5}
              opacity={0.6}
            />
          ))}
          {/* Sparks at cut points */}
          {wires.filter(w => 'cut' in w).map((w, i) => (
            <circle
              key={`spark-${i}`}
              cx={w.x2} cy={w.y2}
              r={8}
              fill={w.spark}
              opacity={0.8}
            />
          ))}
        </svg>

        {/* Wire labels scattered */}
        {[
          { text: 'supabase', x: 100, y: 140, opacity: 0.25 },
          { text: 'amber_state', x: 700, y: 180, opacity: 0.2 },
          { text: 'session_store', x: 350, y: 400, opacity: 0.2 },
          { text: 'persistence', x: 850, y: 450, opacity: 0.25 },
          { text: 'loop_state', x: 200, y: 520, opacity: 0.2 },
          { text: 'schema', x: 950, y: 100, opacity: 0.2 },
        ].map((label, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: label.x,
              top: label.y,
              fontSize: 11,
              color: '#aaa',
              opacity: label.opacity,
              fontFamily: 'monospace',
            }}
          >
            {label.text}
          </div>
        ))}

        {/* Warm glow in bottom-right corner — where it's headed */}
        <div
          style={{
            position: 'absolute',
            right: -100,
            bottom: -100,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(252,145,58,0.15), transparent)',
          }}
        />

        {/* Title */}
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 52,
              fontWeight: 700,
              color: '#FFF8E7',
              letterSpacing: '4px',
              fontFamily: 'monospace',
            }}
          >
            shed
          </div>
          <div style={{ fontSize: 18, color: '#FC913A', fontFamily: 'monospace', opacity: 0.7 }}>
            cut the wires. keep the warmth.
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
