import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

type Face = { data: ArrayBuffer; style: 'normal' | 'italic' }

async function instrumentSerif(): Promise<Face[]> {
  try {
    const css = await fetch('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:20.0) Gecko/20100101 Firefox/20.0' },
    }).then((r) => r.text())
    const faces: Face[] = []
    for (const block of css.split('@font-face').slice(1)) {
      const url = block.match(/src: url\(([^)]+)\)/)?.[1]
      if (!url) continue
      const style = /font-style: italic/.test(block) ? 'italic' : 'normal'
      faces.push({ data: await fetch(url).then((r) => r.arrayBuffer()), style })
    }
    return faces
  } catch {
    return []
  }
}

export default async function OgImage() {
  const faces = await instrumentSerif();
  const font = faces.length > 0;
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
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 22, letterSpacing: '0.16em', color: '#6a6257' }}>
          <div style={{ width: 12, height: 12, borderRadius: 6, background: '#ff4a1c', marginRight: 14 }} />
          A DAILY LEDGER · ONE LINE, KEPT
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
      fonts: font ? faces.map((f) => ({ name: 'Instrument Serif', data: f.data, style: f.style, weight: 400 as const })) : undefined,
    }
  );
}
