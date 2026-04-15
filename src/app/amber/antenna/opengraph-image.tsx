import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'antenna — listening for a specific signal'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  const NIGHT = '#0A0A0A'
  const CREAM = '#E8E8E8'
  const LIME = '#C6FF3C'

  // Scattered specks
  const specks: [number, number, number][] = [
    [0.78, 0.19, 3], [0.14, 0.44, 2], [0.71, 0.74, 3], [0.48, 0.08, 2],
    [0.89, 0.58, 4], [0.23, 0.81, 2], [0.58, 0.31, 2], [0.08, 0.17, 2], [0.62, 0.52, 2],
  ]

  const antX = 408   // 0.34 * 1200
  const antTopY = 139 // 0.22 * 630
  const antBotY = 428 // 0.68 * 630

  return new ImageResponse(
    <div style={{
      width: 1200, height: 630,
      background: NIGHT,
      display: 'flex',
      position: 'relative',
    }}>
      {/* Antenna shaft */}
      <div style={{
        position: 'absolute', left: antX, top: antTopY,
        width: 2, height: antBotY - antTopY, background: CREAM,
      }} />
      {/* Base mark */}
      <div style={{
        position: 'absolute', left: antX - 14, top: antBotY,
        width: 30, height: 2, background: CREAM,
      }} />
      {/* Middle tick */}
      <div style={{
        position: 'absolute', left: antX - 8, top: antTopY + (antBotY - antTopY) * 0.7,
        width: 18, height: 2, background: CREAM,
      }} />
      {/* Tip — LIME, caught signal */}
      <div style={{
        position: 'absolute', left: antX - 6, top: antTopY - 6,
        width: 14, height: 14, background: LIME,
      }} />
      {/* Signal line sweeping right */}
      <div style={{
        position: 'absolute', left: antX + 8, top: antTopY - 1,
        width: 280, height: 2, background: LIME, opacity: 0.85,
      }} />
      {/* Leading dot */}
      <div style={{
        position: 'absolute', left: antX + 284, top: antTopY - 3,
        width: 6, height: 6, background: LIME,
      }} />

      {/* Specks */}
      {specks.map(([fx, fy, sz], i) => (
        <div key={i} style={{
          position: 'absolute', left: fx * 1200, top: fy * 630,
          width: sz, height: sz, background: CREAM, opacity: 0.45,
        }} />
      ))}

      {/* Museum label — lower-left */}
      <div style={{
        position: 'absolute', left: 62, top: 500,
        display: 'flex', flexDirection: 'column',
      }}>
        <span style={{
          fontFamily: 'Georgia, serif',
          fontSize: 68, fontStyle: 'italic', fontWeight: 300,
          color: CREAM, lineHeight: 1,
        }}>
          antenna
        </span>
        <span style={{
          fontFamily: 'monospace',
          fontSize: 15, fontWeight: 700,
          color: 'rgba(232, 232, 232, 0.55)',
          marginTop: 12, letterSpacing: 1,
        }}>
          listening for a specific signal
        </span>
      </div>

      {/* Bottom-right spec */}
      <div style={{
        position: 'absolute', right: 62, bottom: 28,
        fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
        color: 'rgba(232, 232, 232, 0.35)', letterSpacing: 1,
      }}>
        signal · spec 001 · 04.15.26
      </div>
    </div>,
    { ...size },
  )
}
