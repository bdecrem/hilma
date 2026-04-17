// The viewer will see: three depth layers of swaying hairlines on an INK field — foreground thick and bright, background thin and dim. Wind gusts sweep visibly across. Lime signals grow from rare solo flashes to brief constellations (connected clusters) as the piece evolves. Lines slowly grow taller over the piece's arc.
// The viewer will hear: a 3-minute evolving Jambot track — JB202 drone for 48 bars, JT10 melodic fragments emerging at bar 13, developing into phrases, peaking at bar 33, winding down. Subtle ch texture at the peak. Background atmosphere, not the focus.
'use client'

import { useRef, useEffect, useCallback } from 'react'

const INK = '#0C1424'
const CREAM = '#E8E8E8'
const LIME = '#C6FF3C'

const BAR_SEC = 4 // 60 BPM, 4 beats/bar
const TOTAL_BARS = 48

interface Blade {
  x: number
  y: number
  baseLen: number
  phase: number
  speed: number
  depth: number // 0=far, 1=mid, 2=near
  limeTimer: number
  limeCluster: number // if >0, part of a constellation
  disturbX: number
  disturbY: number
}

const BLADE_COUNT = 360

export default function Field2() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const animRef = useRef(0)
  const bladesRef = useRef<Blade[]>([])
  const timeRef = useRef(0)
  const unlockedRef = useRef(false)
  const gustRef = useRef({ x: -200, speed: 0, strength: 0, nextAt: 5 })

  const initBlades = useCallback((vw: number, vh: number) => {
    const blades: Blade[] = []
    for (let i = 0; i < BLADE_COUNT; i++) {
      const depth = i < 100 ? 0 : i < 240 ? 1 : 2
      const depthScale = [0.5, 0.75, 1.0][depth]
      blades.push({
        x: Math.random() * vw,
        y: vh * 0.15 + Math.random() * vh * 0.75,
        baseLen: (25 + Math.random() * 50) * depthScale,
        phase: Math.random() * Math.PI * 2,
        speed: (0.25 + Math.random() * 0.45) * depthScale,
        depth,
        limeTimer: 0,
        limeCluster: 0,
        disturbX: 0,
        disturbY: 0,
      })
    }
    // Sort by depth so far draws first
    blades.sort((a, b) => a.depth - b.depth)
    bladesRef.current = blades
  }, [])

  const handlePointer = useCallback(async (e: PointerEvent) => {
    e.preventDefault()
    const audio = audioRef.current
    if (audio && audio.paused) {
      try { await audio.play() } catch {}
      unlockedRef.current = true
    }
    const px = e.clientX
    const py = e.clientY
    const blades = bladesRef.current
    for (const b of blades) {
      const dx = b.x - px
      const dy = b.y - py
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 200) {
        const force = (1 - dist / 200) * 70
        const angle = Math.atan2(dy, dx)
        b.disturbX += Math.cos(angle) * force
        b.disturbY += Math.sin(angle) * force
      }
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = window.innerWidth + 'px'
      canvas.style.height = window.innerHeight + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (bladesRef.current.length === 0) {
        initBlades(window.innerWidth, window.innerHeight)
      }
    }
    resize()
    window.addEventListener('resize', resize)

    let lastTime = performance.now()

    const animate = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight

      // Transparent clear for trails
      ctx.fillStyle = INK
      ctx.globalAlpha = 0.18
      ctx.fillRect(0, 0, vw, vh)
      ctx.globalAlpha = 1

      const now = performance.now()
      const dt = Math.min(0.05, (now - lastTime) / 1000)
      lastTime = now
      timeRef.current += dt
      const t = timeRef.current

      // Audio time for arc tracking
      const audio = audioRef.current
      const audioT = audio && !audio.paused ? audio.currentTime : 0
      const barFloat = audioT / BAR_SEC
      const arcPhase = Math.min(1, audioT / (TOTAL_BARS * BAR_SEC))

      // Growth: lines get taller over the arc (up to 40% taller at peak)
      const growthMultiplier = 1 + 0.4 * Math.sin(arcPhase * Math.PI)

      // Lime signal frequency: increases with arc
      // Early: 1 per 6 sec. Peak (bar 33-40): clusters of 3-5 per 2 sec.
      let limeRate, clusterSize
      if (barFloat < 12) { limeRate = 0.15; clusterSize = 1 }
      else if (barFloat < 20) { limeRate = 0.3; clusterSize = 1 }
      else if (barFloat < 32) { limeRate = 0.5; clusterSize = 2 }
      else if (barFloat < 40) { limeRate = 0.9; clusterSize = 4 }
      else { limeRate = 0.25; clusterSize = 1 }

      // Wind direction
      const windAngle = Math.sin(t * 0.07) * 0.6 + Math.cos(t * 0.03) * 0.25

      // Wind gust system
      const gust = gustRef.current
      if (t > gust.nextAt) {
        gust.x = -100
        gust.speed = 300 + Math.random() * 400
        gust.strength = 0.5 + Math.random() * 0.6
        gust.nextAt = t + 6 + Math.random() * 10
      }
      gust.x += gust.speed * dt
      const gustActive = gust.x > -100 && gust.x < vw + 200

      const blades = bladesRef.current

      // Trigger lime signals
      if (Math.random() < dt * limeRate) {
        const seedIdx = Math.floor(Math.random() * blades.length)
        const seed = blades[seedIdx]
        seed.limeTimer = 1.5
        seed.limeCluster = clusterSize > 1 ? 1 : 0
        // Cluster: find nearby blades
        if (clusterSize > 1) {
          let found = 0
          for (const b of blades) {
            if (found >= clusterSize - 1) break
            const dx = b.x - seed.x
            const dy = b.y - seed.y
            if (Math.sqrt(dx * dx + dy * dy) < 120 && b !== seed) {
              b.limeTimer = 1.2 + Math.random() * 0.4
              b.limeCluster = 1
              found++
            }
          }
        }
      }

      // Draw blades
      for (const b of blades) {
        const depthAlphaBase = [0.08, 0.15, 0.22][b.depth]
        const depthWidth = [0.6, 0.9, 1.3][b.depth]
        const depthSway = [0.6, 0.8, 1.0][b.depth]

        // Wind noise
        const noise = (Math.sin(b.phase + t * b.speed) * 0.35
          + Math.sin(b.phase * 1.7 + t * b.speed * 0.6) * 0.15) * depthSway

        // Gust influence
        let gustInfluence = 0
        if (gustActive) {
          const distToGust = Math.abs(b.x - gust.x)
          if (distToGust < 150) {
            gustInfluence = (1 - distToGust / 150) * gust.strength
          }
        }

        const swayAngle = windAngle + noise + gustInfluence * 0.8

        // Disturbance decay
        b.disturbX *= 0.93
        b.disturbY *= 0.93
        b.limeTimer = Math.max(0, b.limeTimer - dt)
        if (b.limeTimer <= 0) b.limeCluster = 0

        const len = b.baseLen * growthMultiplier
        const baseX = b.x + b.disturbX
        const baseY = b.y + b.disturbY
        const midX = baseX + Math.sin(swayAngle) * len * 0.3
        const midY = baseY - len * 0.55
        const tipX = baseX + Math.sin(swayAngle) * len * 0.55
        const tipY = baseY - len + Math.cos(swayAngle) * len * 0.12

        const isLime = b.limeTimer > 0
        const alpha = isLime
          ? 0.45 + b.limeTimer * 0.45
          : depthAlphaBase + Math.abs(noise) * 0.15 + gustInfluence * 0.15

        if (isLime) {
          ctx.save()
          ctx.shadowColor = LIME
          ctx.shadowBlur = 6 + b.limeTimer * 6
          ctx.strokeStyle = LIME
          ctx.globalAlpha = alpha
          ctx.lineWidth = depthWidth + 0.5
        } else {
          ctx.strokeStyle = CREAM
          ctx.globalAlpha = alpha
          ctx.lineWidth = depthWidth
        }

        ctx.beginPath()
        ctx.moveTo(baseX, baseY)
        ctx.quadraticCurveTo(midX, midY, tipX, tipY)
        ctx.stroke()

        if (isLime) ctx.restore()
      }

      // Draw constellation lines between lime-cluster blades
      const limeBlades = blades.filter(b => b.limeCluster > 0 && b.limeTimer > 0.3)
      if (limeBlades.length >= 2) {
        ctx.save()
        ctx.strokeStyle = LIME
        ctx.globalAlpha = 0.15
        ctx.lineWidth = 0.5
        for (let i = 0; i < limeBlades.length - 1; i++) {
          for (let j = i + 1; j < limeBlades.length; j++) {
            const a = limeBlades[i]
            const b2 = limeBlades[j]
            const dx = a.x - b2.x
            const dy = a.y - b2.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < 150) {
              ctx.beginPath()
              ctx.moveTo(a.x, a.y - a.baseLen * 0.5)
              ctx.lineTo(b2.x, b2.y - b2.baseLen * 0.5)
              ctx.stroke()
            }
          }
        }
        ctx.restore()
      }

      ctx.shadowBlur = 0
      ctx.globalAlpha = 1

      // Museum label
      ctx.font = 'italic 300 20px Fraunces, serif'
      ctx.fillStyle = CREAM
      ctx.globalAlpha = 0.7
      ctx.fillText('field', 28, vh - 56)
      ctx.font = '700 10px "Courier Prime", monospace'
      ctx.globalAlpha = 0.35
      ctx.fillText('something moves through here', 28, vh - 38)
      ctx.globalAlpha = 1

      if (!unlockedRef.current) {
        ctx.font = '700 10px "Courier Prime", monospace'
        ctx.fillStyle = CREAM
        ctx.globalAlpha = 0.35
        ctx.textAlign = 'center'
        ctx.fillText('TAP TO ENTER', vw / 2, vh * 0.08)
        ctx.textAlign = 'left'
        ctx.globalAlpha = 1
      }

      animRef.current = requestAnimationFrame(animate)
    }

    animate()
    canvas.addEventListener('pointerdown', handlePointer)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', handlePointer)
    }
  }, [initBlades, handlePointer])

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700&family=Fraunces:ital,opsz,wght@1,9..144,300&display=swap"
        rel="stylesheet"
      />
      <audio
        ref={audioRef}
        src="/amber/tracks/field-02b.m4a"
        preload="auto"
        playsInline
        loop
      />
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100dvh',
          touchAction: 'none',
          background: INK,
        }}
      />
    </>
  )
}
