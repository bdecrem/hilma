'use client'

import { useEffect, useRef } from 'react'

// ─── Hodgepodge Machine (Dewdney 1988) ───────────────────────────────────────
// Models the Belousov-Zhabotinsky oscillating chemical reaction.
// Each cell: state ∈ [0, N].
//   Healthy (0)  → infected by ill/sick neighbors
//   Ill (1..N-1) → advance toward N via neighborhood average + g
//   Sick (N)     → reset to 0
// Result: self-organizing spiral waves that rotate forever.

const GW = 220        // grid width
const GH = 160        // grid height
const N  = 100        // max state (sick threshold)
const K1 = 2          // healthy → ill: needs floor(a/K1) ≥ 1 ill neighbors
const K2 = 3          // healthy → ill: needs floor(b/K2) ≥ 1 sick neighbors
const G  = 15         // increment for ill cells each step

// ─── Citrus LUT ──────────────────────────────────────────────────────────────
// State 0 = warm cream → mango → tangerine → blood orange → grapefruit → lime
// 6 stops mapped across [0, N].
const PALETTE: [number, number, number][] = [
  [255, 248, 231],  // 0.0 → warm cream  #FFF8E7
  [249, 212,  35],  // 0.2 → mango       #F9D423
  [252, 145,  58],  // 0.4 → tangerine   #FC913A
  [255,  78,  80],  // 0.6 → blood orange #FF4E50
  [255, 107, 129],  // 0.8 → grapefruit  #FF6B81
  [180, 227,  61],  // 1.0 → lime zest   #B4E33D
]

const LUT_R = new Uint8Array(N + 1)
const LUT_G = new Uint8Array(N + 1)
const LUT_B = new Uint8Array(N + 1)

for (let s = 0; s <= N; s++) {
  const t  = (s / N) * (PALETTE.length - 1)
  const lo = Math.floor(t)
  const hi = Math.min(lo + 1, PALETTE.length - 1)
  const f  = t - lo
  LUT_R[s] = (PALETTE[lo][0] + (PALETTE[hi][0] - PALETTE[lo][0]) * f) | 0
  LUT_G[s] = (PALETTE[lo][1] + (PALETTE[hi][1] - PALETTE[lo][1]) * f) | 0
  LUT_B[s] = (PALETTE[lo][2] + (PALETTE[hi][2] - PALETTE[lo][2]) * f) | 0
}
// ─────────────────────────────────────────────────────────────────────────────

export default function L37() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const el = canvas

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth
    let H = window.innerHeight

    function resize() {
      W = window.innerWidth
      H = window.innerHeight
      el.width  = W * dpr
      el.height = H * dpr
      el.style.width  = W + 'px'
      el.style.height = H + 'px'
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = el.getContext('2d')!
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // ── Simulation buffers ──────────────────────────────────────────────────
    let curr = new Uint8Array(GW * GH)
    let next = new Uint8Array(GW * GH)

    // 30% random noise to reliably seed spirals
    for (let i = 0; i < GW * GH; i++) {
      if (Math.random() < 0.30) curr[i] = (Math.random() * (N + 1)) | 0
    }

    // ── Offscreen canvas for pixel rendering ────────────────────────────────
    const off    = document.createElement('canvas')
    off.width    = GW
    off.height   = GH
    const octx   = off.getContext('2d')!
    const imgData = octx.createImageData(GW, GH)
    const pixels  = imgData.data
    for (let i = 0; i < GW * GH; i++) pixels[i * 4 + 3] = 255  // alpha always 255

    // ── Audio ───────────────────────────────────────────────────────────────
    let actx: AudioContext | null = null
    let droneOsc: OscillatorNode | null = null

    function initAudio() {
      if (actx) return
      const AC = window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      actx = new AC()
      const osc  = actx.createOscillator()
      const gain = actx.createGain()
      osc.type         = 'sine'
      osc.frequency.value = 140
      gain.gain.value  = 0.03
      osc.connect(gain)
      gain.connect(actx.destination)
      osc.start()
      droneOsc = osc
    }

    function chime(freq: number) {
      if (!actx) return
      if (actx.state === 'suspended') void actx.resume()
      const osc  = actx.createOscillator()
      const gain = actx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.15, actx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.9)
      osc.connect(gain)
      gain.connect(actx.destination)
      osc.start()
      osc.stop(actx.currentTime + 0.9)
    }

    // ── Grid helpers ────────────────────────────────────────────────────────
    function toGrid(px: number, py: number): [number, number] {
      return [
        Math.max(1, Math.min(GW - 2, (px / W * GW) | 0)),
        Math.max(1, Math.min(GH - 2, (py / H * GH) | 0)),
      ]
    }

    // Paint a spiral seed: radial gradient of states to kick off a pinwheel
    function seedSpiral(gx: number, gy: number) {
      const r = 5
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = gx + dx, ny = gy + dy
          if (nx < 1 || nx >= GW - 1 || ny < 1 || ny >= GH - 1) continue
          const d2 = dx * dx + dy * dy
          if (d2 > r * r) continue
          const angle = Math.atan2(dy, dx)            // [-π, π]
          const dist  = Math.sqrt(d2)
          // angular gradient to initiate spiral rotation
          const s = ((angle + Math.PI) / (Math.PI * 2) * N * 1.2 + dist * 4) % (N + 1)
          curr[ny * GW + nx] = s | 0
        }
      }
    }

    // Paint catalyst stripe while dragging (set cells to N to trigger spreading)
    function paintCatalyst(gx: number, gy: number) {
      const r = 3
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = gx + dx, ny = gy + dy
          if (nx < 1 || nx >= GW - 1 || ny < 1 || ny >= GH - 1) continue
          if (dx * dx + dy * dy <= r * r) curr[ny * GW + nx] = N
        }
      }
    }

    // ── CA step ─────────────────────────────────────────────────────────────
    function stepCA() {
      for (let y = 1; y < GH - 1; y++) {
        for (let x = 1; x < GW - 1; x++) {
          const i = y * GW + x
          const s = curr[i]

          if (s === N) {
            // Sick → healthy
            next[i] = 0
          } else if (s === 0) {
            // Healthy: count ill (a) and sick (b) neighbors (Moore neighborhood)
            let a = 0, b = 0
            const ns0 = curr[(y-1)*GW+(x-1)]; if (ns0 > 0 && ns0 < N) a++; else if (ns0 === N) b++
            const ns1 = curr[(y-1)*GW+ x   ]; if (ns1 > 0 && ns1 < N) a++; else if (ns1 === N) b++
            const ns2 = curr[(y-1)*GW+(x+1)]; if (ns2 > 0 && ns2 < N) a++; else if (ns2 === N) b++
            const ns3 = curr[ y   *GW+(x-1)]; if (ns3 > 0 && ns3 < N) a++; else if (ns3 === N) b++
            const ns4 = curr[ y   *GW+(x+1)]; if (ns4 > 0 && ns4 < N) a++; else if (ns4 === N) b++
            const ns5 = curr[(y+1)*GW+(x-1)]; if (ns5 > 0 && ns5 < N) a++; else if (ns5 === N) b++
            const ns6 = curr[(y+1)*GW+ x   ]; if (ns6 > 0 && ns6 < N) a++; else if (ns6 === N) b++
            const ns7 = curr[(y+1)*GW+(x+1)]; if (ns7 > 0 && ns7 < N) a++; else if (ns7 === N) b++
            next[i] = Math.min(N, (a / K1 | 0) + (b / K2 | 0))
          } else {
            // Ill: neighborhood average + G
            const sum =
              s +
              curr[(y-1)*GW+(x-1)] + curr[(y-1)*GW+x] + curr[(y-1)*GW+(x+1)] +
              curr[ y   *GW+(x-1)] +                     curr[ y   *GW+(x+1)] +
              curr[(y+1)*GW+(x-1)] + curr[(y+1)*GW+x] + curr[(y+1)*GW+(x+1)]
            next[i] = Math.min(N, (sum / 9 | 0) + G)
          }
        }
      }
      const tmp = curr; curr = next; next = tmp
    }

    // ── Render ───────────────────────────────────────────────────────────────
    function renderFrame() {
      // Map states to pixels via LUT
      let sickCount = 0
      for (let i = 0; i < GW * GH; i++) {
        const s = curr[i]
        if (s === N) sickCount++
        const p = i * 4
        pixels[p]   = LUT_R[s]
        pixels[p+1] = LUT_G[s]
        pixels[p+2] = LUT_B[s]
      }
      octx.putImageData(imgData, 0, 0)

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.drawImage(off, 0, 0, W, H)

      // Modulate drone pitch with spiral activity
      if (droneOsc && actx) {
        const density = sickCount / (GW * GH)
        droneOsc.frequency.setTargetAtTime(100 + density * 300, actx.currentTime, 0.8)
      }

      // Hint
      ctx.font = '11px monospace'
      ctx.fillStyle = 'rgba(42,34,24,0.22)'
      ctx.textAlign = 'center'
      ctx.fillText('tap to seed spirals · drag to paint the catalyst', W / 2, H - 20)
      ctx.textAlign = 'start'
    }

    // ── Pointer events ───────────────────────────────────────────────────────
    let isDown = false
    let lastDragT = 0

    function onDown(px: number, py: number) {
      initAudio()
      const [gx, gy] = toGrid(px, py)
      seedSpiral(gx, gy)
      chime(330 + (gx / GW) * 330)
      isDown = true
      lastDragT = performance.now()
    }

    function onMove(px: number, py: number) {
      if (!isDown) return
      const now = performance.now()
      if (now - lastDragT < 50) return
      lastDragT = now
      const [gx, gy] = toGrid(px, py)
      paintCatalyst(gx, gy)
    }

    function onUp() { isDown = false }

    el.addEventListener('mousedown', e => onDown(e.clientX, e.clientY))
    el.addEventListener('mousemove', e => onMove(e.clientX, e.clientY))
    el.addEventListener('mouseup', onUp)

    el.addEventListener('touchstart', e => {
      e.preventDefault()
      for (const t of Array.from(e.changedTouches)) onDown(t.clientX, t.clientY)
    }, { passive: false })
    el.addEventListener('touchmove', e => {
      e.preventDefault()
      for (const t of Array.from(e.changedTouches)) onMove(t.clientX, t.clientY)
    }, { passive: false })
    el.addEventListener('touchend', e => { e.preventDefault(); onUp() }, { passive: false })

    // ── Animation loop ───────────────────────────────────────────────────────
    let raf: number

    function frame() {
      stepCA()
      renderFrame()
      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      if (droneOsc) droneOsc.stop()
      if (actx) void actx.close()
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
