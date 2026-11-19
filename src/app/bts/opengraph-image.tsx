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
        {/* A drawn heart, not the emoji: next/og fetches emoji pictures from a CDN while the site
            builds, and a timeout there failed a whole deploy on 2026-11-18. */}
        <svg width="120" height="110" viewBox="0 0 24 22" style={{ marginBottom: 14 }}>
          <path fill="#a66bff" d="M12 21.2 2.3 11.6a5.9 5.9 0 0 1 0-8.4 5.9 5.9 0 0 1 8.4 0L12 4.5l1.3-1.3a5.9 5.9 0 0 1 8.4 0 5.9 5.9 0 0 1 0 8.4z" />
        </svg>
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
