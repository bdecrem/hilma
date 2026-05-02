'use client'

import { useEffect, useRef } from 'react'

// L62 — mercury. ray-marched signed-distance-field of a soft metaball cluster.
// Step from L61 (volumetric noise — no surface) to actual 3D geometry with
// an explicit smooth surface. Five spheres orbit a center at different
// frequencies; the SDF combines them via cubic-polynomial smooth-min so they
// merge into a single morphing blob — like a drop of mercury that won't
// settle. Per pixel: march a ray; on hit, estimate the normal via 6-tap
// finite differences, compute Lambert diffuse from a cursor-driven light,
// add a soft shadow ray, mix cream by diffuse and shift toward LIME by a
// Fresnel rim term. Drag X = orbit camera around y-axis. Tap = kick (each
// sphere gets a brief radial impulse so the blob "shudders" before resettling
// into its orbit).
//
// Performance: 80 march steps × 5 sphere evals + 6-tap normal + 24-step
// soft shadow at hits. DPR clamped at 0.6 mobile / 0.85 desktop.

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
uniform vec2 u_cursor;          // 0..1 UV
uniform float u_time;
uniform float u_pulse;          // 0..1 from tap, decays
uniform float u_camYaw;
out vec4 fragColor;

vec3 rotY(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

// cubic polynomial smooth-min — merges shapes with a soft transition of width k
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * h * k * (1.0 / 6.0);
}

// 5-sphere orbiting cluster — positions depend on time and pulse (kick adds
// a radial breathing on top of the orbit so the blob shudders briefly)
vec3 spherePos(int i, float t, float pulse) {
  float ti = t + float(i) * 1.7;
  float speed = 0.55 + float(i) * 0.13;
  float radius = 0.55 + 0.18 * sin(t * 0.31 + float(i) * 2.1);
  // pulse: brief outward bump on tap
  radius *= 1.0 + pulse * 0.45;
  float ang1 = ti * speed;
  float ang2 = ti * speed * 0.73 + float(i);
  return vec3(
    cos(ang1) * radius,
    sin(ang2) * radius * 0.65,
    sin(ang1) * radius
  );
}

float sdMercury(vec3 p) {
  // base sphere at origin (the "core") so the cluster never fully separates
  float d = sdSphere(p, 0.25);
  float sphereR = 0.36;
  // smooth-min in 5 orbiting spheres
  d = smin(d, sdSphere(p - spherePos(0, u_time, u_pulse), sphereR), 0.42);
  d = smin(d, sdSphere(p - spherePos(1, u_time, u_pulse), sphereR), 0.42);
  d = smin(d, sdSphere(p - spherePos(2, u_time, u_pulse), sphereR), 0.42);
  d = smin(d, sdSphere(p - spherePos(3, u_time, u_pulse), sphereR), 0.42);
  d = smin(d, sdSphere(p - spherePos(4, u_time, u_pulse), sphereR), 0.42);
  return d;
}

// 6-tap normal estimation via finite differences
vec3 estimateNormal(vec3 p) {
  float e = 0.002;
  vec2 h = vec2(e, 0.0);
  return normalize(vec3(
    sdMercury(p + h.xyy) - sdMercury(p - h.xyy),
    sdMercury(p + h.yxy) - sdMercury(p - h.yxy),
    sdMercury(p + h.yyx) - sdMercury(p - h.yyx)
  ));
}

// soft shadow ray — march toward the light, accumulate min(d/t) along the way
float softShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
  float res = 1.0;
  float t = mint;
  for (int i = 0; i < 24; i++) {
    if (t > maxt) break;
    float h = sdMercury(ro + rd * t);
    if (h < 0.001) return 0.0;
    res = min(res, k * h / t);
    t += h;
  }
  return clamp(res, 0.0, 1.0);
}

void main() {
  vec2 uv = v_uv;
  vec2 ndc = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.0;

  // camera orbits the cluster at distance 3
  vec3 camPos = rotY(vec3(0.0, 0.5, 3.0), u_camYaw);
  vec3 forward = normalize(-camPos);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
  vec3 up = cross(forward, right);
  vec3 rayDir = normalize(forward + ndc.x * right + ndc.y * up);

  // light position — cursor projected onto a plane in front of the camera
  vec2 curND = (u_cursor - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.2;
  vec3 lightPos = camPos + forward * 1.4 + right * curND.x + up * curND.y;

  // ray march
  float t = 0.0;
  bool hit = false;
  vec3 hitP = vec3(0.0);
  for (int i = 0; i < 80; i++) {
    vec3 p = camPos + rayDir * t;
    float d = sdMercury(p);
    if (d < 0.001) {
      hit = true;
      hitP = p;
      break;
    }
    if (t > 8.0) break;
    t += d;
  }

  vec3 col = vec3(0.0);
  if (hit) {
    vec3 normal = estimateNormal(hitP);
    vec3 toLight = normalize(lightPos - hitP);
    float lightDist = length(lightPos - hitP);
    float diffuse = max(dot(normal, toLight), 0.0);
    // soft shadow — march from just-above-surface toward the light
    float shadow = softShadow(hitP + normal * 0.01, toLight, 0.02, lightDist, 12.0);
    // ambient occlusion-ish: tiny dimming on the side away from light
    float ambient = 0.18;
    // Fresnel rim — cream surface with a lime edge glow
    float fresnel = pow(1.0 - max(dot(normal, -rayDir), 0.0), 3.0);

    vec3 cream = vec3(0.91);
    vec3 lime = vec3(0.776, 1.0, 0.235);

    col = cream * (ambient + diffuse * shadow * 0.85);
    col = mix(col, lime, clamp(fresnel * 0.65 + u_pulse * 0.25, 0.0, 1.0));
    // light pop on tap
    col += lime * u_pulse * fresnel * 0.4;
  }

  // gentle vignette
  float vig = smoothstep(1.55, 0.6, length((uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0)));
  col *= mix(0.5, 1.0, vig);

  fragColor = vec4(col, 1.0);
}`

export default function L62Page() {
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
      // soft drone — three detuned sines on D / A / D
      for (const f of [73.42, 110, 146.83]) {
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
        if (age < 1.6) pulse = (1 - age / 1.6) * Math.exp(-age * 0.6)
        else pulseStart = -1
      }

      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform2f(uCursor, cursorX, cursorY)
      gl.uniform1f(uTime, t)
      gl.uniform1f(uPulse, pulse)
      gl.uniform1f(uCamYaw, camYaw)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      if (audioActive && audioCtx && lp) {
        const targetCutoff = 800 + pulse * 1600
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
          ENVIRONMENT · L62 · SDF
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
            L62.
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
            it can&apos;t decide on a shape.
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
            DRAG · ORBIT &nbsp; TAP · SHUDDER
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
