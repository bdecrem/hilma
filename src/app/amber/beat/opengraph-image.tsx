import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'beat — two frequencies, close enough to argue'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  // Generate a static representation of the beat sum waveform
  const points: string[] = []
  const width = 1100
  const height = 280
  const baseY = 0
  const amp = 90
  const n = 400
  for (let i = 0; i < n; i++) {
    const t = i / n
    const phaseA = 2 * Math.PI * 6 * t
    const phaseB = 2 * Math.PI * 6.3 * t
    const sample = (Math.sin(phaseA) + Math.sin(phaseB)) / 2
    const env = Math.abs(sample)
    const x = (i / (n - 1)) * width
    const y = baseY + sample * amp
    points.push(`${x},${y},${env.toFixed(2)}`)
  }

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
        {/* Two bobbing-dot zones */}
        <div
          style={{
            position: 'absolute',
            top: '110px',
            left: '48px',
            right: '48px',
            display: 'flex',
            flexDirection: 'column',
            gap: '36px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', height: '36px', position: 'relative' }}>
            <span style={{ color: '#E8E8E8', opacity: 0.55, fontSize: '12px', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '1px', width: '100px' }}>A · 220 HZ</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(232,232,232,0.15)' }} />
            <div style={{ position: 'absolute', right: '120px', top: '10px', width: '8px', height: '8px', borderRadius: '50%', background: '#E8E8E8' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', height: '36px', position: 'relative' }}>
            <span style={{ color: '#E8E8E8', opacity: 0.55, fontSize: '12px', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '1px', width: '100px' }}>B · 223 HZ</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(232,232,232,0.15)' }} />
            <div style={{ position: 'absolute', right: '120px', top: '22px', width: '8px', height: '8px', borderRadius: '50%', background: '#E8E8E8' }} />
          </div>
        </div>

        {/* Sum trace — middle */}
        <div style={{ position: 'absolute', top: '280px', left: '48px', right: '48px', height: '220px', display: 'flex', alignItems: 'center' }}>
          <span style={{ color: '#E8E8E8', opacity: 0.55, fontSize: '12px', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '1px', position: 'absolute', top: '-18px' }}>A + B</span>
          <svg width="1104" height="220" style={{ display: 'block' }} viewBox="0 0 1104 220">
            {points.map((p, i) => {
              if (i === 0) return null
              const [x, y, envStr] = p.split(',')
              const [px, py] = points[i - 1].split(',')
              const env = parseFloat(envStr)
              const color = env > 0.75 ? '#C6FF3C' : '#E8E8E8'
              const opacity = env > 0.75 ? 0.95 : (env > 0.35 ? 0.55 : 0.2)
              const lw = env > 0.75 ? 2.5 : (env > 0.35 ? 1.8 : 1.2)
              return (
                <line
                  key={i}
                  x1={px}
                  y1={110 + parseFloat(py)}
                  x2={x}
                  y2={110 + parseFloat(y)}
                  stroke={color}
                  strokeOpacity={opacity}
                  strokeWidth={lw}
                />
              )
            })}
          </svg>
        </div>

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
            beat
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
            two frequencies, close enough to argue
          </span>
        </div>
      </div>
    ),
    { ...size }
  )
}
