'use client'

import { useEffect, useState } from 'react'
import { CanvasArt } from './_components/CanvasArt'

export default function NowWhatHome() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <CanvasArt>
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
