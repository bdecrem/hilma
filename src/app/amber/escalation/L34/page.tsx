'use client'

import { useEffect, useRef } from 'react'
import { pickGradientColors } from '@/lib/citrus-bg'

// Physarum polycephalum — slime mold simulation
// Agents sense trail ahead, turn toward strongest signal, deposit more trail.
// Tap to place food nodes — the network grows to connect them all.

const N_AGENTS = 20000
const SENSE_DIST = 9      // grid cells ahead to sense
const SENSE_ANGLE = Math.PI / 4  // ±45° sensor offset
const TURN_SPEED = 0.28
const MOVE_SPEED = 1.0
const DEPOSIT = 3.5
const DECAY = 0.965
const DIFFUSE_K = 0.38

export default function L34() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    let W = 0, H = 0
    let GW = 0, GH = 0
    let trail: Float32Array = new Float32Array(0)
    let nTrail: Float32Array = new Float32Array(0)
    let ax: Float32Array = new Float32Array(0)
    let ay: Float32Array = new Float32Array(0)
    let aa: Float32Array = new Float32Array(0)
    const foods: { x: number; y: number }[] = []

    // Off-screen canvas for trail (GW×GH, scaled up when drawn)
    const trailCanvas = document.createElement('canvas')
    const trailCtx = trailCanvas.getContext('2d')!

    const [bg1, bg2] = pickGradientColors('L34')

    const ctx = canvas.getContext('2d')!

    const init = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = W + 'px'
      canvas.style.height = H + 'px'

      GW = Math.floor(W / 2)
      GH = Math.floor(H / 2)
      trailCanvas.width = GW
      trailCanvas.height = GH

      trail = new Float32Array(GW * GH)
      nTrail = new Float32Array(GW * GH)

      ax = new Float32Array(N_AGENTS)
      ay = new Float32Array(N_AGENTS)
      aa = new Float32Array(N_AGENTS)

      foods.length = 0

      // Spawn agents in a cluster near the center, facing outward
      const cx = GW / 2, cy = GH / 2
      const r0 = Math.min(GW, GH) * 0.14
      for (let i = 0; i < N_AGENTS; i++) {
        const angle = (i / N_AGENTS) * Math.PI * 2
        const r = r0 * (0.4 + Math.random() * 0.6)
        ax[i] = cx + Math.cos(angle) * r
        ay[i] = cy + Math.sin(angle) * r
        aa[i] = angle  // face outward
      }

      // Seed initial trail at spawn point
      for (let dy = -r0; dy <= r0; dy++) {
        for (let dx = -r0; dx <= r0; dx++) {
          if (dx * dx + dy * dy <= r0 * r0) {
            const gx = Math.round(cx + dx)
            const gy = Math.round(cy + dy)
            if (gx >= 0 && gx < GW && gy >= 0 && gy < GH) {
              trail[gy * GW + gx] = 20
            }
          }
        }
      }
    }

    const sense = (x: number, y: number, angle: number): number => {
      const sx = Math.round(x + Math.cos(angle) * SENSE_DIST)
      const sy = Math.round(y + Math.sin(angle) * SENSE_DIST)
      if (sx < 0 || sx >= GW || sy < 0 || sy >= GH) return 0
      return trail[sy * GW + sx]
    }

    const step = () => {
      for (let i = 0; i < N_AGENTS; i++) {
        const x = ax[i], y = ay[i]
        let angle = aa[i]

        // Food attraction overrides sensing when nearby
        let attracted = false
        for (const f of foods) {
          const dx = f.x - x, dy = f.y - y
          if (dx * dx + dy * dy < 50 * 50) {
            const target = Math.atan2(dy, dx)
            const diff = target - angle
            const wrapped = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI
            angle += Math.sign(wrapped) * Math.min(Math.abs(wrapped), TURN_SPEED * 1.5)
            attracted = true
            break
          }
        }

        if (!attracted) {
          const fwd = sense(x, y, angle)
          const left = sense(x, y, angle - SENSE_ANGLE)
          const right = sense(x, y, angle + SENSE_ANGLE)

          if (fwd >= left && fwd >= right) {
            // Keep straight
          } else if (left > right) {
            angle -= TURN_SPEED
          } else if (right > left) {
            angle += TURN_SPEED
          } else {
            angle += (Math.random() - 0.5) * TURN_SPEED * 2
          }
        }

        const nx = x + Math.cos(angle) * MOVE_SPEED
        const ny = y + Math.sin(angle) * MOVE_SPEED

        if (nx < 0 || nx >= GW || ny < 0 || ny >= GH) {
          aa[i] = angle + Math.PI + (Math.random() - 0.5) * 0.4
        } else {
          ax[i] = nx
          ay[i] = ny
          aa[i] = angle
          const gx = Math.round(nx), gy = Math.round(ny)
          const idx = gy * GW + gx
          if (idx >= 0 && idx < trail.length) {
            trail[idx] = Math.min(trail[idx] + DEPOSIT, 255)
          }
        }
      }

      // Diffuse + decay (box blur on half-res grid)
      for (let y = 1; y < GH - 1; y++) {
        for (let x = 1; x < GW - 1; x++) {
          const sum =
            trail[(y-1)*GW+(x-1)] + trail[(y-1)*GW+x] + trail[(y-1)*GW+(x+1)] +
            trail[y*GW+(x-1)]     + trail[y*GW+x]     + trail[y*GW+(x+1)] +
            trail[(y+1)*GW+(x-1)] + trail[(y+1)*GW+x] + trail[(y+1)*GW+(x+1)]
          nTrail[y*GW+x] = (trail[y*GW+x] * (1 - DIFFUSE_K) + (sum / 9) * DIFFUSE_K) * DECAY
        }
      }
      const tmp = trail; trail = nTrail; nTrail = tmp
    }

    let raf: number
    let frame = 0

    const draw = () => {
      frame++
      step()

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Background gradient
      const grad = ctx.createLinearGradient(0, 0, W, H)
      grad.addColorStop(0, bg1)
      grad.addColorStop(1, bg2)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)

      // Trail to off-screen canvas (GW×GH)
      const tImg = trailCtx.createImageData(GW, GH)
      const tData = tImg.data

      for (let i = 0; i < GW * GH; i++) {
        const v = Math.min(1, trail[i] / 45)
        if (v < 0.015) {
          tData[i * 4 + 3] = 0
          continue
        }

        // Color ramp: lime (#B4E33D) → tangerine (#FC913A) → blood orange (#FF4E50)
        let r, g, b
        if (v < 0.5) {
          const t = v / 0.5
          r = Math.round(180 + (252 - 180) * t)   // 180 → 252
          g = Math.round(227 + (145 - 227) * t)   // 227 → 145
          b = Math.round(61  + (58  - 61)  * t)   // 61  → 58
        } else {
          const t = (v - 0.5) / 0.5
          r = Math.round(252 + (255 - 252) * t)   // 252 → 255
          g = Math.round(145 + (78  - 145) * t)   // 145 → 78
          b = Math.round(58  + (80  - 58)  * t)   // 58  → 80
        }

        tData[i * 4]     = r
        tData[i * 4 + 1] = g
        tData[i * 4 + 2] = b
        tData[i * 4 + 3] = Math.round(v * 235)
      }

      trailCtx.putImageData(tImg, 0, 0)

      // Draw trail canvas scaled up 2× to fill screen
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'medium'
      ctx.drawImage(trailCanvas, 0, 0, W, H)

      // Food node markers
      for (const f of foods) {
        const px = f.x * 2, py = f.y * 2
        // Glow
        const grd = ctx.createRadialGradient(px, py, 0, px, py, 14)
        grd.addColorStop(0, 'rgba(255,78,80,0.5)')
        grd.addColorStop(1, 'rgba(255,78,80,0)')
        ctx.fillStyle = grd
        ctx.beginPath()
        ctx.arc(px, py, 14, 0, Math.PI * 2)
        ctx.fill()
        // Core dot
        ctx.beginPath()
        ctx.arc(px, py, 5, 0, Math.PI * 2)
        ctx.fillStyle = '#FF4E50'
        ctx.fill()
      }

      // Fade-in hint
      if (frame < 200) {
        const alpha = Math.max(0, 1 - frame / 200) * 0.4
        ctx.globalAlpha = alpha
        ctx.font = '13px monospace'
        ctx.fillStyle = '#2D5A27'
        ctx.textAlign = 'center'
        ctx.fillText('tap to place food. the slime finds a way.', W / 2, H - 28)
        ctx.textAlign = 'start'
        ctx.globalAlpha = 1
      }

      raf = requestAnimationFrame(draw)
    }

    const handleTap = (cx: number, cy: number) => {
      if (!audioRef.current) {
        audioRef.current = new (
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        )()
      }
      if (audioRef.current.state === 'suspended') audioRef.current.resume()

      const gx = cx / 2
      const gy = cy / 2
      foods.push({ x: gx, y: gy })

      // Seed a dense trail patch at the food node
      const gxi = Math.round(gx), gyi = Math.round(gy)
      for (let dy = -5; dy <= 5; dy++) {
        for (let dx = -5; dx <= 5; dx++) {
          const nx = gxi + dx, ny = gyi + dy
          if (nx >= 0 && nx < GW && ny >= 0 && ny < GH) {
            trail[ny * GW + nx] = Math.min(trail[ny * GW + nx] + 100, 255)
          }
        }
      }

      // Rising chime — pitch increases with each food placed
      const actx = audioRef.current
      const freq = 320 + foods.length * 45
      const osc = actx.createOscillator()
      const gain = actx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, actx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(freq * 1.6, actx.currentTime + 0.12)
      gain.gain.setValueAtTime(0.07, actx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.55)
      osc.connect(gain)
      gain.connect(actx.destination)
      osc.start()
      osc.stop(actx.currentTime + 0.55)
    }

    canvas.addEventListener('click', e => handleTap(e.clientX, e.clientY))
    canvas.addEventListener('touchstart', e => {
      e.preventDefault()
      handleTap(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })

    init()
    window.addEventListener('resize', init)
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', init)
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
