import { ImageResponse } from 'next/og'

export const alt = 'dog ear — a little library on the internet'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Fetch a Shantell Sans weight from Google Fonts as a usable font file for Satori.
// Fails soft: this image is prerendered at build time, and Vercel's build
// network has timed out on fonts.googleapis.com (2026-09-05, twice), which
// blocked every deploy of the site. No font beats no deploy.
async function loadFont(weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Shantell+Sans:wght@${weight}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)' },
        signal: AbortSignal.timeout(8000),
      })
    ).text()
    const url = css.match(/src:\s*url\((https:[^)]+)\)/)?.[1]
    if (!url) throw new Error('font url not found')
    return await (await fetch(url, { signal: AbortSignal.timeout(8000) })).arrayBuffer()
  } catch (err) {
    console.warn('[book-scout og] font unavailable, using default:', (err as Error).message)
    return null
  }
}

export default async function OG() {
  const [bold, regular] = await Promise.all([loadFont(700), loadFont(400)])
  const fonts = [
    bold && { name: 'Shantell Sans', data: bold, weight: 700 as const, style: 'normal' as const },
    regular && { name: 'Shantell Sans', data: regular, weight: 400 as const, style: 'normal' as const },
  ].filter((f): f is NonNullable<typeof f> => !!f)
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          background: '#f3ece0',
          fontFamily: 'Shantell Sans',
        }}
      >
        <div style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderLeft: '150px solid transparent', borderTop: '150px solid #e8a13c' }} />

        <svg width="340" height="240" viewBox="28 70 144 100" fill="none">
          <g stroke="#3b372f" strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M72 78 C52 82 48 116 58 132 C70 122 76 102 78 86 C78 80 76 78 72 78 Z" fill="#e8a13c" strokeWidth="4" />
            <path d="M128 78 C148 82 152 116 142 132 C130 122 124 102 122 86 C122 80 124 78 128 78 Z" fill="#e8a13c" strokeWidth="4" />
            <path d="M68 130 C62 100 82 84 100 84 C118 84 138 100 132 130" />
            <circle cx="86" cy="112" r="3.6" fill="#3b372f" stroke="none" />
            <circle cx="114" cy="112" r="3.6" fill="#3b372f" stroke="none" />
            <path d="M34 128 L166 128 L166 162 L34 162 Z" />
            <path d="M100 128 L100 162" strokeWidth="2.6" />
            <path d="M74 128 C74 121 88 121 88 128" strokeWidth="3.2" />
            <path d="M112 128 C112 121 126 121 126 128" strokeWidth="3.2" />
            <path d="M96 126 L104 126 L100 131 Z" fill="#3b372f" strokeWidth="1.6" />
          </g>
        </svg>

        <div style={{ display: 'flex', fontSize: 104, fontWeight: 700, color: '#3b372f', marginTop: 6 }}>dog ear</div>
        <div style={{ display: 'flex', fontSize: 33, fontWeight: 400, color: '#8a8475', marginTop: 16, maxWidth: 820, textAlign: 'center' }}>
          a little library on the internet — picked by real booksellers, with a few from Claude.
        </div>
      </div>
    ),
    {
      ...size,
      ...(fonts.length ? { fonts } : {}),
    },
  )
}
