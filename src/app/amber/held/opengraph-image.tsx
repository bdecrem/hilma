import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = '"and when did you first feel the need to be held?"'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#0A0908', fontFamily: 'monospace',
      }}>
        <div style={{
          display: 'flex', gap: 60, alignItems: 'flex-end', marginBottom: 60,
        }}>
          {/* Couch with phone */}
          <div style={{
            width: 200, height: 100, background: '#2D9596', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
          }}>
            {/* Phone lying down */}
            <div style={{
              width: 60, height: 30, background: '#1a1a1a', borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ width: 48, height: 20, background: '#334455', borderRadius: 2, display: 'flex' }} />
            </div>
          </div>
          {/* Chair */}
          <div style={{
            width: 80, height: 90, background: '#4a3e30', borderRadius: 4,
            display: 'flex',
          }} />
        </div>
        <div style={{
          color: '#e8ddd0', fontSize: 28, textAlign: 'center',
          fontStyle: 'italic',
        }}>
          &ldquo;and when did you first feel the need to be held?&rdquo;
        </div>
      </div>
    ),
    { ...size }
  )
}
