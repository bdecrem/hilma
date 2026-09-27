import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'pasture: boards of canada for the weather field'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const FIELD = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'
const UV = '#A855F7'
const SODIUM = '#FF7A1A'

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: FIELD,
          position: 'relative',
          display: 'flex',
          fontFamily: 'serif',
        }}
      >
        <svg width="1200" height="630" style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <filter id="cloud" x="0" y="0" width="1200" height="630" filterUnits="userSpaceOnUse">
              <feTurbulence type="fractalNoise" baseFrequency="0.006 0.008" numOctaves="5" seed="29" />
              <feColorMatrix
                values="0 0 0 0 0.91
                        0 0 0 0 0.91
                        0 0 0 0 0.91
                        0 0 0 1.6 -0.4"
              />
            </filter>
            {/* three small chord-shift blooms */}
            <radialGradient id="bloomLime" cx="0.22" cy="0.42" r="0.16">
              <stop offset="0%" stopColor={LIME} stopOpacity="0.85" />
              <stop offset="100%" stopColor={LIME} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="bloomUV" cx="0.55" cy="0.6" r="0.14">
              <stop offset="0%" stopColor={UV} stopOpacity="0.75" />
              <stop offset="100%" stopColor={UV} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="bloomSod" cx="0.78" cy="0.38" r="0.16">
              <stop offset="0%" stopColor={SODIUM} stopOpacity="0.75" />
              <stop offset="100%" stopColor={SODIUM} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="vignette" cx="0.5" cy="0.5" r="0.7">
              <stop offset="60%" stopColor={FIELD} stopOpacity="0" />
              <stop offset="100%" stopColor={FIELD} stopOpacity="0.85" />
            </radialGradient>
          </defs>
          <rect width="1200" height="630" fill="white" filter="url(#cloud)" />
          <rect width="1200" height="630" fill="url(#bloomLime)" style={{ mixBlendMode: 'screen' }} />
          <rect width="1200" height="630" fill="url(#bloomUV)" style={{ mixBlendMode: 'screen' }} />
          <rect width="1200" height="630" fill="url(#bloomSod)" style={{ mixBlendMode: 'screen' }} />
          <rect width="1200" height="630" fill="url(#vignette)" />
        </svg>

        <div
          style={{
            position: 'absolute',
            top: 38,
            right: 48,
            color: CREAM,
            opacity: 0.6,
            fontFamily: 'monospace',
            fontWeight: 700,
            fontSize: 18,
            letterSpacing: 4,
            textTransform: 'uppercase',
          }}
        >
          PASTURE · BOC · 32S LOOP
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 56,
            left: 56,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <span
            style={{
              fontFamily: 'monospace',
              fontWeight: 700,
              fontSize: 32,
              letterSpacing: 3,
              color: CREAM,
              display: 'flex',
            }}
          >
            pasture
            <span style={{ color: LIME, marginLeft: 4 }}>.</span>
          </span>
          <span
            style={{
              fontFamily: 'serif',
              fontStyle: 'italic',
              fontSize: 30,
              color: CREAM,
              opacity: 0.9,
              marginTop: 8,
            }}
          >
            in a quiet field.
          </span>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 56,
            right: 56,
            color: CREAM,
            opacity: 0.55,
            fontFamily: 'monospace',
            fontWeight: 700,
            fontSize: 30,
            letterSpacing: 4,
            display: 'flex',
          }}
        >
          a.
          <span style={{ color: LIME, marginLeft: 4 }}>·</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
