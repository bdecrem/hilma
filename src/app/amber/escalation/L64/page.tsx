'use client'

import { useEffect, useRef } from 'react'

// L64 — current. per-pixel streamline integration through a 2D curl-noise
// vector field. each pixel marches BACKWARD along the field for 24 steps
// (RK1) and accumulates brightness from a separate fbm sample at each step.
// the result: flowing fabric-like patterns where bright cream streaks trace
// where the field has been carrying particles. completely different from
// L60–L63 (which were single-shape rendering): here the entire screen IS
// the field visualization. cursor adds a local vortex source — moves the
// stream around. tap = brief energy injection that brightens a region.

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_resolution;
uniform vec2 u_cursor;
uniform float u_time;
uniform float u_pulse;
out vec4 fragColor;

float hash2(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash2(i + vec2(0.0, 0.0)), hash2(i + vec2(1.0, 0.0)), u.x),
    mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
float fbm2(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise2(p);
    p = p * 2.04 + vec2(13.7, 47.3);
    a *= 0.5;
  }
  return v;
}

// 2D curl noise: rotate the gradient of a scalar field 90° to get a
// divergence-free (incompressible) flow field
vec2 curlNoise(vec2 p, float t) {
  float h = 0.01;
  vec2 drift = vec2(t * 0.04, t * 0.03);
  float n1 = fbm2(p + vec2(0.0, h) + drift);
  float n2 = fbm2(p - vec2(0.0, h) + drift);
  float n3 = fbm2(p + vec2(h, 0.0) + drift);
  float n4 = fbm2(p - vec2(h, 0.0) + drift);
  // curl in 2D: (-∂n/∂y, ∂n/∂x)
  return vec2(-(n1 - n2) / (2.0 * h), (n3 - n4) / (2.0 * h));
}

void main() {
  vec2 uv = v_uv;
  // aspect-corrected coords
  vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.0;
  vec2 cursorP = (u_cursor - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.0;

  // integrate streamline BACKWARD through the field for N steps
  vec2 trail = p;
  float brightness = 0.0;
  float weightSum = 0.0;
  // pulse adds extra brightness near the cursor (visible as a glow that fades)
  float pulseDist = length(p - cursorP);
  float pulseGlow = u_pulse * exp(-pulseDist * pulseDist * 4.0);

  for (int i = 0; i < 24; i++) {
    vec2 v = curlNoise(trail * 1.4, u_time);
    // cursor influence — adds a vortex centered at the cursor
    vec2 toCursor = cursorP - trail;
    float dC = length(toCursor) + 0.001;
    // perpendicular vortex (CCW), falls off with distance
    vec2 vortex = vec2(-toCursor.y, toCursor.x) / dC;
    float vortexStrength = exp(-dC * dC * 2.0) * 0.6;
    v += vortex * vortexStrength;

    // step backward
    trail -= v * 0.02;

    // accumulate brightness from a separate fbm sample at this trail point
    // (older positions contribute less — falloff weight)
    float weight = 1.0 - float(i) / 24.0;
    float sample_ = fbm2(trail * 2.5 + vec2(7.7, 3.1));
    brightness += smoothstep(0.55, 0.85, sample_) * weight;
    weightSum += weight;
  }
  brightness /= weightSum;

  // base color: cream, with lime tint where the cursor pulses
  vec3 cream = vec3(0.91);
  vec3 lime = vec3(0.776, 1.0, 0.235);
  vec3 col = cream * brightness * 0.95 + lime * pulseGlow * 0.7;

  // gentle vignette
  float vig = smoothstep(1.55, 0.6, length((uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0)));
  col *= mix(0.55, 1.0, vig);

  fragColor = vec4(col, 1.0);
}`

export default function L64Page() {
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

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)
      if (!sh) throw new Error('shader create')
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        // eslint-disable-next-line no-console
        console.error(gl.getShaderInfoLog(sh))
      }
      return sh
    }
    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      // eslint-disable-next-line no-console
      console.error(gl.getProgramInfoLog(prog))
    }
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(prog, 'u_resolution')
    const uCursor = gl.getUniformLocation(prog, 'u_cursor')
    const uTime = gl.getUniformLocation(prog, 'u_time')
    const uPulse = gl.getUniformLocation(prog, 'u_pulse')

    const isMobile = window.matchMedia('(max-width: 600px)').matches
    const DPR = Math.min(window.devicePixelRatio || 1, isMobile ? 0.7 : 1.0)

    const resize = () => {
      const W = window.innerWidth
      const H = window.innerHeight
      canvas.width = Math.max(1, Math.floor(W * DPR))
      canvas.height = Math.max(1, Math.floor(H * DPR))
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    window.addEventListener('resize', resize)

    let cursorX = 0.5
    let cursorY = 0.5
    let pulseStart = -1

    const handleMove = (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect()
      cursorX = (clientX - r.left) / r.width
      cursorY = 1 - (clientY - r.top) / r.height
    }
    let down = false
    let downX = 0,
      downY = 0,
      downT = 0,
      moved = false

    const onPointerDown = (e: PointerEvent) => {
      down = true
      moved = false
      const r = canvas.getBoundingClientRect()
      downX = e.clientX - r.left
      downY = e.clientY - r.top
      downT = performance.now()
      handleMove(e.clientX, e.clientY)
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
      }
      handleMove(e.clientX, e.clientY)
    }
    const onPointerUp = (e: PointerEvent) => {
      down = false
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {}
      const dur = performance.now() - downT
      if (!moved && dur < 350) pulseStart = performance.now() / 1000
    }
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)

    // touch fallback (iOS Safari quirks)
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
      }
      handleMove(t.clientX, t.clientY)
    }
    const onTouchEnd = () => {
      down = false
      const dur = performance.now() - downT
      if (!moved && dur < 350) pulseStart = performance.now() / 1000
    }
    canvas.addEventListener('touchstart', onTouchStart, { passive: true })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd)
    canvas.addEventListener('touchcancel', onTouchEnd)

    // audio — slow ambient drone, master gain ramps in on first tap
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
      masterGain.gain.linearRampToValueAtTime(0.14, audioCtx.currentTime + 4)
      lp = audioCtx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 900
      lp.Q.value = 0.5
      lp.connect(masterGain)
      masterGain.connect(audioCtx.destination)
      // 3 detuned voice pairs at C2/G2/C3 — water-current pitched lower than tube/L62
      for (const f of [65.41, 98.0, 130.81]) {
        for (const det of [-7, 5]) {
          const o = audioCtx.createOscillator()
          o.type = 'sine'
          o.frequency.value = f
          o.detune.value = det
          const g = audioCtx.createGain()
          g.gain.value = 0.18
          o.connect(g)
          g.connect(lp)
          o.start()
          const lfo = audioCtx.createOscillator()
          lfo.frequency.value = 0.04 + Math.random() * 0.05
          const lfoGain = audioCtx.createGain()
          lfoGain.gain.value = 0.07
          lfo.connect(lfoGain)
          lfoGain.connect(g.gain)
          lfo.start()
        }
      }
    }

    const startT = performance.now() / 1000
    let raf = 0
    const tick = (now: number) => {
      const t = now / 1000 - startT
      let pulse = 0
      if (pulseStart > 0) {
        const age = now / 1000 - pulseStart
        if (age < 1.4) pulse = (1 - age / 1.4) * Math.exp(-age * 0.7)
        else pulseStart = -1
      }

      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform2f(uCursor, cursorX, cursorY)
      gl.uniform1f(uTime, t)
      gl.uniform1f(uPulse, pulse)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      if (audioActive && audioCtx && lp) {
        lp.frequency.setTargetAtTime(900 + pulse * 1400, audioCtx.currentTime, 0.2)
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
          }}
        >
          this piece needs WebGL2.
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
          ENVIRONMENT · L64 · STREAMLINES
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
            L64.
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
            follow the current.
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
            DRAG · BEND THE FLOW &nbsp; TAP · GLOW
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
