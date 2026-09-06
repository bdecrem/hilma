import { ImageResponse } from 'next/og'
import { MARK_DARK_B64 } from './mark-dark-b64'

export const runtime = 'edge'
export const alt = 'Jambot — a groovebox you talk to'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Enamel panel with the signature 16-step LED strip.
// Math: 16 cells × 56px + 15 gaps × 12px = 1076px wide; margin (1200 − 1076) / 2 = 62px.
const CELL = 56
const GAP = 12
const ROWS: { bits: string; color: string; h: number }[] = [
  { bits: '1000100010001000', color: '#ff4f1f', h: 40 },
  { bits: '0000100000001000', color: '#2c5bff', h: 28 },
  { bits: '0010001000100010', color: '#14161a', h: 20 },
]

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#dcdfd8',
          color: '#14161a',
          padding: '56px 62px',
          fontFamily: 'Arial Narrow, Arial, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
          {/* Monogram mark: ink tile, putty J, orange dot — the app icon and site mark. */}
          <img
            src={`data:image/png;base64,${MARK_DARK_B64}`}
            width={112}
            height={112}
            style={{ borderRadius: 25, boxShadow: '0 6px 20px rgba(0,0,0,0.28)' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 26, letterSpacing: 6, color: '#6b6f78', textTransform: 'uppercase' }}>A groovebox you talk to</div>
            <div style={{ display: 'flex', alignItems: 'flex-start', fontSize: 168, fontWeight: 800, letterSpacing: 8, lineHeight: 1, textTransform: 'uppercase', marginTop: 8 }}>
              Jambot
              <div style={{ width: 34, height: 34, borderRadius: 17, background: '#ff4f1f', marginLeft: 14, marginTop: 18, boxShadow: '0 0 24px #ff4f1f' }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
          {ROWS.map((row, r) => (
            <div key={r} style={{ display: 'flex', gap: GAP }}>
              {Array.from({ length: 16 }, (_, i) => {
                const on = row.bits[i] === '1'
                return (
                  <div
                    key={i}
                    style={{
                      width: CELL,
                      height: row.h,
                      borderRadius: 8,
                      background: on ? row.color : '#b7bbb2',
                      opacity: on ? 1 : 0.55,
                      boxShadow: on && r === 0 ? `0 0 28px ${row.color}99` : 'none',
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 28, color: '#3a3d44' }}>
          <div>“techno at 128 with a 909 kick and an acid line”</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'Courier New, monospace', fontSize: 30 }}>
            <div style={{ width: 16, height: 16, borderRadius: 8, background: '#ff4f1f', boxShadow: '0 0 12px #ff4f1f' }} />
            128 BPM
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
