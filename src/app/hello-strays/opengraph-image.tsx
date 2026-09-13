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
          background: '#fff6ea',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: '0.18em',
            color: '#b8552c',
            marginBottom: 24,
          }}
        >
          STRAYS
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 120,
            fontWeight: 700,
            letterSpacing: '-0.025em',
            color: '#1a1714',
          }}
        >
          Hello from Strays.
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 28,
            fontSize: 36,
            color: '#5a524a',
          }}
        >
          A Discord-driven build agent on a Mac mini
        </div>
      </div>
    ),
    size
  );
}
