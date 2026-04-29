'use client'

import { useEffect, useRef } from 'react'

// L59 — aurora
// a curtain of light hanging in a dark sky. ~150 vertical ribbons placed along
// an arc in 3D. each ribbon's brightness is a vertical envelope (top fades to
// transparent, lower portion bright) modulated by two traveling waves along
// the arc index, plus contributions from substorm pulses. tap injects a
// substorm — a wave packet that propagates outward in both directions from
// the tap origin and shifts color from cream toward lime at its peak.
// drag X orbits the camera around y-axis; drag Y modulates baseline
// intensity. audio: bandpassed noise — pitch and gain track total brightness.

const FIELD = '#0A0A0A'
const CREAM = [232, 232, 232]
const LIME = [198, 255, 60]

const RIBBONS = 180
const ARC_WIDTH = 9.0
const ARC_DEPTH = 0.8
const RIBBON_H = 2.4
const CAM_DIST = 3.6

type Substorm = { origin: number; born: number; life: number; amp: number }

export default function L59Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth
    let H = window.innerHeight

    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * DPR
      canvas.height = H * DPR
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(DPR, DPR)
    }
    resize()
    window.addEventListener('resize', resize)

    let camYaw = 0
    let intensity = 0.9
    const substorms: Substorm[] = []
    const startT = performance.now()

    // pointer
    let down = false
    let lastX = 0,
      lastY = 0
    let downX = 0,
      downY = 0,
      downT = 0
    let moved = false

    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const onDown = (e: PointerEvent) => {
      down = true
      moved = false
      const p = pos(e)
      lastX = p.x
      lastY = p.y
      downX = p.x
      downY = p.y
      downT = performance.now()
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {}
      ensureAudio()
    }

    const onMove = (e: PointerEvent) => {
      if (!down) return
      const p = pos(e)
      const dx = p.x - lastX
      const dy = p.y - lastY
      camYaw -= dx * 0.005
      intensity = Math.max(0.15, Math.min(1.0, intensity - dy * 0.0022))
      if (Math.abs(p.x - downX) > 6 || Math.abs(p.y - downY) > 6) moved = true
      lastX = p.x
      lastY = p.y
    }

    const onUp = (e: PointerEvent) => {
      down = false
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {}
      const dur = performance.now() - downT
      if (!moved && dur < 350) {
        const p = pos(e)
        const tapU = mapTapToU(p.x)
        substorms.push({
          origin: tapU,
          born: performance.now() / 1000,
          life: 5.5,
          amp: 1.0,
        })
      }
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    function mapTapToU(sx: number): number {
      // project all ribbons, find nearest by screen-x distance
      const t = (performance.now() - startT) / 1000
      let best = 0.5
      let bestDist = Infinity
      const cy = Math.cos(camYaw),
        sy2 = Math.sin(camYaw)
      const focal = Math.min(W, H) * 0.55
      for (let i = 0; i < RIBBONS; i++) {
        const u = i / (RIBBONS - 1)
        const x3 = ARC_WIDTH * (u - 0.5)
        const z3 = ARC_DEPTH * Math.sin(u * Math.PI * 1.2 + t * 0.04)
        const xR = x3 * cy + z3 * sy2
        const zR = -x3 * sy2 + z3 * cy
        const zCam = zR + CAM_DIST
        if (zCam < 0.1) continue
        const f = focal / zCam
        const sx2 = W / 2 + xR * f
        const d = Math.abs(sx - sx2)
        if (d < bestDist) {
          bestDist = d
          best = u
        }
      }
      return best
    }

    // audio
    let audioActive = false
    let audioCtx: AudioContext | null = null
    let masterGain: GainNode | null = null
    let bandpass: BiquadFilterNode | null = null

    const startAudio = () => {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtx = new Ctx()
      // pink-ish noise
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate)
      const ch = buf.getChannelData(0)
      let b0 = 0,
        b1 = 0,
        b2 = 0
      for (let i = 0; i < ch.length; i++) {
        const white = Math.random() * 2 - 1
        b0 = 0.99765 * b0 + white * 0.099046
        b1 = 0.963 * b1 + white * 0.2965164
        b2 = 0.57 * b2 + white * 1.0526913
        ch[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16
      }
      const src = audioCtx.createBufferSource()
      src.buffer = buf
      src.loop = true
      bandpass = audioCtx.createBiquadFilter()
      bandpass.type = 'bandpass'
      bandpass.frequency.value = 240
      bandpass.Q.value = 1.5
      masterGain = audioCtx.createGain()
      masterGain.gain.value = 0
      src.connect(bandpass)
      bandpass.connect(masterGain)
      masterGain.connect(audioCtx.destination)
      src.start()
      audioActive = true
    }

    let audioEnsured = false
    const ensureAudio = () => {
      if (audioEnsured) return
      audioEnsured = true
      startAudio()
    }

    // render loop
    let raf = 0
    const tick = (now: number) => {
      const t = (now - startT) / 1000

      // background
      ctx.fillStyle = FIELD
      ctx.fillRect(0, 0, W, H)

      // age out substorms
      for (let s = substorms.length - 1; s >= 0; s--) {
        const age = now / 1000 - substorms[s].born
        if (age > substorms[s].life) substorms.splice(s, 1)
      }

      const cy = Math.cos(camYaw),
        sy = Math.sin(camYaw)
      const focal = Math.min(W, H) * 0.62
      const horizonY = H * 0.66 // where world Y = CAM_HEIGHT projects
      const CAM_HEIGHT = 0.55 // viewer height — looks UP at the curtain

      // accumulate total brightness for audio
      let totalBrightness = 0

      // sort ribbons by depth (back to front) so closer ribbons paint over far
      const order: { i: number; zCam: number }[] = []
      for (let i = 0; i < RIBBONS; i++) {
        const u = i / (RIBBONS - 1)
        const x3 = ARC_WIDTH * (u - 0.5)
        const z3 = ARC_DEPTH * Math.sin(u * Math.PI * 1.2 + t * 0.04)
        const zR = -x3 * sy + z3 * cy
        order.push({ i, zCam: zR + CAM_DIST })
      }
      order.sort((a, b) => b.zCam - a.zCam) // far first, then near

      ctx.globalCompositeOperation = 'lighter' // additive for glow

      for (const o of order) {
        const i = o.i
        const u = i / (RIBBONS - 1)
        const x3 = ARC_WIDTH * (u - 0.5)
        const z3 = ARC_DEPTH * Math.sin(u * Math.PI * 1.2 + t * 0.04)
        const xR = x3 * cy + z3 * sy
        const zR = -x3 * sy + z3 * cy
        const zCam = zR + CAM_DIST
        if (zCam < 0.2) continue
        const f = focal / zCam
        const sx = W / 2 + xR * f
        // proper 3D projection: base at world y=0, top at world y=RIBBON_H
        const sBase = horizonY + CAM_HEIGHT * f
        const sTop = horizonY + (CAM_HEIGHT - RIBBON_H) * f

        // brightness: floor + traveling waves so the whole curtain stays visible
        const sinSum =
          0.55 * Math.sin(u * Math.PI * 4 - t * 0.5) +
          0.45 * Math.sin(u * Math.PI * 9 + t * 0.85)
        const wave = 0.6 + 0.4 * sinSum // ~0.2..1.0, always visible
        // slow breathing
        const breath = 0.75 + 0.25 * Math.sin(t * 0.11 + u * 3.2)
        let brightness = intensity * wave * breath

        // substorm contributions
        let substormPeak = 0
        for (const s of substorms) {
          const age = now / 1000 - s.born
          const speed = 0.16 // u-units per second
          const pkt = 0.07
          const distLeft = u - (s.origin - speed * age)
          const distRight = u - (s.origin + speed * age)
          const dMin = Math.min(Math.abs(distLeft), Math.abs(distRight))
          const env = Math.exp(-(dMin * dMin) / (2 * pkt * pkt))
          const decay = Math.max(0, 1 - age / s.life)
          substormPeak += s.amp * env * decay
        }
        brightness += substormPeak * 0.85

        brightness = Math.max(0, Math.min(1.5, brightness))
        totalBrightness += brightness

        // depth fog
        const fog = Math.max(0.5, 1 - (zCam - CAM_DIST) * 0.22)
        const finalAlpha = brightness * fog

        // color shift: cream → lime at substorm peak
        const limeMix = Math.min(1, substormPeak * 1.3)
        const r = CREAM[0] * (1 - limeMix) + LIME[0] * limeMix
        const g = CREAM[1] * (1 - limeMix) + LIME[1] * limeMix
        const b = CREAM[2] * (1 - limeMix) + LIME[2] * limeMix

        // ribbon: vertical line with gradient — bright at top, fade to bottom
        const grad = ctx.createLinearGradient(sx, sTop, sx, sBase)
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`)
        grad.addColorStop(0.18, `rgba(${r}, ${g}, ${b}, ${(finalAlpha * 0.95).toFixed(3)})`)
        grad.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${(finalAlpha * 0.7).toFixed(3)})`)
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(sx, sTop)
        ctx.lineTo(sx, sBase)
        ctx.stroke()

        // soft glow at peak — wider stroke with gradient so it blooms instead of boxing
        if (substormPeak > 0.15) {
          const glowAlpha = Math.min(0.5, substormPeak * 0.45) * fog
          const glowGrad = ctx.createLinearGradient(sx, sTop, sx, sBase)
          glowGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`)
          glowGrad.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${glowAlpha.toFixed(3)})`)
          glowGrad.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, ${(glowAlpha * 0.6).toFixed(3)})`)
          glowGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
          ctx.strokeStyle = glowGrad
          ctx.lineWidth = 6
          ctx.beginPath()
          ctx.moveTo(sx, sTop)
          ctx.lineTo(sx, sBase)
          ctx.stroke()
        }
      }

      ctx.globalCompositeOperation = 'source-over'

      // audio modulation
      if (audioActive && masterGain && bandpass && audioCtx) {
        const norm = Math.min(1, totalBrightness / RIBBONS)
        const targetGain = 0.035 + norm * 0.06
        const targetFreq = 200 + norm * 380
        masterGain.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.4)
        bandpass.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.4)
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      if (audioCtx) {
        try {
          audioCtx.close()
        } catch {}
      }
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
            cursor: 'crosshair',
          }}
        />

        <div
          style={{
            position: 'fixed',
            top: 'calc(20px + env(safe-area-inset-top, 0px))',
            right: 'calc(20px + env(safe-area-inset-right, 0px))',
            color: '#E8E8E8',
            fontFamily: '"Courier Prime", monospace',
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '0.18em',
            opacity: 0.55,
            pointerEvents: 'none',
            textAlign: 'right',
            mixBlendMode: 'difference',
          }}
        >
          ENVIRONMENT · L59
        </div>

        <div
          style={{
            position: 'fixed',
            bottom: 'calc(28px + env(safe-area-inset-bottom, 0px))',
            left: 'calc(28px + env(safe-area-inset-left, 0px))',
            color: '#E8E8E8',
            pointerEvents: 'none',
            mixBlendMode: 'difference',
          }}
        >
          <div
            style={{
              fontFamily: '"Courier Prime", monospace',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.15em',
            }}
          >
            L59.
          </div>
          <div
            style={{
              fontFamily: '"Fraunces", serif',
              fontStyle: 'italic',
              fontWeight: 300,
              fontSize: 17,
              marginTop: 4,
              opacity: 0.8,
            }}
          >
            a curtain in the sky.
          </div>
          <div
            style={{
              fontFamily: '"Courier Prime", monospace',
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '0.22em',
              marginTop: 12,
              opacity: 0.42,
            }}
          >
            DRAG X · ORBIT &nbsp; DRAG Y · INTENSITY &nbsp; TAP · SUBSTORM
          </div>
        </div>

        <a
          href="/amber"
          style={{
            position: 'fixed',
            bottom: 'calc(28px + env(safe-area-inset-bottom, 0px))',
            right: 'calc(28px + env(safe-area-inset-right, 0px))',
            color: 'rgba(232,232,232,0.55)',
            fontFamily: '"Courier Prime", monospace',
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '0.18em',
            textDecoration: 'none',
            mixBlendMode: 'difference',
          }}
        >
          a.
          <span style={{ color: '#C6FF3C' }}>·</span>
        </a>
      </div>
    </>
  )
}
