'use client'

import { useEffect, useRef } from 'react'

// L60 — weather. first WebGL piece (the tier-table unlock at L60).
// fullscreen WebGL2 fragment shader running domain-warped FBM noise across
// every pixel each frame. the cursor is a soft point light: areas near the
// cursor lift from cream toward lime; the noise field's brightness is
// modulated by distance to the light too, so the light reveals structure
// in the cloud rather than just sitting on top of it. tap = pulse: the
// light briefly surges and a small lime bloom propagates outward. drag =
// move the light through the field. ambient drone (3 detuned sines, one
// per octave of A) on tap-to-start, master gain tracks total brightness.

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
uniform vec2 u_cursor;          // 0..1 in screen UV (cursorY already flipped)
uniform float u_time;
uniform float u_pulse;          // 0..1, decays after tap
out vec4 fragColor;

// hash + value noise
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.02 + vec2(13.7, 47.3);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = v_uv;
  // aspect-corrected coords
  vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.4;
  float t = u_time * 0.07;

  // domain warp — Iñigo Quílez's classic two-step warp applied to fbm
  vec2 q = vec2(fbm(p + vec2(t, 0.0)), fbm(p + vec2(-t, 1.7)));
  vec2 r = vec2(
    fbm(p + 2.0 * q + vec2(1.7, 9.2) + 0.10 * t),
    fbm(p + 2.0 * q + vec2(8.3, 2.8) - 0.07 * t)
  );
  float n = fbm(p + 3.6 * r);
  // soft contrast — keep some dark, some bright
  float cloud = smoothstep(0.30, 0.78, n);

  // cursor as soft point light
  vec2 cursor = (u_cursor - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.4;
  float dC = length(p - cursor);
  float light = exp(-dC * dC * 0.55);

  // pulse: tighter falloff, brief surge
  float pulse = u_pulse * exp(-dC * dC * 1.4);

  // colors — cream and lime
  vec3 cream = vec3(0.910, 0.910, 0.910);
  vec3 lime  = vec3(0.776, 1.000, 0.235);

  // base color shifts toward lime under the light + pulse
  vec3 col = mix(cream, lime, clamp(light * 0.62 + pulse * 1.3, 0.0, 1.0));
  // brightness: the cloud reveals structure; the light raises the floor near the cursor
  float bright = cloud * (0.55 + light * 0.55) + pulse * 0.45;
  col *= bright;

  // gentle vignette so edges fall to FIELD
  float vig = smoothstep(1.45, 0.55, length((uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0)));
  col *= mix(0.55, 1.0, vig);

  fragColor = vec4(col, 1.0);
}`

export default function L60Page() {
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
      if (!sh) throw new Error('shader create failed')
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
    const prog = gl.createProgram()
    if (!prog) throw new Error('program create failed')
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
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    )
    const aPos = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(prog, 'u_resolution')
    const uCursor = gl.getUniformLocation(prog, 'u_cursor')
    const uTime = gl.getUniformLocation(prog, 'u_time')
    const uPulse = gl.getUniformLocation(prog, 'u_pulse')

    // render-resolution scale: WebGL is fast but fbm is heavy. scale down on
    // hi-DPR so mobile stays smooth.
    const DPR_RAW = window.devicePixelRatio || 1
    const DPR = Math.min(DPR_RAW, 1.5)
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

    let cursorX = 0.55
    let cursorY = 0.55
    let pulseStart = -1

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      cursorX = (e.clientX - r.left) / r.width
      cursorY = 1 - (e.clientY - r.top) / r.height
    }

    let down = false
    let downX = 0,
      downY = 0,
      downT = 0
    let moved = false

    const onDown = (e: PointerEvent) => {
      down = true
      moved = false
      const r = canvas.getBoundingClientRect()
      downX = e.clientX - r.left
      downY = e.clientY - r.top
      downT = performance.now()
      onMove(e)
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {}
      ensureAudio()
    }
    const onMoveDrag = (e: PointerEvent) => {
      if (down) {
        const r = canvas.getBoundingClientRect()
        const x = e.clientX - r.left
        const y = e.clientY - r.top
        if (Math.abs(x - downX) > 6 || Math.abs(y - downY) > 6) moved = true
      }
      onMove(e)
    }
    const onUp = (e: PointerEvent) => {
      down = false
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {}
      const dur = performance.now() - downT
      if (!moved && dur < 350) {
        pulseStart = performance.now() / 1000
      }
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMoveDrag)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    // ──────── audio ────────
    let audioCtx: AudioContext | null = null
    let masterGain: GainNode | null = null
    let bandpass: BiquadFilterNode | null = null
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
      masterGain.gain.linearRampToValueAtTime(0.18, audioCtx.currentTime + 4)

      bandpass = audioCtx.createBiquadFilter()
      bandpass.type = 'lowpass'
      bandpass.frequency.value = 1400
      bandpass.Q.value = 0.5
      bandpass.connect(masterGain)
      masterGain.connect(audioCtx.destination)

      // 3 detuned sines, one per octave of A — soft drone
      for (const f of [55, 110, 165]) {
        for (const det of [-7, 5]) {
          const o = audioCtx.createOscillator()
          o.type = 'sine'
          o.frequency.value = f
          o.detune.value = det
          const g = audioCtx.createGain()
          g.gain.value = 0.18
          o.connect(g)
          g.connect(bandpass)
          o.start()
          // each tone slowly breathes
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
        if (age < 1.4) {
          pulse = (1 - age / 1.4) * Math.exp(-age * 0.7)
        } else {
          pulseStart = -1
        }
      }

      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform2f(uCursor, cursorX, cursorY)
      gl.uniform1f(uTime, t)
      gl.uniform1f(uPulse, pulse)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      // audio modulation — pulse drives the filter cutoff up briefly
      if (audioActive && audioCtx && bandpass && masterGain) {
        const targetCutoff = 1100 + pulse * 1400
        bandpass.frequency.setTargetAtTime(targetCutoff, audioCtx.currentTime, 0.2)
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMoveDrag)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
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
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            touchAction: 'none',
            cursor: 'crosshair',
          }}
        />

        {/* WebGL fallback */}
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
          ENVIRONMENT · L60 · WEBGL
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
            L60.
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
            the field has weather.
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
            DRAG · MOVE THE LIGHT &nbsp; TAP · PULSE
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
