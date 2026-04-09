import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'lava — amber'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Static lava lamp blob composition for OG preview
// Blobs arranged in a lava-lamp style: rising from bottom, floating at top
const BLOBS = [
  // [cx, cy, rx, ry, color, opacity]
  { cx: 180, cy: 530, rx: 135, ry: 130, color: '#FF4E50', opacity: 0.95 },  // large, bottom-left
  { cx: 680, cy: 520, rx: 155, ry: 145, color: '#F9D423', opacity: 0.95 },  // large, bottom-center
  { cx: 430, cy: 400, rx: 110, ry: 105, color: '#FC913A', opacity: 0.92 },  // medium, middle
  { cx: 920, cy: 430, rx: 95,  ry: 105, color: '#B4E33D', opacity: 0.92 },  // medium, right
  { cx: 160, cy: 270, rx: 80,  ry: 85,  color: '#FF6B81', opacity: 0.90 },  // small, upper-left
  { cx: 580, cy: 230, rx: 72,  ry: 78,  color: '#FF4E50', opacity: 0.88 },  // small, upper-center
  { cx: 1080, cy: 510, rx: 115, ry: 105, color: '#FC913A', opacity: 0.90 }, // partial, right edge
  { cx: 790, cy: 290, rx: 65,  ry: 70,  color: '#F9D423', opacity: 0.85 },  // small, upper-right
  // Merging blob pair — touching blobs suggest the metaball merge
  { cx: 330, cy: 560, rx: 90,  ry: 85,  color: '#FC913A', opacity: 0.90 },
]

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: 'linear-gradient(135deg, #FFECD2 0%, #FFFDE7 60%, #FFECD2 100%)',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Blobs */}
        {BLOBS.map((b, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: b.cx - b.rx,
              top: b.cy - b.ry,
              width: b.rx * 2,
              height: b.ry * 2,
              borderRadius: '50%',
              background: b.color,
              opacity: b.opacity,
              boxShadow: `0 0 ${b.rx * 0.5}px ${b.color}99, 0 0 ${b.rx}px ${b.color}44`,
              display: 'flex',
            }}
          />
        ))}

        {/* Highlight on each blob — top-left bright spot */}
        {BLOBS.map((b, i) => (
          <div
            key={`hl-${i}`}
            style={{
              position: 'absolute',
              left: b.cx - b.rx * 0.5,
              top: b.cy - b.ry * 0.55,
              width: b.rx * 0.55,
              height: b.ry * 0.45,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.35)',
              display: 'flex',
            }}
          />
        ))}

        {/* Warm vignette overlay at top */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(255,248,231,0.15) 0%, transparent 40%, rgba(255,236,210,0.2) 100%)',
            display: 'flex',
          }}
        />

        {/* Title */}
        <div
          style={{
            position: 'absolute',
            bottom: 44,
            left: 0,
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <div
            style={{
              fontSize: 84,
              fontWeight: 700,
              color: '#7A2A10',
              letterSpacing: '-3px',
              fontFamily: 'monospace',
              textShadow: '0 2px 12px rgba(255,78,80,0.25)',
            }}
          >
            lava
          </div>
          <div
            style={{
              fontSize: 20,
              color: '#7A2A10',
              fontFamily: 'monospace',
              opacity: 0.5,
              letterSpacing: '2px',
            }}
          >
            amber
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
