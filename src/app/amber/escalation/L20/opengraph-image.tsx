import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L20 — amber escalation'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']

  // Simulate particle flow trails — curved paths across the canvas
  const trails = [
    { color: '#FF4E50', points: [[60, 480], [180, 390], [320, 310], [500, 260], [680, 240], [840, 220]] },
    { color: '#FC913A', points: [[120, 200], [260, 260], [400, 350], [560, 400], [720, 380], [900, 310]] },
    { color: '#F9D423', points: [[0, 340], [140, 300], [280, 240], [440, 190], [620, 170], [800, 155], [980, 170]] },
    { color: '#B4E33D', points: [[200, 560], [340, 490], [500, 420], [660, 360], [820, 310], [1000, 270]] },
    { color: '#FF6B81', points: [[80, 140], [220, 200], [380, 280], [540, 350], [700, 400], [880, 430], [1050, 420]] },
    { color: '#FF4E50', points: [[300, 80], [440, 130], [580, 190], [740, 240], [900, 280], [1060, 300]] },
    { color: '#FC913A', points: [[0, 580], [160, 520], [330, 460], [510, 390], [690, 330], [870, 280], [1080, 240]] },
    { color: '#B4E33D', points: [[400, 580], [540, 530], [680, 470], [820, 420], [960, 380], [1100, 340]] },
    { color: '#F9D423', points: [[0, 100], [100, 150], [230, 220], [370, 290], [520, 360], [680, 410], [840, 440]] },
    { color: '#FF6B81', points: [[600, 60], [720, 100], [840, 160], [960, 240], [1080, 320], [1160, 400]] },
  ]

  // Build SVG path strings from point arrays
  const pathStrings = trails.map(t => {
    const pts = t.points
    let d = `M ${pts[0][0]} ${pts[0][1]}`
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]
      const curr = pts[i]
      const cx = (prev[0] + curr[0]) / 2
      const cy = (prev[1] + curr[1]) / 2
      d += ` Q ${prev[0]} ${prev[1]} ${cx} ${cy}`
    }
    return { d, color: t.color }
  })

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: 'linear-gradient(135deg, #FFF8E7 0%, #FFECD2 50%, #FFF0F0 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'monospace',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Flow trails rendered as SVG */}
        <svg
          style={{ position: 'absolute', inset: 0, width: 1200, height: 630 }}
          viewBox="0 0 1200 630"
          xmlns="http://www.w3.org/2000/svg"
        >
          {pathStrings.map((p, i) => (
            <path
              key={i}
              d={p.d}
              stroke={p.color}
              strokeWidth={i % 3 === 0 ? 2 : 1.2}
              fill="none"
              opacity={0.55}
            />
          ))}
          {/* Dot caps at trail ends */}
          {trails.map((t, i) => {
            const last = t.points[t.points.length - 1]
            return (
              <circle
                key={i}
                cx={last[0]}
                cy={last[1]}
                r={3.5}
                fill={t.color}
                opacity={0.8}
              />
            )
          })}
        </svg>

        {/* Disturbance ring (tap ripple) */}
        <div
          style={{
            position: 'absolute',
            left: 540,
            top: 240,
            width: 160,
            height: 160,
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.6)',
            boxShadow: '0 0 0 4px rgba(255,255,255,0.2)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 570,
            top: 270,
            width: 100,
            height: 100,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.4)',
          }}
        />

        {/* Title block */}
        <div
          style={{
            position: 'absolute',
            bottom: 52,
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 68, fontWeight: 700, color: '#FF4E50', lineHeight: 1 }}>L20</div>
          <div style={{ fontSize: 22, color: '#FC913A', opacity: 0.9 }}>
            the current knows where to go. tap to bend it.
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
          {CITRUS.map((c, i) => (
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
      </div>
    ),
    { ...size }
  )
}
