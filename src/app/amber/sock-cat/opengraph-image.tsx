import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'sock cat: tiny laundry goblin'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const FIELD = '#0A0A0A'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'
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
        }}
      >
        <svg width="1200" height="630" style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <radialGradient id="warm" cx="0.5" cy="0.5" r="0.55">
              <stop offset="0%" stopColor={SODIUM} stopOpacity="0.18" />
              <stop offset="100%" stopColor={SODIUM} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="vignette" cx="0.5" cy="0.5" r="0.7">
              <stop offset="55%" stopColor={FIELD} stopOpacity="0" />
              <stop offset="100%" stopColor={FIELD} stopOpacity="0.9" />
            </radialGradient>
          </defs>

          {/* warm bloom behind the scene */}
          <rect width="1200" height="630" fill="url(#warm)" />

          {/* radar circles — the game's signature ground pattern */}
          <g stroke={CREAM} strokeOpacity="0.09" strokeWidth="1" fill="none">
            <circle cx="600" cy="315" r="90" />
            <circle cx="600" cy="315" r="180" />
            <circle cx="600" cy="315" r="270" />
            <circle cx="600" cy="315" r="360" />
            <circle cx="600" cy="315" r="450" />
            <circle cx="600" cy="315" r="540" />
          </g>

          {/* trajectory: dashed slingshot arc from cat to sock */}
          <path
            d="M 540 380 Q 620 250 720 220"
            stroke={CREAM}
            strokeOpacity="0.35"
            strokeWidth="2"
            strokeDasharray="4 8"
            fill="none"
          />

          {/* scattered "stars" / treats */}
          <g fill={CREAM} fillOpacity="0.55">
            <circle cx="220" cy="160" r="2" />
            <circle cx="980" cy="120" r="2.5" />
            <circle cx="1080" cy="420" r="2" />
            <circle cx="160" cy="480" r="2.2" />
            <circle cx="380" cy="120" r="1.8" />
            <circle cx="860" cy="500" r="2" />
          </g>

          {/* the sock — cream outline with a single SODIUM stripe (signal) */}
          <g transform="translate(720 220) rotate(28)">
            <rect
              x="-46"
              y="-86"
              width="92"
              height="130"
              rx="28"
              ry="28"
              fill={FIELD}
              stroke={CREAM}
              strokeWidth="3"
            />
            <rect
              x="-46"
              y="22"
              width="128"
              height="62"
              rx="28"
              ry="28"
              fill={FIELD}
              stroke={CREAM}
              strokeWidth="3"
            />
            {/* sodium accent stripe at the cuff */}
            <line
              x1="-34"
              y1="-58"
              x2="34"
              y2="-58"
              stroke={SODIUM}
              strokeWidth="6"
              strokeLinecap="round"
            />
          </g>

          {/* the cat — minimal cream-stroke silhouette, mid-pounce */}
          <g transform="translate(540 380)" stroke={CREAM} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
            {/* body */}
            <ellipse cx="0" cy="0" rx="44" ry="30" />
            {/* ears */}
            <path d="M -22 -22 L -34 -50 L -8 -28 Z" fill={CREAM} fillOpacity="0.0" />
            <path d="M 22 -22 L 34 -50 L 8 -28 Z" />
            <path d="M -22 -22 L -34 -50 L -8 -28 Z" />
            {/* tail */}
            <path d="M 38 8 Q 78 -4 80 -38" />
            {/* eyes (cream dots) */}
            <circle cx="-12" cy="-3" r="2.5" fill={CREAM} stroke="none" />
            <circle cx="12" cy="-3" r="2.5" fill={CREAM} stroke="none" />
          </g>

          <rect width="1200" height="630" fill="url(#vignette)" />
        </svg>

        {/* top-right meta label */}
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
          SOCK CAT · TINY LAUNDRY GOBLIN
        </div>

        {/* bottom-left title */}
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
            sock cat
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
            drag to slingshot. catch socks. avoid bombs.
          </span>
        </div>

        {/* bottom-right a. mark */}
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
