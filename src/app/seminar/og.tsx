import { ImageResponse } from 'next/og'
import { ogFont } from '@/lib/og-fonts'

export const ogSize = { width: 1200, height: 630 }

// A sheet's share image: its own head on its paper (the kicker, the headline with
// "your own" set heavier), and one "Say" bubble.
export async function sheetOg({ kicker, title, say }: { kicker: string; title: string; say: string }) {
  const [semi, black] = await Promise.all([
    ogFont('inter-tight/InterTight-600.ttf'),
    ogFont('inter-tight/InterTight-900.ttf'),
  ])
  const [before, after] = title.split('your own')

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: '#fff6ea',
          color: '#2b2118',
          padding: '0 84px',
          fontFamily: 'Inter Tight',
        }}
      >
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 600, letterSpacing: '0.08em', color: '#d64a22' }}>
          {kicker.toUpperCase()}
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            columnGap: 26,
            marginTop: 22,
            fontSize: 104,
            fontWeight: 600,
            lineHeight: 1.04,
            letterSpacing: '-0.02em',
          }}
        >
          {/* Satori drops the spaces between spans: the gap is the word space. */}
          <span>{before.trim()}</span>
          <span style={{ fontWeight: 900 }}>your own</span>
          <span>{after.trim()}</span>
        </div>
        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            marginTop: 44,
            padding: '20px 30px',
            background: '#fde5cc',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderBottomRightRadius: 28,
            borderBottomLeftRadius: 7,
            fontSize: 34,
            fontWeight: 600,
          }}
        >
          {say}
        </div>
      </div>
    ),
    {
      ...ogSize,
      fonts: [
        { name: 'Inter Tight', data: semi, weight: 600, style: 'normal' },
        { name: 'Inter Tight', data: black, weight: 900, style: 'normal' },
      ],
    },
  )
}
