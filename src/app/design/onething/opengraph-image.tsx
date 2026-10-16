import { ImageResponse } from 'next/og'
import { ogFont } from '@/lib/og-fonts'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'onething: three design directions, Notebook, Riso and Tear-off'

export default async function OgImage() {
  const archivo = await ogFont('archivo-black/ArchivoBlack-400.ttf')
  const mono = await ogFont('dm-mono/DMMono-400.ttf')
  const panel = { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, padding: '44px 40px' } as const
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', fontFamily: 'Mono' }}>
        <div style={{ ...panel, position: 'relative', background: '#f4efe2', color: '#2a3a8f' }}>
          {Array.from({ length: 19 }, (_, i) => <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: 31 + i * 32, height: 1, background: '#c9d6e5' }} />)}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 22, width: 4, borderLeft: '1px solid #e2a39a', borderRight: '1px solid #e2a39a' }} />
          <div style={{ display: 'flex', fontSize: 20, letterSpacing: 3, color: '#c8452f' }}>01 · NOTEBOOK</div>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 58, lineHeight: 1, fontFamily: 'Archivo', color: '#26231e' }}>
            <span>one</span><span style={{ alignSelf: 'flex-start', background: '#f6e65c', padding: '0 6px' }}>thing</span>
          </div>
          <div style={{ display: 'flex', fontSize: 20 }}>ballpoint on ruled paper</div>
        </div>
        <div style={{ ...panel, background: '#ffc31f', color: '#16121c', borderLeft: '6px solid #16121c', borderRight: '6px solid #16121c' }}>
          <div style={{ display: 'flex', fontSize: 20, letterSpacing: 3 }}>02 · RISO</div>
          <div style={{ display: 'flex', position: 'relative', fontSize: 210, lineHeight: 0.8, fontFamily: 'Archivo', height: 170 }}>
            <span style={{ position: 'absolute', left: 10, top: 8, color: '#ff4b1f' }}>1</span>
            <span style={{ position: 'absolute', left: 0, top: 0, color: '#3d3bff' }}>1</span>
          </div>
          <div style={{ display: 'flex', fontSize: 20 }}>flat ink, off register</div>
        </div>
        <div style={{ ...panel, background: '#e9e3d8', color: '#151515' }}>
          <div style={{ display: 'flex', fontSize: 20, letterSpacing: 3 }}>03 · TEAR-OFF</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#fffdf7', padding: '18px 0 22px', borderTop: '22px solid #222' }}>
            <span style={{ fontSize: 16, letterSpacing: 3, color: '#d63a20' }}>SUNDAY</span>
            <span style={{ fontSize: 150, lineHeight: 0.9, fontFamily: 'Archivo', color: '#d63a20' }}>11</span>
          </div>
          <div style={{ display: 'flex', fontSize: 20 }}>a day-by-day desk calendar</div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: 'Archivo', data: archivo, weight: 400, style: 'normal' }, { name: 'Mono', data: mono, weight: 400, style: 'normal' }] },
  )
}
