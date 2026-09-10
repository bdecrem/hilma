import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ff69b4',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 150,
            fontWeight: 800,
            letterSpacing: '-0.04em',
            color: '#2b0a1e',
          }}
        >
          Hello, world
        </div>
        <div style={{ display: 'flex', marginTop: 28, fontSize: 40, color: '#7a0f3f' }}>
          Built on the mini, shipped to Vercel.
        </div>
      </div>
    ),
    size
  );
}
