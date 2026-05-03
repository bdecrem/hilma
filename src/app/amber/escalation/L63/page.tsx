'use client'

import { useEffect, useRef } from 'react'

// L63 — marble. ray-marched glass sphere refracting a domain-warped FBM
// cloud field behind it. step in the rendering arc: L60 = 2D shader (no
// surface), L61 = 3D volumetric (no surface), L62 = 3D opaque surface,
// L63 = 3D refractive surface (light bends through). camera fixed; the
// sphere moves with the cursor across the field. drag = move the marble.
// tap = nudge (brief sphere wobble + lime rim flash). audio: a single
// quiet sine at 880Hz with very slow tremolo — the "ringing" of glass.
//
// Per pixel:
// 1) sample the FBM bg field (cloud)
// 2) ray-test against the sphere SDF
// 3) on hit: estimate normal, refract entry, march to the exit, refract
//    out, sample the bg along the exit direction (offset by a small lens
//    distance) — that's "what you see through the glass"
// 4) Fresnel mix between refraction and the surrounding bg, plus a thin
//    lime edge glow at grazing angles (the marble's rim)
// 5) inside the marble, sample 3D fbm at the entry point's interior to
//    produce a faint cream "swirl" — the colored ribbon inside a real
//    marble.

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
out vec4 fragColor;

// 2D hash + value noise (for bg field)
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

// 3D hash + value noise (for the marble's internal swirl)
float hash3(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), u.x),
        mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), u.x), u.y),
    mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), u.x),
        mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), u.x), u.y),
    u.z
  );
}

// Background field — domain-warped FBM, the L60 weather pattern, drifting
vec3 sampleField(vec2 p) {
  float t = u_time * 0.06;
  vec2 q = vec2(fbm2(p + vec2(t, 0.0)), fbm2(p + vec2(-t, 1.7)));
  vec2 r = vec2(
    fbm2(p + 2.0 * q + vec2(1.7, 9.2)),
    fbm2(p + 2.0 * q + vec2(8.3, 2.8))
  );
  float n = fbm2(p + 3.2 * r);
  float cloud = smoothstep(0.32, 0.78, n);
  vec3 cream = vec3(0.91);
  return cream * cloud * 0.65;
}

void main() {
  vec2 uv = v_uv;
  // aspect-corrected 2D coords
  vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.4;

  // BG: the cloud field (everywhere)
  vec3 bg = sampleField(p);

  // sphere center: cursor position in same coord space, slightly behind the camera plane
  vec2 cursorP = (u_cursor - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.4;
  vec3 sphereC = vec3(cursorP, 0.0);
  // pulse on tap: slight radial breathing
  float radius = 0.7 + u_pulse * 0.05;

  // ray from "camera" at z = -3 toward (p, 0)
  vec3 ro = vec3(p, -3.0);
  vec3 rd = vec3(0.0, 0.0, 1.0); // straight forward — orthographic-ish for simplicity

  // ray-sphere intersection
  vec3 oc = ro - sphereC;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - radius * radius;
  float h = b * b - c;

  vec3 col = bg;

  if (h > 0.0) {
    // hit
    float t1 = -b - sqrt(h);     // entry
    float t2 = -b + sqrt(h);     // exit
    vec3 entryP = ro + rd * t1;
    vec3 exitP  = ro + rd * t2;
    vec3 entryN = (entryP - sphereC) / radius;
    vec3 exitN  = -(exitP - sphereC) / radius;  // flip — pointing inward at exit

    // refract entry (air → glass, IOR ratio 1/1.45)
    vec3 refractedIn = refract(rd, entryN, 1.0 / 1.45);
    // we don't actually march refractedIn through the sphere (cheap approximation):
    // instead, treat the exit direction as the bent ray, sampled at exitP
    vec3 refractedOut = refract(refractedIn, exitN, 1.45);
    // if total internal reflection (refract returned 0), fall back to direction
    if (length(refractedOut) < 0.01) refractedOut = refractedIn;

    // sample the BG at the projected exit point along refractedOut, with a
    // small lens distance — produces the "looking through glass" warp
    vec2 lensSample = exitP.xy + refractedOut.xy * 0.4;
    vec3 throughGlass = sampleField(lensSample);

    // Fresnel — grazing rays reflect more (we approximate "reflection" as
    // mixing in the surrounding bg a bit, since we don't have a env map)
    float fresnel = pow(1.0 - abs(dot(rd, entryN)), 3.0);

    // internal swirl — sample 3D fbm at the entry point's interior coord
    // (gives a faint cream ribbon visible through the glass)
    vec3 swirlSamplePos = entryP * 1.6 + vec3(0.0, 0.0, u_time * 0.07);
    float swirl = vnoise3(swirlSamplePos);
    swirl = smoothstep(0.55, 0.75, swirl) * 0.45;

    col = mix(throughGlass, bg, fresnel * 0.35);
    // add the internal swirl
    col += vec3(0.91) * swirl * (1.0 - fresnel * 0.5);

    // edge rim — lime, mostly at grazing
    vec3 lime = vec3(0.776, 1.0, 0.235);
    col = mix(col, lime, fresnel * 0.55 + u_pulse * fresnel * 0.4);

    // tap pulse: brief overall brightness lift to the marble
    col += vec3(0.05) * u_pulse * (1.0 - fresnel);
  }

  // gentle vignette
  float vig = smoothstep(1.55, 0.6, length((uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0)));
  col *= mix(0.55, 1.0, vig);

  fragColor = vec4(col, 1.0);
}`

export default function L63Page() {
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
    const DPR = Math.min(window.devicePixelRatio || 1, isMobile ? 0.85 : 1.2)

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
    let down = false
    let downX = 0,
      downY = 0,
      downT = 0,
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
      if (!moved && dur < 350) pulseStart = performance.now() / 1000
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMoveDrag)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    // audio — quiet glass tone (single sine 880Hz) with slow tremolo on amplitude
    let audioCtx: AudioContext | null = null
    let masterGain: GainNode | null = null
    let pingGain: GainNode | null = null
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
      masterGain.gain.linearRampToValueAtTime(0.04, audioCtx.currentTime + 4)
      masterGain.connect(audioCtx.destination)
      // continuous quiet glass sine
      const o = audioCtx.createOscillator()
      o.type = 'sine'
      o.frequency.value = 880
      const g = audioCtx.createGain()
      g.gain.value = 0.5
      o.connect(g)
      g.connect(masterGain)
      o.start()
      // tremolo LFO on g.gain
      const lfo = audioCtx.createOscillator()
      lfo.frequency.value = 0.18
      const lfoGain = audioCtx.createGain()
      lfoGain.gain.value = 0.35
      lfo.connect(lfoGain)
      lfoGain.connect(g.gain)
      lfo.start()
      // ping channel for tap — separate gain that surges on pulse
      pingGain = audioCtx.createGain()
      pingGain.gain.value = 0
      const ping = audioCtx.createOscillator()
      ping.type = 'sine'
      ping.frequency.value = 1760
      ping.connect(pingGain)
      pingGain.connect(masterGain)
      ping.start()
    }

    const startT = performance.now() / 1000
    let raf = 0
    const tick = (now: number) => {
      const t = now / 1000 - startT
      let pulse = 0
      if (pulseStart > 0) {
        const age = now / 1000 - pulseStart
        if (age < 1.2) pulse = (1 - age / 1.2) * Math.exp(-age * 0.6)
        else pulseStart = -1
      }

      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform2f(uCursor, cursorX, cursorY)
      gl.uniform1f(uTime, t)
      gl.uniform1f(uPulse, pulse)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      if (audioActive && audioCtx && pingGain) {
        pingGain.gain.setTargetAtTime(pulse * 0.18, audioCtx.currentTime, 0.05)
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
          ENVIRONMENT · L63 · REFRACTION
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
            L63.
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
            look through it.
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
            DRAG · ROLL THE MARBLE &nbsp; TAP · NUDGE
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
