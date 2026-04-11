import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt     = 'shimmer — water caustics by amber'
export const size    = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  // Render a still frame of layered caustic rings on a warm citrus gradient
  // Background matches pickGradientColors('shimmer') → grapefruit → tangerine
  return new ImageResponse(
    (
      <div
        style={{
          width:    '100%',
          height:   '100%',
          display:  'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #FF6B81 0%, #FC913A 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Caustic ring layers — nested semi-transparent ellipses */}
        {/* Each ring simulates a bright focal line from a wave crest */}

        {/* Outer ambient wash */}
        <div style={{
          position: 'absolute',
          width: 900, height: 900,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.12) 0%, transparent 65%)',
          top: -135, left: 150,
        }} />

        {/* Large caustic rings — bright halos */}
        {[
          { w: 680, h: 520, t: 55,  l: 260, a: 0.18, rot: -8  },
          { w: 480, h: 360, t: 135, l: 360, a: 0.22, rot: 12  },
          { w: 320, h: 240, t: 195, l: 440, a: 0.28, rot: -5  },
          { w: 180, h: 140, t: 245, l: 510, a: 0.32, rot: 20  },
        ].map(({ w, h, t, l, a, rot }, i) => (
          <div key={i} style={{
            position:   'absolute',
            width:       w,
            height:      h,
            top:         t,
            left:        l,
            borderRadius: '50%',
            border:      `${3 + i}px solid rgba(255,255,255,${a})`,
            transform:   `rotate(${rot}deg)`,
            boxShadow:   `0 0 ${12 + i*4}px rgba(255,255,255,${a * 0.6})`,
          }} />
        ))}

        {/* Second cluster — offset to top-right */}
        {[
          { w: 560, h: 420, t: 30,  l: 580, a: 0.16, rot: 15  },
          { w: 380, h: 290, t: 100, l: 660, a: 0.20, rot: -10 },
          { w: 220, h: 170, t: 165, l: 730, a: 0.26, rot: 5   },
        ].map(({ w, h, t, l, a, rot }, i) => (
          <div key={`b${i}`} style={{
            position:    'absolute',
            width:        w,
            height:       h,
            top:          t,
            left:         l,
            borderRadius: '50%',
            border:       `${2 + i}px solid rgba(255,255,255,${a})`,
            transform:    `rotate(${rot}deg)`,
            boxShadow:    `0 0 ${10 + i*4}px rgba(255,255,255,${a * 0.5})`,
          }} />
        ))}

        {/* Bottom cluster */}
        {[
          { w: 500, h: 380, t: 260, l: 100, a: 0.17, rot: -12 },
          { w: 340, h: 260, t: 325, l: 180, a: 0.21, rot: 8   },
          { w: 180, h: 140, t: 380, l: 270, a: 0.25, rot: -3  },
        ].map(({ w, h, t, l, a, rot }, i) => (
          <div key={`c${i}`} style={{
            position:    'absolute',
            width:        w,
            height:       h,
            top:          t,
            left:         l,
            borderRadius: '50%',
            border:       `${2 + i}px solid rgba(249,212,35,${a})`,
            transform:    `rotate(${rot}deg)`,
            boxShadow:    `0 0 ${8 + i*4}px rgba(249,212,35,${a * 0.5})`,
          }} />
        ))}

        {/* Bright focal point highlights */}
        <div style={{
          position: 'absolute', width: 80, height: 80,
          top: 215, left: 475, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.55) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', width: 52, height: 52,
          top: 295, left: 705, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.45) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', width: 40, height: 40,
          top: 360, left: 290, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(249,212,35,0.6) 0%, transparent 70%)',
        }} />

        {/* Text */}
        <div style={{
          position:   'absolute',
          bottom:      52,
          right:       60,
          fontFamily:  'monospace',
          fontSize:    22,
          color:       'rgba(255,255,255,0.75)',
          letterSpacing: '0.08em',
        }}>
          shimmer
        </div>
        <div style={{
          position:   'absolute',
          bottom:      52,
          left:        60,
          fontFamily:  'monospace',
          fontSize:    16,
          color:       'rgba(255,255,255,0.50)',
          letterSpacing: '0.05em',
        }}>
          intheamber.com
        </div>
      </div>
    ),
    { ...size },
  )
}
