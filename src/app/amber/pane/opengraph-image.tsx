import { ImageResponse } from 'next/og'

export const runtime     = 'edge'
export const alt         = 'pane — stained glass by amber'
export const size        = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Glass panes: left, top, width, height, color
// Layout: 3 rows × variable columns, 12 px lead gaps, 12 px outer margin
// Row 1 (y:12, h:180): A(370) B(460) C(322)  — total 1152 + 2×12 + 2×12 = 1200 ✓
// Row 2 (y:204, h:222): D(260) E(360) F(280) G(240) — total 1140 + 3×12 + 2×12 = 1200 ✓
// Row 3 (y:438, h:180): H(560) I(310) J(282)  — total 1152 + 2×12 + 2×12 = 1200 ✓
const PANES = [
  // Row 1
  { l:  12, t:  12, w: 370, h: 180, c: '#FF4E50', hi: 'rgba(255,255,255,0.28)' }, // blood orange
  { l: 394, t:  12, w: 460, h: 180, c: '#F9D423', hi: 'rgba(255,255,255,0.20)' }, // mango
  { l: 866, t:  12, w: 322, h: 180, c: '#B4E33D', hi: 'rgba(255,255,255,0.22)' }, // lime
  // Row 2
  { l:  12, t: 204, w: 260, h: 222, c: '#FF6B81', hi: 'rgba(255,255,255,0.26)' }, // grapefruit
  { l: 284, t: 204, w: 360, h: 222, c: '#FC913A', hi: 'rgba(255,255,255,0.24)' }, // tangerine
  { l: 656, t: 204, w: 280, h: 222, c: '#FFF8E7', hi: 'rgba(255,220,180,0.45)' }, // warm cream
  { l: 948, t: 204, w: 240, h: 222, c: '#D4A574', hi: 'rgba(255,255,255,0.30)' }, // amber
  // Row 3
  { l:  12, t: 438, w: 560, h: 180, c: '#FC913A', hi: 'rgba(255,255,255,0.22)' }, // tangerine
  { l: 584, t: 438, w: 310, h: 180, c: '#FF4E50', hi: 'rgba(255,255,255,0.28)' }, // blood orange
  { l: 906, t: 438, w: 282, h: 180, c: '#B4E33D', hi: 'rgba(255,255,255,0.20)' }, // lime
]

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#2A1F1A',
          display: 'flex',
          position: 'relative',
        }}
      >
        {/* Glass panes — each has a radial highlight for the backlit glass look */}
        {PANES.map((p, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              display: 'flex',
              left:   p.l,
              top:    p.t,
              width:  p.w,
              height: p.h,
              // Backlit glass: radial highlight at top-centre blends into flat colour
              background: `radial-gradient(ellipse at 50% 28%, ${p.hi} 0%, transparent 65%), ${p.c}`,
            }}
          />
        ))}

        {/* Title */}
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 4,
            bottom: 38,
            right:  56,
          }}
        >
          <div
            style={{
              fontSize:      72,
              fontWeight:    700,
              fontFamily:    'monospace',
              color:         'rgba(255,200,120,0.92)',
              letterSpacing: '-1px',
              display: 'flex',
            }}
          >
            pane
          </div>
          <div
            style={{
              fontSize:      18,
              fontFamily:    'monospace',
              color:         'rgba(255,200,120,0.50)',
              letterSpacing: '3px',
              display: 'flex',
            }}
          >
            amber
          </div>
        </div>

        {/* URL */}
        <div
          style={{
            position:      'absolute',
            display:       'flex',
            bottom:        42,
            left:          56,
            fontFamily:    'monospace',
            fontSize:      17,
            color:         'rgba(255,200,120,0.40)',
            letterSpacing: '0.04em',
          }}
        >
          intheamber.com
        </div>
      </div>
    ),
    { ...size },
  )
}
