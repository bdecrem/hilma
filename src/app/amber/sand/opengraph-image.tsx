import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'sand — citrus falling sand by amber'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  // Simulate sand dunes with layered trapezoid shapes
  // Five citrus colors stacked into organic dune formations
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(180deg, #FFFDE7 0%, #FFECD2 100%)',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'monospace',
        }}
      >
        {/* Sand dune layers — bottom to top */}

        {/* Grapefruit base dune */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: '-5%',
          width: '110%',
          height: '38%',
          background: '#FF6B81',
          borderRadius: '55% 45% 0 0 / 40% 40% 0 0',
          display: 'flex',
        }} />

        {/* Blood orange middle dune */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: '10%',
          width: '85%',
          height: '48%',
          background: '#FF4E50',
          borderRadius: '50% 55% 0 0 / 50% 50% 0 0',
          display: 'flex',
        }} />

        {/* Tangerine upper dune */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: '20%',
          width: '65%',
          height: '55%',
          background: '#FC913A',
          borderRadius: '45% 50% 0 0 / 55% 55% 0 0',
          display: 'flex',
        }} />

        {/* Mango peak dune */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: '30%',
          width: '45%',
          height: '62%',
          background: '#F9D423',
          borderRadius: '40% 45% 0 0 / 55% 60% 0 0',
          display: 'flex',
        }} />

        {/* Lime tip dune */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: '38%',
          width: '28%',
          height: '70%',
          background: '#B4E33D',
          borderRadius: '38% 42% 0 0 / 60% 65% 0 0',
          display: 'flex',
        }} />

        {/* Scattered grain dots */}
        {[
          { left: '8%', top: '18%', size: 12, color: '#FC913A' },
          { left: '15%', top: '28%', size: 8, color: '#F9D423' },
          { left: '78%', top: '22%', size: 10, color: '#FF4E50' },
          { left: '85%', top: '35%', size: 14, color: '#B4E33D' },
          { left: '92%', top: '15%', size: 9, color: '#FF6B81' },
          { left: '5%', top: '42%', size: 11, color: '#F9D423' },
          { left: '72%', top: '12%', size: 8, color: '#FC913A' },
        ].map((dot, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: dot.left,
            top: dot.top,
            width: dot.size,
            height: dot.size,
            borderRadius: '2px',
            background: dot.color,
            display: 'flex',
          }} />
        ))}

        {/* Title */}
        <div style={{
          position: 'absolute',
          top: '52px',
          left: '60px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <div style={{
            fontSize: '80px',
            fontWeight: 900,
            fontFamily: 'monospace',
            color: '#2D1A0A',
            letterSpacing: '-2px',
            lineHeight: 1,
            display: 'flex',
          }}>
            sand
          </div>
          <div style={{
            fontSize: '22px',
            fontFamily: 'monospace',
            color: 'rgba(80, 50, 20, 0.65)',
            letterSpacing: '1px',
            display: 'flex',
          }}>
            drag to pour · double-tap to change color
          </div>
        </div>

        {/* Amber signature */}
        <div style={{
          position: 'absolute',
          bottom: '24px',
          right: '40px',
          fontSize: '18px',
          fontFamily: 'monospace',
          color: '#D4A574',
          letterSpacing: '2px',
          display: 'flex',
        }}>
          amber
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
