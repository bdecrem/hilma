'use client'

import { useEffect, useRef } from 'react'

const FIELD = '#050506'
const CREAM = '#E8E8E8'
const LIME = '#B8FF2C'
const VIOLET = '#8B5CF6'

type Boop = { x: number; y: number; time: number; strength: number }
type Star = { x: number; y: number; r: number; tw: number; p: number }

export default function VoidPupPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth
    let H = window.innerHeight
    let pointerX = W / 2
    let pointerY = H / 2
    let tailPhase = 0
    let happiness = 0.35
    let raf = 0
    let audioCtx: AudioContext | null = null
    let master: GainNode | null = null
    const boops: Boop[] = []

    const stars: Star[] = Array.from({ length: 110 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.5 + Math.random() * 1.7,
      tw: 0.6 + Math.random() * 1.8,
      p: Math.random() * Math.PI * 2,
    }))

    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = Math.floor(W * DPR)
      canvas.height = Math.floor(H * DPR)
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const ensureAudio = () => {
      if (audioCtx) return
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtx = new Ctor()
      master = audioCtx.createGain()
      master.gain.value = 0.16
      master.connect(audioCtx.destination)
    }

    const yip = (pitch = 440) => {
      ensureAudio()
      if (!audioCtx || !master) return
      const now = audioCtx.currentTime
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      const filt = audioCtx.createBiquadFilter()
      filt.type = 'lowpass'
      filt.frequency.setValueAtTime(1800, now)
      filt.frequency.exponentialRampToValueAtTime(420, now + 0.22)
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(pitch, now)
      osc.frequency.exponentialRampToValueAtTime(pitch * 1.65, now + 0.07)
      osc.frequency.exponentialRampToValueAtTime(pitch * 0.8, now + 0.22)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.24, now + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24)
      osc.connect(filt)
      filt.connect(gain)
      gain.connect(master)
      osc.start(now)
      osc.stop(now + 0.26)
    }

    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const onMove = (e: PointerEvent) => {
      const p = pos(e)
      pointerX = p.x
      pointerY = p.y
    }

    const onDown = (e: PointerEvent) => {
      const p = pos(e)
      pointerX = p.x
      pointerY = p.y
      happiness = 1
      boops.push({ x: p.x, y: p.y, time: performance.now() / 1000, strength: 1 })
      if (boops.length > 16) boops.shift()
      yip(330 + Math.random() * 190)
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {}
    }

    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerdown', onDown)

    const start = performance.now()
    let last = start

    const rounded = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.lineTo(x + w - r, y)
      ctx.quadraticCurveTo(x + w, y, x + w, y + r)
      ctx.lineTo(x + w, y + h - r)
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
      ctx.lineTo(x + r, y + h)
      ctx.quadraticCurveTo(x, y + h, x, y + h - r)
      ctx.lineTo(x, y + r)
      ctx.quadraticCurveTo(x, y, x + r, y)
      ctx.closePath()
    }

    const tick = (nowMs: number) => {
      const t = (nowMs - start) / 1000
      const dt = Math.min(0.04, (nowMs - last) / 1000)
      last = nowMs
      happiness += (0.28 - happiness) * (1 - Math.exp(-dt * 0.9))
      tailPhase += dt * (5 + happiness * 16)

      ctx.fillStyle = FIELD
      ctx.fillRect(0, 0, W, H)

      const nebula = ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.42, Math.max(W, H) * 0.65)
      nebula.addColorStop(0, 'rgba(139, 92, 246, 0.18)')
      nebula.addColorStop(0.45, 'rgba(184, 255, 44, 0.045)')
      nebula.addColorStop(1, 'rgba(5, 5, 6, 0)')
      ctx.fillStyle = nebula
      ctx.fillRect(0, 0, W, H)

      for (const s of stars) {
        const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.tw + s.p))
        ctx.fillStyle = `rgba(232, 232, 232, ${a})`
        ctx.beginPath()
        ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2)
        ctx.fill()
      }

      const cx = W / 2
      const cy = H / 2 + Math.sin(t * 1.2) * 8
      const scale = Math.min(W, H) * 0.42
      const bodyW = Math.max(150, scale * 0.9)
      const bodyH = Math.max(110, scale * 0.58)
      const headR = bodyH * 0.48
      const lookX = Math.max(-1, Math.min(1, (pointerX - cx) / (W * 0.28)))
      const lookY = Math.max(-1, Math.min(1, (pointerY - cy) / (H * 0.28)))
      const wag = Math.sin(tailPhase) * (0.5 + happiness * 0.75)

      // shadow pool
      const shadow = ctx.createRadialGradient(cx, cy + bodyH * 0.62, 0, cx, cy + bodyH * 0.62, bodyW * 0.75)
      shadow.addColorStop(0, 'rgba(0,0,0,0.45)')
      shadow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = shadow
      ctx.fillRect(cx - bodyW, cy, bodyW * 2, bodyH)

      // tail: a happy antenna into the void
      ctx.save()
      ctx.translate(cx - bodyW * 0.42, cy + bodyH * 0.04)
      ctx.rotate(-0.55 + wag * 0.32)
      ctx.strokeStyle = `rgba(232, 232, 232, ${0.7 + happiness * 0.25})`
      ctx.lineWidth = bodyH * 0.16
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.bezierCurveTo(-bodyW * 0.28, -bodyH * 0.28, -bodyW * 0.22, -bodyH * 0.7, bodyW * 0.02, -bodyH * 0.62)
      ctx.stroke()
      ctx.restore()

      // body
      ctx.fillStyle = CREAM
      rounded(cx - bodyW * 0.48, cy - bodyH * 0.18, bodyW * 0.8, bodyH * 0.62, bodyH * 0.28)
      ctx.fill()

      // head
      ctx.beginPath()
      ctx.ellipse(cx + bodyW * 0.18, cy - bodyH * 0.12, headR * 1.03, headR * 0.93, 0, 0, Math.PI * 2)
      ctx.fill()

      // ears
      ctx.fillStyle = CREAM
      ctx.beginPath()
      ctx.moveTo(cx + bodyW * 0.02, cy - bodyH * 0.52)
      ctx.lineTo(cx - bodyW * 0.04, cy - bodyH * 0.9)
      ctx.lineTo(cx + bodyW * 0.22, cy - bodyH * 0.6)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(cx + bodyW * 0.38, cy - bodyH * 0.5)
      ctx.lineTo(cx + bodyW * 0.58, cy - bodyH * 0.82)
      ctx.lineTo(cx + bodyW * 0.57, cy - bodyH * 0.36)
      ctx.closePath()
      ctx.fill()

      // legs
      ctx.fillStyle = CREAM
      rounded(cx - bodyW * 0.33, cy + bodyH * 0.25, bodyW * 0.13, bodyH * 0.28, bodyW * 0.06)
      ctx.fill()
      rounded(cx + bodyW * 0.13, cy + bodyH * 0.25, bodyW * 0.13, bodyH * 0.28, bodyW * 0.06)
      ctx.fill()

      // void mask/blot on face
      const faceVoid = ctx.createRadialGradient(cx + bodyW * 0.2, cy - bodyH * 0.11, 0, cx + bodyW * 0.2, cy - bodyH * 0.11, headR * 0.85)
      faceVoid.addColorStop(0, 'rgba(5,5,6,0.98)')
      faceVoid.addColorStop(0.66, 'rgba(5,5,6,0.9)')
      faceVoid.addColorStop(1, 'rgba(5,5,6,0)')
      ctx.fillStyle = faceVoid
      ctx.beginPath()
      ctx.ellipse(cx + bodyW * 0.19, cy - bodyH * 0.1, headR * 0.78, headR * 0.62, -0.08, 0, Math.PI * 2)
      ctx.fill()

      const eye = (ex: number, ey: number) => {
        ctx.fillStyle = LIME
        ctx.shadowColor = LIME
        ctx.shadowBlur = 12 + happiness * 18
        ctx.beginPath()
        ctx.ellipse(ex + lookX * 5, ey + lookY * 4, 5 + happiness * 2, 8, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      }
      eye(cx + bodyW * 0.08, cy - bodyH * 0.18)
      eye(cx + bodyW * 0.3, cy - bodyH * 0.18)

      // nose + grin
      ctx.fillStyle = VIOLET
      ctx.beginPath()
      ctx.arc(cx + bodyW * 0.2, cy - bodyH * 0.04, 4 + happiness * 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = `rgba(184, 255, 44, ${0.45 + happiness * 0.35})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(cx + bodyW * 0.2, cy + bodyH * 0.01, 15 + happiness * 10, 0.1, Math.PI - 0.1)
      ctx.stroke()

      // cursor gravity leash
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.28)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 8])
      ctx.beginPath()
      ctx.moveTo(cx + bodyW * 0.2, cy - bodyH * 0.1)
      ctx.quadraticCurveTo((cx + pointerX) / 2, cy - bodyH, pointerX, pointerY)
      ctx.stroke()
      ctx.setLineDash([])

      for (let i = boops.length - 1; i >= 0; i--) {
        const b = boops[i]
        const age = t - b.time
        if (age > 1.4) {
          boops.splice(i, 1)
          continue
        }
        const k = 1 - age / 1.4
        ctx.strokeStyle = `rgba(184, 255, 44, ${k * 0.7})`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(b.x, b.y, (1 - k) * 90 + 8, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = `rgba(232, 232, 232, ${k * 0.75})`
        ctx.font = `${12 + (1 - k) * 10}px ui-monospace, SFMono-Regular, Menlo, monospace`
        ctx.fillText('yip', b.x + 12, b.y - 10 - (1 - k) * 35)
      }

      // chrome
      ctx.fillStyle = CREAM
      ctx.font = '700 14px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.letterSpacing = '0.12em'
      ctx.fillText('VOID PUP.', 24, 34)
      ctx.fillStyle = 'rgba(232,232,232,0.72)'
      ctx.font = 'italic 17px Georgia, serif'
      ctx.fillText('boop the creature at the edge of nothing.', 24, H - 30)
      ctx.fillStyle = LIME
      ctx.font = '700 16px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.fillText('a.·', W - 48, H - 28)

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerdown', onDown)
      audioCtx?.close().catch(() => {})
    }
  }, [])

  return (
    <main style={{ margin: 0, width: '100vw', height: '100dvh', overflow: 'hidden', background: FIELD }}>
      <canvas ref={canvasRef} aria-label="Void Pup interactive canvas" style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair' }} />
    </main>
  )
}
