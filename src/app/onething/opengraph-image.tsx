import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function instrumentSerif(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@1&display=swap', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:20.0) Gecko/20100101 Firefox/20.0' },
    }).then((r) => r.text());
    const url = css.match(/src: url\(([^)]+)\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function OgImage() {
  const font = await instrumentSerif();
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 88px 72px',
          background: 'linear-gradient(135deg, #f4efe6 0%, #f4efe6 55%, #fbe0d4 100%)',
          color: '#16130f',
          fontFamily: font ? 'Instrument Serif' : 'serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 22, letterSpacing: '0.16em', color: '#6a6257', fontFamily: 'monospace' }}>
          ● A DAILY LEDGER · ONE LINE, KEPT
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 210, lineHeight: 0.85, letterSpacing: '-0.04em' }}>
            <span style={{ color: '#ff4a1c', fontStyle: 'italic' }}>1</span>
            <span>thing</span>
          </div>
          <div style={{ display: 'flex', marginTop: 34, fontSize: 52, lineHeight: 1.1, fontStyle: 'italic', color: '#16130f' }}>
            Every day at ten, a text: what&rsquo;s one thing that happened?
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: font ? [{ name: 'Instrument Serif', data: font, style: 'italic' as const, weight: 400 as const }] : undefined,
    }
  );
}
