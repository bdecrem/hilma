import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const S = 10; // cell
const G = 3; // gap

type Cell = 'on' | 'off' | 'pad';

function monthCells(mi: number, rng: { x: number }): Cell[][] {
  const first = new Date(Date.UTC(2026, mi, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(2026, mi + 1, 0)).getUTCDate();
  const flat: Cell[] = [];
  for (let i = 0; i < offset; i++) flat.push('pad');
  for (let d = 1; d <= count; d++) { rng.x = (rng.x * 48271) % 2147483647; flat.push(mi < 9 && rng.x % 9 !== 0 ? 'on' : 'off'); }
  while (flat.length % 7) flat.push('pad');
  const rows: Cell[][] = [];
  for (let i = 0; i < flat.length; i += 7) rows.push(flat.slice(i, i + 7));
  return rows;
}

export default function OgImage() {
  const rng = { x: 7 };
  const months = MONTHS.map((name, mi) => ({ name, rows: monthCells(mi, rng) }));
  const monthW = 7 * S + 6 * G;
  const rowsOf4 = [months.slice(0, 4), months.slice(4, 8), months.slice(8, 12)];

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#fff', color: '#111', fontFamily: 'sans-serif', padding: '64px 72px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 500 }}>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 600, letterSpacing: '-0.02em' }}>
            <span style={{ color: '#0a2fff' }}>1</span><span>thing</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 54, fontWeight: 600, lineHeight: 1.05, letterSpacing: '-0.03em' }}>
              One sentence a day, by text.
            </div>
            <div style={{ display: 'flex', marginTop: 22, fontSize: 24, color: '#767676' }}>365 cells. Fill one a day.</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 'auto', justifyContent: 'center' }}>
          {rowsOf4.map((group, gi) => (
            <div key={gi} style={{ display: 'flex', marginTop: gi === 0 ? 0 : 26 }}>
              {group.map((m, i) => (
                <div key={m.name} style={{ display: 'flex', flexDirection: 'column', width: monthW, marginLeft: i === 0 ? 0 : 26 }}>
                  <div style={{ display: 'flex', fontSize: 13, color: '#767676', marginBottom: 6 }}>{m.name}</div>
                  {m.rows.map((row, ri) => (
                    <div key={ri} style={{ display: 'flex', marginTop: ri === 0 ? 0 : G }}>
                      {row.map((c, ci) => (
                        <div key={ci} style={{ width: S, height: S, marginLeft: ci === 0 ? 0 : G, background: c === 'pad' ? 'transparent' : c === 'on' ? '#111' : '#ececec' }} />
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
