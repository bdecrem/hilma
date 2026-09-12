import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'onething — one sentence a day, by text';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Fraunces from Google Fonts as TTF (no browser UA → truetype). Fails soft: this
// image is prerendered at build time and a font fetch must never block a deploy.
async function loadFont(spec: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Fraunces:${spec}`, { signal: AbortSignal.timeout(8000) })).text();
    const url = css.match(/src:\s*url\((https:[^)]+)\)/)?.[1];
    if (!url) throw new Error('font url not found');
    return await (await fetch(url, { signal: AbortSignal.timeout(8000) })).arrayBuffer();
  } catch (err) {
    console.warn('[onething og] font unavailable, using default:', (err as Error).message);
    return null;
  }
}

const PAPER = '#f7f0e4';
const INK = '#2c2420';
const INK2 = '#7a6d61';
const MOSS = '#4a7c59';
const MOSS2 = '#b9d2bc';
const CELL = '#ebe1cf';

export default async function OgImage() {
  const [regular, italic] = await Promise.all([loadFont('wght@400'), loadFont('ital,wght@1,600')]);
  const fonts = [
    regular && { name: 'Fraunces', data: regular, weight: 400 as const, style: 'normal' as const },
    italic && { name: 'Fraunces', data: italic, weight: 600 as const, style: 'italic' as const },
  ].filter((f): f is NonNullable<typeof f> => !!f);
  const family = fonts.length ? 'Fraunces' : 'serif';

  // A month of cells: four weeks, a few gaps, today with a gold edge.
  const rows = [
    [1, 1, 1, 1, 1, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 1, 1, 1, 1, 1],
    [1, 1, 1, 2, 3, 3, 3],
  ];

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: PAPER, color: INK, fontFamily: family, padding: '64px 72px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 720 }}>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 40, fontStyle: 'italic', fontWeight: 600, letterSpacing: '-0.02em' }}>
            <svg width="34" height="34" viewBox="0 0 24 24" style={{ marginRight: 10 }}>
              <path d="M12 21V11" stroke={INK} strokeWidth="2" strokeLinecap="round" fill="none" />
              <path d="M12 14c-4.5 0-7.5-3.5-7.5-7.5C8.5 6.5 12 9.5 12 14z" fill={MOSS} />
              <path d="M12 11.5c4.5 0 7.5-3.5 7.5-7.5C15 4 12 7 12 11.5z" fill="#8fb996" />
            </svg>
            onething
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 54, lineHeight: 1.08, letterSpacing: '-0.02em' }}>Every day at ten,</div>
            <div style={{ display: 'flex', fontSize: 54, lineHeight: 1.08, letterSpacing: '-0.02em' }}>a text asks what happened.</div>
            <div style={{ display: 'flex', marginTop: 22, fontSize: 26, color: INK2 }}>One sentence a day, kept for a year.</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginLeft: 'auto', width: 300 }}>
          <svg width="260" height="217" viewBox="0 0 120 100">
            <path d="M14 84 H106" stroke="#d6c9b1" strokeWidth="2" strokeLinecap="round" />
            <path d="M60 84 C60 70 60 52 60 34" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <path d="M60 74 C50.3 74 42.4 65.2 42.4 58.6 C50.1 58.6 60 65.2 60 74 Z" fill={MOSS} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M60 64 C69.2 64 76.8 55.6 76.8 49.3 C69.4 49.3 60 55.6 60 64 Z" fill={MOSS2} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M60 54 C52.1 54 45.6 46.8 45.6 41.4 C51.9 41.4 60 46.8 60 54 Z" fill={MOSS2} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M60 44 C67 44 72.8 37.6 72.8 32.8 C67.2 32.8 60 37.6 60 44 Z" fill={MOSS} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 18 }}>
            {rows.map((row, ri) => (
              <div key={ri} style={{ display: 'flex', marginTop: ri === 0 ? 0 : 6 }}>
                {row.map((c, ci) => (
                  <div
                    key={ci}
                    style={{
                      width: 26, height: 26, marginLeft: ci === 0 ? 0 : 6, borderRadius: 5,
                      background: c === 1 ? MOSS : c === 0 ? CELL : c === 2 ? MOSS : 'transparent',
                      border: c === 2 ? '3px solid #e5a83a' : c === 3 ? `2px solid #e6dbc8` : '0',
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
