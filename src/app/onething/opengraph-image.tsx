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
          justifyContent: 'center',
          padding: '0 96px',
          background: '#f6f1e7',
          color: '#1f1a14',
          fontFamily: 'serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', fontSize: 168, letterSpacing: '-0.04em', lineHeight: 1 }}>
          <span style={{ color: '#d9541e' }}>1</span>
          <span>thing</span>
        </div>
        <div style={{ display: 'flex', marginTop: 28, fontSize: 40, color: '#1f1a14' }}>
          One sentence a day. Texted at 10, kept for good.
        </div>
        <div style={{ display: 'flex', marginTop: 16, fontSize: 28, fontFamily: 'sans-serif', letterSpacing: '0.12em', color: '#8a7f70' }}>
          STREAKS · POINTS · LEVELS
        </div>
      </div>
    ),
    size
  );
}
