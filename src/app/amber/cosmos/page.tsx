'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

// ═══════════════════════════════════════════════════════════
//  COSMOS — Gravitational Music Synthesizer
//
//  N-body gravity → orbital mechanics → sound synthesis
//  Each celestial body is an oscillator. Proximity = harmony.
//  Collisions = mergers. Physics creates music.
// ═══════════════════════════════════════════════════════════

// Pentatonic scale frequencies mapped by octave
const SCALE_FREQS = [
  // C2 pentatonic
  65.41, 73.42, 87.31, 98.0, 110.0,
  // C3
  130.81, 146.83, 174.61, 196.0, 220.0,
  // C4
  261.63, 293.66, 349.23, 392.0, 440.0,
  // C5
  523.25, 587.33, 698.46, 783.99, 880.0,
]

function massToFreq(mass: number): number {
  // Larger mass = lower frequency
  const idx = Math.max(0, Math.min(SCALE_FREQS.length - 1,
    Math.floor((1 - Math.min(mass, 20) / 20) * (SCALE_FREQS.length - 1))
  ))
  return SCALE_FREQS[idx]
}

function massToColor(mass: number): { h: number; s: number; l: number } {
  // Small = hot blue-white, large = deep red-orange
  const t = Math.min(mass / 15, 1)
  return {
    h: 220 - t * 220, // blue → red
    s: 80 + t * 20,
    l: 70 - t * 25,
  }
}

interface Body {
  id: number
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  mass: number
  radius: number
  color: { h: number; s: number; l: number }
  freq: number
  trail: { x: number; y: number; z: number; age: number }[]
  osc: OscillatorNode | null
  gain: GainNode | null
  filter: BiquadFilterNode | null
  born: number
  alive: boolean
}

interface Star {
  x: number; y: number; z: number
  brightness: number
  twinklePhase: number
}

interface Explosion {
  x: number; y: number; z: number
  particles: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; color: string }[]
  age: number
}

export default function Cosmos() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const reverbRef = useRef<ConvolverNode | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const bodiesRef = useRef<Body[]>([])
  const starsRef = useRef<Star[]>([])
  const explosionsRef = useRef<Explosion[]>([])
  const idCounterRef = useRef(0)
  const tRef = useRef(0)
  const cameraRef = useRef({ rotX: 0, rotY: 0, zoom: 600 })
  const dragRef = useRef<{ startX: number; startY: number; startTime: number; bodyX: number; bodyY: number } | null>(null)
  const [started, setStarted] = useState(false)
  const [bodyCount, setBodyCount] = useState(0)

  // Create reverb impulse
  const createReverb = useCallback((ctx: AudioContext) => {
    const length = ctx.sampleRate * 3
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch)
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5)
      }
    }
    const conv = ctx.createConvolver()
    conv.buffer = impulse
    return conv
  }, [])

  // Create a body's audio chain
  const createBodyAudio = useCallback((body: Body) => {
    const ctx = audioCtxRef.current
    if (!ctx || !masterGainRef.current) return

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const filter = ctx.createBiquadFilter()

    // Larger bodies get triangle/sine (deeper), smaller get sine
    osc.type = body.mass > 5 ? 'triangle' : 'sine'
    osc.frequency.value = body.freq

    filter.type = 'lowpass'
    filter.frequency.value = 800 + (1 - body.mass / 20) * 2000
    filter.Q.value = 2

    gain.gain.value = 0 // Start silent

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(masterGainRef.current)

    // Also send to reverb
    if (reverbRef.current) {
      const reverbSend = ctx.createGain()
      reverbSend.gain.value = 0.3
      filter.connect(reverbSend)
      reverbSend.connect(reverbRef.current)
    }

    osc.start()

    body.osc = osc
    body.gain = gain
    body.filter = filter
  }, [])

  // Spawn a new body
  const spawnBody = useCallback((x: number, y: number, z: number, vx = 0, vy = 0, vz = 0, mass?: number) => {
    const m = mass ?? (1 + Math.random() * 8)
    const body: Body = {
      id: idCounterRef.current++,
      x, y, z,
      vx, vy, vz,
      mass: m,
      radius: Math.pow(m, 0.4) * 3,
      color: massToColor(m),
      freq: massToFreq(m),
      trail: [],
      osc: null, gain: null, filter: null,
      born: tRef.current,
      alive: true,
    }
    createBodyAudio(body)
    bodiesRef.current.push(body)
    setBodyCount(bodiesRef.current.length)
    return body
  }, [createBodyAudio])

  // Collision burst sound
  const playBurst = useCallback((freq: number, volume: number) => {
    const ctx = audioCtxRef.current
    if (!ctx || !masterGainRef.current) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    osc.frequency.exponentialRampToValueAtTime(freq * 0.25, ctx.currentTime + 1.5)
    gain.gain.value = Math.min(0.3, volume * 0.15)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2)
    osc.connect(gain)
    gain.connect(masterGainRef.current)
    if (reverbRef.current) {
      const rs = ctx.createGain()
      rs.gain.value = 0.5
      gain.connect(rs)
      rs.connect(reverbRef.current)
    }
    osc.start()
    osc.stop(ctx.currentTime + 2)
  }, [])

  // 3D → 2D projection
  const project3D = useCallback((x: number, y: number, z: number, w: number, h: number) => {
    const cam = cameraRef.current
    // Rotate around Y then X
    const cosY = Math.cos(cam.rotY), sinY = Math.sin(cam.rotY)
    const cosX = Math.cos(cam.rotX), sinX = Math.sin(cam.rotX)
    let rx = x * cosY - z * sinY
    let rz = x * sinY + z * cosY
    const ry2 = y * cosX - rz * sinX
    const rz2 = y * sinX + rz * cosX
    rz = rz2

    const fov = cam.zoom
    const scale = fov / (fov + rz + 300)
    return {
      sx: w / 2 + rx * scale,
      sy: h / 2 + ry2 * scale,
      scale,
      depth: rz,
    }
  }, [])

  const initAudio = useCallback(() => {
    const ctx = new AudioContext()
    audioCtxRef.current = ctx

    const master = ctx.createGain()
    master.gain.value = 0.4
    masterGainRef.current = master

    const reverb = createReverb(ctx)
    reverbRef.current = reverb

    const reverbGain = ctx.createGain()
    reverbGain.gain.value = 0.25
    reverb.connect(reverbGain)
    reverbGain.connect(master)

    master.connect(ctx.destination)

    // Seed with initial bodies in orbit
    const seed = [
      { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mass: 12 },
      { x: 120, y: 0, z: 0, vx: 0, vy: 0.6, vz: 0.3, mass: 3 },
      { x: -80, y: 40, z: 60, vx: 0.2, vy: -0.5, vz: 0.1, mass: 2 },
      { x: 0, y: -100, z: -40, vx: -0.4, vy: 0, vz: 0.4, mass: 4 },
      { x: 60, y: 70, z: -80, vx: 0.3, vy: -0.3, vz: -0.2, mass: 1.5 },
    ]
    seed.forEach(s => spawnBody(s.x, s.y, s.z, s.vx, s.vy, s.vz, s.mass))

    setStarted(true)
  }, [createReverb, spawnBody])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0, h = 0, frame: number

    // Generate star field
    starsRef.current = Array.from({ length: 800 }, () => ({
      x: (Math.random() - 0.5) * 2000,
      y: (Math.random() - 0.5) * 2000,
      z: (Math.random() - 0.5) * 2000,
      brightness: 0.2 + Math.random() * 0.8,
      twinklePhase: Math.random() * Math.PI * 2,
    }))

    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    // Slow camera rotation
    let autoRotate = true

    // Pointer events
    const handleDown = (e: MouseEvent) => {
      if (!started) return
      dragRef.current = {
        startX: e.clientX, startY: e.clientY,
        startTime: performance.now(),
        bodyX: e.clientX, bodyY: e.clientY,
      }
    }
    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      // If dragging far enough, it's a camera rotation
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      if (Math.abs(dx) + Math.abs(dy) > 15) {
        cameraRef.current.rotY += dx * 0.003
        cameraRef.current.rotX += dy * 0.003
        cameraRef.current.rotX = Math.max(-1.2, Math.min(1.2, cameraRef.current.rotX))
        dragRef.current.startX = e.clientX
        dragRef.current.startY = e.clientY
        autoRotate = false
      }
      dragRef.current.bodyX = e.clientX
      dragRef.current.bodyY = e.clientY
    }
    const handleUp = (e: MouseEvent) => {
      if (!dragRef.current || !started) { dragRef.current = null; return }
      const dt = performance.now() - dragRef.current.startTime
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      if (Math.abs(dx) + Math.abs(dy) < 15 && dt < 300) {
        // Tap: spawn body at click position
        const cx = (e.clientX - w / 2) * 0.5
        const cy = (e.clientY - h / 2) * 0.5
        spawnBody(cx, cy, (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3)
      } else if (dt >= 300) {
        // Drag-release: spawn with velocity
        const cx = (dragRef.current.startX - w / 2) * 0.5
        const cy = (dragRef.current.startY - h / 2) * 0.5
        const vx = (e.clientX - dragRef.current.startX) * 0.005
        const vy = (e.clientY - dragRef.current.startY) * 0.005
        spawnBody(cx, cy, (Math.random() - 0.5) * 60, vx, vy, (Math.random() - 0.5) * 0.2)
      }
      dragRef.current = null
    }

    // Touch events
    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      if (!started) return
      const t = e.touches[0]
      dragRef.current = { startX: t.clientX, startY: t.clientY, startTime: performance.now(), bodyX: t.clientX, bodyY: t.clientY }
    }
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      if (!dragRef.current) return
      const t = e.touches[0]
      const dx = t.clientX - dragRef.current.startX
      const dy = t.clientY - dragRef.current.startY
      if (Math.abs(dx) + Math.abs(dy) > 15) {
        cameraRef.current.rotY += dx * 0.003
        cameraRef.current.rotX += dy * 0.003
        cameraRef.current.rotX = Math.max(-1.2, Math.min(1.2, cameraRef.current.rotX))
        dragRef.current.startX = t.clientX
        dragRef.current.startY = t.clientY
        autoRotate = false
      }
      dragRef.current.bodyX = t.clientX
      dragRef.current.bodyY = t.clientY
    }
    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault()
      if (!dragRef.current || !started) { dragRef.current = null; return }
      const dt = performance.now() - dragRef.current.startTime
      const dx = dragRef.current.bodyX - dragRef.current.startX
      const dy = dragRef.current.bodyY - dragRef.current.startY
      if (Math.abs(dx) + Math.abs(dy) < 15 && dt < 400) {
        const cx = (dragRef.current.startX - w / 2) * 0.5
        const cy = (dragRef.current.startY - h / 2) * 0.5
        spawnBody(cx, cy, (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3)
      }
      dragRef.current = null
    }

    canvas.addEventListener('mousedown', handleDown)
    canvas.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false })
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false })

    // Scroll to zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      cameraRef.current.zoom = Math.max(200, Math.min(1500, cameraRef.current.zoom + e.deltaY * 0.5))
    }, { passive: false })

    // ─── Physics tick ───
    const G = 0.08 // gravitational constant
    const SOFTENING = 15 // prevent singularities
    const MERGE_DIST = 8

    const physicsTick = () => {
      const bodies = bodiesRef.current.filter(b => b.alive)

      // N-body gravitational acceleration
      for (let i = 0; i < bodies.length; i++) {
        let ax = 0, ay = 0, az = 0
        for (let j = 0; j < bodies.length; j++) {
          if (i === j) continue
          const dx = bodies[j].x - bodies[i].x
          const dy = bodies[j].y - bodies[i].y
          const dz = bodies[j].z - bodies[i].z
          const distSq = dx * dx + dy * dy + dz * dz + SOFTENING * SOFTENING
          const dist = Math.sqrt(distSq)
          const force = G * bodies[j].mass / distSq
          ax += force * dx / dist
          ay += force * dy / dist
          az += force * dz / dist
        }
        bodies[i].vx += ax
        bodies[i].vy += ay
        bodies[i].vz += az
      }

      // Integration + trails
      for (const b of bodies) {
        b.x += b.vx
        b.y += b.vy
        b.z += b.vz

        // Trail
        b.trail.push({ x: b.x, y: b.y, z: b.z, age: 0 })
        if (b.trail.length > 60) b.trail.shift()
        for (const t of b.trail) t.age++
      }

      // Collision detection + mergers
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          if (!bodies[i].alive || !bodies[j].alive) continue
          const dx = bodies[j].x - bodies[i].x
          const dy = bodies[j].y - bodies[i].y
          const dz = bodies[j].z - bodies[i].z
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (dist < MERGE_DIST + bodies[i].radius + bodies[j].radius) {
            // Merge: conserve momentum
            const a = bodies[i], b = bodies[j]
            const [big, small] = a.mass >= b.mass ? [a, b] : [b, a]
            const totalMass = big.mass + small.mass
            big.vx = (big.vx * big.mass + small.vx * small.mass) / totalMass
            big.vy = (big.vy * big.mass + small.vy * small.mass) / totalMass
            big.vz = (big.vz * big.mass + small.vz * small.mass) / totalMass
            big.mass = totalMass
            big.radius = Math.pow(totalMass, 0.4) * 3
            big.color = massToColor(totalMass)
            big.freq = massToFreq(totalMass)
            if (big.osc) big.osc.frequency.exponentialRampToValueAtTime(big.freq, (audioCtxRef.current?.currentTime ?? 0) + 0.5)
            if (big.filter) big.filter.frequency.value = 800 + (1 - Math.min(totalMass, 20) / 20) * 2000

            // Kill small
            small.alive = false
            if (small.osc) { small.gain?.gain.exponentialRampToValueAtTime(0.001, (audioCtxRef.current?.currentTime ?? 0) + 0.3); setTimeout(() => { try { small.osc?.stop() } catch {} }, 500) }

            // Explosion
            const particles = []
            const burstCount = Math.floor(15 + totalMass * 3)
            for (let p = 0; p < burstCount; p++) {
              const angle = Math.random() * Math.PI * 2
              const elevation = (Math.random() - 0.5) * Math.PI
              const speed = 1 + Math.random() * 3
              particles.push({
                x: big.x, y: big.y, z: big.z,
                vx: Math.cos(angle) * Math.cos(elevation) * speed,
                vy: Math.sin(elevation) * speed,
                vz: Math.sin(angle) * Math.cos(elevation) * speed,
                life: 1,
                color: `hsl(${big.color.h + Math.random() * 40 - 20}, ${big.color.s}%, ${big.color.l + 20}%)`,
              })
            }
            explosionsRef.current.push({ x: big.x, y: big.y, z: big.z, particles, age: 0 })

            // Burst sound
            playBurst(big.freq * 2, totalMass)

            setBodyCount(bodiesRef.current.filter(b => b.alive).length)
          }
        }
      }

      // Update audio: volume based on proximity to other bodies
      const now = audioCtxRef.current?.currentTime ?? 0
      for (const b of bodies) {
        if (!b.gain || !b.alive) continue
        let proximity = 0
        for (const other of bodies) {
          if (other.id === b.id || !other.alive) continue
          const dx = other.x - b.x
          const dy = other.y - b.y
          const dz = other.z - b.z
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
          proximity += other.mass / (dist + 30)
        }
        // Volume scales with proximity — isolated bodies are quieter
        const targetVol = Math.min(0.12, proximity * 0.02 + 0.005)
        b.gain.gain.linearRampToValueAtTime(targetVol, now + 0.05)

        // Filter modulation based on velocity
        if (b.filter) {
          const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz)
          b.filter.frequency.value = 600 + speed * 800
        }
      }
    }

    // ─── Render ───
    const render = () => {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)

      // Very subtle deep space gradient
      const spaceGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.6)
      spaceGrad.addColorStop(0, 'rgba(10, 5, 20, 1)')
      spaceGrad.addColorStop(1, 'rgba(0, 0, 0, 1)')
      ctx.fillStyle = spaceGrad
      ctx.fillRect(0, 0, w, h)

      const t = tRef.current

      // Star field
      for (const star of starsRef.current) {
        const p = project3D(star.x, star.y, star.z, w, h)
        if (p.depth < -500) continue
        const twinkle = 0.5 + 0.5 * Math.sin(t * 0.02 + star.twinklePhase)
        const alpha = star.brightness * twinkle * Math.max(0.1, p.scale)
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, alpha)})`
        const size = Math.max(0.5, 1.5 * p.scale)
        ctx.beginPath()
        ctx.arc(p.sx, p.sy, size, 0, Math.PI * 2)
        ctx.fill()
      }

      // Sort bodies by depth for painter's algorithm
      const bodies = bodiesRef.current.filter(b => b.alive)
      const projected = bodies.map(b => ({
        body: b,
        ...project3D(b.x, b.y, b.z, w, h),
      })).sort((a, b) => b.depth - a.depth)

      // Trails
      for (const { body } of projected) {
        if (body.trail.length < 2) continue
        ctx.beginPath()
        let first = true
        for (const tp of body.trail) {
          const pp = project3D(tp.x, tp.y, tp.z, w, h)
          if (first) { ctx.moveTo(pp.sx, pp.sy); first = false }
          else ctx.lineTo(pp.sx, pp.sy)
        }
        ctx.strokeStyle = `hsla(${body.color.h}, ${body.color.s}%, ${body.color.l}%, 0.2)`
        ctx.lineWidth = Math.max(0.5, body.radius * 0.3 * (projected.find(p => p.body === body)?.scale ?? 1))
        ctx.stroke()
      }

      // Bodies
      for (const { body, sx, sy, scale } of projected) {
        const r = Math.max(2, body.radius * scale)
        const { h: ch, s: cs, l: cl } = body.color

        // Outer glow
        const glow = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 4)
        glow.addColorStop(0, `hsla(${ch}, ${cs}%, ${cl + 15}%, 0.3)`)
        glow.addColorStop(0.5, `hsla(${ch}, ${cs}%, ${cl}%, 0.08)`)
        glow.addColorStop(1, `hsla(${ch}, ${cs}%, ${cl}%, 0)`)
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(sx, sy, r * 4, 0, Math.PI * 2)
        ctx.fill()

        // Body
        const bodyGrad = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, 0, sx, sy, r)
        bodyGrad.addColorStop(0, `hsl(${ch}, ${cs - 10}%, ${cl + 30}%)`)
        bodyGrad.addColorStop(0.7, `hsl(${ch}, ${cs}%, ${cl}%)`)
        bodyGrad.addColorStop(1, `hsl(${ch + 10}, ${cs + 10}%, ${cl - 15}%)`)
        ctx.fillStyle = bodyGrad
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fill()

        // Corona pulse
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.03 + body.id * 1.7)
        ctx.strokeStyle = `hsla(${ch}, ${cs}%, ${cl + 20}%, ${0.15 + pulse * 0.15})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(sx, sy, r + 2 + pulse * 3, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Connection lines between close bodies (gravitational bonds)
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i], b = bodies[j]
          const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (dist < 150) {
            const alpha = (1 - dist / 150) * 0.15
            const pa = project3D(a.x, a.y, a.z, w, h)
            const pb = project3D(b.x, b.y, b.z, w, h)
            ctx.strokeStyle = `rgba(100, 140, 255, ${alpha})`
            ctx.lineWidth = 0.5
            ctx.beginPath()
            ctx.moveTo(pa.sx, pa.sy)
            ctx.lineTo(pb.sx, pb.sy)
            ctx.stroke()
          }
        }
      }

      // Explosions
      explosionsRef.current = explosionsRef.current.filter(exp => {
        exp.age++
        let anyAlive = false
        for (const p of exp.particles) {
          p.x += p.vx; p.y += p.vy; p.z += p.vz
          p.vx *= 0.97; p.vy *= 0.97; p.vz *= 0.97
          p.life -= 0.015
          if (p.life <= 0) continue
          anyAlive = true
          const pp = project3D(p.x, p.y, p.z, w, h)
          const size = Math.max(0.5, 2 * pp.scale * p.life)
          ctx.fillStyle = p.color
          ctx.globalAlpha = p.life * 0.8
          ctx.beginPath()
          ctx.arc(pp.sx, pp.sy, size, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
        return anyAlive
      })

      // Drag preview line
      if (dragRef.current && performance.now() - dragRef.current.startTime > 300) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(dragRef.current.startX, dragRef.current.startY)
        ctx.lineTo(dragRef.current.bodyX, dragRef.current.bodyY)
        ctx.stroke()
        ctx.setLineDash([])
        // Preview body
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
        ctx.beginPath()
        ctx.arc(dragRef.current.startX, dragRef.current.startY, 6, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // ─── Main loop ───
    const tick = () => {
      tRef.current++

      // Slow auto-rotation
      if (autoRotate) {
        cameraRef.current.rotY += 0.001
      }

      if (started) physicsTick()
      render()
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('resize', resize)
    }
  }, [started, project3D, spawnBody, playBurst])

  return (
    <div className="fixed inset-0 bg-black">
      <canvas ref={canvasRef} className="w-full h-full" style={{ cursor: 'crosshair' }} />

      {/* Start overlay */}
      {!started && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <button
            onClick={initAudio}
            className="group relative px-8 py-4 text-white/80 hover:text-white transition-all"
          >
            <div className="absolute inset-0 rounded-2xl border border-white/10 group-hover:border-white/30 transition-colors" />
            <div className="text-2xl font-light tracking-[0.3em] uppercase">begin</div>
            <div className="text-[10px] tracking-[0.2em] uppercase opacity-30 mt-2">tap to create stars &middot; drag to launch &middot; scroll to zoom</div>
          </button>
        </div>
      )}

      {/* HUD */}
      {started && (
        <div className="absolute top-4 left-4 text-white/25 text-[10px] tracking-[0.15em] uppercase pointer-events-none">
          <div>cosmos &middot; {bodyCount} bodies</div>
          <div className="mt-1 opacity-50">tap to birth &middot; drag to orbit &middot; scroll to zoom</div>
        </div>
      )}
    </div>
  )
}
