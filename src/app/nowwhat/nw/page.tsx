'use client'

import { useEffect, useState } from 'react'
import { CanvasArt } from '../_components/CanvasArt'

export default function NowWhatNW() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <CanvasArt>
      {/* Read the essay — overlay below the title */}
      <div
        className="fixed inset-0 z-20 flex items-center justify-center pointer-events-none"
        style={{ marginTop: '-6vh' }}
      >
        <div className="text-center" style={{ marginTop: 'clamp(80px, 12vw, 120px)' }}>
          <a
            href="/nowwhat/about"
            className="pointer-events-auto font-light tracking-[0.08em]"
            style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: '12px',
              color: 'rgba(255,255,255,0.5)',
              opacity: mounted ? 1 : 0,
              transition: 'opacity 1s ease 1.2s, color 0.3s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
          >
            read the essay
          </a>
        </div>
      </div>

      {/* Dashboard link — bottom of viewport */}
      <a
        href="/nowwhat/dashboard"
        style={{
          position: 'fixed',
          bottom: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontSize: '11px',
          letterSpacing: '0.08em',
          color: 'rgba(255,255,255,0.4)',
          textDecoration: 'none',
          zIndex: 20,
          opacity: mounted ? 1 : 0,
          transition: 'opacity 1s ease 1.2s, color 0.3s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
      >
        about the artifact
      </a>
    </CanvasArt>
  )
}
