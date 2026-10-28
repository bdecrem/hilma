import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Five finger capsules and a tucked thumb, the way the lesson draws them: one lit, one cued.
export default function OgImage() {
  const fingers = [
    { x: 520, top: 170, h: 250, fill: '#1a1a1a', stroke: '#3a3a3a' },
    { x: 600, top: 140, h: 280, fill: '#ff5a1f', stroke: '#ff5a1f' },
    { x: 680, top: 160, h: 260, fill: '#1a1a1a', stroke: '#8fb3ff' },
    { x: 755, top: 220, h: 200, fill: '#1a1a1a', stroke: '#3a3a3a' },
  ];
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#0d0d0d',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 80,
            top: 90,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', fontSize: 26, letterSpacing: '0.2em', color: '#8a8a8a' }}>TAKT</div>
          <div style={{ display: 'flex', fontSize: 132, fontWeight: 800, letterSpacing: '-0.04em', color: '#ede9e0', marginTop: 8 }}>
            HANDS
          </div>
          <div style={{ display: 'flex', fontSize: 30, color: '#8a8a8a', marginTop: 10, maxWidth: 420, lineHeight: 1.3 }}>
            Six concepts for the scale lessons
          </div>
        </div>
        {/* palm */}
        <div
          style={{
            position: 'absolute',
            left: 490,
            top: 400,
            width: 320,
            height: 190,
            borderRadius: 70,
            background: '#1a1a1a',
            border: '3px solid #3a3a3a',
            display: 'flex',
          }}
        />
        {fingers.map((f, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: f.x,
              top: f.top,
              width: 66,
              height: f.h,
              borderRadius: 40,
              background: f.fill,
              border: `4px solid ${f.stroke}`,
              display: 'flex',
            }}
          />
        ))}
        {/* thumb, out to the side */}
        <div
          style={{
            position: 'absolute',
            left: 420,
            top: 360,
            width: 70,
            height: 170,
            borderRadius: 40,
            background: '#1a1a1a',
            border: '4px solid #3a3a3a',
            transform: 'rotate(-42deg)',
            display: 'flex',
          }}
        />
      </div>
    ),
    size,
  );
}
