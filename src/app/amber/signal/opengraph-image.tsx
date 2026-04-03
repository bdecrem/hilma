import React from 'react'
import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

function lissajousPath(
  cx: number, cy: number, r: number,
  fA: number, fB: number,
  phaseOff: number,
  N = 400
): string {
  const T = Math.PI * 4
  let d = ''
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * T
    const x = cx + r * Math.sin(fA * t + phaseOff)
    const y = cy + r * Math.sin(fB * t)
    d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`
  }
  return d
}

export default function OGImage() {
  const cx = 600, cy = 315, r = 230
  const fA = 5, fB = 3

  const p1 = lissajousPath(cx, cy, r, fA, fB, 0)
  const p2 = lissajousPath(cx, cy, r, fA, fB, Math.PI / 6)
  const p3 = lissajousPath(cx, cy, r, fA, fB, Math.PI / 3)

  return new ImageResponse(
    <div
      style={{
        width: '1200px',
        height: '630px',
        background: 'linear-gradient(135deg, #0D3B66 0%, #1A1A2E 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <svg
        width="1200"
        height="630"
        style={{ position: 'absolute', top: 0, left: 0 } as React.CSSProperties}
      >
        <path d={p3} stroke="#FF6B81" strokeWidth="1.5" fill="none" opacity="0.4" />
        <path d={p2} stroke="#FC913A" strokeWidth="2"   fill="none" opacity="0.55" />
        <path d={p1} stroke="#FF4E50" strokeWidth="2.5" fill="none" opacity="0.85" />
      </svg>

      {/* Ratio label */}
      <div
        style={{
          position: 'absolute',
          bottom: '40px',
          left: '48px',
          color: '#D4A574',
          fontSize: '20px',
          fontFamily: 'monospace',
          opacity: 0.7,
          display: 'flex',
        }}
      >
        signal — 5:3
      </div>
    </div>,
    { width: 1200, height: 630 }
  )
}
