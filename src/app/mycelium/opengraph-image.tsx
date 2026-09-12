import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OgImage() {
  const base = await fetch(new URL('./og-base.png', import.meta.url)).then((r) => r.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: '#05030a',
          fontFamily: 'serif',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          // Satori accepts an ArrayBuffer here at runtime; the DOM typing does not.
          src={base as unknown as string}
          width={1200}
          height={630}
          style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 630 }}
        />
        <div
          style={{
            position: 'absolute',
            left: 64,
            bottom: 56,
            display: 'flex',
            flexDirection: 'column',
            color: 'white',
          }}
        >
          <div style={{ display: 'flex', fontSize: 96, fontStyle: 'italic', letterSpacing: '-0.02em', lineHeight: 1 }}>
            Mycelium
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 18,
              fontSize: 26,
              fontFamily: 'sans-serif',
              letterSpacing: '0.12em',
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            A SLIME MOULD IN YOUR POCKET
          </div>
        </div>
      </div>
    ),
    size
  );
}
