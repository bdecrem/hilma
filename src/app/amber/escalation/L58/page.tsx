'use client'

import { useEffect, useRef } from 'react'

// L58 — caustics
// the floor of a virtual pool. above it, a water surface modeled as the sum
// of 5 moving sine waves plus any active ripple disturbances. for each of
// ~2700 light samples cast straight down, the surface gradient at that
// sample's (x,y) refracts the ray (Snell-ish), so the ray hits the floor
// shifted by (-∂h/∂x · D, -∂h/∂y · D). the floor accumulates these splats
// as cream brightness, with a slight per-frame fade so the pattern flows.
// drag: continuous ripple at cursor. tap: stone drop (large initial bump
// that propagates outward as a circular wave packet, decaying over ~3.5s).
// audio: low filtered noise — a water-y rumble that thickens during ripples.

const FIELD = '#0A0A0A'
const LIME = '#C6FF3C'

const SAMPLES_X = 70
const SAMPLES_Y = 40
const REFRACT_D = 200  // virtual depth — magnifies gradient effect
const SPLAT_RADIUS = 2 // splat size in pixels

type Ripple = {
  x: number
  y: number
  born: number
  amp: number      // initial amplitude
  speed: number    // wave speed (px/sec)
  life: number     // ms
}

// 5 base wave components
const BASE_WAVES = [
  { kx: 0.0085, ky: 0.0042, omega: 0.42, amp: 1.0,  phase: 0.0 },
  { kx: 0.0050, ky: 0.0098, omega: 0.31, amp: 0.85, phase: 1.1 },
  { kx: 0.0124, ky: 0.0029, omega: 0.55, amp: 0.55, phase: 2.4 },
  { kx: 0.0036, ky: 0.0056, omega: 0.24, amp: 0.95, phase: 0.7 },
  { kx: 0.0072, ky: 0.0078, omega: 0.49, amp: 0.45, phase: 3.1 },
]

export default function L58Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

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

    const ripples: Ripple[] = []

    // pointer state
    let down = false
    let lastDripT = 0
    let lastRippleX = 0, lastRippleY = 0
    let downX = 0, downY = 0
    let downT = 0
    let moved = false

    function getXY(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    function spawnRipple(x: number, y: number, amp: number, life: number) {
      ripples.push({
        x,
        y,
        born: performance.now(),
        amp,
        speed: 240 + Math.random() * 80, // px/sec
        life,
      })
      // cap
      if (ripples.length > 80) ripples.shift()
    }

    canvas.addEventListener('pointerdown', (e) => {
      ensureAudio()
      const p = getXY(e)
      down = true
      lastDripT = performance.now()
      lastRippleX = p.x; lastRippleY = p.y
      downX = p.x; downY = p.y
      downT = performance.now()
      moved = false
    })
    canvas.addEventListener('pointermove', (e) => {
      if (!down) return
      const p = getXY(e)
      const d = Math.hypot(p.x - lastRippleX, p.y - lastRippleY)
      if (Math.hypot(p.x - downX, p.y - downY) > 4) moved = true
      // continuous drip every ~26px or every 90ms, whichever first
      const now = performance.now()
      if (d > 26 || now - lastDripT > 90) {
        spawnRipple(p.x, p.y, 1.4, 1800)
        lastRippleX = p.x; lastRippleY = p.y
        lastDripT = now
      }
    })
    canvas.addEventListener('pointerup', (e) => {
      if (!down) return
      const p = getXY(e)
      const dt = performance.now() - downT
      down = false
      if (!moved && dt < 280) {
        // tap — stone drop, larger and longer-lived
        spawnRipple(p.x, p.y, 4.5, 3500)
      }
    })
    canvas.addEventListener('pointerleave', () => { down = false })

    // audio — bandpass-filtered noise (water rumble)
    let audioCtx: AudioContext | null = null
    let noiseSrc: AudioBufferSourceNode | null = null
    let bp: BiquadFilterNode | null = null
    let gain: GainNode | null = null
    function ensureAudio() {
      if (audioCtx) return
      try {
        audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      } catch { return }
      const len = audioCtx.sampleRate * 2
      const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      noiseSrc = audioCtx.createBufferSource()
      noiseSrc.buffer = buf
      noiseSrc.loop = true
      bp = audioCtx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 220
      bp.Q.value = 0.7
      gain = audioCtx.createGain()
      gain.gain.value = 0
      noiseSrc.connect(bp).connect(gain).connect(audioCtx.destination)
      noiseSrc.start()
      gain.gain.linearRampToValueAtTime(0.035, audioCtx.currentTime + 1.2)
    }

    // ImageData buffer for the caustic pattern, sized to viewport
    let imgData: ImageData | null = null
    let imgW = 0
    let imgH = 0
    function ensureImgData() {
      // use a coarse render resolution to keep the splat budget small
      const targetW = Math.floor(W * 0.5)
      const targetH = Math.floor(H * 0.5)
      if (!imgData || imgW !== targetW || imgH !== targetH) {
        imgW = targetW
        imgH = targetH
        imgData = new ImageData(imgW, imgH)
        // initialize to FIELD with full alpha
        const d = imgData.data
        for (let i = 0; i < d.length; i += 4) {
          d[i] = 0x0A
          d[i + 1] = 0x0A
          d[i + 2] = 0x0A
          d[i + 3] = 0xff
        }
      }
    }

    function loop() {
      ensureImgData()
      if (!imgData) return
      const data = imgData!.data

      const now = performance.now()
      const t = now / 1000

      // gentle fade — pull each pixel toward FIELD a bit so old splats fade
      // (cheap fade by subtracting a small constant from R/G/B)
      const FADE = 24
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        data[i]     = r > 0x0A + FADE ? r - FADE : 0x0A
        data[i + 1] = g > 0x0A + FADE ? g - FADE : 0x0A
        data[i + 2] = b > 0x0A + FADE ? b - FADE : 0x0A
      }

      // age out ripples
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i]
        if (now - r.born > r.life) ripples.splice(i, 1)
      }

      // gradient sample — base waves + ripple disturbances
      // we want ∂h/∂x and ∂h/∂y at position (sx, sy)
      const xstride = W / SAMPLES_X
      const ystride = H / SAMPLES_Y

      for (let iy = 0; iy < SAMPLES_Y; iy++) {
        for (let ix = 0; ix < SAMPLES_X; ix++) {
          const sx = ix * xstride + xstride * 0.5
          const sy = iy * ystride + ystride * 0.5

          // base waves contribute to ∂h/∂x and ∂h/∂y analytically
          let dhx = 0, dhy = 0
          for (const w of BASE_WAVES) {
            const phase = w.kx * sx + w.ky * sy + w.omega * t + w.phase
            const cosp = Math.cos(phase)
            dhx += w.amp * w.kx * cosp
            dhy += w.amp * w.ky * cosp
          }
          // each ripple: a circular wavefront at radius c·age; height contribution
          // is amp · gauss(d - c·age) · exp(-age/decay), where d = distance(sample, ripple center)
          for (const r of ripples) {
            const age = (now - r.born) / 1000
            const front = r.speed * age
            const rdx = sx - r.x
            const rdy = sy - r.y
            const d = Math.hypot(rdx, rdy)
            const dFromFront = d - front
            // gaussian wavefront, half-width ~12px
            const env = Math.exp(-(dFromFront * dFromFront) / 220) * Math.exp(-age * 0.85)
            // h(d) = r.amp · env  → d/dd h = r.amp · (-2(dFromFront)/220) · env (chain rule on the gaussian arg)
            // ∂h/∂x = (∂h/∂d) · (rdx/d), but we want h gradient in (sx, sy), so:
            // ∂(d)/∂sx = rdx/d, etc.
            if (d > 0.5) {
              const dh_dd = r.amp * env * (-2 * dFromFront / 220)
              dhx += dh_dd * (rdx / d)
              dhy += dh_dd * (rdy / d)
            }
          }

          // refraction: floor position = sample + (-dhx · D, -dhy · D)
          const fx = sx - dhx * REFRACT_D
          const fy = sy - dhy * REFRACT_D

          // map to imgData coords
          const ix2 = Math.floor((fx / W) * imgW)
          const iy2 = Math.floor((fy / H) * imgH)
          if (ix2 < 1 || ix2 > imgW - 2 || iy2 < 1 || iy2 > imgH - 2) continue

          // splat — bright cream cell
          // additive: each sample adds brightness, peaks where many samples land in same cell
          const idx = (iy2 * imgW + ix2) * 4
          // soft 3x3 splat
          for (let oy = -SPLAT_RADIUS; oy <= SPLAT_RADIUS; oy++) {
            for (let ox = -SPLAT_RADIUS; ox <= SPLAT_RADIUS; ox++) {
              const px = ix2 + ox
              const py = iy2 + oy
              if (px < 0 || px >= imgW || py < 0 || py >= imgH) continue
              const odist = ox * ox + oy * oy
              const w = Math.max(0, 1 - odist / (SPLAT_RADIUS * SPLAT_RADIUS + 0.5))
              if (w <= 0) continue
              const bumpR = Math.floor(36 * w)
              const bumpG = Math.floor(36 * w)
              const bumpB = Math.floor(34 * w)
              const i2 = (py * imgW + px) * 4
              data[i2]     = Math.min(255, data[i2] + bumpR)
              data[i2 + 1] = Math.min(255, data[i2 + 1] + bumpG)
              data[i2 + 2] = Math.min(255, data[i2 + 2] + bumpB)
            }
          }
          void idx
        }
      }

      // blit imgData to a temp canvas, then drawImage scaled up
      // simpler: putImageData scaled via offscreen canvas trick
      // Actually canvas2d doesn't support scaled putImageData, so we use a
      // throwaway temp canvas to drawImage.
      const temp = (loop as unknown as { __temp?: HTMLCanvasElement; __tempCtx?: CanvasRenderingContext2D }).__temp
        || (() => {
          const c = document.createElement('canvas')
          c.width = imgW
          c.height = imgH
          ;(loop as unknown as { __temp: HTMLCanvasElement; __tempCtx: CanvasRenderingContext2D }).__temp = c
          ;(loop as unknown as { __temp: HTMLCanvasElement; __tempCtx: CanvasRenderingContext2D }).__tempCtx = c.getContext('2d')!
          return c
        })()
      const tempCtx = (loop as unknown as { __tempCtx: CanvasRenderingContext2D }).__tempCtx
      if (temp.width !== imgW || temp.height !== imgH) {
        temp.width = imgW
        temp.height = imgH
      }
      tempCtx.putImageData(imgData!, 0, 0)
      ctx!.fillStyle = FIELD
      ctx!.fillRect(0, 0, W, H)
      ctx!.imageSmoothingEnabled = true
      ctx!.imageSmoothingQuality = 'high'
      ctx!.drawImage(temp, 0, 0, W, H)

      // overlay: small lime ring at each ripple origin (fading out)
      for (const r of ripples) {
        const age = (now - r.born) / 1000
        const t2 = age / (r.life / 1000)
        if (t2 > 1) continue
        const front = r.speed * age
        const alpha = (1 - t2) * 0.6
        ctx!.strokeStyle = `rgba(198, 255, 60, ${alpha.toFixed(3)})`
        ctx!.lineWidth = 1.2
        ctx!.beginPath()
        ctx!.arc(r.x, r.y, Math.max(2, front), 0, Math.PI * 2)
        ctx!.stroke()
        // origin dot
        ctx!.fillStyle = `rgba(198, 255, 60, ${(alpha * 0.7).toFixed(3)})`
        ctx!.beginPath()
        ctx!.arc(r.x, r.y, 2.4, 0, Math.PI * 2)
        ctx!.fill()
      }

      // audio — drone gain rises with ripple count
      if (audioCtx && bp && gain) {
        const aT = audioCtx.currentTime
        const norm = Math.min(1, ripples.length / 10)
        bp.frequency.setTargetAtTime(180 + norm * 200, aT, 0.4)
        gain.gain.setTargetAtTime(0.03 + norm * 0.04, aT, 0.4)
      }

      // suppress unused warning
      void LIME

      requestAnimationFrame(loop)
    }
    loop()

    return () => {
      window.removeEventListener('resize', resize)
      if (audioCtx) {
        try { audioCtx.close() } catch {}
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
          ENVIRONMENT · L58
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
            L58.
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
            light through water, on the floor.
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
            DRAG · RIPPLE &nbsp; TAP · DROP A STONE
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
