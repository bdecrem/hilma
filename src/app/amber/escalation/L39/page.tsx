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

// Interesting Julia c-values to start with
const PRESETS: [number, number][] = [
  [-0.745, 0.186],   // Douady rabbit
  [-0.4, 0.6],       // dendrite
  [0.285, 0.01],     // spiral
  [-0.835, -0.2321], // ornate
  [-0.7269, 0.1889], // detailed rabbit
]

export default function L39() {
  const juliaCanvasRef = useRef<HTMLCanvasElement>(null)
  const mapCanvasRef = useRef<HTMLCanvasElement>(null)
  const juliaCRef = useRef({ cr: PRESETS[0][0], ci: PRESETS[0][1] })
  const juliaRenderIdRef = useRef(0)
  const audioRef = useRef<AudioContext | null>(null)
  const oscRef = useRef<OscillatorNode | null>(null)

  useEffect(() => {
    const juliaCanvas = juliaCanvasRef.current
    const mapCanvas = mapCanvasRef.current
    if (!juliaCanvas || !mapCanvas) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth, H = window.innerHeight

    // Julia = full screen
    function sizeJulia() {
      juliaCanvas!.width = W * dpr
      juliaCanvas!.height = H * dpr
      juliaCanvas!.style.width = W + 'px'
      juliaCanvas!.style.height = H + 'px'
    }
    sizeJulia()

    // Mandelbrot map = 160px square
    const MAP_SIZE = 160
    mapCanvas.width = MAP_SIZE * dpr
    mapCanvas.height = MAP_SIZE * dpr
    mapCanvas.style.width = MAP_SIZE + 'px'
    mapCanvas.style.height = MAP_SIZE + 'px'

    const jctx = juliaCanvas.getContext('2d')!
    const mctx = mapCanvas.getContext('2d')!

    function inCardioid(cr: number, ci: number): boolean {
      const q = (cr - 0.25) ** 2 + ci * ci
      if (q * (q + cr - 0.25) <= 0.25 * ci * ci) return true
      if ((cr + 1) ** 2 + ci * ci <= 0.0625) return true
      return false
    }

    function mandelbrotIter(cr: number, ci: number, maxIter: number): [number, number, number] {
      let zr = 0, zi = 0, i = 0
      while (i < maxIter && zr * zr + zi * zi <= 4) {
        const t = zr * zr - zi * zi + cr
        zi = 2 * zr * zi + ci
        zr = t
        i++
      }
      return [i, zr, zi]
    }

    function juliaIter(zr0: number, zi0: number, cr: number, ci: number, maxIter: number): [number, number, number] {
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
      const idx = Math.abs(Math.floor(smooth * 14)) % 256
      return PAL[idx]
    }

    // Render the Mandelbrot minimap (once, with dot overlay)
    function renderMap() {
      const w = mapCanvas!.width, h = mapCanvas!.height
      const img = mctx.createImageData(w, h)
      const d = img.data
      // View: real [-2.2, 0.8], imag [-1.5, 1.5]
      const xMin = -2.2, xMax = 0.8, yMin = -1.5, yMax = 1.5
      const maxIter = 80

      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const cr = xMin + (px / w) * (xMax - xMin)
          const ci = yMin + (py / h) * (yMax - yMin)
          const [iter, zr, zi] = inCardioid(cr, ci)
            ? [maxIter, 0, 0] as [number, number, number]
            : mandelbrotIter(cr, ci, maxIter)
          const [r, g, b] = getColor(iter, zr, zi, maxIter)
          const i = (py * w + px) * 4
          d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255
        }
      }
      mctx.putImageData(img, 0, 0)
    }

    // Draw the dot showing current c value on the map
    function drawMapDot() {
      renderMap() // redraw base
      const { cr, ci } = juliaCRef.current
      const xMin = -2.2, xMax = 0.8, yMin = -1.5, yMax = 1.5
      const w = mapCanvas!.width, h = mapCanvas!.height
      const dotX = ((cr - xMin) / (xMax - xMin)) * w
      const dotY = ((ci - yMin) / (yMax - yMin)) * h

      mctx.beginPath()
      mctx.arc(dotX, dotY, 6 * dpr, 0, Math.PI * 2)
      mctx.fillStyle = '#FFF8E7'
      mctx.fill()
      mctx.beginPath()
      mctx.arc(dotX, dotY, 4 * dpr, 0, Math.PI * 2)
      mctx.fillStyle = '#FF4E50'
      mctx.fill()
    }

    // Render Julia set full screen (progressive)
    function renderJulia(id: number) {
      const { cr, ci } = juliaCRef.current
      const w = juliaCanvas!.width, h = juliaCanvas!.height
      const s = 3.2
      const aspect = W / H
      const xRange = s * aspect, yRange = s
      const maxIter = 200

      // Coarse pass (step 4)
      const img = jctx.createImageData(w, h)
      const d = img.data
      for (let py = 0; py < h; py += 4) {
        for (let px = 0; px < w; px += 4) {
          const zr0 = -xRange / 2 + (px / w) * xRange
          const zi0 = -yRange / 2 + (py / h) * yRange
          const [iter, zr, zi] = juliaIter(zr0, zi0, cr, ci, maxIter)
          const [r, g, b] = getColor(iter, zr, zi, maxIter)
          for (let dy = 0; dy < 4 && py + dy < h; dy++)
            for (let dx = 0; dx < 4 && px + dx < w; dx++) {
              const i = ((py + dy) * w + (px + dx)) * 4
              d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255
            }
        }
      }
      jctx.putImageData(img, 0, 0)

      // Fine pass in row chunks
      let row = 0
      const CHUNK = 20
      function refine() {
        if (juliaRenderIdRef.current !== id) return
        const endRow = Math.min(row + CHUNK, h)
        const strip = jctx.createImageData(w, endRow - row)
        const sd = strip.data
        for (let py = row; py < endRow; py++) {
          for (let px = 0; px < w; px++) {
            const zr0 = -xRange / 2 + (px / w) * xRange
            const zi0 = -yRange / 2 + (py / h) * yRange
            const [iter, zr, zi] = juliaIter(zr0, zi0, cr, ci, maxIter)
            const [r, g, b] = getColor(iter, zr, zi, maxIter)
            const i = ((py - row) * w + px) * 4
            sd[i] = r; sd[i + 1] = g; sd[i + 2] = b; sd[i + 3] = 255
          }
        }
        jctx.putImageData(strip, 0, row)
        row = endRow
        if (row < h) requestAnimationFrame(refine)
      }
      requestAnimationFrame(refine)
    }

    function startRender() {
      juliaRenderIdRef.current++
      renderJulia(juliaRenderIdRef.current)
      drawMapDot()

      // Update c label
      const { cr, ci } = juliaCRef.current
      const cl = document.getElementById('L39-c')
      if (cl) {
        const sign = ci >= 0 ? '+' : '\u2212'
        cl.textContent = `c = ${cr.toFixed(3)} ${sign} ${Math.abs(ci).toFixed(3)}i`
      }
    }

    // Tap on the Mandelbrot map → pick new c → re-render Julia full screen
    function handleMapTap(e: MouseEvent | Touch) {
      const rect = mapCanvas!.getBoundingClientRect()
      const mx = (e.clientX - rect.left) / rect.width
      const my = (e.clientY - rect.top) / rect.height
      const xMin = -2.2, xMax = 0.8, yMin = -1.5, yMax = 1.5
      const cr = xMin + mx * (xMax - xMin)
      const ci = yMin + my * (yMax - yMin)

      juliaCRef.current = { cr, ci }

      // Audio — different tone per point
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
      // Frequency based on distance from origin in complex plane
      const dist = Math.sqrt(cr * cr + ci * ci)
      oscRef.current!.frequency.setTargetAtTime(
        150 + dist * 200,
        audioRef.current.currentTime,
        0.1,
      )

      startRender()
    }

    mapCanvas.addEventListener('click', (e) => {
      e.stopPropagation()
      handleMapTap(e)
    })
    mapCanvas.addEventListener('touchstart', (e) => {
      e.preventDefault()
      e.stopPropagation()
      handleMapTap(e.touches[0])
    }, { passive: false })

    // Drag on the map for continuous exploration
    let dragging = false
    mapCanvas.addEventListener('mousedown', () => { dragging = true })
    window.addEventListener('mouseup', () => { dragging = false })
    mapCanvas.addEventListener('mousemove', (e) => {
      if (!dragging) return
      e.stopPropagation()
      handleMapTap(e)
    })
    mapCanvas.addEventListener('touchmove', (e) => {
      e.preventDefault()
      e.stopPropagation()
      handleMapTap(e.touches[0])
    }, { passive: false })

    const onResize = () => {
      W = window.innerWidth
      H = window.innerHeight
      sizeJulia()
      startRender()
    }
    window.addEventListener('resize', onResize)

    startRender()

    return () => {
      window.removeEventListener('resize', onResize)
      juliaRenderIdRef.current++
      if (oscRef.current) oscRef.current.stop()
    }
  }, [])

  return (
    <>
      {/* Julia set — full screen */}
      <canvas ref={juliaCanvasRef} style={{
        position: 'fixed', inset: 0,
        width: '100%', height: '100dvh',
        touchAction: 'none',
      }} />
      {/* Mandelbrot map — bottom right */}
      <canvas ref={mapCanvasRef} style={{
        position: 'fixed', bottom: 50, right: 16,
        width: 160, height: 160,
        borderRadius: 10,
        border: '2px solid rgba(255,248,231,0.15)',
        cursor: 'crosshair',
        touchAction: 'none',
        zIndex: 10,
      }} />
      <div style={{
        position: 'fixed', bottom: 34, right: 16,
        color: 'rgba(255,248,231,0.3)',
        fontFamily: 'monospace', fontSize: 10,
        zIndex: 10,
      }}>tap the map</div>
      <div id="L39-c" style={{
        position: 'fixed', bottom: 215, right: 16,
        color: 'rgba(255,248,231,0.25)',
        fontFamily: 'monospace', fontSize: 10,
        zIndex: 10,
      }}>c = &minus;0.745 + 0.186i</div>
    </>
  )
}
