'use client'

import { useEffect, useRef } from 'react'

// Build 256-entry citrus palette
const PAL: [number, number, number][] = (() => {
  const stops: [number, number, number][] = [
    [255, 78, 80],   // blood orange
    [252, 145, 58],  // tangerine
    [249, 212, 35],  // mango
    [255, 248, 231], // cream
    [180, 227, 61],  // lime
    [255, 107, 129], // grapefruit
    [252, 145, 58],  // tangerine
    [255, 78, 80],   // blood orange
  ]
  const p: [number, number, number][] = []
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    const idx = t * (stops.length - 1)
    const j = Math.floor(idx)
    const f = idx - j
    const a = stops[j], b = stops[Math.min(j + 1, stops.length - 1)]
    p.push([
      Math.round(a[0] + (b[0] - a[0]) * f),
      Math.round(a[1] + (b[1] - a[1]) * f),
      Math.round(a[2] + (b[2] - a[2]) * f),
    ])
  }
  return p
})()

const INTERIOR: [number, number, number] = [20, 12, 8]

export default function L39() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const juliaRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef({ cx: -0.5, cy: 0, scale: 3.5 })
  const juliaCRef = useRef({ cr: -0.745, ci: 0.186 })
  const renderIdRef = useRef(0)
  const audioRef = useRef<AudioContext | null>(null)
  const oscRef = useRef<OscillatorNode | null>(null)
  const zoomRef = useRef(1)

  useEffect(() => {
    const canvas = canvasRef.current
    const jCanvas = juliaRef.current
    if (!canvas || !jCanvas) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth, H = window.innerHeight

    function sizeCanvas() {
      canvas!.width = W * dpr
      canvas!.height = H * dpr
      canvas!.style.width = W + 'px'
      canvas!.style.height = H + 'px'
    }
    sizeCanvas()

    const JS = 130
    jCanvas.width = JS * dpr
    jCanvas.height = JS * dpr
    jCanvas.style.width = JS + 'px'
    jCanvas.style.height = JS + 'px'

    const ctx = canvas.getContext('2d')!
    const jctx = jCanvas.getContext('2d')!

    // Cardioid / period-2 bulb check (skip iteration for known interior)
    function inCardioid(cr: number, ci: number): boolean {
      const q = (cr - 0.25) ** 2 + ci * ci
      if (q * (q + cr - 0.25) <= 0.25 * ci * ci) return true
      if ((cr + 1) ** 2 + ci * ci <= 0.0625) return true
      return false
    }

    function iterate(cr: number, ci: number, maxIter: number): [number, number, number] {
      let zr = 0, zi = 0, i = 0
      while (i < maxIter && zr * zr + zi * zi <= 4) {
        const t = zr * zr - zi * zi + cr
        zi = 2 * zr * zi + ci
        zr = t
        i++
      }
      return [i, zr, zi]
    }

    function juliaIterate(zr0: number, zi0: number, cr: number, ci: number, maxIter: number): [number, number, number] {
      let zr = zr0, zi = zi0, i = 0
      while (i < maxIter && zr * zr + zi * zi <= 4) {
        const t = zr * zr - zi * zi + cr
        zi = 2 * zr * zi + ci
        zr = t
        i++
      }
      return [i, zr, zi]
    }

    function getColor(iter: number, zr: number, zi: number, maxIter: number): [number, number, number] {
      if (iter >= maxIter) return INTERIOR
      const mag = zr * zr + zi * zi
      const smooth = iter + 1 - Math.log2(Math.max(1, Math.log2(mag)))
      // Map smoothed iteration directly — gives visible color banding at all depths
      const idx = Math.abs(Math.floor(smooth * 14)) % 256
      return PAL[idx]
    }

    function renderMandelbrot(id: number) {
      const { cx, cy, scale } = viewRef.current
      const w = canvas!.width, h = canvas!.height
      const aspect = W / H
      const xr = scale * aspect, yr = scale
      const x0 = cx - xr / 2, y0 = cy - yr / 2
      const maxIter = Math.min(200 + Math.floor(Math.log2(Math.max(1, 3.5 / scale)) * 40), 800)

      // Coarse pass (step 4) — instant feedback
      const img = ctx.createImageData(w, h)
      const d = img.data
      for (let py = 0; py < h; py += 4) {
        for (let px = 0; px < w; px += 4) {
          const cr = x0 + (px / w) * xr
          const ci = y0 + (py / h) * yr
          const [iter, zr, zi] = inCardioid(cr, ci)
            ? [maxIter, 0, 0] as [number, number, number]
            : iterate(cr, ci, maxIter)
          const [r, g, b] = getColor(iter, zr, zi, maxIter)
          for (let dy = 0; dy < 4 && py + dy < h; dy++)
            for (let dx = 0; dx < 4 && px + dx < w; dx++) {
              const i = ((py + dy) * w + (px + dx)) * 4
              d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255
            }
        }
      }
      ctx.putImageData(img, 0, 0)

      // Fine pass — row chunks, progressive top to bottom
      let row = 0
      const CHUNK = 20
      function refine() {
        if (renderIdRef.current !== id) return
        const endRow = Math.min(row + CHUNK, h)
        const strip = ctx.createImageData(w, endRow - row)
        const sd = strip.data
        for (let py = row; py < endRow; py++) {
          for (let px = 0; px < w; px++) {
            const cr = x0 + (px / w) * xr
            const ci = y0 + (py / h) * yr
            const [iter, zr, zi] = inCardioid(cr, ci)
              ? [maxIter, 0, 0] as [number, number, number]
              : iterate(cr, ci, maxIter)
            const [r, g, b] = getColor(iter, zr, zi, maxIter)
            const i = ((py - row) * w + px) * 4
            sd[i] = r; sd[i + 1] = g; sd[i + 2] = b; sd[i + 3] = 255
          }
        }
        ctx.putImageData(strip, 0, row)
        row = endRow
        if (row < h) requestAnimationFrame(refine)
      }
      requestAnimationFrame(refine)
    }

    function renderJulia() {
      const { cr, ci } = juliaCRef.current
      const w = jCanvas!.width, h = jCanvas!.height
      const img = jctx.createImageData(w, h)
      const d = img.data
      const s = 3.2
      const maxIter = 150
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const zr0 = -s / 2 + (px / w) * s
          const zi0 = -s / 2 + (py / h) * s
          const [iter, zr, zi] = juliaIterate(zr0, zi0, cr, ci, maxIter)
          const [r, g, b] = getColor(iter, zr, zi, maxIter)
          const i = (py * w + px) * 4
          d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255
        }
      }
      jctx.putImageData(img, 0, 0)
    }

    function startRender() {
      renderIdRef.current++
      renderMandelbrot(renderIdRef.current)
      renderJulia()
    }

    function handleTap(clientX: number, clientY: number) {
      const { cx, cy, scale } = viewRef.current
      const aspect = W / H
      const xr = scale * aspect, yr = scale
      const tapCr = cx - xr / 2 + (clientX / W) * xr
      const tapCi = cy - yr / 2 + (clientY / H) * yr

      viewRef.current = { cx: tapCr, cy: tapCi, scale: scale / 3 }
      juliaCRef.current = { cr: tapCr, ci: tapCi }
      zoomRef.current *= 3

      // Audio
      if (!audioRef.current) {
        const a = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        audioRef.current = a
        const o = a.createOscillator()
        o.type = 'sine'
        const g = a.createGain()
        g.gain.value = 0.04
        o.connect(g)
        g.connect(a.destination)
        o.start()
        oscRef.current = o
      }
      if (audioRef.current.state === 'suspended') audioRef.current.resume()
      const depth = Math.log2(zoomRef.current)
      oscRef.current!.frequency.setTargetAtTime(
        180 + depth * 50,
        audioRef.current.currentTime,
        0.15,
      )

      // Update labels
      const zl = document.getElementById('L39-zoom')
      if (zl) zl.textContent = `\u00d7${zoomRef.current}`
      const cl = document.getElementById('L39-c')
      if (cl) {
        const sign = tapCi >= 0 ? '+' : '\u2212'
        cl.textContent = `c = ${tapCr.toFixed(3)} ${sign} ${Math.abs(tapCi).toFixed(3)}i`
      }

      startRender()
    }

    function resetView() {
      viewRef.current = { cx: -0.5, cy: 0, scale: 3.5 }
      juliaCRef.current = { cr: -0.745, ci: 0.186 }
      zoomRef.current = 1
      const zl = document.getElementById('L39-zoom')
      if (zl) zl.textContent = '\u00d71'
      const cl = document.getElementById('L39-c')
      if (cl) cl.textContent = 'c = \u22120.745 + 0.186i'
      startRender()
    }

    canvas.addEventListener('click', (e) => handleTap(e.clientX, e.clientY))
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault()
      handleTap(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })

    const resetBtn = document.getElementById('L39-reset')
    if (resetBtn) {
      const doReset = (e: Event) => { e.preventDefault(); e.stopPropagation(); resetView() }
      resetBtn.addEventListener('click', doReset)
      resetBtn.addEventListener('touchstart', doReset, { passive: false } as AddEventListenerOptions)
    }

    const onResize = () => {
      W = window.innerWidth
      H = window.innerHeight
      sizeCanvas()
      startRender()
    }
    window.addEventListener('resize', onResize)

    startRender()

    return () => {
      window.removeEventListener('resize', onResize)
      renderIdRef.current++
      if (oscRef.current) oscRef.current.stop()
    }
  }, [])

  return (
    <>
      <canvas ref={canvasRef} style={{
        position: 'fixed', inset: 0,
        width: '100%', height: '100dvh',
        cursor: 'pointer', touchAction: 'none',
      }} />
      {/* Julia set preview */}
      <canvas ref={juliaRef} style={{
        position: 'fixed', bottom: 60, right: 16,
        width: 130, height: 130,
        borderRadius: 10,
        border: '2px solid rgba(255,248,231,0.12)',
        pointerEvents: 'none',
      }} />
      <div id="L39-c" style={{
        position: 'fixed', bottom: 195, right: 16,
        color: 'rgba(255,248,231,0.25)',
        fontFamily: 'monospace', fontSize: 10,
      }}>c = &minus;0.745 + 0.186i</div>
      <div style={{
        position: 'fixed', bottom: 44, right: 16,
        color: 'rgba(255,248,231,0.25)',
        fontFamily: 'monospace', fontSize: 10,
      }}>julia set</div>
      {/* Controls */}
      <div id="L39-zoom" style={{
        position: 'fixed', bottom: 12, left: 14,
        color: 'rgba(255,248,231,0.25)',
        fontFamily: 'monospace', fontSize: 12,
      }}>&times;1</div>
      <div style={{
        position: 'fixed', bottom: 30, left: 14,
        color: 'rgba(255,248,231,0.15)',
        fontFamily: 'monospace', fontSize: 11,
      }}>tap to zoom</div>
      <div id="L39-reset" style={{
        position: 'fixed', top: 16, right: 16,
        color: 'rgba(255,248,231,0.3)',
        fontFamily: 'monospace', fontSize: 11,
        cursor: 'pointer', padding: '5px 10px',
        border: '1px solid rgba(255,248,231,0.12)',
        borderRadius: 6,
        zIndex: 10,
      }}>reset</div>
    </>
  )
}
