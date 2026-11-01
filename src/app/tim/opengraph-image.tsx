import { ImageResponse } from 'next/og'
import { ogFont } from '@/lib/og-fonts'

export const alt = 'Hi Tim'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const bricolage = await ogFont('bricolage-grotesque/BricolageGrotesque-800.ttf')
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ff4b1f',
          fontFamily: 'Bricolage Grotesque',
        }}
      >
        <div
          style={{
            width: 580,
            height: 580,
            borderRadius: 290,
            background: '#ffc31f',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#16121c',
            fontSize: 170,
            fontWeight: 800,
            letterSpacing: '0.012em',
            textShadow: '4px 4px 0 #3d3bff',
          }}
        >
          Hi Tim
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: 'Bricolage Grotesque', data: bricolage, weight: 800, style: 'normal' }] },
  )
}
