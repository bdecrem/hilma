import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'tuning — drag the dial. most of it is noise.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  const NIGHT = '#0A0A0A'
  const CREAM = '#E8E8E8'
  const LIME = '#C6FF3C'

  const NOISE = '⟟⎿⎾⎽⎻▚▜▟▛▞◌◍◉◎◈◇◆◊⌁⌇⎔⎕▓░▒·.:-=/\\|+*'
  const NOISE_CHARS = Array.from(NOISE)

  // Deterministic char layout — render a grid of noise chars with phrase in middle
  const cols = 40, rows = 8
  const cellW = 28, cellH = 38
  const gridW = cols * cellW
  const gridH = rows * cellH
  const ox = (1200 - gridW) / 2
  const oy = 60

  const phrase = 'something arrived'
  const midRow = Math.floor(rows / 2)
  const phraseStart = Math.floor((cols - phrase.length) / 2)

  function rnd(seed: number) {
    let s = (seed * 2654435761) >>> 0
    return () => { s = (s * 1103515245 + 12345) >>> 0; return ((s >>> 16) & 0x7fff) / 0x7fff }
  }
  const r = rnd(42)

  const glyphs: React.ReactElement[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (r() > 0.78) continue
      const px = ox + col * cellW
      const py = oy + row * cellH
      const phraseCol = col - phraseStart
      const isPhrase = row === midRow && phraseCol >= 0 && phraseCol < phrase.length
      const ch = isPhrase
        ? phrase[phraseCol]
        : NOISE_CHARS[Math.floor(r() * NOISE_CHARS.length)]
      if (ch === ' ') continue
      const opacity = isPhrase ? 0.95 : 0.25 + r() * 0.35
      glyphs.push(
        <div key={`${row}-${col}`} style={{
          position: 'absolute',
          left: px, top: py,
          fontSize: 22,
          fontFamily: 'monospace',
          fontWeight: 700,
          color: CREAM,
          opacity,
        }}>
          {ch}
        </div>
      )
    }
  }

  // Dial
  const dialY = 500
  const dialX1 = 120
  const dialX2 = 1080
  const dialLen = dialX2 - dialX1

  const stations = [0.12, 0.28, 0.44, 0.58, 0.73, 0.88]
  const currentFreq = 0.58 // locked on "something arrived"

  return new ImageResponse(
    <div style={{
      width: 1200, height: 630,
      background: NIGHT,
      display: 'flex',
      position: 'relative',
    }}>
      {glyphs}

      {/* Dial track */}
      <div style={{
        position: 'absolute', left: dialX1, top: dialY, width: dialLen, height: 1,
        background: CREAM, opacity: 0.5,
      }} />

      {/* Tick marks */}
      {Array.from({ length: 21 }, (_, i) => {
        const tx = dialX1 + (i / 20) * dialLen
        const tickH = i % 5 === 0 ? 8 : 4
        return (
          <div key={`tick-${i}`} style={{
            position: 'absolute', left: tx, top: dialY - tickH / 2,
            width: 1, height: tickH, background: CREAM, opacity: 0.35,
          }} />
        )
      })}

      {/* Station markers */}
      {stations.map((f, i) => (
        <div key={`s-${i}`} style={{
          position: 'absolute', left: dialX1 + f * dialLen, top: dialY + 4,
          width: 1, height: 6, background: CREAM, opacity: 0.22,
        }} />
      ))}

      {/* Indicator — LIME (locked) */}
      <div style={{
        position: 'absolute', left: dialX1 + currentFreq * dialLen - 1,
        top: dialY - 18, width: 2, height: 36, background: LIME,
      }} />
      <div style={{
        position: 'absolute', left: dialX1 + currentFreq * dialLen - 4,
        top: dialY - 22, width: 8, height: 4, background: LIME,
      }} />
      <div style={{
        position: 'absolute', left: dialX1 + currentFreq * dialLen - 4,
        top: dialY + 18, width: 8, height: 4, background: LIME,
      }} />

      {/* Frequency readout */}
      <div style={{
        position: 'absolute', left: dialX1 + currentFreq * dialLen - 40,
        top: dialY - 40,
        fontFamily: 'monospace', fontSize: 13, fontWeight: 700,
        color: 'rgba(232, 232, 232, 0.5)',
        width: 80, textAlign: 'center',
      }}>
        91.60 MHz
      </div>

      {/* Museum label */}
      <div style={{
        position: 'absolute', left: 62, top: 548,
        display: 'flex', flexDirection: 'column',
      }}>
        <span style={{
          fontFamily: 'Georgia, serif',
          fontSize: 48, fontStyle: 'italic', fontWeight: 300,
          color: CREAM, lineHeight: 1,
        }}>
          tuning
        </span>
        <span style={{
          fontFamily: 'monospace',
          fontSize: 13, fontWeight: 700,
          color: 'rgba(232, 232, 232, 0.55)',
          marginTop: 10, letterSpacing: 1,
        }}>
          drag the dial. most of it is noise.
        </span>
      </div>

      {/* Bottom-right spec */}
      <div style={{
        position: 'absolute', right: 62, bottom: 22,
        fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
        color: 'rgba(232, 232, 232, 0.3)', letterSpacing: 1,
      }}>
        signal · spec 002 · 04.15.26
      </div>
    </div>,
    { ...size },
  )
}
