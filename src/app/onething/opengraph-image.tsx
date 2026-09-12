import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'onething — one sentence a day, by text';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Gaegu from Google Fonts as TTF (no browser UA → truetype). Fails soft: this
// image is prerendered at build time and a font fetch must never block a deploy.
async function loadFont(weight: 400 | 700): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Gaegu:wght@${weight}`, { signal: AbortSignal.timeout(8000) })).text();
    const url = css.match(/src:\s*url\((https:[^)]+)\)/)?.[1];
    if (!url) throw new Error('font url not found');
    return await (await fetch(url, { signal: AbortSignal.timeout(8000) })).arrayBuffer();
  } catch (err) {
    console.warn('[onething og] font unavailable, using default:', (err as Error).message);
    return null;
  }
}

const PAPER = '#faf8f3';
const GRAPHITE = '#35332f';
const SOFT = '#9a968f';
const PENCIL = '#f3c64b';
const PINK = '#f0a3a0';
const WOOD = '#e7c9a2';
const FERRULE = '#d5d2cb';

/** The pencil, drawn with graphite outlines and flat coloured-pencil fills (Satori has no patterns). */
function Pencil() {
  return (
    <svg width="300" height="470" viewBox="0 0 120 200">
      <g stroke={GRAPHITE} strokeLinecap="round" strokeLinejoin="round" fill="none" transform="rotate(14 60 120)">
        <path d="M60 196 L 48 170 L 72 170 Z" fill={GRAPHITE} strokeWidth="2.2" />
        <path d="M48 170 L 72 170 L 84 146 L 36 146 Z" fill={WOOD} strokeWidth="2.4" />
        <rect x="36" y="16" width="48" height="130" rx="4" fill={PENCIL} fillOpacity="0.75" strokeWidth="2.8" />
        <path d="M44 20 L44 142 M52 20 L52 142 M60 20 L60 142 M68 20 L68 142 M76 20 L76 142" stroke="#e0ad2e" strokeWidth="1.2" strokeOpacity="0.7" />
        <rect x="34" y="-8" width="52" height="24" rx="3" fill={FERRULE} strokeWidth="2.4" />
        <rect x="36" y="-30" width="48" height="24" rx="8" fill={PINK} strokeWidth="2.6" />
        <ellipse cx="50" cy="78" rx="3.2" ry="4.2" fill={GRAPHITE} stroke="none" />
        <ellipse cx="71" cy="78" rx="3.2" ry="4.2" fill={GRAPHITE} stroke="none" />
        <path d="M51 95 Q 60 104, 70 95" strokeWidth="2.6" />
        <circle cx="43" cy="89" r="4.5" fill={PINK} fillOpacity="0.8" stroke="none" />
        <circle cx="78" cy="89" r="4.5" fill={PINK} fillOpacity="0.8" stroke="none" />
        <path d="M84 62 C 100 54, 106 40, 100 26 M100 26 L 92 20 M100 26 L 108 20 M100 26 L 102 15" strokeWidth="2.8" />
        <path d="M36 70 C 22 78, 18 92, 24 104" strokeWidth="2.8" />
      </g>
    </svg>
  );
}

export default async function OgImage() {
  const [regular, bold] = await Promise.all([loadFont(400), loadFont(700)]);
  const fonts = [
    regular && { name: 'Gaegu', data: regular, weight: 400 as const, style: 'normal' as const },
    bold && { name: 'Gaegu', data: bold, weight: 700 as const, style: 'normal' as const },
  ].filter((f): f is NonNullable<typeof f> => !!f);
  const family = fonts.length ? 'Gaegu' : 'sans-serif';
  const coil = Array.from({ length: 40 }, (_, i) => i);

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: PAPER, color: GRAPHITE, fontFamily: family }}>
        {/* spiral binding */}
        <div style={{ display: 'flex', height: 50, paddingLeft: 6 }}>
          {coil.map((i) => (
            <svg key={i} width="30" height="50" viewBox="0 0 30 40">
              <ellipse cx="15" cy="21" rx="5.5" ry="4" fill="#e6e2d9" />
              <path d="M9 4 C 4 10, 4 30, 15 34 C 24 37, 27 22, 21 15" fill="none" stroke="#8f8b84" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          ))}
        </div>

        <div style={{ display: 'flex', flex: 1, padding: '10px 64px 40px' }}>
          {/* the pencil, leaning in */}
          <div style={{ display: 'flex', alignItems: 'flex-end', width: 300, marginRight: 10 }}>
            <Pencil />
          </div>

          {/* the bubble */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 44, fontWeight: 700, marginBottom: 18, transform: 'rotate(-2deg)' }}>
              <svg width="40" height="40" viewBox="0 0 32 32" style={{ marginRight: 10 }}>
                <g fill="none" stroke={GRAPHITE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 27 L9 17 L21 5 L27 11 L15 23 Z" />
                  <path d="M21 5 L27 11 M6 27 L9 24" />
                </g>
                <path d="M9 17 L15 23 L12 25 L7 20 Z" fill={PENCIL} />
              </svg>
              <span style={{ backgroundImage: `linear-gradient(transparent 62%, ${PENCIL} 62%, ${PENCIL} 88%, transparent 88%)`, padding: '0 6px' }}>onething</span>
            </div>
            <div
              style={{
                display: 'flex', flexDirection: 'column', padding: '30px 36px 32px',
                border: `3px solid ${GRAPHITE}`, background: PAPER,
                borderTopLeftRadius: 22, borderTopRightRadius: 8, borderBottomRightRadius: 26, borderBottomLeftRadius: 6,
              }}
            >
              <div style={{ display: 'flex', fontSize: 58, fontWeight: 700, lineHeight: 1.05 }}>Every day at ten, a text asks what happened.</div>
              <div style={{ display: 'flex', marginTop: 16, fontSize: 32, color: SOFT, lineHeight: 1.2 }}>You answer in one sentence. By December, you have a year.</div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
