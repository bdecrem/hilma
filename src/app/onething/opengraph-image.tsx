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

// Three more doodles in the same hand, for the pile (the other three are the real September ones).
const MORE = {
  cup: '<path d="M120 62 L132 140 L198 140 L210 62 Z"/><path d="M210 80 Q244 86 232 112 Q226 124 204 120"/><path d="M146 50 q9 -12 0 -26 M168 50 q9 -12 0 -26 M190 50 q9 -12 0 -26" class="thin"/><path d="M104 152 L226 152" class="r"/>',
  kite: '<path d="M170 14 L218 66 L170 128 L122 66 Z"/><path d="M170 14 L170 128 M122 66 L218 66" class="thin"/><path d="M170 128 Q148 146 174 156 Q200 166 178 178" class="r"/>',
  balloon: '<ellipse cx="170" cy="62" rx="40" ry="48"/><path d="M170 110 L163 120 L177 120 Z"/><path d="M170 120 Q158 138 172 152 Q184 166 168 176" class="r"/><path d="M152 44 q6 -10 16 -12" class="thin"/>',
};

type Card = { svg: string; date: string; bg: string; deep: string; x: number; y: number; tilt: number; w: number };
const CARDS: Card[] = [
  { svg: MORE.kite, date: '2 Sep', bg: '#ff7a2f', deep: '#e2560c', x: 600, y: 300, tilt: -9, w: 210 },
  { svg: EXAMPLES[1].svg, date: '6 Sep', bg: '#93d94e', deep: '#4f9a1f', x: 960, y: 330, tilt: 8, w: 220 },
  { svg: MORE.cup, date: '4 Sep', bg: '#ffd23f', deep: '#d99a00', x: 940, y: 36, tilt: 6, w: 210 },
  { svg: EXAMPLES[2].svg, date: '1 Sep', bg: '#7b4dff', deep: '#6a3df0', x: 640, y: 40, tilt: -6, w: 220 },
  { svg: MORE.balloon, date: '5 Sep', bg: '#ff5fa8', deep: '#e0307f', x: 760, y: 360, tilt: 3, w: 200 },
  { svg: EXAMPLES[0].svg, date: '3 Sep', bg: '#33b6ff', deep: '#0a86d0', x: 790, y: 168, tilt: -2, w: 240 },
];

function DayCard({ c }: { c: Card }) {
  const h = Math.round(c.w * 0.92);
  const blobW = c.w - 46, blobH = Math.round(blobW * 0.78);
  const doodle = svgUri(standaloneSvg(c.svg, { ink: INK, accent: c.deep, width: 8, viewBox: '10 0 320 180' }));
  return (
    <div
      style={{
        position: 'absolute', left: c.x, top: c.y, width: c.w, height: h, display: 'flex', flexDirection: 'column', padding: '12px 18px',
        background: c.bg, border: `5px solid ${INK}`, borderRadius: 30, transform: `rotate(${c.tilt}deg)`, boxShadow: `7px 8px 0 ${INK}`,
      }}
    >
      <div style={{ fontFamily: 'Bricolage', fontWeight: 800, fontSize: 24, color: INK, lineHeight: 1 }}>{c.date}</div>
      <div style={{ marginTop: 8, width: blobW, height: blobH, borderRadius: '50%', background: '#fff', border: `4px solid ${INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={doodle} width={Math.round(blobW * 0.96)} height={Math.round(blobW * 0.96 * 180 / 340)} alt="" />
      </div>
    </div>
  );
}

/** Confetti: rounded bits in the day colours, each with an ink edge. */
const BITS: [number, number, string, number, 'dot' | 'strip'][] = [
  [70, 30, '#ff5fa8', 0, 'dot'], [520, 70, '#33b6ff', 30, 'strip'], [540, 575, '#ffd23f', -20, 'strip'], [40, 570, '#93d94e', 0, 'dot'],
  [30, 420, '#ff7a2f', 0, 'dot'], [1160, 290, '#7b4dff', 0, 'dot'], [1150, 595, '#ff5fa8', 40, 'strip'], [600, 250, '#93d94e', -30, 'strip'],
];

const FLOWER = svgUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${[['#ffd23f', 50, 25], ['#33b6ff', 74, 42], ['#93d94e', 66, 71], ['#ff7a2f', 34, 71], ['#7b4dff', 26, 42]].map(([c, x, y]) => `<ellipse cx="${x}" cy="${y}" rx="15" ry="13" fill="${c}" stroke="${INK}" stroke-width="5"/>`).join('')}<circle cx="50" cy="51" r="13" fill="#fff" stroke="${INK}" stroke-width="5"/><path d="M45 50 q2 -3 4 0 M52 50 q2 -3 4 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/></svg>`,
);

const H1 = { fontFamily: 'Bricolage', fontWeight: 800, fontSize: 68, lineHeight: 1, letterSpacing: -3, color: INK } as const;

/** A warm page with a pile of days on the right: each day its colour, each with its doodle. */
export default async function Image() {
  const [bricolage, hand] = await Promise.all([loadFont('Bricolage Grotesque', 800), loadFont('Patrick Hand', 400)]);
  const fonts = [
    bricolage && { name: 'Bricolage', data: bricolage, weight: 800 as const, style: 'normal' as const },
    hand && { name: 'Hand', data: hand, weight: 400 as const, style: 'normal' as const },
  ].filter((f): f is NonNullable<typeof f> => !!f);

  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: 'flex', position: 'relative', overflow: 'hidden', background: '#fbf7f0' }}>
        {BITS.map(([x, y, c, r, kind], i) => (
          <div key={i} style={{ position: 'absolute', left: x, top: y, width: kind === 'dot' ? 22 : 34, height: kind === 'dot' ? 22 : 14, borderRadius: kind === 'dot' ? 11 : 6, background: c, border: `3.5px solid ${INK}`, transform: `rotate(${r}deg)` }} />
        ))}
        {CARDS.map((c, i) => <DayCard key={i} c={c} />)}

        <div style={{ position: 'absolute', left: 70, top: 62, display: 'flex', alignItems: 'center' }}>
          <img src={FLOWER} width={64} height={64} alt="" />
          <div style={{ marginLeft: 12, fontFamily: 'Bricolage', fontWeight: 800, fontSize: 54, letterSpacing: -2, color: INK, lineHeight: 1 }}>onething</div>
        </div>
        <div style={{ position: 'absolute', left: 70, top: 176, width: 540, display: 'flex', flexDirection: 'column' }}>
          <div style={{ ...H1, display: 'flex' }}>One sentence</div>
          <div style={{ ...H1, marginTop: 10, display: 'flex', alignItems: 'flex-end' }}>
            <span style={{ display: 'flex' }}>a day. A</span>
            <div style={{ display: 'flex', position: 'relative', marginLeft: 18, padding: '0 8px' }}>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 2, height: 36, background: '#ffd23f', borderRadius: 12, transform: 'rotate(-2deg)' }} />
              <span style={{ display: 'flex', position: 'relative' }}>doodle</span>
            </div>
          </div>
          <div style={{ ...H1, marginTop: 10, display: 'flex' }}>for every one.</div>
          <div style={{ marginTop: 26, display: 'flex', fontFamily: 'Hand', fontSize: 34, lineHeight: 1.2, color: '#5a2fd6', transform: 'rotate(-1.5deg)' }}>a text at ten asks what happened</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
