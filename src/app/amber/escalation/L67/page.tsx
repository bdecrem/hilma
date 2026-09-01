'use client'

import { useEffect, useRef } from 'react'

// L67 — stable fluids. Step in the rendering arc:
// L65 introduced state (one chemistry field, ping-pong).
// L66 introduced agents (a particle texture reading/writing a trail field).
// L67 introduces a COUPLED solver: velocity, pressure, divergence, curl and
// ink are separate fields that constrain each other every frame. The
// velocity field must stay divergence-free (incompressible), which is
// enforced by an iterative Jacobi pressure solve (20 passes) followed by a
// gradient subtraction. Everything is then advected semi-Lagrangian style
// through the corrected velocity. ~30 shader passes per frame.
//
// Ink carries two channels: density (R) and freshness (G). Freshness decays
// faster than density, so what you just stirred is lime and cools to cream
// as it ages and mixes — signal fades into body.
//
// Drag = stir (velocity + fresh ink along the stroke).
// Tap  = drop (a radial burst + a fresh spot of ink).
// Ambient drips (cream, already cooled) keep the water moving at rest.

const BASE_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
uniform vec2 texelSize;
void main() {
  vUv = a_pos * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

// ────────────────────── shader sources ──────────────────────

// Copy — used when resizing framebuffers.
const COPY_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uTexture;
out vec4 fragColor;
void main() {
  fragColor = texture(uTexture, vUv);
}`

// Clear — multiplies a field by a constant (pressure dissipation).
const CLEAR_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uTexture;
uniform float value;
out vec4 fragColor;
void main() {
  fragColor = value * texture(uTexture, vUv);
}`

// Splat — add a gaussian blob to a field. Two modes:
//   radial = 0 : add a constant vector/color (stir, ink)
//   radial = 1 : add an outward radial velocity (drop)
const SPLAT_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
uniform float radial;
out vec4 fragColor;
void main() {
  vec2 p = vUv - point.xy;
  p.x *= aspectRatio;
  float g = exp(-dot(p, p) / radius);
  vec3 splat;
  if (radial > 0.5) {
    splat = vec3(p * (color.x / sqrt(radius)) * g, 0.0);
  } else {
    splat = g * color;
  }
  vec3 base = texture(uTarget, vUv).xyz;
  fragColor = vec4(base + splat, 1.0);
}`

// Advection — semi-Lagrangian: trace back along the velocity, sample there.
// dissipation is per-channel so ink density and freshness can decay at
// different rates.
const ADVECTION_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform vec4 dissipation;
out vec4 fragColor;
void main() {
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
  vec4 result = texture(uSource, coord);
  fragColor = result / (1.0 + dissipation * dt);
}`

// Divergence of the velocity field, with reflecting walls.
const DIVERGENCE_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uVelocity;
out vec4 fragColor;
void main() {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}`

// Curl (2D vorticity scalar) of the velocity field.
const CURL_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uVelocity;
out vec4 fragColor;
void main() {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  fragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}`

// Vorticity confinement — push velocity toward the curl gradient so small
// swirls that numerical diffusion would smear are re-energized.
const VORTICITY_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
out vec4 fragColor;
void main() {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity += force * dt;
  velocity = clamp(velocity, vec2(-1000.0), vec2(1000.0));
  fragColor = vec4(velocity, 0.0, 1.0);
}`

// Jacobi pressure iteration — one relaxation step of ∇²p = ∇·u.
const PRESSURE_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
out vec4 fragColor;
void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float divergence = texture(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}`

// Gradient subtract — u ← u − ∇p makes the field divergence-free.
const GRADIENT_SUBTRACT_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
out vec4 fragColor;
void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  fragColor = vec4(velocity, 0.0, 1.0);
}`

// Display — ink density → cream with a film response, freshness → lime,
// density gradient → faint relief shading, temporal grain, vignette.
const DISPLAY_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uDye;
uniform vec2 texelSize;
uniform vec2 uResolution;
uniform vec2 uCursor;
uniform float uPulse;
uniform float uTime;
out vec4 fragColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec3 d = texture(uDye, vUv).xyz;
  float ink = max(d.x, 0.0);
  float fresh = clamp(d.y / max(d.x, 0.002), 0.0, 1.0);

  // film response — dense ink saturates softly instead of clipping
  float b = 1.0 - exp(-ink * 2.8);
  b = smoothstep(0.03, 0.95, b);

  // relief shading from the density gradient
  float lx = texture(uDye, vL).x;
  float rx = texture(uDye, vR).x;
  float tx = texture(uDye, vT).x;
  float bx = texture(uDye, vB).x;
  vec3 n = normalize(vec3(rx - lx, tx - bx, length(texelSize)));
  float diffuse = clamp(dot(n, vec3(0.0, 0.0, 1.0)) + 0.7, 0.7, 1.0);

  vec3 field = vec3(0.039);
  vec3 cream = vec3(0.91);
  vec3 lime = vec3(0.776, 1.0, 0.235);

  vec3 col = mix(cream, lime, smoothstep(0.15, 0.7, fresh)) * b * diffuse;

  // tap pulse halo
  vec2 p = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * 2.0;
  vec2 cursorP = (uCursor - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * 2.0;
  float pd = length(p - cursorP);
  float halo = uPulse * exp(-pd * pd * 1.2);
  float core = uPulse * exp(-pd * pd * 7.0);
  col = mix(col, col * (1.0 + lime * 0.5), halo * 0.4);
  col += lime * core * 0.22;

  col = field + col;

  // temporal grain — the water has a surface
  col += (hash(gl_FragCoord.xy + fract(uTime) * 17.0) - 0.5) * 0.022;

  float vig = smoothstep(1.55, 0.6, length((vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0)));
  col *= mix(0.6, 1.0, vig);
  fragColor = vec4(col, 1.0);
}`

// ────────────────────── tuning ──────────────────────

const SIM_RES_MOBILE = 128
const SIM_RES_DESKTOP = 256
const DYE_RES_MOBILE = 640
const DYE_RES_DESKTOP = 1024
const PRESSURE_ITERATIONS = 20
const CURL = 30
const PRESSURE_DISSIPATION = 0.8
const VELOCITY_DISSIPATION = 0.2
const INK_DISSIPATION = 0.4      // density — ink clears in ~10s, the water stays black
const FRESH_DISSIPATION = 0.85   // freshness — lime while you stir, cream ~4s after you stop
const SPLAT_FORCE = 5000
const SPLAT_RADIUS = 0.0018      // velocity blob, in (short-side fraction)²
const INK_RADIUS_SCALE = 0.16    // ink blob is much narrower than the velocity blob — threads, not smoke

interface FBO {
  texture: WebGLTexture
  fbo: WebGLFramebuffer
  width: number
  height: number
  texelSizeX: number
  texelSizeY: number
  attach: (id: number) => number
}

interface DoubleFBO {
  width: number
  height: number
  texelSizeX: number
  texelSizeY: number
  read: FBO
  write: FBO
  swap: () => void
}

interface Splat {
  x: number
  y: number
  dx: number
  dy: number
  amount: number
  fresh: number
  rScale: number
  radial: number // 0 = directional, >0 = radial burst strength
}

export default function L67Page() {
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
    const ext = gl.getExtension('EXT_color_buffer_float')
    if (!ext) {
      if (fallbackRef.current) {
        fallbackRef.current.style.display = 'flex'
        fallbackRef.current.textContent = 'this piece needs WebGL2 with EXT_color_buffer_float.'
      }
      return
    }

    // ── program helpers ──
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        // eslint-disable-next-line no-console
        console.error('Shader error:', gl.getShaderInfoLog(sh))
      }
      return sh
    }
    const baseVs = compile(gl.VERTEX_SHADER, BASE_VERT)
    const makeProgram = (fragSrc: string) => {
      const p = gl.createProgram()!
      gl.attachShader(p, baseVs)
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragSrc))
      gl.linkProgram(p)
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        // eslint-disable-next-line no-console
        console.error('Link error:', gl.getProgramInfoLog(p))
      }
      const uniforms: Record<string, WebGLUniformLocation | null> = {}
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(p, i)
        if (info) uniforms[info.name] = gl.getUniformLocation(p, info.name)
      }
      return { program: p, uniforms, bind: () => gl.useProgram(p) }
    }

    const copyProg = makeProgram(COPY_FRAG)
    const clearProg = makeProgram(CLEAR_FRAG)
    const splatProg = makeProgram(SPLAT_FRAG)
    const advectionProg = makeProgram(ADVECTION_FRAG)
    const divergenceProg = makeProgram(DIVERGENCE_FRAG)
    const curlProg = makeProgram(CURL_FRAG)
    const vorticityProg = makeProgram(VORTICITY_FRAG)
    const pressureProg = makeProgram(PRESSURE_FRAG)
    const gradientProg = makeProgram(GRADIENT_SUBTRACT_FRAG)
    const displayProg = makeProgram(DISPLAY_FRAG)

    // fullscreen quad — one VAO, attribute location 0 in every program
    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)
    const quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    const blit = (target: FBO | null) => {
      if (target === null) {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      } else {
        gl.viewport(0, 0, target.width, target.height)
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    // ── framebuffers ──
    const createFBO = (
      w: number,
      h: number,
      internalFormat: number,
      format: number,
      type: number,
      filter: number,
    ): FBO => {
      gl.activeTexture(gl.TEXTURE0)
      const texture = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null)
      const fbo = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
      gl.viewport(0, 0, w, h)
      gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      return {
        texture,
        fbo,
        width: w,
        height: h,
        texelSizeX: 1 / w,
        texelSizeY: 1 / h,
        attach(id: number) {
          gl.activeTexture(gl.TEXTURE0 + id)
          gl.bindTexture(gl.TEXTURE_2D, texture)
          return id
        },
      }
    }
    const createDoubleFBO = (
      w: number,
      h: number,
      internalFormat: number,
      format: number,
      type: number,
      filter: number,
    ): DoubleFBO => {
      let fbo1 = createFBO(w, h, internalFormat, format, type, filter)
      let fbo2 = createFBO(w, h, internalFormat, format, type, filter)
      return {
        width: w,
        height: h,
        texelSizeX: fbo1.texelSizeX,
        texelSizeY: fbo1.texelSizeY,
        get read() {
          return fbo1
        },
        set read(v: FBO) {
          fbo1 = v
        },
        get write() {
          return fbo2
        },
        set write(v: FBO) {
          fbo2 = v
        },
        swap() {
          const t = fbo1
          fbo1 = fbo2
          fbo2 = t
        },
      }
    }
    const deleteFBO = (f: FBO) => {
      gl.deleteTexture(f.texture)
      gl.deleteFramebuffer(f.fbo)
    }
    const resizeFBO = (
      target: FBO,
      w: number,
      h: number,
      internalFormat: number,
      format: number,
      type: number,
      filter: number,
    ) => {
      const newFBO = createFBO(w, h, internalFormat, format, type, filter)
      copyProg.bind()
      gl.uniform1i(copyProg.uniforms.uTexture, target.attach(0))
      blit(newFBO)
      deleteFBO(target)
      return newFBO
    }
    const resizeDoubleFBO = (
      target: DoubleFBO,
      w: number,
      h: number,
      internalFormat: number,
      format: number,
      type: number,
      filter: number,
    ) => {
      if (target.width === w && target.height === h) return target
      target.read = resizeFBO(target.read, w, h, internalFormat, format, type, filter)
      deleteFBO(target.write)
      target.write = createFBO(w, h, internalFormat, format, type, filter)
      target.width = w
      target.height = h
      target.texelSizeX = 1 / w
      target.texelSizeY = 1 / h
      return target
    }

    const isMobile = window.matchMedia('(max-width: 600px)').matches
    const SIM_RES = isMobile ? SIM_RES_MOBILE : SIM_RES_DESKTOP
    const DYE_RES = isMobile ? DYE_RES_MOBILE : DYE_RES_DESKTOP

    const getResolution = (resolution: number) => {
      let aspect = gl.drawingBufferWidth / gl.drawingBufferHeight
      if (aspect < 1) aspect = 1 / aspect
      const min = Math.round(resolution)
      const max = Math.round(resolution * aspect)
      return gl.drawingBufferWidth > gl.drawingBufferHeight
        ? { width: max, height: min }
        : { width: min, height: max }
    }

    // canvas size — display pass is one texture sample, so DPR can be generous
    const DPR = Math.min(window.devicePixelRatio || 1, isMobile ? 1.0 : 1.5)
    const sizeCanvas = () => {
      const W = window.innerWidth
      const H = window.innerHeight
      canvas.width = Math.max(1, Math.floor(W * DPR))
      canvas.height = Math.max(1, Math.floor(H * DPR))
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
    }
    sizeCanvas()

    let simRes = getResolution(SIM_RES)
    let dyeRes = getResolution(DYE_RES)

    let dye = createDoubleFBO(dyeRes.width, dyeRes.height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR)
    let velocity = createDoubleFBO(simRes.width, simRes.height, gl.RG16F, gl.RG, gl.HALF_FLOAT, gl.LINEAR)
    let divergence = createFBO(simRes.width, simRes.height, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.NEAREST)
    let curl = createFBO(simRes.width, simRes.height, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.NEAREST)
    let pressure = createDoubleFBO(simRes.width, simRes.height, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.NEAREST)

    const initFramebuffers = () => {
      simRes = getResolution(SIM_RES)
      dyeRes = getResolution(DYE_RES)
      dye = resizeDoubleFBO(dye, dyeRes.width, dyeRes.height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR)
      velocity = resizeDoubleFBO(velocity, simRes.width, simRes.height, gl.RG16F, gl.RG, gl.HALF_FLOAT, gl.LINEAR)
      if (divergence.width !== simRes.width || divergence.height !== simRes.height) {
        deleteFBO(divergence)
        deleteFBO(curl)
        divergence = createFBO(simRes.width, simRes.height, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.NEAREST)
        curl = createFBO(simRes.width, simRes.height, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.NEAREST)
        pressure = resizeDoubleFBO(pressure, simRes.width, simRes.height, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.NEAREST)
      }
    }

    const onResize = () => {
      sizeCanvas()
      initFramebuffers()
    }
    window.addEventListener('resize', onResize)

    // ── splats ──
    const splatQueue: Splat[] = []
    const aspect = () => canvas.width / canvas.height
    // radius is in (short-side fraction)²; in portrait the short side is width
    const correctRadius = (r: number) => {
      const a = aspect()
      return a < 1 ? r * a * a : r
    }
    // deltas → short-side units so a stroke feels the same on every screen
    const correctDelta = (dx: number, dy: number): [number, number] => {
      const a = aspect()
      return a > 1 ? [dx * a, dy] : [dx, dy / a]
    }

    const applySplat = (s: Splat) => {
      const r = correctRadius(SPLAT_RADIUS * s.rScale)
      splatProg.bind()
      gl.uniform1i(splatProg.uniforms.uTarget, velocity.read.attach(0))
      gl.uniform1f(splatProg.uniforms.aspectRatio, aspect())
      gl.uniform2f(splatProg.uniforms.point, s.x, s.y)
      if (s.radial > 0) {
        gl.uniform3f(splatProg.uniforms.color, s.radial, 0, 0)
        gl.uniform1f(splatProg.uniforms.radial, 1)
      } else {
        gl.uniform3f(splatProg.uniforms.color, s.dx * SPLAT_FORCE, s.dy * SPLAT_FORCE, 0)
        gl.uniform1f(splatProg.uniforms.radial, 0)
      }
      gl.uniform1f(splatProg.uniforms.radius, r)
      blit(velocity.write)
      velocity.swap()

      if (s.amount > 0) {
        gl.uniform1i(splatProg.uniforms.uTarget, dye.read.attach(0))
        gl.uniform1f(splatProg.uniforms.radial, 0)
        gl.uniform3f(splatProg.uniforms.color, s.amount, s.amount * s.fresh, 0)
        gl.uniform1f(splatProg.uniforms.radius, r * INK_RADIUS_SCALE * (s.radial > 0 ? 1.5 : 1))
        blit(dye.write)
        dye.swap()
      }
    }

    // seed — a handful of cream drips already drifting, and one fresh stroke
    // that shows the gesture once before it cools
    const seed = () => {
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2
        splatQueue.push({
          x: 0.12 + Math.random() * 0.76,
          y: 0.12 + Math.random() * 0.76,
          dx: Math.cos(a) * 0.014,
          dy: Math.sin(a) * 0.014,
          amount: 0.3,
          fresh: 0,
          rScale: 1.4,
          radial: 0,
        })
      }
      const N = 16
      for (let i = 0; i < N; i++) {
        const s = i / (N - 1)
        const x = 0.36 + s * 0.28
        const y = 0.52 + Math.sin(s * Math.PI) * 0.09 - s * 0.06
        const ns = Math.min(1, (i + 1) / (N - 1))
        const nx = 0.36 + ns * 0.28
        const ny = 0.52 + Math.sin(ns * Math.PI) * 0.09 - ns * 0.06
        splatQueue.push({ x, y, dx: (nx - x) * 0.9, dy: (ny - y) * 0.9, amount: 0.12, fresh: 1, rScale: 1, radial: 0 })
      }
    }
    seed()

    // ── interaction ──
    interface Pointer {
      x: number
      y: number
      downX: number
      downY: number
      downT: number
      moved: boolean
    }
    const pointers = new Map<number, Pointer>()
    let cursorX = -1
    let cursorY = -1
    let pulseStart = -1
    let energy = 0

    const toUv = (clientX: number, clientY: number): [number, number] => {
      const r = canvas.getBoundingClientRect()
      return [(clientX - r.left) / r.width, 1 - (clientY - r.top) / r.height]
    }

    const pointerDown = (id: number, clientX: number, clientY: number) => {
      const [x, y] = toUv(clientX, clientY)
      pointers.set(id, { x, y, downX: clientX, downY: clientY, downT: performance.now(), moved: false })
      ensureAudio()
    }
    const pointerMove = (id: number, clientX: number, clientY: number) => {
      const p = pointers.get(id)
      if (!p) return
      if (Math.abs(clientX - p.downX) > 6 || Math.abs(clientY - p.downY) > 6) p.moved = true
      const [x, y] = toUv(clientX, clientY)
      const [dx, dy] = correctDelta(x - p.x, y - p.y)
      p.x = x
      p.y = y
      if (dx === 0 && dy === 0) return
      splatQueue.push({ x, y, dx, dy, amount: 0.12, fresh: 1, rScale: 1, radial: 0 })
      energy = Math.min(1, energy + Math.hypot(dx, dy) * 28)
    }
    const pointerUp = (id: number) => {
      const p = pointers.get(id)
      if (!p) return
      pointers.delete(id)
      const dur = performance.now() - p.downT
      if (!p.moved && dur < 350) {
        // drop
        cursorX = p.x
        cursorY = p.y
        pulseStart = performance.now() / 1000
        splatQueue.push({ x: p.x, y: p.y, dx: 0, dy: 0, amount: 0.5, fresh: 1, rScale: 2.0, radial: 800 })
        drop()
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      pointerDown(e.pointerId, e.clientX, e.clientY)
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {}
    }
    const onPointerMove = (e: PointerEvent) => pointerMove(e.pointerId, e.clientX, e.clientY)
    const onPointerUp = (e: PointerEvent) => {
      pointerUp(e.pointerId)
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {}
    }
    const onTouchStart = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]
        pointerDown(t.identifier, t.clientX, t.clientY)
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]
        pointerMove(t.identifier, t.clientX, t.clientY)
      }
    }
    const onTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) pointerUp(e.changedTouches[i].identifier)
    }

    const hasPointer = typeof window.PointerEvent !== 'undefined'
    if (hasPointer) {
      canvas.addEventListener('pointerdown', onPointerDown)
      canvas.addEventListener('pointermove', onPointerMove)
      canvas.addEventListener('pointerup', onPointerUp)
      canvas.addEventListener('pointercancel', onPointerUp)
    } else {
      canvas.addEventListener('touchstart', onTouchStart, { passive: true })
      canvas.addEventListener('touchmove', onTouchMove, { passive: false })
      canvas.addEventListener('touchend', onTouchEnd)
      canvas.addEventListener('touchcancel', onTouchEnd)
    }

    // ── audio ──
    let audioCtx: AudioContext | null = null
    let masterGain: GainNode | null = null
    let lp: BiquadFilterNode | null = null
    let pingOsc: OscillatorNode | null = null
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
      masterGain.gain.linearRampToValueAtTime(0.13, audioCtx.currentTime + 5)
      lp = audioCtx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 800
      lp.Q.value = 0.5
      lp.connect(masterGain)
      masterGain.connect(audioCtx.destination)
      // E-minor drone — E2 / B2 / E3 / G3. lower and darker than L66's C.
      for (const f of [82.41, 123.47, 164.81, 196.0]) {
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
          lfo.frequency.value = 0.04 + Math.random() * 0.06
          const lfoGain = audioCtx.createGain()
          lfoGain.gain.value = 0.05
          lfo.connect(lfoGain)
          lfoGain.connect(g.gain)
          lfo.start()
        }
      }
      // drop voice — a short sine bloop, bypasses the lowpass
      pingOsc = audioCtx.createOscillator()
      pingOsc.type = 'sine'
      pingOsc.frequency.value = 493.88
      pingGain = audioCtx.createGain()
      pingGain.gain.value = 0
      pingOsc.connect(pingGain)
      pingGain.connect(masterGain)
      pingOsc.start()
    }
    const drop = () => {
      if (!audioCtx || !lp || !pingOsc || !pingGain) return
      const now = audioCtx.currentTime
      lp.frequency.cancelScheduledValues(now)
      lp.frequency.setTargetAtTime(2400, now, 0.02)
      lp.frequency.setTargetAtTime(800, now + 0.08, 0.6)
      pingOsc.frequency.cancelScheduledValues(now)
      pingOsc.frequency.setValueAtTime(740, now)
      pingOsc.frequency.exponentialRampToValueAtTime(493.88, now + 0.09)
      pingGain.gain.cancelScheduledValues(now)
      pingGain.gain.setValueAtTime(0.0001, now)
      pingGain.gain.linearRampToValueAtTime(0.09, now + 0.012)
      pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9)
    }

    // ── simulation step ──
    const step = (dt: number) => {
      curlProg.bind()
      gl.uniform2f(curlProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
      gl.uniform1i(curlProg.uniforms.uVelocity, velocity.read.attach(0))
      blit(curl)

      vorticityProg.bind()
      gl.uniform2f(vorticityProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
      gl.uniform1i(vorticityProg.uniforms.uVelocity, velocity.read.attach(0))
      gl.uniform1i(vorticityProg.uniforms.uCurl, curl.attach(1))
      gl.uniform1f(vorticityProg.uniforms.curl, CURL)
      gl.uniform1f(vorticityProg.uniforms.dt, dt)
      blit(velocity.write)
      velocity.swap()

      divergenceProg.bind()
      gl.uniform2f(divergenceProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
      gl.uniform1i(divergenceProg.uniforms.uVelocity, velocity.read.attach(0))
      blit(divergence)

      clearProg.bind()
      gl.uniform1i(clearProg.uniforms.uTexture, pressure.read.attach(0))
      gl.uniform1f(clearProg.uniforms.value, PRESSURE_DISSIPATION)
      blit(pressure.write)
      pressure.swap()

      pressureProg.bind()
      gl.uniform2f(pressureProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
      gl.uniform1i(pressureProg.uniforms.uDivergence, divergence.attach(0))
      for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(pressureProg.uniforms.uPressure, pressure.read.attach(1))
        blit(pressure.write)
        pressure.swap()
      }

      gradientProg.bind()
      gl.uniform2f(gradientProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
      gl.uniform1i(gradientProg.uniforms.uPressure, pressure.read.attach(0))
      gl.uniform1i(gradientProg.uniforms.uVelocity, velocity.read.attach(1))
      blit(velocity.write)
      velocity.swap()

      advectionProg.bind()
      gl.uniform2f(advectionProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY)
      const velId = velocity.read.attach(0)
      gl.uniform1i(advectionProg.uniforms.uVelocity, velId)
      gl.uniform1i(advectionProg.uniforms.uSource, velId)
      gl.uniform1f(advectionProg.uniforms.dt, dt)
      gl.uniform4f(advectionProg.uniforms.dissipation, VELOCITY_DISSIPATION, VELOCITY_DISSIPATION, 0, 0)
      blit(velocity.write)
      velocity.swap()

      gl.uniform1i(advectionProg.uniforms.uVelocity, velocity.read.attach(0))
      gl.uniform1i(advectionProg.uniforms.uSource, dye.read.attach(1))
      gl.uniform4f(advectionProg.uniforms.dissipation, INK_DISSIPATION, FRESH_DISSIPATION, 0, 0)
      blit(dye.write)
      dye.swap()
    }

    const render = (t: number, pulse: number) => {
      displayProg.bind()
      gl.uniform2f(displayProg.uniforms.texelSize, dye.texelSizeX, dye.texelSizeY)
      gl.uniform1i(displayProg.uniforms.uDye, dye.read.attach(0))
      gl.uniform2f(displayProg.uniforms.uResolution, gl.drawingBufferWidth, gl.drawingBufferHeight)
      gl.uniform2f(displayProg.uniforms.uCursor, cursorX, cursorY)
      gl.uniform1f(displayProg.uniforms.uPulse, pulse)
      gl.uniform1f(displayProg.uniforms.uTime, t)
      blit(null)
    }

    // ── render loop ──
    let raf = 0
    const startT = performance.now() / 1000
    let lastNow = performance.now()
    let nextDrip = 2.5 + Math.random() * 2

    const tick = (now: number) => {
      const t = now / 1000 - startT
      const dt = Math.min((now - lastNow) / 1000, 1 / 60)
      lastNow = now

      let pulse = 0
      if (pulseStart > 0) {
        const age = now / 1000 - pulseStart
        if (age < 1.4) pulse = (1 - age / 1.4) * Math.exp(-age * 0.7)
        else pulseStart = -1
      }

      // ambient drips — already cooled, so only your touch is signal
      if (t > nextDrip) {
        const a = Math.random() * Math.PI * 2
        splatQueue.push({
          x: 0.15 + Math.random() * 0.7,
          y: 0.15 + Math.random() * 0.7,
          dx: Math.cos(a) * 0.007,
          dy: Math.sin(a) * 0.007,
          amount: 0.3,
          fresh: 0,
          rScale: 1.4,
          radial: 0,
        })
        nextDrip = t + 2.8 + Math.random() * 2.7
      }

      for (const s of splatQueue) applySplat(s)
      splatQueue.length = 0

      step(dt)
      render(t, pulse)

      // the drone opens with the stir
      energy *= 0.86
      if (lp && audioCtx && pulse === 0) {
        lp.frequency.setTargetAtTime(800 + energy * 1900, audioCtx.currentTime, 0.12)
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
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
      try {
        gl.getExtension('WEBGL_lose_context')?.loseContext()
      } catch {}
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
          ENVIRONMENT · L67 · STABLE FLUIDS
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
            L67.
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
            it keeps moving after you stop.
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
            DRAG · STIR &nbsp; TAP · DROP
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
