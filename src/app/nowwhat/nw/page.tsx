'use client'

import { useEffect, useState } from 'react'

// This page renders the main nowwhat landing page in an iframe
// with an "about" link overlay added on top

export default function NowWhatNW() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <div className="h-dvh bg-black relative overflow-hidden">
      {/* Main landing page */}
      <iframe
        src="/nowwhat"
        className="w-full h-full border-0"
        style={{ position: 'absolute', inset: 0 }}
      />

      {/* About link overlay */}
      <div
        className="fixed inset-0 z-20 flex items-center justify-center pointer-events-none"
        style={{ marginTop: '-6vh' }}
      >
        <div className="text-center" style={{ marginTop: 'clamp(80px, 12vw, 120px)' }}>
          <a
            href="/nowwhat/about"
            className="pointer-events-auto font-light tracking-[0.08em] hover:text-white/50 transition-colors"
            style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: 'clamp(9px, 2vw, 13px)',
              color: 'rgba(255,255,255,0.25)',
              opacity: mounted ? 1 : 0,
              transition: 'opacity 2s ease 3s',
            }}
          >
            read the essay
          </a>
        </div>
      </div>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400&display=swap');`}</style>
    </div>
  )
}
