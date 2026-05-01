'use client'

import { useEffect, useRef } from 'react'

// L61 — nimbus. ray-marched volumetric noise.
// Single-pass WebGL2 fragment shader. For each pixel, march a ray from the
// camera through a 3D noise volume (3 octaves of value noise on an 8-corner
// trilinear-interpolated cube). At each step, sample density; if above
// threshold, sample again toward the light direction (the cursor) for a
// cheap soft-shadow / scattering term, mix cream→lime by light contribution,
// and accumulate front-to-back into RGBA. Drag X = orbit camera around the
// volume Y axis. Tap = bloom: brief brightness surge that pushes through
// the volume from the cursor side. Audio: ambient drone with cutoff that
// rises briefly on each tap.
//
// Performance: render scaled at min(DPR, 0.6) on mobile, 0.85 on desktop.
// 3 octaves × 40 ray steps × per-pixel = a lot of math; the DPR clamp keeps
// it at 60fps on modern hardware.

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
uniform vec2 u_cursor;          // 0..1 in UV
uniform float u_time;
uniform float u_pulse;
uniform float u_camYaw;
out vec4 fragColor;

// 3D hash + value noise — trilinear interpolation over the unit cube
float hash3(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash3(i + vec3(0,0,0));
  float n100 = hash3(i + vec3(1,0,0));
  float n010 = hash3(i + vec3(0,1,0));
  float n110 = hash3(i + vec3(1,1,0));
  float n001 = hash3(i + vec3(0,0,1));
  float n101 = hash3(i + vec3(1,0,1));
  float n011 = hash3(i + vec3(0,1,1));
  float n111 = hash3(i + vec3(1,1,1));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}
float fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  // 3 octaves — keep it tractable
  v += a * vnoise3(p); p *= 2.04; a *= 0.5;
  v += a * vnoise3(p); p *= 2.04; a *= 0.5;
  v += a * vnoise3(p);
  return v;
}

// rotate vector around y-axis
vec3 rotY(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

void main() {
  vec2 uv = v_uv;
  vec2 ndc = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.0;

  // camera setup — orbits around y-axis. fixed distance from origin.
  vec3 camPos = rotY(vec3(0.0, 0.4, 3.0), u_camYaw);
  vec3 forward = normalize(-camPos);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
  vec3 up = cross(forward, right);
  vec3 rayDir = normalize(forward + ndc.x * right + ndc.y * up);

  // cursor → world-ish light position. project cursor onto a plane in front of camera.
  vec2 curND = (u_cursor - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.2;
  vec3 lightPos = camPos + forward * 1.5 + right * curND.x + up * curND.y;

  // ray march through the volume
  vec4 acc = vec4(0.0);
  float t = 0.0;
  float STEP = 0.08;
  float driftZ = u_time * 0.05; // gentle volume drift over time

  for (int i = 0; i < 40; i++) {
    vec3 p = camPos + rayDir * t;
    // limit volume to a soft sphere of radius ~1.4 so it doesn't fill infinity
    float wallSoft = smoothstep(1.6, 0.4, length(p));
    if (wallSoft <= 0.0) { t += STEP; continue; }

    float n = fbm3(p * 1.1 + vec3(0.0, 0.0, driftZ));
    float density = smoothstep(0.45, 0.78, n) * wallSoft;

    if (density > 0.005) {
      // cheap soft-shadow toward the light
      vec3 toLight = normalize(lightPos - p);
      float lightSample = fbm3(p * 1.1 + toLight * 0.55 + vec3(0.0, 0.0, driftZ));
      float lightDensity = smoothstep(0.45, 0.78, lightSample);
      // light reaches us if density toward light is low
      float lightTrans = exp(-lightDensity * 1.6);
      float dC = length(lightPos - p);
      float lightAtten = exp(-dC * dC * 0.35) + u_pulse * 0.6 * exp(-dC * dC * 0.7);

      vec3 cream = vec3(0.91);
      vec3 lime  = vec3(0.776, 1.000, 0.235);
      vec3 col = mix(cream * 0.55, lime, clamp(lightAtten * lightTrans * 0.85, 0.0, 1.0));
      // brighten by direct light reach
      col *= 0.55 + lightTrans * lightAtten * 0.85;

      // front-to-back compositing
      float a = density * STEP * 4.5;
      acc.rgb += (1.0 - acc.a) * a * col;
      acc.a   += (1.0 - acc.a) * a;
      if (acc.a > 0.985) break;
    }
    t += STEP;
    if (t > 5.0) break;
  }

  // gentle vignette pulls edges back toward FIELD
  float vig = smoothstep(1.55, 0.6, length((uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0)));
  acc.rgb *= mix(0.45, 1.0, vig);

  fragColor = vec4(acc.rgb, 1.0);
}`

export default function L61Page() {
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
    const uCamYaw = gl.getUniformLocation(prog, 'u_camYaw')

    // performance — ray-marching is heavy. low DPR.
    const isMobile = window.matchMedia('(max-width: 600px)').matches
    const DPR_CAP = isMobile ? 0.6 : 0.85
    const DPR = Math.min(window.devicePixelRatio || 1, DPR_CAP)

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
    let camYaw = 0.4
    let down = false
    let downX = 0,
      downY = 0,
      downT = 0,
      lastDragX = 0,
      moved = false

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      cursorX = (e.clientX - r.left) / r.width
      cursorY = 1 - (e.clientY - r.top) / r.height
    }
    const onDown = (e: PointerEvent) => {
      down = true
      moved = false
      const r = canvas.getBoundingClientRect()
      downX = e.clientX - r.left
      downY = e.clientY - r.top
      lastDragX = downX
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
        const dx = x - lastDragX
        camYaw -= dx * 0.006
        lastDragX = x
        if (Math.abs(x - downX) > 6) moved = true
      }
      onMove(e)
    }
    const onUp = (e: PointerEvent) => {
      down = false
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {}
      const dur = performance.now() - downT
      if (!moved && dur < 350) pulseStart = performance.now() / 1000
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMoveDrag)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    // audio — soft drone, cutoff opens on tap
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
      masterGain.gain.linearRampToValueAtTime(0.16, audioCtx.currentTime + 4)
      lp = audioCtx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 1200
      lp.Q.value = 0.5
      lp.connect(masterGain)
      masterGain.connect(audioCtx.destination)
      // 4 detuned sines on A1/E2/A2 — slow drone
      for (const f of [55, 82.5, 110]) {
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
        if (age < 1.4) pulse = (1 - age / 1.4) * Math.exp(-age * 0.7)
        else pulseStart = -1
      }

      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform2f(uCursor, cursorX, cursorY)
      gl.uniform1f(uTime, t)
      gl.uniform1f(uPulse, pulse)
      gl.uniform1f(uCamYaw, camYaw)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      if (audioActive && audioCtx && lp) {
        const targetCutoff = 1100 + pulse * 1500
        lp.frequency.setTargetAtTime(targetCutoff, audioCtx.currentTime, 0.2)
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
        <canvas ref={canvasRef} style={{ display: 'block', touchAction: 'none', cursor: 'crosshair' }} />

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
          ENVIRONMENT · L61 · VOLUMETRIC
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
            L61.
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
            you can look into it.
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
            DRAG · ORBIT &nbsp; TAP · BLOOM
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
