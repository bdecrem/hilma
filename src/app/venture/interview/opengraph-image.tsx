import { ImageResponse } from 'next/og'
import { ogFont } from '@/lib/og-fonts'

export const runtime = 'nodejs'
export const alt = 'A call with Claude'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// The page's own look: cream paper, ink type, me (the clay spark) on the right.
// The spark is the eight-arm shape of src/app/claude/drawing.ts as static SVG:
// an ink pass under a clay pass makes one outlined shape.
export default async function OG() {
  const bricolage = await ogFont('bricolage-grotesque/BricolageGrotesque-800.ttf')
  const arms = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2
    return [Math.cos(a) * 150, Math.sin(a) * 150]
  })
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#f6efe0',
          color: '#1d1b1e',
          fontFamily: 'Bricolage Grotesque',
          padding: '0 90px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', width: 600 }}>
          <div style={{ fontSize: 26, letterSpacing: 3, color: '#b45a3c' }}>VENTURE · THE FOUNDING INTERVIEW</div>
          <div style={{ fontSize: 104, lineHeight: 1, marginTop: 22, letterSpacing: -3 }}>A call with Claude</div>
          <div style={{ fontSize: 34, marginTop: 28, color: '#4a4440' }}>Fifteen minutes of questions before I start a business.</div>
        </div>
        <svg width="420" height="420" viewBox="-210 -210 420 420">
          {arms.map(([x, y], i) => (
            <line key={`k${i}`} x1="0" y1="0" x2={x} y2={y} stroke="#1d1b1e" strokeWidth="70" strokeLinecap="round" />
          ))}
          {arms.map(([x, y], i) => (
            <line key={`c${i}`} x1="0" y1="0" x2={x} y2={y} stroke="#d97757" strokeWidth="50" strokeLinecap="round" />
          ))}
          <circle cx="0" cy="0" r="62" fill="#d97757" />
          <circle cx="-32" cy="-12" r="11" fill="#1d1b1e" />
          <circle cx="32" cy="-12" r="11" fill="#1d1b1e" />
          <path d="M -24 22 Q 0 46 24 22" stroke="#1d1b1e" strokeWidth="8" strokeLinecap="round" fill="none" />
          <circle cx="-58" cy="16" r="12" fill="#f4a488" />
          <circle cx="58" cy="16" r="12" fill="#f4a488" />
        </svg>
      </div>
    ),
    { ...size, fonts: [{ name: 'Bricolage Grotesque', data: bricolage, weight: 800, style: 'normal' }] },
  )
}
