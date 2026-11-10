import { ImageResponse } from 'next/og'
import { ogFont } from '@/lib/og-fonts'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Research apps: the Adaptation Almanac, Socratic and the Migrant Rights Database'

export default async function OgImage() {
  const bold = await ogFont('inter-tight/InterTight-600.ttf')
  const rows = ['Adaptation Almanac', 'Socratic', 'Migrant Rights Database']
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#ffffff', color: '#111111', padding: '72px 80px', fontFamily: 'Inter' }}>
        <div style={{ display: 'flex', fontSize: 72, letterSpacing: -1, marginBottom: 48 }}>Research apps</div>
        {rows.map((r) => (
          <div key={r} style={{ display: 'flex', fontSize: 44, color: '#1a4fd6', borderTop: '2px solid #e4e4e4', padding: '22px 0' }}>{r}</div>
        ))}
      </div>
    ),
    { ...size, fonts: [{ name: 'Inter', data: bold, weight: 600, style: 'normal' }] },
  )
}
