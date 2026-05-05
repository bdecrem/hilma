'use client'

import { useEffect, useRef } from 'react'

// L65 — let it grow. Gray-Scott reaction-diffusion via FBO ping-pong.
// step in the rendering arc: L60-L64 were all per-pixel-per-frame
// fragment shaders (functions of x,y,t). L65 introduces actual STATE:
// each pixel's value depends on its previous value and its neighbors,
// updated by writing to one framebuffer while reading from another, then
// swapping. the chemistry: two reagents U and V diffuse at different
// rates and react via U + 2V → 3V; the feed (f) and kill (k) coefficients
// determine which morphology emerges. f=0.0367 / k=0.0649 = "mitosis" —
// dots form, divide, drift, repeat. drag injects activator (V) at the
// cursor — drawing seeds new growth. tap perturbs k briefly so the
// pattern morphology shifts (spots → maze → back). audio: warm slow
// ambient drone in A minor (A2/E3/A3), faint texture noise — drift
// rather than current.

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

// Gray-Scott update step. reads texelU and texelV from current state texture
// (R = U, G = V), writes new (U, V) into the destination texture.
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
uniform vec2 u_cursor;       // 0..1 cursor coords
uniform float u_inject;      // 0..1 — how much V to inject at cursor
uniform float u_aspect;
out vec4 fragColor;

void main() {
  vec2 c = texture(u_state, v_uv).rg;
  float U = c.r;
  float V = c.g;

  // 5-point Laplacian (4-neighbour average minus center, weight 1)
  vec2 t = u_texelSize;
  vec2 n  = texture(u_state, v_uv + vec2( 0.0,  t.y)).rg;
  vec2 s  = texture(u_state, v_uv + vec2( 0.0, -t.y)).rg;
  vec2 e  = texture(u_state, v_uv + vec2( t.x,  0.0)).rg;
  vec2 w  = texture(u_state, v_uv + vec2(-t.x,  0.0)).rg;
  // diagonals at half weight (9-point stencil — smoother)
  vec2 ne = texture(u_state, v_uv + vec2( t.x,  t.y)).rg;
  vec2 nw = texture(u_state, v_uv + vec2(-t.x,  t.y)).rg;
  vec2 se = texture(u_state, v_uv + vec2( t.x, -t.y)).rg;
  vec2 sw = texture(u_state, v_uv + vec2(-t.x, -t.y)).rg;

  vec2 lap = (n + s + e + w) * 0.2 + (ne + nw + se + sw) * 0.05 - c;

  // Gray-Scott: U + 2V → 3V
  float reaction = U * V * V;
  float newU = U + (u_dU * lap.r - reaction + u_feed * (1.0 - U)) * u_dt;
  float newV = V + (u_dV * lap.g + reaction - (u_kill + u_feed) * V) * u_dt;

  // cursor injection — adds V (the activator) inside a small disc
  if (u_inject > 0.0) {
    vec2 d = (v_uv - u_cursor) * vec2(u_aspect, 1.0);
    float r = length(d);
    float strength = smoothstep(0.025, 0.0, r) * u_inject;
    newV = clamp(newV + strength * 0.55, 0.0, 1.0);
    newU = clamp(newU - strength * 0.20, 0.0, 1.0);
  }

  fragColor = vec4(clamp(newU, 0.0, 1.0), clamp(newV, 0.0, 1.0), 0.0, 1.0);
}`

// Display shader. samples V (the activator concentration) and renders a
// monochrome cream-on-night image with a soft cursor pulse glow.
const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_state;
uniform vec2 u_resolution;
uniform vec2 u_cursor;
uniform float u_pulse;
out vec4 fragColor;

void main() {
  float V = texture(u_state, v_uv).g;

  // smoothstep contrast lift — V is roughly 0..0.5, lift midtones
  float b = smoothstep(0.10, 0.45, V);

  // pulse glow at cursor (cream → lime)
  vec2 p = (v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.0;
  vec2 cursorP = (u_cursor - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.0;
  float pulseDist = length(p - cursorP);
  float pulseGlow = u_pulse * exp(-pulseDist * pulseDist * 6.0);

  vec3 cream = vec3(0.91);
  vec3 lime = vec3(0.776, 1.0, 0.235);
  vec3 col = cream * b * 0.95 + lime * pulseGlow * 0.55;

  // gentle vignette
  float vig = smoothstep(1.55, 0.6, length((v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0)));
  col *= mix(0.55, 1.0, vig);

  fragColor = vec4(col, 1.0);
}`

// Seed shader — used once at init to plant a small starter pattern at center.
const SEED_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform float u_aspect;
out vec4 fragColor;
void main() {
  vec2 d = (v_uv - 0.5) * vec2(u_aspect, 1.0);
  float r = length(d);
  // U = 1 everywhere except small patches; V = 0 except small patches
  float seed = smoothstep(0.040, 0.020, r);
  // a few off-center secondary seeds for variety (procedural placement)
  float s2 = smoothstep(0.025, 0.012, length(d - vec2( 0.18, 0.07)));
  float s3 = smoothstep(0.025, 0.012, length(d - vec2(-0.21, -0.13)));
  float s4 = smoothstep(0.025, 0.012, length(d - vec2( 0.05, -0.22)));
  float V0 = clamp(seed * 0.55 + s2 * 0.55 + s3 * 0.55 + s4 * 0.55, 0.0, 0.6);
  float U0 = 1.0 - V0 * 0.6;
  fragColor = vec4(U0, V0, 0.0, 1.0);
}`

export default function L65Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fallbackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false })
    if (!gl) {
      if (fallbackRef.current) fallbackRef.current.style.display = 'flex'
      return
    }

    // Need EXT_color_buffer_float for rendering to RGBA16F texture
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
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        // eslint-disable-next-line no-console
        console.error(gl.getProgramInfoLog(p))
      }
      return p
    }

    const vs = compile(gl.VERTEX_SHADER, VERT)
    const simFs = compile(gl.FRAGMENT_SHADER, SIM_FRAG)
    const dispFs = compile(gl.FRAGMENT_SHADER, DISPLAY_FRAG)
    const seedFs = compile(gl.FRAGMENT_SHADER, SEED_FRAG)
    const simProg = link(vs, simFs)
    const dispProg = link(vs, dispFs)
    const seedProg = link(vs, seedFs)

    // fullscreen quad
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

    const setupAttrib = (prog: WebGLProgram) => {
      gl.useProgram(prog)
      const aPos = gl.getAttribLocation(prog, 'a_pos')
      gl.enableVertexAttribArray(aPos)
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
    }

    // sim resolution — much lower than display for performance
    // Gray-Scott is per-cell-per-frame so this dominates cost
    const isMobile = window.matchMedia('(max-width: 600px)').matches
    const SIM_W = isMobile ? 220 : 360
    const SIM_H = isMobile ? Math.floor((220 * window.innerHeight) / window.innerWidth) : Math.floor((360 * window.innerHeight) / window.innerWidth)
    const aspect = SIM_W / SIM_H

    // create two RGBA16F textures + framebuffers for ping-pong
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

    // seed pass — write starter pattern into texA
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboA)
    gl.viewport(0, 0, SIM_W, SIM_H)
    setupAttrib(seedProg)
    gl.uniform1f(gl.getUniformLocation(seedProg, 'u_aspect'), aspect)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    // display canvas size
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

    // sim uniforms (located once)
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

    setupAttrib(dispProg)
    const u_state_disp = gl.getUniformLocation(dispProg, 'u_state')
    const u_resolution = gl.getUniformLocation(dispProg, 'u_resolution')
    const u_cursor_disp = gl.getUniformLocation(dispProg, 'u_cursor')
    const u_pulse = gl.getUniformLocation(dispProg, 'u_pulse')

    // ────── interaction ──────
    let cursorX = 0.5
    let cursorY = 0.5
    let injecting = 0
    let pulseStart = -1
    let killOffset = 0 // momentary perturbation on tap

    const handleMove = (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect()
      cursorX = (clientX - r.left) / r.width
      cursorY = 1 - (clientY - r.top) / r.height
    }

    let down = false
    let downX = 0, downY = 0, downT = 0, moved = false

    const onPointerDown = (e: PointerEvent) => {
      down = true
      moved = false
      const r = canvas.getBoundingClientRect()
      downX = e.clientX - r.left
      downY = e.clientY - r.top
      downT = performance.now()
      handleMove(e.clientX, e.clientY)
      injecting = 1
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {}
      ensureAudio()
    }
    const onPointerMove = (e: PointerEvent) => {
      if (down) {
        const r = canvas.getBoundingClientRect()
        const x = e.clientX - r.left
        const y = e.clientY - r.top
        if (Math.abs(x - downX) > 6 || Math.abs(y - downY) > 6) moved = true
        injecting = 1
      }
      handleMove(e.clientX, e.clientY)
    }
    const onPointerUp = (e: PointerEvent) => {
      down = false
      injecting = 0
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {}
      const dur = performance.now() - downT
      if (!moved && dur < 350) {
        pulseStart = performance.now() / 1000
        // perturb k briefly — pattern morphology shifts
        killOffset = -0.0035
      }
    }
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)

    // touch fallback
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 0) return
      const t = e.touches[0]
      const r = canvas.getBoundingClientRect()
      down = true
      moved = false
      downX = t.clientX - r.left
      downY = t.clientY - r.top
      downT = performance.now()
      handleMove(t.clientX, t.clientY)
      injecting = 1
      ensureAudio()
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return
      e.preventDefault()
      const t = e.touches[0]
      if (down) {
        const r = canvas.getBoundingClientRect()
        const x = t.clientX - r.left
        const y = t.clientY - r.top
        if (Math.abs(x - downX) > 6 || Math.abs(y - downY) > 6) moved = true
        injecting = 1
      }
      handleMove(t.clientX, t.clientY)
    }
    const onTouchEnd = () => {
      down = false
      injecting = 0
      const dur = performance.now() - downT
      if (!moved && dur < 350) {
        pulseStart = performance.now() / 1000
        killOffset = -0.0035
      }
    }
    canvas.addEventListener('touchstart', onTouchStart, { passive: true })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd)
    canvas.addEventListener('touchcancel', onTouchEnd)

    // ────── audio ──────
    let audioCtx: AudioContext | null = null
    let masterGain: GainNode | null = null
    let lp: BiquadFilterNode | null = null
    let audioActive = false
    const ensureAudio = () => {
      if (audioActive) return
      audioActive = true
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtx = new Ctx()
      masterGain = audioCtx.createGain()
      masterGain.gain.setValueAtTime(0, audioCtx.currentTime)
      masterGain.gain.linearRampToValueAtTime(0.13, audioCtx.currentTime + 5)
      lp = audioCtx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 800
      lp.Q.value = 0.5
      lp.connect(masterGain)
      masterGain.connect(audioCtx.destination)
      // A minor drone — A2/E3/A3 (warmer than L64's C-current)
      for (const f of [55.0, 82.41, 110.0, 164.81]) {
        for (const det of [-9, 7]) {
          const o = audioCtx.createOscillator()
          o.type = 'sine'
          o.frequency.value = f
          o.detune.value = det
          const g = audioCtx.createGain()
          g.gain.value = 0.13
          o.connect(g)
          g.connect(lp)
          o.start()
          const lfo = audioCtx.createOscillator()
          lfo.frequency.value = 0.05 + Math.random() * 0.06
          const lfoGain = audioCtx.createGain()
          lfoGain.gain.value = 0.05
          lfo.connect(lfoGain)
          lfoGain.connect(g.gain)
          lfo.start()
        }
      }
    }

    // ────── render loop ──────
    let raf = 0
    const STEPS_PER_FRAME = 6 // sim is more stable with multiple small steps per frame

    const tick = (now: number) => {
      // pulse decay
      let pulse = 0
      if (pulseStart > 0) {
        const age = now / 1000 - pulseStart
        if (age < 1.2) pulse = (1 - age / 1.2) * Math.exp(-age * 0.7)
        else pulseStart = -1
      }
      // killOffset relaxes back to 0
      killOffset *= 0.95

      // ── simulation steps ──
      gl.useProgram(simProg)
      setupAttrib(simProg)
      gl.uniform2f(u_texelSize, 1.0 / SIM_W, 1.0 / SIM_H)
      gl.uniform1f(u_dt, 1.0)
      gl.uniform1f(u_dU, 0.16)
      gl.uniform1f(u_dV, 0.08)
      gl.uniform1f(u_feed, 0.0367)
      gl.uniform1f(u_kill, 0.0649 + killOffset)
      gl.uniform2f(u_cursor_sim, cursorX, cursorY)
      gl.uniform1f(u_inject, injecting)
      gl.uniform1f(u_aspect_sim, aspect)

      gl.viewport(0, 0, SIM_W, SIM_H)
      for (let i = 0; i < STEPS_PER_FRAME; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fboB)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, texA)
        gl.uniform1i(u_state_sim, 0)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        // swap
        const tmpT = texA, tmpF = fboA
        texA = texB; fboA = fboB
        texB = tmpT; fboB = tmpF
      }

      // ── display pass ──
      gl.useProgram(dispProg)
      setupAttrib(dispProg)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texA)
      gl.uniform1i(u_state_disp, 0)
      gl.uniform2f(u_resolution, canvas.width, canvas.height)
      gl.uniform2f(u_cursor_disp, cursorX, cursorY)
      gl.uniform1f(u_pulse, pulse)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      // master LPF opens slightly on pulse
      if (audioActive && audioCtx && lp) {
        lp.frequency.setTargetAtTime(800 + pulse * 1500, audioCtx.currentTime, 0.18)
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
      canvas.removeEventListener('touchcancel', onTouchEnd)
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
            cursor: 'crosshair',
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
          ENVIRONMENT · L65 · REACTION DIFFUSION
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
            L65.
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
            let it grow.
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
            DRAG · SEED &nbsp; TAP · PERTURB
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
