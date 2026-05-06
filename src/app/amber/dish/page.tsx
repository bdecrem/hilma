'use client'

import { useEffect, useRef, useState } from 'react'

// DISH — L65's Gray-Scott reaction-diffusion chemistry as a NON-INTERACTIVE
// video. Same FBO ping-pong simulation, same mitosis params (f=0.0367,
// k=0.0649). Difference: a SCRIPTED "ghost user" drives the cursor through
// parametric gestures (spirals, sine sweeps, arcs, scribbles, taps),
// continuously injecting V activator along the path. After each gesture,
// a quiet period lets the drawing evolve into the maze/skeletal shapes
// the chemistry produces. Loops forever. Paired with an Eno-style ambient
// drone in A minor: continuous low sub + slowly overlapping pad notes
// (sawtooth triple, 12s attack / 18s release) from a pentatonic A minor
// set. No drums.
//
// Music recipe: ambient (Brian Eno "Music for Airports" wheelhouse)
// Visual recipe: see L65's CREATIONS.md entry for chemistry details

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

// Same as L65 — sim step + cursor injection in one pass.
const SIM_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_state;
uniform vec2 u_texelSize;
uniform float u_dt;
uniform float u_dU;
uniform float u_dV;
uniform float u_feed;
uniform float u_kill;
uniform vec2 u_cursor;
uniform float u_inject;
uniform float u_aspect;
uniform float u_injectRadius;
out vec4 fragColor;

void main() {
  vec2 c = texture(u_state, v_uv).rg;
  float U = c.r;
  float V = c.g;

  vec2 t = u_texelSize;
  vec2 n  = texture(u_state, v_uv + vec2( 0.0,  t.y)).rg;
  vec2 s  = texture(u_state, v_uv + vec2( 0.0, -t.y)).rg;
  vec2 e  = texture(u_state, v_uv + vec2( t.x,  0.0)).rg;
  vec2 w  = texture(u_state, v_uv + vec2(-t.x,  0.0)).rg;
  vec2 ne = texture(u_state, v_uv + vec2( t.x,  t.y)).rg;
  vec2 nw = texture(u_state, v_uv + vec2(-t.x,  t.y)).rg;
  vec2 se = texture(u_state, v_uv + vec2( t.x, -t.y)).rg;
  vec2 sw = texture(u_state, v_uv + vec2(-t.x, -t.y)).rg;

  vec2 lap = (n + s + e + w) * 0.2 + (ne + nw + se + sw) * 0.05 - c;

  float reaction = U * V * V;
  float newU = U + (u_dU * lap.r - reaction + u_feed * (1.0 - U)) * u_dt;
  float newV = V + (u_dV * lap.g + reaction - (u_kill + u_feed) * V) * u_dt;

  if (u_inject > 0.0) {
    vec2 d = (v_uv - u_cursor) * vec2(u_aspect, 1.0);
    float r = length(d);
    float strength = smoothstep(u_injectRadius, 0.0, r) * u_inject;
    newV = clamp(newV + strength * 0.55, 0.0, 1.0);
    newU = clamp(newU - strength * 0.20, 0.0, 1.0);
  }

  fragColor = vec4(clamp(newU, 0.0, 1.0), clamp(newV, 0.0, 1.0), 0.0, 1.0);
}`

const SEED_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform float u_aspect;
out vec4 fragColor;
void main() {
  vec2 d = (v_uv - 0.5) * vec2(u_aspect, 1.0);
  float r = length(d);
  float seed = smoothstep(0.040, 0.020, r);
  float s2 = smoothstep(0.025, 0.012, length(d - vec2( 0.18, 0.07)));
  float s3 = smoothstep(0.025, 0.012, length(d - vec2(-0.21, -0.13)));
  float s4 = smoothstep(0.025, 0.012, length(d - vec2( 0.05, -0.22)));
  float V0 = clamp(seed * 0.55 + s2 * 0.55 + s3 * 0.55 + s4 * 0.55, 0.0, 0.6);
  float U0 = 1.0 - V0 * 0.6;
  fragColor = vec4(U0, V0, 0.0, 1.0);
}`

const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_state;
uniform vec2 u_resolution;
uniform vec2 u_pulseCenter; // 0..1 normalized
uniform float u_pulse;       // 0..1 decay
out vec4 fragColor;

void main() {
  float V = texture(u_state, v_uv).g;
  float b = smoothstep(0.10, 0.45, V);
  vec3 cream = vec3(0.91);
  vec3 lime = vec3(0.776, 1.0, 0.235);

  // big cursor pulse glow — fills a large region around the tap point
  vec2 p = (v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.0;
  vec2 pulseP = (u_pulseCenter - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.0;
  float pd = length(p - pulseP);
  // soft, large halo: gaussian falloff with big sigma
  float halo = u_pulse * exp(-pd * pd * 0.9);
  // tighter inner core
  float core = u_pulse * exp(-pd * pd * 4.0);

  vec3 col = cream * b * 0.95;
  // halo TINTS the existing pattern lime (multiplicative blend feel)
  col = mix(col, col * (1.0 + lime * 0.6), halo * 0.55);
  // core adds a soft cream→lime add
  col += lime * core * 0.30;
  col += cream * core * 0.18;

  float vig = smoothstep(1.55, 0.6, length((v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0)));
  col *= mix(0.55, 1.0, vig);
  fragColor = vec4(col, 1.0);
}`

// ────────────────────── ambient music ──────────────────────
// Eno-style A minor pad. Pentatonic note set. Each note = sawtooth triple
// with 12s attack / 18s release through a soft lowpass. Multiple notes
// overlap into a slow drifting pad. Continuous A1/E2 sub drone underneath.

const NOTE_FREQS = [
  110.0, 130.81, 146.83, 164.81, 196.0, 220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 659.25,
]

// ────────────────────── scripted gestures ──────────────────────
// Each gesture is a parametric (x,y) function over normalized time s∈[0,1]
// returning cursor coords in [0..1]. The "ghost user" picks one, plays it
// over `duration` seconds with continuous injection, then pauses
// `pauseAfter` seconds for the chemistry to evolve.

type Gesture = {
  fn: (s: number) => [number, number]
  duration: number // seconds of motion + injection
  pauseAfter: number // seconds of stillness after
  injectRadius: number // 0..1, in normalized aspect-corrected coords
  injectStrength: number // 0..1
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function buildGestures(): Gesture[] {
  // pre-randomize per-call so each playthrough is different
  const cx = rand(0.3, 0.7)
  const cy = rand(0.35, 0.65)
  const r = rand(0.18, 0.30)
  const dirSign = Math.random() < 0.5 ? 1 : -1

  return [
    // ── spiral outward
    {
      fn: (s) => {
        const turns = 2.5
        const a = s * turns * Math.PI * 2 * dirSign
        const rr = r * (0.15 + s * 0.85)
        return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]
      },
      duration: rand(6, 9),
      pauseAfter: rand(8, 14),
      injectRadius: 0.020,
      injectStrength: 1.0,
    },

    // ── thick-brush slow short stroke (produces dense blobs that evolve
    //    into larger boxy/loop shapes — Bart's "larger shapes" reference)
    {
      fn: (s) => {
        const x0 = rand(0.20, 0.45), y0 = rand(0.30, 0.55)
        const x1 = x0 + rand(-0.18, 0.18)
        const y1 = y0 + rand(-0.18, 0.18)
        return [x0 + (x1 - x0) * s, y0 + (y1 - y0) * s]
      },
      duration: rand(2.5, 4),
      pauseAfter: rand(14, 22),
      injectRadius: 0.045, // chunky brush
      injectStrength: 1.0,
    },

    // ── thick-brush large slow figure-8 (single big region of dense V)
    {
      fn: (s) => {
        const t = s * Math.PI * 2
        return [
          0.5 + Math.sin(t) * 0.16,
          0.5 + Math.sin(2 * t) * 0.10,
        ]
      },
      duration: rand(4, 6),
      pauseAfter: rand(14, 20),
      injectRadius: 0.040,
      injectStrength: 1.0,
    },

    // ── sine sweep horizontal
    {
      fn: (s) => {
        const x = 0.08 + s * 0.84
        const y = 0.5 + Math.sin(s * Math.PI * rand(2, 4)) * 0.18
        return [x, y]
      },
      duration: rand(5, 8),
      pauseAfter: rand(8, 14),
      injectRadius: 0.020,
      injectStrength: 1.0,
    },

    // ── lissajous figure (looping)
    {
      fn: (s) => {
        const a = 3 + Math.floor(rand(0, 3))
        const b = 2 + Math.floor(rand(0, 3))
        const phase = rand(0, Math.PI)
        const t = s * Math.PI * 2
        return [
          0.5 + Math.sin(a * t + phase) * 0.32,
          0.5 + Math.sin(b * t) * 0.25,
        ]
      },
      duration: rand(7, 10),
      pauseAfter: rand(8, 14),
      injectRadius: 0.018,
      injectStrength: 1.0,
    },

    // ── arc from one corner to the opposite
    {
      fn: (s) => {
        const x0 = rand(0.05, 0.30), y0 = rand(0.10, 0.40)
        const x1 = rand(0.70, 0.95), y1 = rand(0.60, 0.90)
        // bow the arc by perturbing the midpoint
        const mx = (x0 + x1) / 2 + rand(-0.18, 0.18)
        const my = (y0 + y1) / 2 + rand(-0.18, 0.18)
        // quadratic bezier
        const inv = 1 - s
        return [
          inv * inv * x0 + 2 * inv * s * mx + s * s * x1,
          inv * inv * y0 + 2 * inv * s * my + s * s * y1,
        ]
      },
      duration: rand(4, 7),
      pauseAfter: rand(10, 16),
      injectRadius: 0.022,
      injectStrength: 1.0,
    },

    // ── scribble in a small region
    {
      fn: (s) => {
        const t = s * Math.PI * 2 * rand(3, 5)
        return [
          cx + Math.sin(t * 1.3 + 0.7) * r * 0.8 * (1 - s * 0.4),
          cy + Math.cos(t * 1.7 + 0.2) * r * 0.6 * (1 - s * 0.4),
        ]
      },
      duration: rand(4, 7),
      pauseAfter: rand(8, 14),
      injectRadius: 0.018,
      injectStrength: 1.0,
    },

    // ── multi-tap burst (4-6 stationary "taps" along a line)
    {
      fn: (s) => {
        const n = 5
        const idx = Math.min(n - 1, Math.floor(s * n))
        const tx = 0.2 + (idx / (n - 1)) * 0.6
        const ty = cy + (idx % 2 === 0 ? -0.05 : 0.05)
        return [tx, ty]
      },
      duration: rand(2, 3.5),
      pauseAfter: rand(10, 16),
      injectRadius: 0.025,
      injectStrength: 1.0,
    },

    // ── circle (closed loop)
    {
      fn: (s) => {
        const a = s * Math.PI * 2 * dirSign
        const rr = r * 0.9
        return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]
      },
      duration: rand(5, 7),
      pauseAfter: rand(10, 16),
      injectRadius: 0.022,
      injectStrength: 1.0,
    },
  ]
}

export default function DishPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fallbackRef = useRef<HTMLDivElement>(null)
  const [started, setStarted] = useState(false)
  const startedRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false })
    if (!gl) {
      if (fallbackRef.current) fallbackRef.current.style.display = 'flex'
      return
    }
    const ext = gl.getExtension('EXT_color_buffer_float')
    if (!ext) {
      if (fallbackRef.current) {
        fallbackRef.current.style.display = 'flex'
        fallbackRef.current.textContent = 'this piece needs WebGL2 with EXT_color_buffer_float.'
      }
      return
    }

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        // eslint-disable-next-line no-console
        console.error(gl.getShaderInfoLog(sh))
      }
      return sh
    }
    const link = (vs: WebGLShader, fs: WebGLShader) => {
      const p = gl.createProgram()!
      gl.attachShader(p, vs)
      gl.attachShader(p, fs)
      gl.linkProgram(p)
      return p
    }

    const vs = compile(gl.VERTEX_SHADER, VERT)
    const simProg = link(vs, compile(gl.FRAGMENT_SHADER, SIM_FRAG))
    const dispProg = link(vs, compile(gl.FRAGMENT_SHADER, DISPLAY_FRAG))
    const seedProg = link(vs, compile(gl.FRAGMENT_SHADER, SEED_FRAG))

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

    const setupAttrib = (prog: WebGLProgram) => {
      gl.useProgram(prog)
      const aPos = gl.getAttribLocation(prog, 'a_pos')
      gl.enableVertexAttribArray(aPos)
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
    }

    const isMobile = window.matchMedia('(max-width: 600px)').matches
    const SIM_W = isMobile ? 220 : 360
    const SIM_H = isMobile
      ? Math.floor((220 * window.innerHeight) / window.innerWidth)
      : Math.floor((360 * window.innerHeight) / window.innerWidth)
    const aspect = SIM_W / SIM_H

    const makeTex = () => {
      const t = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, SIM_W, SIM_H, 0, gl.RGBA, gl.HALF_FLOAT, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      return t
    }
    const makeFbo = (tex: WebGLTexture) => {
      const f = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, f)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      return f
    }

    let texA = makeTex()
    let texB = makeTex()
    let fboA = makeFbo(texA)
    let fboB = makeFbo(texB)

    const seedField = () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboA)
      gl.viewport(0, 0, SIM_W, SIM_H)
      setupAttrib(seedProg)
      gl.uniform1f(gl.getUniformLocation(seedProg, 'u_aspect'), aspect)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    seedField()

    const DPR = Math.min(window.devicePixelRatio || 1, isMobile ? 1.0 : 1.4)
    const resize = () => {
      const W = window.innerWidth
      const H = window.innerHeight
      canvas.width = Math.max(1, Math.floor(W * DPR))
      canvas.height = Math.max(1, Math.floor(H * DPR))
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
    }
    resize()
    window.addEventListener('resize', resize)

    setupAttrib(simProg)
    const u_state_sim = gl.getUniformLocation(simProg, 'u_state')
    const u_texelSize = gl.getUniformLocation(simProg, 'u_texelSize')
    const u_dt = gl.getUniformLocation(simProg, 'u_dt')
    const u_dU = gl.getUniformLocation(simProg, 'u_dU')
    const u_dV = gl.getUniformLocation(simProg, 'u_dV')
    const u_feed = gl.getUniformLocation(simProg, 'u_feed')
    const u_kill = gl.getUniformLocation(simProg, 'u_kill')
    const u_cursor_sim = gl.getUniformLocation(simProg, 'u_cursor')
    const u_inject = gl.getUniformLocation(simProg, 'u_inject')
    const u_aspect_sim = gl.getUniformLocation(simProg, 'u_aspect')
    const u_injectRadius = gl.getUniformLocation(simProg, 'u_injectRadius')

    setupAttrib(dispProg)
    const u_state_disp = gl.getUniformLocation(dispProg, 'u_state')
    const u_resolution = gl.getUniformLocation(dispProg, 'u_resolution')
    const u_pulseCenter = gl.getUniformLocation(dispProg, 'u_pulseCenter')
    const u_pulse = gl.getUniformLocation(dispProg, 'u_pulse')

    // ────────────────────── audio (Eno pad) ──────────────────────
    let audioCtx: AudioContext | null = null
    let masterGain: GainNode | null = null
    const padScheduler: { id: number | null } = { id: null }

    const startAudio = () => {
      if (audioCtx) return
      startedRef.current = true
      setStarted(true)
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtx = new Ctx()

      const m = audioCtx.createGain()
      m.gain.setValueAtTime(0, audioCtx.currentTime)
      m.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 6)
      const lpf = audioCtx.createBiquadFilter()
      lpf.type = 'lowpass'
      lpf.frequency.value = 1800
      lpf.Q.value = 0.5
      m.connect(lpf)
      lpf.connect(audioCtx.destination)
      masterGain = m

      // continuous A1/E2 sub drone
      for (const f of [55.0, 82.41]) {
        for (const det of [-9, 8]) {
          const o = audioCtx.createOscillator()
          o.type = 'sine'
          o.frequency.value = f
          o.detune.value = det
          const g = audioCtx.createGain()
          g.gain.value = 0.085
          o.connect(g)
          g.connect(m)
          o.start()
          const lfo = audioCtx.createOscillator()
          lfo.frequency.value = 0.04 + Math.random() * 0.05
          const lfoGain = audioCtx.createGain()
          lfoGain.gain.value = 0.04
          lfo.connect(lfoGain)
          lfoGain.connect(g.gain)
          lfo.start()
        }
      }

      const triggerPadNote = () => {
        if (!audioCtx || !masterGain) return
        const t0 = audioCtx.currentTime
        const f = NOTE_FREQS[Math.floor(Math.random() * NOTE_FREQS.length)]

        const noteG = audioCtx.createGain()
        noteG.gain.setValueAtTime(0, t0)
        noteG.gain.linearRampToValueAtTime(0.07, t0 + 12)
        noteG.gain.setValueAtTime(0.07, t0 + 22)
        noteG.gain.linearRampToValueAtTime(0.0001, t0 + 22 + 18)
        const noteLP = audioCtx.createBiquadFilter()
        noteLP.type = 'lowpass'
        noteLP.frequency.value = 1400
        noteLP.Q.value = 0.7
        noteG.connect(noteLP)
        noteLP.connect(masterGain)

        for (const det of [-7, 0, 7]) {
          const o = audioCtx.createOscillator()
          o.type = 'sawtooth'
          o.frequency.value = f
          o.detune.value = det
          o.connect(noteG)
          o.start(t0)
          o.stop(t0 + 22 + 18 + 0.2)
        }
      }
      setTimeout(triggerPadNote, 200)
      setTimeout(triggerPadNote, 4000)
      setTimeout(triggerPadNote, 8000)
      const scheduleNext = () => {
        const delay = 8000 + Math.random() * 6000
        padScheduler.id = window.setTimeout(() => {
          triggerPadNote()
          scheduleNext()
        }, delay)
      }
      scheduleNext()
    }

    const onAny = () => {
      startAudio()
    }
    window.addEventListener('pointerdown', onAny, { once: true })
    window.addEventListener('touchstart', onAny, { once: true, passive: true })

    // ────────────────────── ghost-user gesture engine ──────────────────────
    let currentGesture: Gesture | null = null
    let gestureStart = 0
    let nextGestureAt = 0 // performance.now() timestamp
    let cursorX = 0.5
    let cursorY = 0.5
    let injecting = 0
    let injectRadius = 0.022

    // ── tap pulses (choreographed) ──
    // each tap fires a big lime halo glow + a small dense V injection.
    let pulseValue = 0
    let pulseCenterX = 0.5
    let pulseCenterY = 0.5
    let pendingTapInject = false
    let pendingTapRadius = 0.025
    let nextTapAt = 0

    // ── two-movement structure ──
    // ACTIVE: drag gestures + frequent small taps (3-7s) — produces
    //   maze-like evolving structures from the cursor paths.
    // STILL: NO drag gestures. Only isolated single taps every 35-65s,
    //   each at radius 0.025 — gives each tap's V blob plenty of time
    //   to bloom into the LARGE square / loop / cell-cluster shapes
    //   Bart screenshotted from real L65 use.
    type Mode = 'active' | 'still'
    let mode: Mode = 'active'
    let nextModeSwitchAt = performance.now() + 70000 // first ~70s = active
    const switchMode = (nowMs: number) => {
      mode = mode === 'active' ? 'still' : 'active'
      if (mode === 'active') {
        nextModeSwitchAt = nowMs + (60000 + Math.random() * 30000) // 60-90s active
        nextTapAt = nowMs + 5000
      } else {
        nextModeSwitchAt = nowMs + (110000 + Math.random() * 50000) // 110-160s still
        nextTapAt = nowMs + 8000 // first still-tap soon after entering still mode
        // cancel any active gesture so still mode is truly still
        currentGesture = null
        nextGestureAt = nextModeSwitchAt + 1000
      }
    }

    const fireTap = (nowMs: number, radiusOverride?: number) => {
      pulseCenterX = rand(0.18, 0.82)
      pulseCenterY = rand(0.22, 0.78)
      pulseValue = 1.0
      pendingTapInject = true
      pendingTapRadius = radiusOverride ?? 0.030
      if (mode === 'active') {
        nextTapAt = nowMs + (3000 + Math.random() * 4000) // 3-7s
      } else {
        // STILL mode: VERY long pauses so each tap can bloom
        nextTapAt = nowMs + (35000 + Math.random() * 30000) // 35-65s
      }
    }

    const pickNextGesture = (nowMs: number) => {
      const gestures = buildGestures()
      currentGesture = pick(gestures)
      gestureStart = nowMs
      injectRadius = currentGesture.injectRadius
    }
    pickNextGesture(performance.now() + 1500) // first gesture starts ~1.5s in
    nextGestureAt = performance.now() + 1500
    nextTapAt = performance.now() + 5000

    // ────────────────────── render loop ──────────────────────
    let raf = 0
    const STEPS_PER_FRAME = 6
    const startMs = performance.now()
    let lastResetMs = startMs

    const tick = (now: number) => {
      // very-occasional soft reset (every ~3-4 minutes) to prevent
      // long-term drift toward a degenerate state
      if (now - lastResetMs > 200000 + Math.random() * 60000) {
        seedField()
        lastResetMs = now
        currentGesture = null
        nextGestureAt = now + 3000
      }

      // ── mode switching ──
      if (now > nextModeSwitchAt) switchMode(now)

      // ── gesture state machine (ACTIVE mode only) ──
      const inPause = now < nextGestureAt
      if (mode === 'still') {
        // STILL mode: never run gestures; cursor "off-screen", no inject
        injecting = 0
        cursorX = -1; cursorY = -1
      } else if (inPause) {
        injecting = 0
      } else if (currentGesture) {
        const elapsed = (now - gestureStart) / 1000
        const dur = currentGesture.duration
        if (elapsed < dur) {
          const s = elapsed / dur
          const [x, y] = currentGesture.fn(s)
          cursorX = x
          cursorY = y
          injecting = 1
          injectRadius = currentGesture.injectRadius
        } else {
          injecting = 0
          nextGestureAt = now + currentGesture.pauseAfter * 1000
          currentGesture = null
        }
      } else {
        pickNextGesture(now)
      }

      // ── tap scheduler ──
      // ACTIVE mode: only during gesture pauses (deliberate punctuation)
      // STILL mode: anytime (since there are no gestures)
      const tapAllowed = mode === 'still' || inPause
      if (tapAllowed && now > nextTapAt) {
        // STILL mode taps use the original L65 small radius (0.025) so
        // the V blob is small enough to grow naturally over the long
        // pause into a clean square/loop. ACTIVE mode taps stay chunky.
        fireTap(now, mode === 'still' ? 0.025 : 0.030)
      }

      // pulse decays
      if (pulseValue > 0) pulseValue *= 0.973 // ~1.8s to fade

      // ── tap injection: do ONE sim step with cursor=pulseCenter and a
      //    medium-large radius BEFORE the gesture step, then proceed ──
      if (pendingTapInject) {
        gl.useProgram(simProg)
        setupAttrib(simProg)
        gl.uniform2f(u_texelSize, 1.0 / SIM_W, 1.0 / SIM_H)
        gl.uniform1f(u_dt, 1.0)
        gl.uniform1f(u_dU, 0.16)
        gl.uniform1f(u_dV, 0.08)
        gl.uniform1f(u_feed, 0.0367)
        gl.uniform1f(u_kill, 0.0649)
        gl.uniform2f(u_cursor_sim, pulseCenterX, pulseCenterY)
        gl.uniform1f(u_inject, 1)
        gl.uniform1f(u_aspect_sim, aspect)
        gl.uniform1f(u_injectRadius, pendingTapRadius)

        gl.viewport(0, 0, SIM_W, SIM_H)
        // a few sim steps with injection — STILL-mode taps need fewer
        // steps (smaller blob, more time to evolve naturally), ACTIVE-
        // mode taps need more (bigger blob, gets disturbed sooner)
        const tapSteps = mode === 'still' ? 2 : 3
        for (let i = 0; i < tapSteps; i++) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, fboB)
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, texA)
          gl.uniform1i(u_state_sim, 0)
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
          const tmpT = texA, tmpF = fboA
          texA = texB; fboA = fboB
          texB = tmpT; fboB = tmpF
        }
        pendingTapInject = false
      }

      // ── normal simulation steps (with gesture cursor) ──
      gl.useProgram(simProg)
      setupAttrib(simProg)
      gl.uniform2f(u_texelSize, 1.0 / SIM_W, 1.0 / SIM_H)
      gl.uniform1f(u_dt, 1.0)
      gl.uniform1f(u_dU, 0.16)
      gl.uniform1f(u_dV, 0.08)
      gl.uniform1f(u_feed, 0.0367)
      gl.uniform1f(u_kill, 0.0649)
      gl.uniform2f(u_cursor_sim, cursorX, cursorY)
      gl.uniform1f(u_inject, injecting)
      gl.uniform1f(u_aspect_sim, aspect)
      gl.uniform1f(u_injectRadius, injectRadius)

      gl.viewport(0, 0, SIM_W, SIM_H)
      for (let i = 0; i < STEPS_PER_FRAME; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fboB)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, texA)
        gl.uniform1i(u_state_sim, 0)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        const tmpT = texA, tmpF = fboA
        texA = texB; fboA = fboB
        texB = tmpT; fboB = tmpF
      }

      // ── display (with pulse) ──
      gl.useProgram(dispProg)
      setupAttrib(dispProg)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texA)
      gl.uniform1i(u_state_disp, 0)
      gl.uniform2f(u_resolution, canvas.width, canvas.height)
      gl.uniform2f(u_pulseCenter, pulseCenterX, pulseCenterY)
      gl.uniform1f(u_pulse, pulseValue)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointerdown', onAny)
      window.removeEventListener('touchstart', onAny)
      if (padScheduler.id) clearTimeout(padScheduler.id)
      if (audioCtx) {
        try {
          audioCtx.close()
        } catch {}
      }
      void startMs
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
          background: '#0A0A0A',
          overflow: 'hidden',
          height: '100dvh',
          width: '100vw',
          touchAction: 'none',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            touchAction: 'none',
            cursor: 'default',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
          }}
        />

        <div
          ref={fallbackRef}
          style={{
            display: 'none',
            position: 'fixed',
            inset: 0,
            alignItems: 'center',
            justifyContent: 'center',
            color: '#E8E8E8',
            fontFamily: '"Fraunces", serif',
            fontStyle: 'italic',
            fontSize: 16,
            opacity: 0.6,
            zIndex: 5,
            padding: '0 24px',
            textAlign: 'center',
          }}
        >
          this piece needs WebGL2 with EXT_color_buffer_float.
        </div>

        {!started && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#E8E8E8',
              fontFamily: '"Fraunces", serif',
              fontStyle: 'italic',
              fontSize: 22,
              letterSpacing: '0.02em',
              opacity: 0.78,
              pointerEvents: 'none',
              mixBlendMode: 'difference',
              zIndex: 4,
            }}
          >
            tap to play.
          </div>
        )}

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
          AMBIENT · A MINOR · A VIDEO FOR L65
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
            DISH.
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
            a slow weather of cells.
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
