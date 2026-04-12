import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'shard — citrus crystal formations by amber'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']

// Pre-compute all arm divs for a crystal
// Returns array of style objects for rotated-div arms
function crystalArms(cx: number, cy: number, size: number, w: number, colorOffset: number) {
  const arms: Array<{
    id: string
    left: number
    top: number
    width: number
    height: number
    angleDeg: number
    bg: string
  }> = []

  for (let i = 0; i < 6; i++) {
    const angleDeg = i * 60 - 90   // -90° = up, then 60° steps
    const angleRad = angleDeg * (Math.PI / 180)
    const color = CITRUS[(colorOffset + Math.floor(i / 2)) % CITRUS.length]
    const secColor = CITRUS[(colorOffset + 1) % CITRUS.length]
    const tertColor = CITRUS[(colorOffset + 2) % CITRUS.length]

    // Primary arm
    arms.push({
      id: `p${i}`,
      left: cx, top: cy - w / 2,
      width: size, height: w,
      angleDeg,
      bg: `linear-gradient(to right, ${color}EE 0%, ${color}BB 55%, transparent 100%)`,
    })

    // Secondary arms at 30%, 55%, 78% of primary
    const milestones = [0.30, 0.55, 0.78]
    for (const m of milestones) {
      const mx = cx + Math.cos(angleRad) * size * m
      const my = cy + Math.sin(angleRad) * size * m
      const secLen = size * (0.35 - m * 0.12)
      const secW = Math.max(2, w * 0.45)

      // Both perpendicular directions
      for (const sign of [1, -1]) {
        arms.push({
          id: `s${i}-${m}-${sign}`,
          left: mx, top: my - secW / 2,
          width: secLen, height: secW,
          angleDeg: angleDeg + sign * 90,
          bg: `linear-gradient(to right, ${secColor}CC 0%, ${secColor}88 60%, transparent 100%)`,
        })

        // Tertiary at midpoint of secondary
        const secAngleRad = (angleDeg + sign * 90) * (Math.PI / 180)
        const tx = mx + Math.cos(secAngleRad) * secLen * 0.50
        const ty = my + Math.sin(secAngleRad) * secLen * 0.50
        const tertLen = secLen * 0.55
        const tertW = Math.max(1, secW * 0.48)

        for (const tsign of [1, -1]) {
          arms.push({
            id: `t${i}-${m}-${sign}-${tsign}`,
            left: tx, top: ty - tertW / 2,
            width: tertLen, height: tertW,
            angleDeg: angleDeg + sign * 90 + tsign * 90,
            bg: `linear-gradient(to right, ${tertColor}AA 0%, ${tertColor}55 60%, transparent 100%)`,
          })
        }
      }
    }
  }

  return arms
}

export default function Image() {
  // Three crystals: large center, smaller flanking two
  const largeCrystal = crystalArms(460, 315, 210, 20, 0)
  const leftCrystal  = crystalArms(145, 510, 100,  9, 2)
  const rightCrystal = crystalArms(1055, 125, 125, 12, 4)

  const amber = '#D4A574'

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: 'linear-gradient(135deg, #B4E33D 0%, #F9D423 55%, #FC913A 100%)',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Render all crystal arms as rotated divs */}
        {[...largeCrystal, ...leftCrystal, ...rightCrystal].map((arm) => (
          <div
            key={arm.id}
            style={{
              position: 'absolute',
              display: 'flex',
              left: arm.left,
              top: arm.top,
              width: arm.width,
              height: arm.height,
              background: arm.bg,
              borderRadius: arm.height,
              transform: `rotate(${arm.angleDeg}deg)`,
              transformOrigin: '0 50%',
            }}
          />
        ))}

        {/* Amber jewels at crystal centers */}
        {[
          { cx: 460, cy: 315, r: 14 },
          { cx: 145, cy: 510, r:  7 },
          { cx: 1055, cy: 125, r:  9 },
        ].map((j, i) => (
          <div
            key={`jewel-${i}`}
            style={{
              position: 'absolute',
              display: 'flex',
              left: j.cx - j.r,
              top:  j.cy - j.r,
              width:  j.r * 2,
              height: j.r * 2,
              borderRadius: '50%',
              background: `radial-gradient(circle at 40% 40%, #fff 0%, ${amber} 40%, transparent 100%)`,
            }}
          />
        ))}

        {/* Label */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            right: 56,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 4,
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.85)',
              fontFamily: 'monospace',
              letterSpacing: '-2px',
              textShadow: '0 2px 16px rgba(0,0,0,0.15)',
            }}
          >
            shard
          </div>
          <div
            style={{
              fontSize: 18,
              color: 'rgba(255,255,255,0.55)',
              fontFamily: 'monospace',
              letterSpacing: '3px',
            }}
          >
            amber
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
