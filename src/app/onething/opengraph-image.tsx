import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function OgImage() {
  let x = 7;
  const months = MONTHS.map((name, mi) => {
    const first = new Date(Date.UTC(2026, mi, 1));
    const offset = (first.getUTCDay() + 6) % 7;
    const count = new Date(Date.UTC(2026, mi + 1, 0)).getUTCDate();
    const cells: { on: boolean; pad?: boolean }[] = [];
    for (let i = 0; i < offset; i++) cells.push({ on: false, pad: true });
    for (let d = 1; d <= count; d++) { x = (x * 48271) % 2147483647; cells.push({ on: mi < 9 && x % 9 !== 0 }); }
    return { name, cells };
  });
  const S = 9, G = 2;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#fff', color: '#111', fontFamily: 'sans-serif', padding: '64px 72px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 520 }}>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 600, letterSpacing: '-0.02em' }}>
            <span style={{ color: '#0a2fff' }}>1</span><span>thing</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 54, fontWeight: 600, lineHeight: 1.05, letterSpacing: '-0.03em' }}>
              One sentence a day, by text.
            </div>
            <div style={{ display: 'flex', marginTop: 22, fontSize: 24, color: '#767676', lineHeight: 1.35 }}>
              365 cells. Fill one a day.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', width: 536, marginLeft: 'auto', alignContent: 'center', gap: '22px 24px' }}>
          {months.map((m) => (
            <div key={m.name} style={{ display: 'flex', flexDirection: 'column', width: 7 * S + 6 * G }}>
              <div style={{ display: 'flex', fontSize: 12, color: '#767676', marginBottom: 6 }}>{m.name}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', width: 7 * S + 6 * G, gap: G }}>
                {m.cells.map((c, i) => (
                  <div key={i} style={{ width: S, height: S, background: c.pad ? 'transparent' : c.on ? '#111' : '#ececec' }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
