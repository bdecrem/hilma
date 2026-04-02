'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']

interface Echo {
  x: number; y: number
  radius: number
  maxRadius: number
  speed: number
  color: string
  opacity: number
  freq: number
  bounces: number
  vx: number; vy: number // direction of travel after bouncing
}

function playTone(ctx: AudioContext, freq: number, vol: number, delay: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, ctx.currentTime + delay)
  gain.gain.setValueAtTime(0, ctx.currentTime + delay)
  gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + delay + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.4)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(ctx.currentTime + delay)
  osc.stop(ctx.currentTime + delay + 0.4)
}

export default function L19() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const echoesRef = useRef<Echo[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0

    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')!
    const [bg1, bg2] = pickGradientColors('L19')
    let raf: number
    let frame = 0

    const draw = () => {
      frame++
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Background
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      // Draw room edges (subtle)
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 1
      ctx.strokeRect(10, 10, W - 20, H - 20)

      const echoes = echoesRef.current

      for (let i = echoes.length - 1; i >= 0; i--) {
        const e = echoes[i]
        e.radius += e.speed
        e.opacity -= 0.004

        // Move center (bouncing echo travels)
        e.x += e.vx
        e.y += e.vy

        // Bounce off walls — spawn child echo
        let bounced = false
        if (e.x - e.radius < 10 || e.x + e.radius > W - 10) {
          if (e.bounces < 4 && e.opacity > 0.05) {
            const child: Echo = {
              x: e.x < W / 2 ? 10 : W - 10,
              y: e.y,
              radius: 0,
              maxRadius: e.maxRadius * 0.7,
              speed: e.speed * 0.9,
              color: CITRUS[(CITRUS.indexOf(e.color) + 1) % CITRUS.length],
              opacity: e.opacity * 0.6,
              freq: e.freq * (e.x < W / 2 ? 1.12 : 0.89),
              bounces: e.bounces + 1,
              vx: -e.vx * 0.7,
              vy: e.vy * 0.9,
            }
            echoes.push(child)

            // Play bounce sound
            if (audioRef.current) {
              playTone(audioRef.current, child.freq, child.opacity * 0.3, 0)
            }
            bounced = true
          }
          e.vx *= -0.5
        }

        if (e.y - e.radius < 10 || e.y + e.radius > H - 10) {
          if (!bounced && e.bounces < 4 && e.opacity > 0.05) {
            const child: Echo = {
              x: e.x,
              y: e.y < H / 2 ? 10 : H - 10,
              radius: 0,
              maxRadius: e.maxRadius * 0.7,
              speed: e.speed * 0.9,
              color: CITRUS[(CITRUS.indexOf(e.color) + 1) % CITRUS.length],
              opacity: e.opacity * 0.6,
              freq: e.freq * (e.y < H / 2 ? 1.06 : 0.94),
              bounces: e.bounces + 1,
              vx: e.vx * 0.9,
              vy: -e.vy * 0.7,
            }
            echoes.push(child)

            if (audioRef.current) {
              playTone(audioRef.current, child.freq, child.opacity * 0.3, 0)
            }
          }
          e.vy *= -0.5
        }

        // Draw ripple
        if (e.opacity > 0) {
          ctx.beginPath()
          ctx.arc(e.x, e.y, Math.max(0, e.radius), 0, Math.PI * 2)
          ctx.strokeStyle = e.color
          ctx.lineWidth = 2 + (1 - e.bounces / 4) * 3
          ctx.globalAlpha = e.opacity
          ctx.stroke()

          // Inner glow for fresh echoes
          if (e.radius < 30) {
            ctx.beginPath()
            ctx.arc(e.x, e.y, e.radius * 0.5, 0, Math.PI * 2)
            ctx.fillStyle = e.color
            ctx.globalAlpha = e.opacity * 0.3
            ctx.fill()
          }

          ctx.globalAlpha = 1
        }

        // Remove dead echoes
        if (e.opacity <= 0 || e.radius > e.maxRadius) {
          echoes.splice(i, 1)
        }
      }

      // Cap
      if (echoes.length > 150) echoes.splice(0, echoes.length - 150)

      // Hint
      if (echoes.length === 0 && frame < 300) {
        ctx.globalAlpha = 0.25 + Math.sin(frame * 0.03) * 0.08
        ctx.textAlign = 'center'
        ctx.font = '13px monospace'
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.fillText('tap anywhere. listen to the room.', W / 2, H - 35)
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      raf = requestAnimationFrame(draw)
    }

    const handleTap = (cx: number, cy: number) => {
      if (!audioRef.current) {
        audioRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      }
      if (audioRef.current.state === 'suspended') audioRef.current.resume()

      // Pitch from position — left is low, right is high
      const baseFreq = 200 + (cx / W) * 600
      const color = CITRUS[Math.floor(Math.random() * CITRUS.length)]

      // Spawn primary echo
      const echo: Echo = {
        x: cx, y: cy,
        radius: 0,
        maxRadius: Math.max(W, H) * 0.6,
        speed: 2 + Math.random() * 2,
        color,
        opacity: 0.6,
        freq: baseFreq,
        bounces: 0,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
      }
      echoesRef.current.push(echo)

      // Play initial tone
      playTone(audioRef.current, baseFreq, 0.25, 0)
    }

    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault()
      handleTap(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })
    canvas.addEventListener('click', (e: MouseEvent) => handleTap(e.clientX, e.clientY))

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100dvh',
        cursor: 'crosshair',
        touchAction: 'none',
      }}
    />
  )
}
