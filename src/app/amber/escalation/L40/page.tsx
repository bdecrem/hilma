'use client'

import { useEffect, useRef } from 'react'

// Four minimal surfaces: type 'g' = gyroid, 'sp' = schwarz p, 'b' = blend
const MODES = [
  { label: 'gyroid',    type: 'g'  as const, scale: 2.0, thickness: 0.05,  gmax: 5.2, freq: 60 },
  { label: 'schwarz p', type: 'sp' as const, scale: 2.0, thickness: 0.06,  gmax: 4.0, freq: 80 },
  { label: 'filigree',  type: 'g'  as const, scale: 3.2, thickness: 0.024, gmax: 9.0, freq: 50 },
  { label: 'morphing',  type: 'b'  as const, scale: 2.0, thickness: 0.055, gmax: 5.5, freq: 70 },
]

export default function L40() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef({
    yaw: 0.4, pitch: 0.22,
    dragging: false, lastX: 0, lastY: 0,
    mode: 0, t: 0,
  })
  const oscsRef = useRef<[OscillatorNode, OscillatorNode] | null>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const animRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const W = window.innerWidth, H = window.innerHeight
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'

    // Render at 1/5 resolution, upscaled with pixelated CSS — chunky 3D aesthetic
    const RS = 5
    const RW = Math.floor(W / RS), RH = Math.floor(H / RS)
    canvas.width = RW
    canvas.height = RH

    const ctx = canvas.getContext('2d')!
    const imgData = ctx.createImageData(RW, RH)
    const pixels = imgData.data

    const state = stateRef.current

    // --- Implicit surface functions ---
    // Gyroid: cos(x)sin(y) + cos(y)sin(z) + cos(z)sin(x)
    // Gradient magnitude bounded by sqrt(6) ≈ 2.45 (before scale factor)
    function gyroid(x: number, y: number, z: number, s: number): number {
      return Math.cos(x * s) * Math.sin(y * s)
           + Math.cos(y * s) * Math.sin(z * s)
           + Math.cos(z * s) * Math.sin(x * s)
    }

    // Schwarz P: cos(x) + cos(y) + cos(z)
    // Gradient magnitude bounded by sqrt(3) ≈ 1.73 (before scale)
    function schwarzP(x: number, y: number, z: number, s: number): number {
      return Math.cos(x * s) + Math.cos(y * s) + Math.cos(z * s)
    }

    // --- Citrus shading from surface normal ---
    function shade(
      nx: number, ny: number, nz: number,
      rdX: number, rdY: number, rdZ: number,
      steps: number,
    ): [number, number, number] {
      // Key light: warm upper-right
      const lx = 0.557, ly = 0.671, lz = 0.490
      const diff = Math.max(0, nx * lx + ny * ly + nz * lz)

      // Blinn-Phong specular
      const hx = lx - rdX, hy = ly - rdY, hz = lz - rdZ
      const hl = Math.sqrt(hx * hx + hy * hy + hz * hz) + 1e-8
      const spec = Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / hl), 44)

      // Ambient occlusion approximated from step count
      const ao = 0.28 + 0.72 * (1 - steps / 80)

      // Normal → citrus: nx maps blood orange → lime, ny blends in tangerine
      const tx = (nx + 1) * 0.5  // 0–1
      const ty = (ny + 1) * 0.5

      // Interpolate blood orange [255,78,80] → lime [180,227,61]
      let r = 255 + (180 - 255) * tx
      let g = 78  + (227 - 78)  * tx
      let b = 80  + (61  - 80)  * tx

      // Warm toward tangerine [252,145,58] on ny axis
      r = r + (252 - r) * ty * 0.38
      g = g + (145 - g) * ty * 0.38
      b = b + (58  - b) * ty * 0.38

      const light = Math.min(1, 0.16 + diff * 0.67 + spec * 0.48) * ao
      return [
        Math.round(Math.max(0, Math.min(255, r * light))),
        Math.round(Math.max(0, Math.min(255, g * light))),
        Math.round(Math.max(0, Math.min(255, b * light))),
      ]
    }

    // --- Main render ---
    function render() {
      const { yaw, pitch, mode, t } = state
      const md = MODES[mode]

      // Slightly animate surface scale so it breathes
      const surfScale = md.scale * (1 + Math.sin(t * 0.22) * 0.07)
      const th = md.thickness
      const GMAX = md.gmax
      const blend = md.type === 'b' ? (Math.sin(t * 0.38) + 1) * 0.5 : 0

      // Camera: orbit around origin at fixed distance
      const camDist = 5.1
      const cx = camDist * Math.sin(yaw) * Math.cos(pitch)
      const cy = camDist * Math.sin(pitch)
      const cz = camDist * Math.cos(yaw) * Math.cos(pitch)

      // Camera frame from position + world-up (0,1,0)
      const fLen = camDist
      const fx = -cx / fLen, fy = -cy / fLen, fz = -cz / fLen  // forward = normalize(-cam)

      // right = forward × world_up = (-fz, 0, fx) then normalize
      const rRaw = Math.sqrt(fz * fz + fx * fx) + 1e-8
      const rxn = -fz / rRaw, rzn = fx / rRaw  // right.y = 0 always

      // camUp = right × forward
      const cupX = rzn * (-fy)
      const cupY = rzn * fx - rxn * fz
      const cupZ = rxn * fy

      const aspect = RW / RH
      const halfFov = 0.58  // tan(half-angle ≈ 30°)

      const SPHERE_R = 2.2
      const R2 = SPHERE_R * SPHERE_R
      const EPSILON = 0.0042
      const MAX_STEPS = 80

      // Surface distance (shell of implicit surface inside a bounding sphere)
      function sceneDist(px3: number, py3: number, pz3: number): number {
        let fval: number
        if (md.type === 'sp') {
          fval = schwarzP(px3, py3, pz3, surfScale)
        } else if (md.type === 'b') {
          fval = gyroid(px3, py3, pz3, surfScale) * (1 - blend)
               + schwarzP(px3, py3, pz3, surfScale) * blend
        } else {
          fval = gyroid(px3, py3, pz3, surfScale)
        }
        return Math.abs(fval) - th
      }

      // Normal via central finite differences (6 SDF calls)
      function calcNormal(px3: number, py3: number, pz3: number): [number, number, number] {
        const e = 0.0032
        const nx = sceneDist(px3 + e, py3, pz3) - sceneDist(px3 - e, py3, pz3)
        const ny = sceneDist(px3, py3 + e, pz3) - sceneDist(px3, py3 - e, pz3)
        const nz = sceneDist(px3, py3, pz3 + e) - sceneDist(px3, py3, pz3 - e)
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) + 1e-8
        return [nx / len, ny / len, nz / len]
      }

      for (let row = 0; row < RH; row++) {
        for (let col = 0; col < RW; col++) {
          const u = (col / RW - 0.5) * 2 * aspect * halfFov
          const v = (0.5 - row / RH) * 2 * halfFov

          // Ray direction (perspective)
          let rdX = fx + rxn * u + cupX * v
          let rdY = fy          + cupY * v
          let rdZ = fz + rzn * u + cupZ * v
          const rdL = Math.sqrt(rdX * rdX + rdY * rdY + rdZ * rdZ)
          rdX /= rdL; rdY /= rdL; rdZ /= rdL

          // Ray-sphere intersection: skip pixels that miss the bounding sphere
          const dotB = 2 * (cx * rdX + cy * rdY + cz * rdZ)
          const dotC = cx * cx + cy * cy + cz * cz - R2
          const disc = dotB * dotB - 4 * dotC

          const pidx = (row * RW + col) * 4

          if (disc < 0) {
            pixels[pidx] = 20; pixels[pidx + 1] = 12; pixels[pidx + 2] = 8; pixels[pidx + 3] = 255
            continue
          }

          const sqD = Math.sqrt(disc)
          const tEntry = Math.max(0, (-dotB - sqD) * 0.5)
          const tExit  = (-dotB + sqD) * 0.5

          if (tExit < 0) {
            pixels[pidx] = 20; pixels[pidx + 1] = 12; pixels[pidx + 2] = 8; pixels[pidx + 3] = 255
            continue
          }

          // March from sphere entry to sphere exit
          let tt = tEntry + 0.008
          let hit = false, hitSteps = 0

          for (let i = 0; i < MAX_STEPS && tt < tExit; i++) {
            const hx = cx + rdX * tt
            const hy = cy + rdY * tt
            const hz = cz + rdZ * tt
            const dist = sceneDist(hx, hy, hz)
            if (dist < EPSILON) { hit = true; hitSteps = i; break }
            // Conservative step: divide by gradient max so we don't overstep
            tt += Math.max(0.005, dist / GMAX)
          }

          if (hit) {
            const hx = cx + rdX * tt
            const hy = cy + rdY * tt
            const hz = cz + rdZ * tt
            const [nx, ny, nz] = calcNormal(hx, hy, hz)
            const [r, g, b] = shade(nx, ny, nz, rdX, rdY, rdZ, hitSteps)
            pixels[pidx] = r; pixels[pidx + 1] = g; pixels[pidx + 2] = b; pixels[pidx + 3] = 255
          } else {
            pixels[pidx] = 20; pixels[pidx + 1] = 12; pixels[pidx + 2] = 8; pixels[pidx + 3] = 255
          }
        }
      }

      ctx.putImageData(imgData, 0, 0)
    }

    // --- Animation loop ---
    function loop() {
      state.t += 0.016
      if (!state.dragging) state.yaw += 0.0038  // gentle auto-rotation
      render()
      animRef.current = requestAnimationFrame(loop)
    }

    // --- Audio: two-oscillator drone, pitch shifts per mode ---
    function initAudio(mode: number) {
      const AudioCtxClass = window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!audioRef.current) {
        const a = new AudioCtxClass()
        audioRef.current = a
        const gain = a.createGain()
        gain.gain.value = 0.038

        const o1 = a.createOscillator(), o2 = a.createOscillator()
        o1.type = 'sine'; o2.type = 'sine'
        o1.frequency.value = MODES[mode].freq
        o2.frequency.value = MODES[mode].freq * 1.499  // perfect fifth

        o1.connect(gain); o2.connect(gain); gain.connect(a.destination)
        o1.start(); o2.start()
        oscsRef.current = [o1, o2]
      } else {
        audioRef.current.resume()
      }

      if (oscsRef.current && audioRef.current) {
        const now = audioRef.current.currentTime
        const f = MODES[mode].freq
        oscsRef.current[0].frequency.setTargetAtTime(f, now, 0.55)
        oscsRef.current[1].frequency.setTargetAtTime(f * 1.499, now, 0.55)
      }
    }

    // --- Input handling ---
    const onDragStart = (x: number, y: number) => {
      state.dragging = true; state.lastX = x; state.lastY = y
    }
    const onDragMove = (x: number, y: number) => {
      if (!state.dragging) return
      state.yaw   += (x - state.lastX) * 0.007
      state.pitch  = Math.max(-1.28, Math.min(1.28, state.pitch + (y - state.lastY) * 0.007))
      state.lastX = x; state.lastY = y
    }
    const cycleMode = () => {
      state.mode = (state.mode + 1) % MODES.length
      initAudio(state.mode)
    }

    // Mouse
    canvas.addEventListener('mousedown', (e) => onDragStart(e.clientX, e.clientY))
    window.addEventListener('mouseup',   () => { state.dragging = false })
    window.addEventListener('mousemove', (e) => onDragMove(e.clientX, e.clientY))
    canvas.addEventListener('click', cycleMode)

    // Touch
    let touchMoved = false, touchStartX = 0, touchStartY = 0
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault()
      touchMoved = false
      touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY
      onDragStart(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault()
      const dx = e.touches[0].clientX - touchStartX
      const dy = e.touches[0].clientY - touchStartY
      if (dx * dx + dy * dy > 25) touchMoved = true
      onDragMove(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })
    canvas.addEventListener('touchend', (e) => {
      e.preventDefault()
      state.dragging = false
      if (!touchMoved) cycleMode()
    }, { passive: false })

    loop()

    return () => {
      cancelAnimationFrame(animRef.current)
      try { oscsRef.current?.[0].stop() } catch (_) { /* */ }
      try { oscsRef.current?.[1].stop() } catch (_) { /* */ }
    }
  }, [])

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed', inset: 0,
          width: '100%', height: '100dvh',
          touchAction: 'none',
          imageRendering: 'pixelated',
          background: '#120C08',
        }}
      />
      <div style={{
        position: 'fixed', bottom: 24, left: '50%',
        transform: 'translateX(-50%)',
        color: 'rgba(255,248,231,0.32)',
        fontFamily: 'monospace', fontSize: 11,
        zIndex: 10, pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}>
        drag to orbit · tap to change surface
      </div>
    </>
  )
}
