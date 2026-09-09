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
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff7ed',
          color: '#1c1917',
          fontSize: 140,
          fontWeight: 800,
          letterSpacing: '-0.03em',
        }}
      >
        Hello World
      </div>
    ),
    size
  );
}
