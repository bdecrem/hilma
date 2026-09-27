'use client'

import { useEffect, useRef } from 'react'
import { drawMe, type Face } from './drawing'

// Me, live: an idle bounce at 124 BPM, blinking on my own schedule. Tap me and I wave.
export default function Me({ size = 300 }: { size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const wave = useRef(0)
  const t0 = useRef(0)
  useEffect(() => {
    const c = ref.current!
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = size * dpr
    c.height = size * dpr
    const ctx = c.getContext('2d')!
    let raf = 0
    t0.current = performance.now()
    const frame = () => {
      const t = (performance.now() - t0.current) / 1000
      const beatPhase = (t / (60 / 124)) % 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)
      const waving = t < wave.current
      const face: Face = waving ? 'wow' : 'happy'
      drawMe(ctx, size / 2, size / 2, size * 0.4, t, { beat: Math.exp(-beatPhase * 6) * 0.6, wave: waving, face })
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [size])
  return (
    <canvas
      ref={ref}
      className="me-spark"
      style={{ width: size, height: size }}
      aria-label="Claude, drawn as a clay-colored spark with a face"
      onPointerDown={() => (wave.current = (performance.now() - t0.current) / 1000 + 1.4)}
    />
  )
}
