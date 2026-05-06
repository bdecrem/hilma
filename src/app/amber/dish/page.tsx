'use client'

import { useEffect, useRef, useState } from 'react'

// DISH — L65's reaction-diffusion chemistry as a NON-INTERACTIVE video.
// Same WebGL2 + RGBA16F + FBO ping-pong setup as L65. The chemistry uses
// f=0.030 / k=0.062 ("maze" / "labyrinth") instead of L65's mitosis,
// because a hand-composed timeline of taps and drags needs each gesture
// to produce a persistent, visible structure — mitosis kills isolated
// V deposits faster than they can grow. Maze sustains both spots AND
// continuous trails, which is what we need for the gesture vocabulary.
//
// A fixed 75-second composition drives the cursor through 13 hand-placed
// events that exercise the full L65 vocabulary (single taps, multi-tap
// bursts, slow line drags, curved drags, spirals, circles, lissajous,
// thick-brush strokes). Synced to a deterministic A-minor pad note
// schedule. Loops bit-for-bit identically forever.

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

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
uniform float u_inject;          // 0..1 multiplier (0 = off)
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
  // empty field — V=0 everywhere. Timeline draws all V deposits.
  fragColor = vec4(1.0, 0.0, 0.0, 1.0);
}`

// Erase pass — restore U=1, V=0 within a disc, leave everything else
// untouched. Used to remove old artifacts as new ones are added so the
// canvas density stays roughly constant.
const ERASE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_state;
uniform vec2 u_eraseCenter;
uniform float u_eraseRadius;
uniform float u_aspect;
out vec4 fragColor;
void main() {
  vec2 prev = texture(u_state, v_uv).rg;
  vec2 d = (v_uv - u_eraseCenter) * vec2(u_aspect, 1.0);
  float r = length(d);
  float t = smoothstep(u_eraseRadius, u_eraseRadius * 0.5, r);
  float U = mix(prev.r, 1.0, t);
  float V = mix(prev.g, 0.0, t);
  fragColor = vec4(U, V, 0.0, 1.0);
}`

const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_state;
uniform vec2 u_resolution;
uniform vec2 u_pulseCenter;
uniform float u_pulse;
out vec4 fragColor;

void main() {
  float V = texture(u_state, v_uv).g;
  // narrow band — only the high-V "ridge" cells show as bright lines,
  // the rest stays dark. Less saturated, more skeletal.
  float b = smoothstep(0.18, 0.45, V);
  vec3 cream = vec3(0.91);
  vec3 lime = vec3(0.776, 1.0, 0.235);

  vec2 p = (v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.0;
  vec2 pulseP = (u_pulseCenter - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.0;
  float pd = length(p - pulseP);
  float halo = u_pulse * exp(-pd * pd * 1.2);
  float core = u_pulse * exp(-pd * pd * 5.0);

  // moderate brightness — pieces stay skeletal, never flood
  vec3 col = cream * b * 0.80;
  col = mix(col, col * (1.0 + lime * 0.45), halo * 0.40);
  col += lime * core * 0.22;
  col += cream * core * 0.12;

  float vig = smoothstep(1.55, 0.6, length((v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0)));
  col *= mix(0.55, 1.0, vig);
  fragColor = vec4(col, 1.0);
}`

// ────────────────────── COMPOSITION ──────────────────────
// 75-second piece, deterministic, loops forever. Maze chemistry
// (f=0.030 / k=0.062) sustains all gestures so each one produces a
// visible persistent structure. Events are dense (every 4-8s) so the
// piece never sits empty.

const LOOP_S = 45

type DragPath = (s: number) => [number, number]

type Event =
  | { t: number; type: 'tap'; x: number; y: number; radius?: number; steps?: number }
  | { t: number; type: 'tap-burst'; positions: [number, number][]; spacing: number; radius?: number; steps?: number }
  | { t: number; type: 'drag'; path: DragPath; duration: number; radius?: number; strength?: number }
  | { t: number; type: 'pad'; freq: number }

const line = (x0: number, y0: number, x1: number, y1: number): DragPath => (s) => [x0 + (x1 - x0) * s, y0 + (y1 - y0) * s]
const sineSweep = (x0: number, x1: number, yMid: number, amp: number, cycles: number): DragPath =>
  (s) => [x0 + (x1 - x0) * s, yMid + Math.sin(s * Math.PI * 2 * cycles) * amp]
const arc = (x0: number, y0: number, x1: number, y1: number, mx: number, my: number): DragPath =>
  (s) => {
    const inv = 1 - s
    return [
      inv * inv * x0 + 2 * inv * s * mx + s * s * x1,
      inv * inv * y0 + 2 * inv * s * my + s * s * y1,
    ]
  }
const spiral = (cx: number, cy: number, rMin: number, rMax: number, turns: number, dir = 1): DragPath =>
  (s) => {
    const a = s * turns * Math.PI * 2 * dir
    const r = rMin + (rMax - rMin) * s
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
  }
const circle = (cx: number, cy: number, r: number, dir = 1): DragPath => (s) => {
  const a = s * Math.PI * 2 * dir
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
}
const lissajous = (cx: number, cy: number, ax: number, ay: number, fx: number, fy: number, phase: number): DragPath =>
  (s) => {
    const t = s * Math.PI * 2
    return [cx + Math.sin(fx * t + phase) * ax, cy + Math.sin(fy * t) * ay]
  }
const figure8 = (cx: number, cy: number, ax: number, ay: number): DragPath => (s) => {
  const t = s * Math.PI * 2
  return [cx + Math.sin(t) * ax, cy + Math.sin(2 * t) * ay]
}

// Solitary-spots regime needs a slightly higher critical mass to survive
// (it doesn't replicate to compensate). Modest tap radius / few steps
// keeps each artifact small but stable.
const TAP_R = 0.032
const TAP_STEPS = 6
const BURST_R = 0.022
const BURST_STEPS = 3
const DRAG_R = 0.012
const DRAG_STR = 0.32

// Tight 60s composition — events every 2-3s so something fresh is always
// blooming. Taps make rings (~5s lifetime each), drags trace lines (~3s).
// 22 visual events + 12 pad notes.

// 45-second composition. Asymmetric event placement to avoid bilateral
// "organism" shapes — events scattered off-center, no mirror pairs.
const TIMELINE: Event[] = [
  // ── 0-12s: scattered taps + first line
  { t: 0.5, type: 'pad', freq: 110.0 },
  { t: 1.0, type: 'tap', x: 0.42, y: 0.55, radius: TAP_R, steps: TAP_STEPS },
  { t: 2.5, type: 'tap', x: 0.68, y: 0.32, radius: TAP_R, steps: TAP_STEPS },
  { t: 4.0, type: 'tap', x: 0.22, y: 0.72, radius: TAP_R, steps: TAP_STEPS },
  { t: 5.5, type: 'pad', freq: 220.0 },
  { t: 6.0, type: 'drag', path: line(0.10, 0.40, 0.78, 0.62), duration: 0.9, radius: DRAG_R, strength: DRAG_STR }, // diagonal across, off-center
  { t: 8.0, type: 'tap', x: 0.85, y: 0.78, radius: TAP_R, steps: TAP_STEPS },
  { t: 9.5, type: 'tap', x: 0.55, y: 0.18, radius: TAP_R, steps: TAP_STEPS },
  { t: 11.0, type: 'pad', freq: 261.63 },

  // ── 12-25s: curves and bursts
  { t: 12.0, type: 'drag', path: arc(0.12, 0.35, 0.62, 0.78, 0.20, 0.78), duration: 1.1, radius: DRAG_R, strength: DRAG_STR },
  { t: 14.5, type: 'tap', x: 0.78, y: 0.45, radius: TAP_R, steps: TAP_STEPS },
  { t: 16.0, type: 'drag', path: circle(0.35, 0.50, 0.15, 1), duration: 1.4, radius: DRAG_R, strength: DRAG_STR }, // off-center circle
  { t: 18.5, type: 'pad', freq: 329.63 },
  { t: 19.0, type: 'tap-burst', positions: [
    [0.65, 0.30], [0.78, 0.42], [0.70, 0.58], [0.55, 0.50],
  ], spacing: 0.20, radius: BURST_R, steps: BURST_STEPS },
  { t: 21.0, type: 'drag', path: spiral(0.72, 0.65, 0.04, 0.12, 2.0, 1), duration: 1.3, radius: DRAG_R, strength: DRAG_STR }, // off-center spiral
  { t: 23.0, type: 'tap', x: 0.18, y: 0.30, radius: TAP_R, steps: TAP_STEPS },
  { t: 24.5, type: 'tap', x: 0.90, y: 0.20, radius: TAP_R, steps: TAP_STEPS },

  // ── 25-37s: more variety, asymmetric
  { t: 25.0, type: 'pad', freq: 392.0 },
  { t: 25.5, type: 'drag', path: lissajous(0.42, 0.55, 0.25, 0.15, 3, 2, 0.7), duration: 1.5, radius: DRAG_R, strength: DRAG_STR },
  { t: 28.0, type: 'tap', x: 0.30, y: 0.40, radius: TAP_R, steps: TAP_STEPS },
  { t: 29.5, type: 'pad', freq: 440.0 },
  { t: 30.0, type: 'drag', path: line(0.15, 0.78, 0.50, 0.20), duration: 0.8, radius: DRAG_R, strength: DRAG_STR },
  { t: 31.5, type: 'tap', x: 0.65, y: 0.72, radius: TAP_R, steps: TAP_STEPS },
  { t: 33.0, type: 'tap-burst', positions: [
    [0.20, 0.55], [0.35, 0.60], [0.48, 0.45],
  ], spacing: 0.20, radius: BURST_R, steps: BURST_STEPS },
  { t: 35.0, type: 'drag', path: figure8(0.55, 0.45, 0.18, 0.11), duration: 1.4, radius: DRAG_R, strength: DRAG_STR },

  // ── 37-45s: closing — sparse final taps into loop
  { t: 37.5, type: 'pad', freq: 523.25 },
  { t: 38.0, type: 'tap', x: 0.85, y: 0.55, radius: TAP_R, steps: TAP_STEPS },
  { t: 39.5, type: 'tap', x: 0.40, y: 0.20, radius: TAP_R, steps: TAP_STEPS },
  { t: 41.0, type: 'pad', freq: 220.0 },
  { t: 41.5, type: 'tap', x: 0.25, y: 0.78, radius: TAP_R, steps: TAP_STEPS },
  { t: 43.0, type: 'pad', freq: 110.0 }, // A2 carries into next loop
  { t: 43.5, type: 'tap', x: 0.62, y: 0.40, radius: TAP_R, steps: TAP_STEPS },
]

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
    const eraseProg = link(vs, compile(gl.FRAGMENT_SHADER, ERASE_FRAG))

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
    const SIM_W = isMobile ? 240 : 360
    const SIM_H = isMobile
      ? Math.floor((240 * window.innerHeight) / window.innerWidth)
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

    setupAttrib(eraseProg)
    const u_state_erase = gl.getUniformLocation(eraseProg, 'u_state')
    const u_eraseCenter = gl.getUniformLocation(eraseProg, 'u_eraseCenter')
    const u_eraseRadius = gl.getUniformLocation(eraseProg, 'u_eraseRadius')
    const u_aspect_erase = gl.getUniformLocation(eraseProg, 'u_aspect')

    // ────────────────────── audio ──────────────────────
    let audioCtx: AudioContext | null = null
    let masterGain: GainNode | null = null

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
        }
      }
    }

    // pad envelope: 8s attack / 14s release (tighter than 12/18 for 75s loop)
    const playPadNote = (atSec: number, freq: number) => {
      if (!audioCtx || !masterGain) return
      const t0 = audioCtx.currentTime + atSec
      const noteG = audioCtx.createGain()
      noteG.gain.setValueAtTime(0, t0)
      noteG.gain.linearRampToValueAtTime(0.07, t0 + 8)
      noteG.gain.setValueAtTime(0.07, t0 + 16)
      noteG.gain.linearRampToValueAtTime(0.0001, t0 + 16 + 14)
      const noteLP = audioCtx.createBiquadFilter()
      noteLP.type = 'lowpass'
      noteLP.frequency.value = 1400
      noteLP.Q.value = 0.7
      noteG.connect(noteLP)
      noteLP.connect(masterGain)
      for (const det of [-7, 0, 7]) {
        const o = audioCtx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = freq
        o.detune.value = det
        o.connect(noteG)
        o.start(t0)
        o.stop(t0 + 16 + 14 + 0.2)
      }
    }

    const scheduleLoopPads = (loopStartAtCtxTime: number) => {
      if (!audioCtx) return
      for (const ev of TIMELINE) {
        if (ev.type !== 'pad') continue
        const delayFromNow = loopStartAtCtxTime - audioCtx.currentTime + ev.t
        if (delayFromNow >= 0) playPadNote(delayFromNow, ev.freq)
      }
    }

    let timelineStartCtxTime = 0
    let timelineStartedAtPerf = 0
    const onAny = () => {
      if (audioCtx) return
      startAudio()
      timelineStartCtxTime = audioCtx!.currentTime + 0.1
      timelineStartedAtPerf = performance.now() / 1000 + 0.1
      scheduleLoopPads(timelineStartCtxTime)
    }
    window.addEventListener('pointerdown', onAny, { once: true })
    window.addEventListener('touchstart', onAny, { once: true, passive: true })

    // ────────────────────── timeline state ──────────────────────
    let cursorX = 0.5
    let cursorY = 0.5
    let injecting = 0 // current frame's u_inject value (0 or strength)
    let injectRadius = 0.022
    let pulseValue = 0
    let pulseCenterX = 0.5
    let pulseCenterY = 0.5

    type PendingTap = { x: number; y: number; radius: number; stepsRemaining: number }
    const pendingTaps: PendingTap[] = []

    // erases scheduled to fire at a future loopT — keeps canvas density
    // roughly steady. Each gesture schedules its own erase ~ERASE_DELAY
    // seconds later.
    type ScheduledErase = { fireAt: number; x: number; y: number; radius: number }
    const scheduledErases: ScheduledErase[] = []
    const ERASE_DELAY = 6.0
    const scheduleErase = (loopT: number, x: number, y: number, radius: number) => {
      scheduledErases.push({ fireAt: loopT + ERASE_DELAY, x, y, radius })
    }
    // erases that need to run THIS frame
    const pendingErases: { x: number; y: number; radius: number }[] = []

    let prevLoopT = -1
    let loopCount = 0

    const fireTapVisual = (x: number, y: number, radius: number, steps: number) => {
      pulseCenterX = x
      pulseCenterY = y
      pulseValue = 1.0
      pendingTaps.push({ x, y, radius, stepsRemaining: steps })
    }

    // ────────────────────── render loop ──────────────────────
    let raf = 0
    // 1 chemistry step per frame — slow evolution keeps the canvas
    // sparse instead of letting pulsating spots tile the whole field.
    const STEPS_PER_FRAME = 1

    const tick = () => {
      if (startedRef.current && timelineStartedAtPerf > 0) {
        const nowSec = performance.now() / 1000
        const elapsedSinceStart = nowSec - timelineStartedAtPerf
        const newLoopCount = Math.floor(elapsedSinceStart / LOOP_S)
        const loopT = elapsedSinceStart - newLoopCount * LOOP_S

        if (newLoopCount !== loopCount) {
          seedField()
          loopCount = newLoopCount
          if (audioCtx) {
            const loopStartCtx = timelineStartCtxTime + loopCount * LOOP_S
            scheduleLoopPads(loopStartCtx)
          }
          prevLoopT = -1
        }

        const lo = prevLoopT
        const hi = loopT
        for (const ev of TIMELINE) {
          if (ev.type === 'pad' || ev.type === 'drag') continue
          if (ev.type === 'tap') {
            if (ev.t > lo && ev.t <= hi) {
              const r = ev.radius ?? TAP_R
              fireTapVisual(ev.x, ev.y, r, ev.steps ?? TAP_STEPS)
              scheduleErase(loopT, ev.x, ev.y, r * 2.4)
            }
          } else if (ev.type === 'tap-burst') {
            for (let i = 0; i < ev.positions.length; i++) {
              const tFire = ev.t + i * ev.spacing
              if (tFire > lo && tFire <= hi) {
                const r = ev.radius ?? BURST_R
                fireTapVisual(ev.positions[i][0], ev.positions[i][1], r, ev.steps ?? BURST_STEPS)
                scheduleErase(loopT, ev.positions[i][0], ev.positions[i][1], r * 2.6)
              }
            }
          }
        }

        injecting = 0
        let activeDrag: typeof TIMELINE[number] | null = null
        for (const ev of TIMELINE) {
          if (ev.type !== 'drag') continue
          if (loopT >= ev.t && loopT < ev.t + ev.duration) {
            const s = (loopT - ev.t) / ev.duration
            const [x, y] = ev.path(s)
            cursorX = x
            cursorY = y
            injectRadius = ev.radius ?? DRAG_R
            injecting = ev.strength ?? DRAG_STR
            activeDrag = ev
            break
          }
        }
        if (injecting === 0) {
          cursorX = -1
          cursorY = -1
        } else if (activeDrag && activeDrag.type === 'drag') {
          // for drags, schedule erases along the path at a few sample points,
          // but only ONCE per drag (when it first fires)
          if (lo < activeDrag.t && hi >= activeDrag.t) {
            const samples = 5
            for (let i = 0; i < samples; i++) {
              const s = i / (samples - 1)
              const [px, py] = activeDrag.path(s)
              // stagger so they erase one by one as the new gesture forms
              scheduledErases.push({
                fireAt: loopT + ERASE_DELAY + i * 0.3,
                x: px,
                y: py,
                radius: (activeDrag.radius ?? DRAG_R) * 6.0,
              })
            }
          }
        }

        // collect any erases that should fire this frame
        for (let i = scheduledErases.length - 1; i >= 0; i--) {
          if (scheduledErases[i].fireAt <= loopT) {
            pendingErases.push({
              x: scheduledErases[i].x,
              y: scheduledErases[i].y,
              radius: scheduledErases[i].radius,
            })
            scheduledErases.splice(i, 1)
          }
        }
        // when the loop wraps, erase events scheduled past LOOP_S would
        // never fire — drop them (they were for content the seedField
        // already wiped at the boundary).
        if (loopT < lo) {
          scheduledErases.length = 0
        }

        prevLoopT = loopT
      }

      if (pulseValue > 0) pulseValue *= 0.965 // ~1.4s halo

      // pending erases — wipe regions before any new injection so the
      // canvas density stays steady
      while (pendingErases.length > 0) {
        const er = pendingErases[0]
        gl.useProgram(eraseProg)
        setupAttrib(eraseProg)
        gl.uniform1f(u_aspect_erase, aspect)
        gl.uniform2f(u_eraseCenter, er.x, er.y)
        gl.uniform1f(u_eraseRadius, er.radius)
        gl.viewport(0, 0, SIM_W, SIM_H)
        gl.bindFramebuffer(gl.FRAMEBUFFER, fboB)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, texA)
        gl.uniform1i(u_state_erase, 0)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        const tT = texA, tF = fboA
        texA = texB; fboA = fboB
        texB = tT; fboB = tF
        pendingErases.shift()
      }

      // pending tap injects (run BEFORE normal sim steps so V is in state for chemistry)
      while (pendingTaps.length > 0) {
        const tap = pendingTaps[0]
        gl.useProgram(simProg)
        setupAttrib(simProg)
        gl.uniform2f(u_texelSize, 1.0 / SIM_W, 1.0 / SIM_H)
        gl.uniform1f(u_dt, 1.0)
        gl.uniform1f(u_dU, 0.16)
        gl.uniform1f(u_dV, 0.08)
        gl.uniform1f(u_feed, 0.038) // solitary spots, deeper kill — discrete, no replication
        gl.uniform1f(u_kill, 0.063)
        gl.uniform2f(u_cursor_sim, tap.x, tap.y)
        gl.uniform1f(u_inject, 1.0) // taps inject at full strength
        gl.uniform1f(u_aspect_sim, aspect)
        gl.uniform1f(u_injectRadius, tap.radius)

        gl.viewport(0, 0, SIM_W, SIM_H)
        for (let i = 0; i < tap.stepsRemaining; i++) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, fboB)
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, texA)
          gl.uniform1i(u_state_sim, 0)
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
          const tmpT = texA, tmpF = fboA
          texA = texB; fboA = fboB
          texB = tmpT; fboB = tmpF
        }
        pendingTaps.shift()
      }

      // normal sim steps (with drag cursor if active)
      gl.useProgram(simProg)
      setupAttrib(simProg)
      gl.uniform2f(u_texelSize, 1.0 / SIM_W, 1.0 / SIM_H)
      gl.uniform1f(u_dt, 1.0)
      gl.uniform1f(u_dU, 0.16)
      gl.uniform1f(u_dV, 0.08)
      gl.uniform1f(u_feed, 0.038)
      gl.uniform1f(u_kill, 0.063)
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
