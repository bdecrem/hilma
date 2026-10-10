import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Gummy on the candy gradient, the name, the one line. /dolly/today inherits it.
export default async function OgImage() {
  const png = await readFile(join(process.cwd(), 'public/dolly/gummy.png'))
  const src = `data:image/png;base64,${png.toString('base64')}`
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 60,
          background: 'linear-gradient(180deg, #ebdfff 0%, #ffe6f3 55%, #dffff4 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={360} height={360} alt="" style={{ objectFit: 'contain' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', fontSize: 150, fontWeight: 800, color: '#ff4fa3', letterSpacing: '-0.02em', lineHeight: 1 }}>Dolly</div>
          <div style={{ display: 'flex', fontSize: 42, fontWeight: 700, color: '#3b2a5a', lineHeight: 1.2 }}>A three-minute call a day,</div>
          <div style={{ display: 'flex', fontSize: 42, fontWeight: 700, color: '#3b2a5a', lineHeight: 1.2 }}>in Spanish.</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
            {['1 Talk', '2 Three things', '3 Cards'].map((s) => (
              <div key={s} style={{ display: 'flex', background: '#fff', color: '#7b5cff', borderRadius: 999, padding: '10px 22px', fontSize: 26, fontWeight: 700, boxShadow: '0 5px 0 #e4d4f5' }}>
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  )
}
