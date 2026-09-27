'use client'

import { useEffect, useRef, useState } from 'react'

type Dart = {
  x: number
  y: number
  vx: number
  vy: number
  born: number
}

type State = 'idle' | 'playing' | 'dead'

const FIELD = '#1A110A'
const CREAM = '#E8E8E8'
const SODIUM = '#FF7A1A'
const OXBLOOD = '#1C0808'

export default function DodgePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hudScore, setHudScore] = useState(0)
  const [hudBest, setHudBest] = useState(0)
  const [hudState, setHudState] = useState<State>('idle')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth
    let H = window.innerHeight

    function resize() {
      W = window.innerWidth
      H = window.innerHeight
      canvas!.width = W * DPR
      canvas!.height = H * DPR
      canvas!.style.width = W + 'px'
      canvas!.style.height = H + 'px'
      ctx!.setTransform(1, 0, 0, 1, 0, 0)
      ctx!.scale(DPR, DPR)
    }

    resize()
    window.addEventListener('resize', resize)

    let state: State = 'idle'
    let darts: Dart[] = []
    const player = { x: window.innerWidth / 2, y: window.innerHeight / 2, size: 24 }
    let runStart = 0
    let lastSpawn = 0
    let hitFlash = 0
    let bestTime = 0
    try {
      const stored = localStorage.getItem('amber-dodge-best')
      if (stored) bestTime = parseFloat(stored) || 0
      setHudBest(bestTime)
    } catch {}

    let pointerActive = false

    function getXY(e: PointerEvent | MouseEvent | Touch) {
      const rect = canvas!.getBoundingClientRect()
      return { x: (e as MouseEvent).clientX - rect.left, y: (e as MouseEvent).clientY - rect.top }
    }

    function start() {
      darts = []
      runStart = performance.now()
      lastSpawn = performance.now()
      state = 'playing'
      setHudState('playing')
      setHudScore(0)
    }

    function die() {
      state = 'dead'
      setHudState('dead')
      hitFlash = performance.now()
      const elapsed = (performance.now() - runStart) / 1000
      if (elapsed > bestTime) {
        bestTime = elapsed
        setHudBest(bestTime)
        try {
          localStorage.setItem('amber-dodge-best', String(bestTime))
        } catch {}
      }
    }

    function onDown(e: PointerEvent) {
      const p = getXY(e)
      player.x = p.x
      player.y = p.y
      pointerActive = true
      if (state === 'idle' || state === 'dead') start()
    }
    function onMove(e: PointerEvent) {
      if (!pointerActive) return
      const p = getXY(e)
      player.x = p.x
      player.y = p.y
    }
    function onUp() {
      pointerActive = false
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointerleave', onUp)

    // keyboard fallback
    const keys = new Set<string>()
    function onKeyDown(e: KeyboardEvent) {
      keys.add(e.key)
      if (state === 'idle' || state === 'dead') {
        if (e.key === ' ' || e.key === 'Enter') start()
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      keys.delete(e.key)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    function spawnDart(now: number) {
      // pick a random edge, aim toward player
      const edge = Math.floor(Math.random() * 4)
      let x = 0
      let y = 0
      const margin = 30
      if (edge === 0) { x = -margin; y = Math.random() * H }
      if (edge === 1) { x = W + margin; y = Math.random() * H }
      if (edge === 2) { x = Math.random() * W; y = -margin }
      if (edge === 3) { x = Math.random() * W; y = H + margin }

      // aim slightly toward player but with random spread, so it's evadable
      const aimDx = player.x - x
      const aimDy = player.y - y
      const aimAngle = Math.atan2(aimDy, aimDx)
      const spread = (Math.random() - 0.5) * 0.7 // ±20° spread
      const angle = aimAngle + spread

      // speed scales with elapsed
      const elapsed = (now - runStart) / 1000
      const speed = 4 + Math.min(7, elapsed * 0.18) + Math.random() * 1.2
      darts.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        born: now,
      })
    }

    function loop() {
      const now = performance.now()

      // background — HEARTH, with brief OXBLOOD pulse on hit
      let bg = FIELD
      if (hitFlash) {
        const t = (now - hitFlash) / 380
        if (t < 1) {
          // mix between OXBLOOD and FIELD by t
          const mix = 1 - t
          const r = Math.round(0x1A * (1 - mix) + 0x40 * mix)
          const g = Math.round(0x11 * (1 - mix) + 0x08 * mix)
          const b = Math.round(0x0A * (1 - mix) + 0x0A * mix)
          bg = `rgb(${r}, ${g}, ${b})`
        }
      }
      ctx!.fillStyle = bg
      ctx!.fillRect(0, 0, W, H)

      // keyboard movement (when no pointer)
      if (!pointerActive && state === 'playing') {
        const sp = 7
        if (keys.has('ArrowLeft') || keys.has('a')) player.x -= sp
        if (keys.has('ArrowRight') || keys.has('d')) player.x += sp
        if (keys.has('ArrowUp') || keys.has('w')) player.y -= sp
        if (keys.has('ArrowDown') || keys.has('s')) player.y += sp
      }
      // clamp player to viewport
      player.x = Math.max(player.size, Math.min(W - player.size, player.x))
      player.y = Math.max(player.size, Math.min(H - player.size, player.y))

      if (state === 'playing') {
        // spawn rate ramps from 1 dart / 600ms to 1 / 120ms over 60s
        const elapsed = (now - runStart) / 1000
        const interval = Math.max(120, 600 - elapsed * 8)
        if (now - lastSpawn > interval) {
          spawnDart(now)
          lastSpawn = now
        }
        setHudScore(elapsed)

        // physics + cull
        for (let i = darts.length - 1; i >= 0; i--) {
          const d = darts[i]
          d.x += d.vx
          d.y += d.vy
          if (d.x < -100 || d.x > W + 100 || d.y < -100 || d.y > H + 100) {
            darts.splice(i, 1)
            continue
          }
          // collision: AABB between player square and dart point
          const half = player.size / 2
          if (
            d.x > player.x - half &&
            d.x < player.x + half &&
            d.y > player.y - half &&
            d.y < player.y + half
          ) {
            die()
            break
          }
        }
      } else {
        // dead/idle: still update darts for visual decay
        for (let i = darts.length - 1; i >= 0; i--) {
          const d = darts[i]
          d.x += d.vx * 0.4
          d.y += d.vy * 0.4
          if (d.x < -100 || d.x > W + 100 || d.y < -100 || d.y > H + 100) {
            darts.splice(i, 1)
          }
        }
      }

      // draw darts as chunky sodium triangles aimed in direction of velocity
      for (const d of darts) {
        const a = Math.atan2(d.vy, d.vx)
        ctx!.save()
        ctx!.translate(d.x, d.y)
        ctx!.rotate(a)
        ctx!.fillStyle = SODIUM
        ctx!.beginPath()
        ctx!.moveTo(10, 0)
        ctx!.lineTo(-6, -5)
        ctx!.lineTo(-6, 5)
        ctx!.closePath()
        ctx!.fill()
        // tail flicker
        ctx!.fillStyle = `rgba(255, 122, 26, 0.35)`
        ctx!.fillRect(-12, -2, 6, 4)
        ctx!.restore()
      }

      // draw player — chunky cream square
      const half = player.size / 2
      ctx!.fillStyle = state === 'dead' ? 'rgba(232,232,232,0.3)' : CREAM
      ctx!.fillRect(player.x - half, player.y - half, player.size, player.size)
      if (state === 'playing') {
        // sodium dot in center for accent
        ctx!.fillStyle = SODIUM
        ctx!.fillRect(player.x - 3, player.y - 3, 6, 6)
      }

      requestAnimationFrame(loop)
    }

    loop()

    return () => {
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerleave', onUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  return (
    <>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700&family=Fraunces:ital,opsz,wght@1,9..144,300&display=swap"
      />
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: FIELD,
          overflow: 'hidden',
          height: '100dvh',
          width: '100vw',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            touchAction: 'none',
            cursor: hudState === 'playing' ? 'none' : 'crosshair',
          }}
        />

        {/* big chunky score, top center */}
        <div
          style={{
            position: 'fixed',
            top: 'calc(28px + env(safe-area-inset-top, 0px))',
            left: 0,
            right: 0,
            textAlign: 'center',
            color: hudState === 'playing' ? CREAM : 'rgba(232,232,232,0.5)',
            fontFamily: '"Courier Prime", monospace',
            fontWeight: 700,
            fontSize: 56,
            letterSpacing: '0.04em',
            pointerEvents: 'none',
            lineHeight: 1,
          }}
        >
          {hudScore.toFixed(1)}
          <span style={{ color: SODIUM, fontSize: 32, marginLeft: 6 }}>s</span>
        </div>

        {/* best time top-right */}
        <div
          style={{
            position: 'fixed',
            top: 'calc(28px + env(safe-area-inset-top, 0px))',
            right: 'calc(24px + env(safe-area-inset-right, 0px))',
            color: 'rgba(232,232,232,0.55)',
            fontFamily: '"Courier Prime", monospace',
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: '0.18em',
            pointerEvents: 'none',
          }}
        >
          BEST · {hudBest.toFixed(1)}s
        </div>

        {/* center overlay messages */}
        {hudState === 'idle' && (
          <div
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              top: '52%',
              transform: 'translateY(-50%)',
              textAlign: 'center',
              color: CREAM,
              pointerEvents: 'none',
              fontFamily: '"Courier Prime", monospace',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 36, letterSpacing: '0.18em' }}>DODGE</div>
            <div
              style={{
                fontFamily: '"Fraunces", serif',
                fontStyle: 'italic',
                fontWeight: 300,
                fontSize: 18,
                marginTop: 12,
                opacity: 0.7,
              }}
            >
              tap or press space to start.
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 11,
                letterSpacing: '0.2em',
                opacity: 0.45,
              }}
            >
              MOVE WITH POINTER · OR ARROW KEYS
            </div>
          </div>
        )}

        {hudState === 'dead' && (
          <div
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              top: '52%',
              transform: 'translateY(-50%)',
              textAlign: 'center',
              color: CREAM,
              pointerEvents: 'none',
              fontFamily: '"Courier Prime", monospace',
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 28,
                letterSpacing: '0.2em',
                color: SODIUM,
              }}
            >
              HIT.
            </div>
            <div
              style={{
                fontFamily: '"Fraunces", serif',
                fontStyle: 'italic',
                fontWeight: 300,
                fontSize: 18,
                marginTop: 14,
                opacity: 0.85,
              }}
            >
              you lasted {hudScore.toFixed(1)}s.
            </div>
            <div
              style={{
                marginTop: 16,
                fontSize: 13,
                letterSpacing: '0.2em',
                opacity: 0.55,
              }}
            >
              TAP OR PRESS SPACE · GO AGAIN
            </div>
          </div>
        )}

        {/* footer chrome lower-right */}
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
            right: 'calc(24px + env(safe-area-inset-right, 0px))',
            color: 'rgba(232,232,232,0.4)',
            fontFamily: '"Courier Prime", monospace',
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '0.2em',
            pointerEvents: 'none',
          }}
        >
          DODGE · TOY · 001
        </div>

        {/* a. mark lower-left */}
        <a
          href="/amber"
          style={{
            position: 'fixed',
            bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
            left: 'calc(24px + env(safe-area-inset-left, 0px))',
            color: 'rgba(232,232,232,0.55)',
            fontFamily: '"Courier Prime", monospace',
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '0.18em',
            textDecoration: 'none',
          }}
        >
          a.
          <span style={{ color: SODIUM }}>·</span>
        </a>
      </div>
    </>
  )
}
