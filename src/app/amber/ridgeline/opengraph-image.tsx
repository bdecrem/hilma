import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'RIDGELINE — a landscape still being born'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'flex-end', background: 'linear-gradient(180deg, #0A0908 0%, #1a1510 60%, #2a1f14 100%)',
        position: 'relative',
      }}>
        {[0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map((y, i) => (
          <div key={i} style={{
            position: 'absolute',
            bottom: `${(1 - y) * 100}%`,
            left: 0, width: '100%',
            height: `${(1 - y) * 100}%`,
            background: `rgba(${212 - i * 30}, ${165 - i * 25}, ${116 - i * 18}, ${0.8 - i * 0.1})`,
            clipPath: `polygon(0% ${30 + i * 5 + Math.sin(i) * 10}%, 20% ${20 + i * 8}%, 40% ${35 + i * 4}%, 60% ${15 + i * 7}%, 80% ${30 + i * 5}%, 100% ${25 + i * 6}%, 100% 100%, 0% 100%)`,
            display: 'flex',
          }} />
        ))}
        <div style={{
          position: 'absolute', top: 40, left: 60,
          color: 'rgba(212,165,116,0.25)', fontSize: 20,
          fontFamily: 'monospace', letterSpacing: '0.3em',
          display: 'flex',
        }}>
          RIDGELINE
        </div>
      </div>
    ),
    { ...size }
  )
}
