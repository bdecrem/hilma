import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'BTS Bias Check — who is it?';

export default function Image() {
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
          background: 'linear-gradient(180deg, #160b2e 0%, #2d1657 100%)',
          color: '#f3ecff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 110, marginBottom: 10 }}>💜</div>
        <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2 }}>
          BTS Bias Check
        </div>
        <div style={{ fontSize: 36, color: '#b9a3e3', marginTop: 18 }}>
          Who is it? Build your streak.
        </div>
        <div
          style={{
            display: 'flex',
            gap: 18,
            marginTop: 48,
            fontSize: 30,
            color: '#e5d8ff',
          }}
        >
          {['RM', 'Jin', 'Suga', 'J-Hope', 'Jimin', 'V', 'Jungkook'].map((n) => (
            <div
              key={n}
              style={{
                padding: '10px 26px',
                borderRadius: 999,
                border: '2px solid #6d4fb3',
                background: 'rgba(139,92,246,0.18)',
              }}
            >
              {n}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
