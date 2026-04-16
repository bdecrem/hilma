import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'interference — two signals meeting'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  const NIGHT = '#0A0A0A'
  const CREAM = '#E8E8E8'
  const LIME = '#C6FF3C'

  const W = 1200, H = 630

  // Source positions
  const s1 = { x: Math.round(0.33 * W), y: Math.round(0.46 * H) }
  const s2 = { x: Math.round(0.67 * W), y: Math.round(0.54 * H) }

  // Concentric rings from each source — fringe spacing ≈ 114px
  const spacing = 114
  const maxR = 900
  const rings: React.ReactElement[] = []

  for (let r = spacing * 0.5; r < maxR; r += spacing) {
    const fade = Math.max(0.04, 0.22 * (1 - r / maxR))
    for (let si = 0; si < 2; si++) {
      const sx = si === 0 ? s1.x : s2.x
      const sy = si === 0 ? s1.y : s2.y
      rings.push(
        <div
          key={`r${si}-${Math.round(r)}`}
          style={{
            position: 'absolute',
            left: sx - r,
            top: sy - r,
            width: r * 2,
            height: r * 2,
            borderRadius: '50%',
            border: `1px solid rgba(232,232,232,${fade.toFixed(3)})`,
            boxSizing: 'border-box',
          }}
        />
      )
    }
  }

  return new ImageResponse(
    <div
      style={{
        width: W,
        height: H,
        background: NIGHT,
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {rings}

      {/* Source 1 — lime */}
      <div
        style={{
          position: 'absolute',
          left: s1.x - 7,
          top: s1.y - 7,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: LIME,
          boxShadow: '0 0 28px 14px rgba(198,255,60,0.22)',
        }}
      />

      {/* Source 2 — lime */}
      <div
        style={{
          position: 'absolute',
          left: s2.x - 7,
          top: s2.y - 7,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: LIME,
          boxShadow: '0 0 28px 14px rgba(198,255,60,0.22)',
        }}
      />

      {/* Museum label — lower-left */}
      <div
        style={{
          position: 'absolute',
          left: 64,
          bottom: 58,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <span
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: 62,
            fontStyle: 'italic',
            fontWeight: 300,
            color: CREAM,
            lineHeight: 1,
          }}
        >
          interference
        </span>
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 14,
            fontWeight: 700,
            color: 'rgba(232,232,232,0.5)',
            marginTop: 12,
            letterSpacing: 1,
          }}
        >
          two signals meeting
        </span>
      </div>

      {/* Spec label — lower-right */}
      <div
        style={{
          position: 'absolute',
          right: 64,
          bottom: 24,
          fontFamily: 'monospace',
          fontSize: 11,
          fontWeight: 700,
          color: 'rgba(232,232,232,0.28)',
          letterSpacing: 1,
        }}
      >
        signal · spec 003 · 04.16.26
      </div>
    </div>,
    { ...size },
  )
}
