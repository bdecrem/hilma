import { ImageResponse } from 'next/og'
import { ogFont } from '@/lib/og-fonts'

export const runtime = 'nodejs'
export const alt = 'Migrant Rights Law Library: the laws behind the Migrant Rights Database, in full text'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const NAVY = '#0b0b50', MINT = '#d5fcf0', GREY = '#808080'
const GROUP = ['#a0e7e6', '#ecbd35', '#ecbd35', '#96d371', '#96d371', '#96d371', '#fc6652', '#fc6652', '#fc6652', '#475883', '#475883', '#475883', '#475883', '#475883', '#475883', '#475883', '#475883']
// a typical wheel: spoke lengths 0..1
const LEN = [0.7, 0.45, 0.62, 0.95, 0.5, 0.58, 0.55, 0.75, 0.48, 0.52, 0.8, 0.6, 0.3, 0.9, 0.57, 0.66, 0.5]

function logo() {
  const parts: string[] = []
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a)
    parts.push(`<line x1="${50 + c * 3}" y1="${50 + s * 3}" x2="${50 + c * 41}" y2="${50 + s * 41}" stroke="${NAVY}" stroke-width="0.55"/>`)
    parts.push(`<circle cx="${50 + c * 45}" cy="${50 + s * 45}" r="1.35" fill="${NAVY}"/>`)
  }
  parts.push(`<circle cx="50" cy="50" r="7" fill="${NAVY}"/>`)
  return `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${parts.join('')}</svg>`).toString('base64')}`
}

function wheel() {
  const C = 150, R = 140, n = 17, parts: string[] = []
  const ang = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2
  for (let i = 0; i < n; i++) {
    const a0 = ang(i - 0.5) + 0.012, a1 = ang(i + 0.5) - 0.012
    parts.push(`<path d="M${C},${C} L${C + R * Math.cos(a0)},${C + R * Math.sin(a0)} A${R},${R} 0 0 1 ${C + R * Math.cos(a1)},${C + R * Math.sin(a1)} Z" fill="#f4f4f4"/>`)
  }
  for (let i = 0; i < n; i++) {
    const r = 12 + (R - 22) * LEN[i], x = C + r * Math.cos(ang(i)), y = C + r * Math.sin(ang(i))
    parts.push(`<line x1="${C}" y1="${C}" x2="${x}" y2="${y}" stroke="${GROUP[i]}" stroke-width="2.4"/><circle cx="${x}" cy="${y}" r="6" fill="${GROUP[i]}"/>`)
  }
  parts.push(`<circle cx="${C}" cy="${C}" r="6" fill="#475883"/>`)
  return `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">${parts.join('')}</svg>`).toString('base64')}`
}

export default async function Image() {
  const [light, regular, bold] = await Promise.all([
    ogFont('dm-sans/DMSans-300.ttf'), ogFont('dm-sans/DMSans-400.ttf'), ogFont('dm-sans/DMSans-700.ttf'),
  ])
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#fff', fontFamily: 'DM Sans' }}>
        <div style={{ display: 'flex', flex: 1, padding: '56px 64px 0', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
              <img src={logo()} width={92} height={92} alt="" />
              <div style={{ display: 'flex', flexDirection: 'column', color: NAVY, fontSize: 38, fontWeight: 700, lineHeight: 1.02 }}>
                <span>Migrant Rights</span><span>Law Library</span>
              </div>
            </div>
            <div style={{ fontSize: 64, fontWeight: 300, lineHeight: 1.08, marginTop: 54, color: '#000', letterSpacing: -1 }}>Check the Legislation</div>
            <div style={{ fontSize: 26, fontWeight: 400, lineHeight: 1.45, marginTop: 20, color: GREY, maxWidth: 600 }}>
              The laws behind the Migrant Rights Database, in full text: 2,271 statutes, rulings and treaties from 45 countries.
            </div>
          </div>
          <img src={wheel()} width={380} height={380} alt="" style={{ marginTop: 34 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, height: 92, background: MINT, borderLeft: `14px solid ${NAVY}`, padding: '0 50px' }}>
          {['Search', 'Categories', 'Countries'].map(t => (
            <div key={t} style={{ display: 'flex', background: NAVY, color: '#fff', fontSize: 20, fontWeight: 700, padding: '8px 18px', borderRadius: 12, textTransform: 'uppercase' }}>{t}</div>
          ))}
          <div style={{ display: 'flex', marginLeft: 'auto', fontSize: 22, color: NAVY, fontWeight: 700 }}>ola.cx/mrd</div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: 'DM Sans', data: light, weight: 300 }, { name: 'DM Sans', data: regular, weight: 400 }, { name: 'DM Sans', data: bold, weight: 700 }] },
  )
}
