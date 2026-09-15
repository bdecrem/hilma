import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'onething — one sentence a day, by text';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Google Fonts as TTF (no browser UA → truetype). Fails soft: this image is
// prerendered at build time and a font fetch must never block a deploy.
async function loadFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const q = `family=${family.replace(/ /g, '+')}:wght@${weight}`;
    const css = await (await fetch(`https://fonts.googleapis.com/css2?${q}`, { signal: AbortSignal.timeout(8000) })).text();
    const url = css.match(/src:\s*url\((https:[^)]+)\)/)?.[1];
    if (!url) throw new Error('font url not found');
    return await (await fetch(url, { signal: AbortSignal.timeout(8000) })).arrayBuffer();
  } catch (err) {
    console.warn(`[onething og] ${family} ${weight} unavailable, using default:`, (err as Error).message);
    return null;
  }
}

const DESK = '#e3dccb';
const PAPER = '#f7f1e1';
const INK = '#2a251c';
const RED = '#a8341f';
const RULE = '#cdb999';
const BODY = '#4a4238';

/** Design 4c: a single ruled page on the desk, slightly askew, taped at the
 * top. Headline in the hand, system voice in typewriter, red margin, kept! */
export default async function Image() {
  const [hand, mono, monoBold] = await Promise.all([loadFont('Caveat', 600), loadFont('Courier Prime', 400), loadFont('Courier Prime', 700)]);
  const fonts = [
    hand && { name: 'Caveat', data: hand, weight: 600 as const, style: 'normal' as const },
    mono && { name: 'Courier Prime', data: mono, weight: 400 as const, style: 'normal' as const },
    monoBold && { name: 'Courier Prime', data: monoBold, weight: 700 as const, style: 'normal' as const },
  ].filter((f): f is NonNullable<typeof f> => !!f);
  const now = new Date();
  const dayOfYear = Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 86400000) + 1;
  const hatch = 'repeating-linear-gradient(45deg, #e9bd3a 0 10px, #f6dc85 10px 20px)';

  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: 'flex', position: 'relative', background: DESK, backgroundImage: 'repeating-linear-gradient(135deg, rgba(42,37,28,.025) 0 1px, transparent 1px 7px)' }}>
        <div
          style={{
            position: 'absolute', top: 60, left: 60, width: 1080, height: 510, display: 'flex', flexDirection: 'column',
            background: PAPER, backgroundImage: 'repeating-linear-gradient(90deg, rgba(42,37,28,.02) 0 1px, transparent 1px 5px)',
            border: `3px solid ${INK}`, boxShadow: `10px 10px 0 ${INK}`, padding: '56px 72px 56px 150px', transform: 'rotate(-0.5deg)',
          }}
        >
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 104, width: 3, background: '#c9645a' }} />
          <div style={{ position: 'absolute', top: 6, bottom: -6, left: 112, width: 2, background: '#e0a39b' }} />
          <div style={{ position: 'absolute', top: -22, left: 447, width: 180, height: 40, background: hatch, border: `3px solid ${INK}`, transform: 'rotate(-2deg)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ display: 'flex', fontFamily: 'Courier Prime', fontWeight: 700, fontSize: 40, color: INK, letterSpacing: -1 }}>
              onething<span style={{ color: RED }}>.ink</span>
            </div>
            <div style={{ fontFamily: 'Courier Prime', fontSize: 20, letterSpacing: 3, color: RED }}>{`DAY ${dayOfYear}`}</div>
          </div>
          <div style={{ display: 'flex', borderBottom: `3px solid ${RULE}`, marginTop: 26, height: 0 }} />
          <div style={{ display: 'flex', fontFamily: 'Caveat', fontWeight: 600, fontSize: 78, lineHeight: 1.05, color: INK, padding: '18px 0 10px', borderBottom: `3px solid ${RULE}` }}>
            Every day at ten, a text asks what happened.
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 22 }}>
            <div style={{ fontFamily: 'Courier Prime', fontSize: 24, color: BODY }}>You answer in one sentence.</div>
            <div style={{ fontFamily: 'Courier Prime', fontSize: 20, color: RED, border: `3px solid ${RED}`, padding: '4px 16px', transform: 'rotate(-3deg)' }}>kept!</div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
