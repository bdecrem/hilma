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
          background: '#0b0f14',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 150,
            fontWeight: 800,
            letterSpacing: '-0.04em',
            backgroundImage: 'linear-gradient(100deg, #7dd3fc 0%, #a78bfa 50%, #fb923c 100%)',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          Hello, world
        </div>
        <div style={{ display: 'flex', marginTop: 28, fontSize: 40, color: '#8ea0b3' }}>
          Built on the mini, shipped to Vercel.
        </div>
      </div>
    ),
    size
  );
}
