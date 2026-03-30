import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L14 — territory'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #FFFDE7, #FFECD2)',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Voronoi-style mosaic regions */}
        {/* Blood orange region — top left */}
        <div style={{
          display: 'flex', position: 'absolute',
          top: 0, left: 0, width: 320, height: 280,
          background: '#FF4E50', opacity: 0.75,
          clipPath: 'polygon(0 0, 100% 0, 70% 60%, 30% 100%, 0 80%)',
        }} />
        {/* Tangerine — top center */}
        <div style={{
          display: 'flex', position: 'absolute',
          top: 0, left: 250, width: 380, height: 240,
          background: '#FC913A', opacity: 0.75,
          clipPath: 'polygon(20% 0, 100% 0, 100% 70%, 60% 100%, 0 60%)',
        }} />
        {/* Mango — top right */}
        <div style={{
          display: 'flex', position: 'absolute',
          top: 0, right: 0, width: 340, height: 300,
          background: '#F9D423', opacity: 0.8,
          clipPath: 'polygon(30% 0, 100% 0, 100% 100%, 0 80%)',
        }} />
        {/* Lime — bottom left */}
        <div style={{
          display: 'flex', position: 'absolute',
          bottom: 0, left: 0, width: 380, height: 300,
          background: '#B4E33D', opacity: 0.75,
          clipPath: 'polygon(0 20%, 60% 0, 100% 40%, 80% 100%, 0 100%)',
        }} />
        {/* Grapefruit — bottom center-right */}
        <div style={{
          display: 'flex', position: 'absolute',
          bottom: 0, right: 100, width: 420, height: 260,
          background: '#FF6B81', opacity: 0.7,
          clipPath: 'polygon(20% 0, 100% 30%, 100% 100%, 0 100%)',
        }} />

        {/* Seed dots */}
        <div style={{ display: 'flex', position: 'absolute', top: 108, left: 168, width: 14, height: 14, borderRadius: '50%', background: '#FFF8E7', opacity: 0.9 }} />
        <div style={{ display: 'flex', position: 'absolute', top: 88, left: 520, width: 14, height: 14, borderRadius: '50%', background: '#FFF8E7', opacity: 0.9 }} />
        <div style={{ display: 'flex', position: 'absolute', top: 128, right: 188, width: 14, height: 14, borderRadius: '50%', background: '#FFF8E7', opacity: 0.9 }} />
        <div style={{ display: 'flex', position: 'absolute', bottom: 148, left: 188, width: 14, height: 14, borderRadius: '50%', background: '#FFF8E7', opacity: 0.9 }} />
        <div style={{ display: 'flex', position: 'absolute', bottom: 118, right: 228, width: 14, height: 14, borderRadius: '50%', background: '#FFF8E7', opacity: 0.9 }} />

        {/* Title */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10 }}>
          <div style={{
            fontSize: 88, fontWeight: 800, color: '#2A2218',
            letterSpacing: '-0.03em',
            textShadow: '0 2px 12px rgba(255,248,231,0.7)',
          }}>
            L14
          </div>
          <div style={{ fontSize: 30, color: '#5c5248', marginTop: 10, letterSpacing: '0.02em' }}>
            tap to claim territory
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
