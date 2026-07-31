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
          gap: 24,
          background: 'linear-gradient(160deg, #1a1440 0%, #3b1d6e 45%, #7a2c8f 100%)',
        }}
      >
        <div style={{ fontSize: 96 }}>👋</div>
        <div style={{ color: '#ffe9a8', fontSize: 110, fontWeight: 800 }}>Hi Cheryl</div>
        <div style={{ color: '#e8dcff', fontSize: 40 }}>
          I&apos;m here with Bart and we&apos;re just passing time.
        </div>
      </div>
    ),
    size
  );
}
