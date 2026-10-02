import { ImageResponse } from 'next/og';
import { EXAMPLES, standaloneSvg } from '@/lib/onething/examples';

export const runtime = 'nodejs';
export const alt = 'onething: one sentence a day, and a doodle for every one';
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

const INK = '#1d1625';
const svgUri = (s: string) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`;
const DROP = svgUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g" cx="36%" cy="40%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#e8dbff"/><stop offset="1" stop-color="#c3a8ff"/></radialGradient></defs><path d="M50 6 C60 28 82 44 82 64 A32 30 0 0 1 18 64 C18 44 40 28 50 6 Z" fill="url(#g)"/><ellipse cx="36" cy="46" rx="6" ry="11" transform="rotate(30 36 46)" fill="#fff" opacity=".9"/></svg>',
);

/** A day card, as on the page: its colour, the date, the doodle in a white blob, the sentence. */
function Card({ ex, date, bg, bg2, accent, tilt, x, y }: { ex: number; date: string; bg: string; bg2: string; accent: string; tilt: number; x: number; y: number }) {
  const e = EXAMPLES[ex];
  const doodle = svgUri(standaloneSvg(e.svg, { ink: INK, accent, width: 7, viewBox: '0 20 340 140' }));
  return (
    <div
      style={{
        position: 'absolute', left: x, top: y, width: 300, height: 380, display: 'flex', flexDirection: 'column', padding: 22, borderRadius: 34,
        backgroundImage: `radial-gradient(130% 90% at 20% 0%, ${bg2} 0%, ${bg} 65%)`, transform: `rotate(${tilt}deg)`,
        boxShadow: '0 30px 60px rgba(29,10,80,.35)',
      }}
    >
      <div style={{ fontFamily: 'Bricolage', fontWeight: 800, fontSize: 26, color: INK }}>{date}</div>
      <div style={{ marginTop: 14, alignSelf: 'center', width: 220, height: 206, borderRadius: 110, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 24px rgba(20,10,40,.18)' }}>
        <img src={doodle} width={196} height={81} alt="" />
      </div>
      <div style={{ marginTop: 16, fontFamily: 'Bricolage', fontWeight: 800, fontSize: 22, lineHeight: 1.15, color: INK, display: 'flex' }}>
        {e.sentence.length > 62 ? `${e.sentence.slice(0, 60).replace(/\s+\S*$/, '')}…` : e.sentence}
      </div>
    </div>
  );
}

/** The landing page's hero as a card: violet, the drop, the line, two real days fanned on the right. */
export default async function Image() {
  const [bricolage, nunito] = await Promise.all([loadFont('Bricolage Grotesque', 800), loadFont('Nunito', 800)]);
  const fonts = [
    bricolage && { name: 'Bricolage', data: bricolage, weight: 800 as const, style: 'normal' as const },
    nunito && { name: 'Nunito', data: nunito, weight: 800 as const, style: 'normal' as const },
  ].filter((f): f is NonNullable<typeof f> => !!f);

  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: 'flex', position: 'relative', overflow: 'hidden', backgroundImage: 'radial-gradient(120% 110% at 15% 0%, #b39bff 0%, #7b4dff 55%, #5a2fd6 100%)' }}>
        <div style={{ position: 'absolute', left: 72, top: 64, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ fontFamily: 'Bricolage', fontWeight: 800, fontSize: 52, letterSpacing: -2, color: '#fff', lineHeight: 1 }}>onething</div>
          <img src={DROP} width={40} height={40} alt="" style={{ marginLeft: 2 }} />
        </div>
        <div style={{ position: 'absolute', left: 72, top: 160, width: 500, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: 'Bricolage', fontWeight: 800, fontSize: 76, lineHeight: 0.98, letterSpacing: -3.2, color: '#fff' }}>One sentence a day.</div>
          <div style={{ marginTop: 10, fontFamily: 'Bricolage', fontWeight: 800, fontSize: 76, lineHeight: 0.98, letterSpacing: -3.2, color: '#ffd23f' }}>A doodle for every one.</div>
          <div style={{ marginTop: 26, fontFamily: 'Nunito', fontWeight: 800, fontSize: 26, lineHeight: 1.35, color: 'rgba(255,255,255,.86)' }}>
            A text at ten asks what happened. You answer, Opus draws it.
          </div>
        </div>
        <Card ex={2} date="28 Sep" bg="#ff7a2f" bg2="#ffa86a" accent="#e2560c" tilt={-8} x={640} y={140} />
        <Card ex={0} date="29 Sep" bg="#33b6ff" bg2="#86d6ff" accent="#0a86d0" tilt={6} x={860} y={70} />
      </div>
    ),
    { ...size, fonts },
  );
}
