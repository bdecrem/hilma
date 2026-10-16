import { ImageResponse } from 'next/og';
import { ogFont } from '@/lib/og-fonts';
import { EXAMPLES, standaloneSvg } from '@/lib/onething/examples';

export const runtime = 'nodejs';
export const alt = 'onething: one sentence a day, and a doodle for every one';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// The tear-off calendar (2026-10-16): the words on the wall at left, the pad at
// right with one of the real September days on its top sheet. The fonts are
// bundled (src/fonts): this image is prerendered at build time, and fetching
// them from Google Fonts failed builds on 2026-09-05 and 2026-10-11.

const WALL = '#e9e3d8', SHEET = '#fffdf7', INK = '#151515', MUTE = '#8a8478', RED = '#d63a20';
const svgUri = (s: string) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`;

export default async function Image() {
  const black = await ogFont('inter-tight/InterTight-900.ttf');
  const semi = await ogFont('inter-tight/InterTight-600.ttf');
  const doodle = svgUri(standaloneSvg(EXAMPLES[0].svg, { ink: INK, accent: RED, width: 5, viewBox: '10 0 320 170' }));
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: WALL, fontFamily: 'Inter Tight', color: INK }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: 620, padding: '0 0 0 84px' }}>
          <div style={{ display: 'flex', fontSize: 44, fontWeight: 900, letterSpacing: -1.2 }}>onething<span style={{ color: RED }}>.</span></div>
          <div style={{ display: 'flex', marginTop: 40, fontSize: 64, fontWeight: 900, lineHeight: 1.04, letterSpacing: -2 }}>One sentence a day. A doodle for every one.</div>
          <div style={{ display: 'flex', marginTop: 26, fontSize: 28, fontWeight: 600, color: MUTE }}>A journal that lives in your texts.</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', width: 420, marginTop: 56, marginLeft: 40 }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 150, height: 36, background: '#222', borderRadius: '8px 8px 2px 2px' }}>
            <div style={{ display: 'flex', width: 13, height: 13, borderRadius: 13, background: WALL }} />
            <div style={{ display: 'flex', width: 13, height: 13, borderRadius: 13, background: WALL }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: SHEET, padding: '22px 30px 0', height: 520 }}>
            <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', fontSize: 15, fontWeight: 600, letterSpacing: 3, color: MUTE }}>
              <span>SEPTEMBER 2026</span><span>TUESDAY</span>
            </div>
            <div style={{ display: 'flex', marginTop: 18, fontSize: 210, fontWeight: 900, lineHeight: 0.84, letterSpacing: -9 }}>29</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={doodle} width={330} height={175} alt="" style={{ marginTop: 26 }} />
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: 'Inter Tight', data: black, weight: 900, style: 'normal' }, { name: 'Inter Tight', data: semi, weight: 600, style: 'normal' }] },
  );
}
