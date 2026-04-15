import { ImageResponse } from 'next/og'
import bakedToday from '../../../../data/amber-noon/2026-04-14.json'
import { CONCEPTS } from './concepts'
import type { NoonRun } from './generator'

export const alt = 'amber — noon'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const PALETTE_BG: Record<string, string> = {
  night:   '#0A0A0A',
  hearth:  '#1A110A',
  ink:     '#0C1424',
  petrol:  '#0A1C1A',
  bruise:  '#150826',
  oxblood: '#1C0808',
}
const ACCENT: Record<string, string> = {
  lime:   '#C6FF3C',
  sodium: '#FF7A1A',
  uv:     '#A855F7',
}

export default async function Image() {
  const run = bakedToday as NoonRun
  const bg = PALETTE_BG[run.mood.palette] ?? '#0A0A0A'
  const accent = ACCENT[run.mood.accent] ?? '#C6FF3C'

  const winner = CONCEPTS.find(c => c.name === run.winner.concept) ?? CONCEPTS[0]
  const grid = winner.grid
  const CELL = 28

  const blurb = `“${run.winner.blurb}”`

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: bg,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          color: '#E8E8E8',
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 40,
            left: 0,
            width: '100%',
            justifyContent: 'center',
            fontSize: 18,
            letterSpacing: 2,
            color: 'rgba(232,232,232,0.55)',
          }}
        >
          April 14, 2026
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 24 }}>
          {grid.map((row, r) => (
            <div key={r} style={{ display: 'flex', gap: 2 }}>
              {row.map((v, c) => (
                <div
                  key={c}
                  style={{
                    display: 'flex',
                    width: CELL,
                    height: CELL,
                    background: v ? '#E8E8E8' : 'rgba(255,255,255,0.025)',
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 44,
            fontSize: 30,
            letterSpacing: 1,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 12,
              height: 12,
              borderRadius: 6,
              background: accent,
            }}
          />
          <div style={{ display: 'flex' }}>{run.winner.concept}</div>
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 12,
            fontSize: 20,
            fontStyle: 'italic',
            color: 'rgba(232,232,232,0.65)',
          }}
        >
          {blurb}
        </div>

        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 32,
            right: 44,
            fontSize: 14,
            letterSpacing: 2,
            color: 'rgba(232,232,232,0.45)',
          }}
        >
          amber · noon
        </div>
      </div>
    ),
    { ...size }
  )
}
