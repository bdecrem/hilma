'use client'

import { useEffect, useRef, useState } from 'react'

// SCENT — L66's Physarum slime-mold simulation paired with chopped-up
// techno. Visual forked verbatim from L66 (16,384 GPU agents). Audio
// is Octatrack-glitch on top of driving Berlin 4/4: a 125 BPM kick all
// the way through, sub-anchored, with two pre-rendered short voices
// (Cm9 stab + sine ping) chopped on every offbeat with random parameter
// locks — variable playback rate (0.7-1.4×), occasional reverse,
// stutter retriggers (3-6 sub-divisions in one step). Everything except
// kick and sub goes through a 6-bit waveshaper + tilt LP at 5kHz for
// grit. The chopped voices darting around over the steady kick = the
// audio analog of agents darting around organizing into a network.
//
// Cursor mapping:
//   drag → bias agent headings toward cursor AND ride master LPF (Y)
//   tap  → scatter fresh agents at cursor AND fire a stutter cluster
//
// Music recipe: vibeceo/jambot/library.json → genres.octatrack_glitch +
// detroit_techno (hybrid). Visual: L66 (Physarum).

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const AGENT_UPDATE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_agents;
uniform sampler2D u_trail;
uniform vec2 u_trailRes;
uniform vec2 u_aspectScale;
uniform float u_senseDist;
uniform float u_senseAngle;
uniform float u_turnAngle;
uniform float u_moveDist;
uniform vec2 u_cursor;
uniform float u_cursorPull;
uniform float u_time;
out vec4 fragColor;

float hash(float n) { return fract(sin(n) * 43758.5453123); }
float sampleTrail(vec2 p) { p = fract(p); return texture(u_trail, p).r; }

void main() {
  vec4 a = texture(u_agents, v_uv);
  float x = a.r;
  float y = a.g;
  float heading = a.b * 6.28318530718;

  vec2 fwd  = vec2(cos(heading),                 sin(heading));
  vec2 lft  = vec2(cos(heading + u_senseAngle),  sin(heading + u_senseAngle));
  vec2 rgt  = vec2(cos(heading - u_senseAngle),  sin(heading - u_senseAngle));

  vec2 senseFwd = vec2(x, y) + fwd * u_senseDist * u_aspectScale;
  vec2 senseLft = vec2(x, y) + lft * u_senseDist * u_aspectScale;
  vec2 senseRgt = vec2(x, y) + rgt * u_senseDist * u_aspectScale;

  float sF = sampleTrail(senseFwd);
  float sL = sampleTrail(senseLft);
  float sR = sampleTrail(senseRgt);

  float turn = 0.0;
  if (sF > sL && sF > sR) turn = 0.0;
  else if (sL > sR) turn = u_turnAngle;
  else if (sR > sL) turn = -u_turnAngle;
  else {
    float r = hash(v_uv.x * 13.37 + v_uv.y * 71.41 + u_time);
    turn = (r - 0.5) * u_turnAngle * 1.5;
  }

  if (u_cursor.x >= 0.0) {
    vec2 toCursor = u_cursor - vec2(x, y);
    if (length(toCursor) > 0.001) {
      float targetHeading = atan(toCursor.y, toCursor.x);
      float dh = mod(targetHeading - heading + 3.14159265, 6.28318530718) - 3.14159265;
      turn += dh * u_cursorPull;
    }
  }

  heading += turn;

  vec2 fwd2 = vec2(cos(heading), sin(heading));
  x += fwd2.x * u_moveDist * u_aspectScale.x;
  y += fwd2.y * u_moveDist * u_aspectScale.y;

  x = fract(x + 1.0);
  y = fract(y + 1.0);

  fragColor = vec4(x, y, heading / 6.28318530718, 1.0);
}`

const DEPOSIT_VERT = `#version 300 es
in float a_index;
uniform sampler2D u_agents;
uniform vec2 u_agentTexRes;
out float v_alpha;
void main() {
  float ax = mod(a_index, u_agentTexRes.x);
  float ay = floor(a_index / u_agentTexRes.x);
  vec2 uv = (vec2(ax, ay) + 0.5) / u_agentTexRes;
  vec4 a = texture(u_agents, uv);
  vec2 pos = a.rg;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
  v_alpha = 1.0;
}`

const DEPOSIT_FRAG = `#version 300 es
precision highp float;
in float v_alpha;
out vec4 fragColor;
void main() { fragColor = vec4(v_alpha, 0.0, 0.0, 1.0); }`

const TRAIL_DECAY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_trail;
uniform vec2 u_texelSize;
uniform float u_decay;
uniform float u_diffuse;
out vec4 fragColor;
void main() {
  vec2 t = u_texelSize;
  float c  = texture(u_trail, v_uv).r;
  float n  = texture(u_trail, v_uv + vec2( 0.0,  t.y)).r;
  float s  = texture(u_trail, v_uv + vec2( 0.0, -t.y)).r;
  float e  = texture(u_trail, v_uv + vec2( t.x,  0.0)).r;
  float w  = texture(u_trail, v_uv + vec2(-t.x,  0.0)).r;
  float ne = texture(u_trail, v_uv + vec2( t.x,  t.y)).r;
  float nw = texture(u_trail, v_uv + vec2(-t.x,  t.y)).r;
  float se = texture(u_trail, v_uv + vec2( t.x, -t.y)).r;
  float sw = texture(u_trail, v_uv + vec2(-t.x, -t.y)).r;
  float avg = (c + n + s + e + w + ne + nw + se + sw) / 9.0;
  float v = mix(c, avg, u_diffuse);
  v *= u_decay;
  fragColor = vec4(v, 0.0, 0.0, 1.0);
}`

const INJECT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_agents;
uniform vec2 u_cursor;
uniform float u_seed;
uniform float u_injectFrac;
out vec4 fragColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec4 a = texture(u_agents, v_uv);
  float r = hash(v_uv + vec2(u_seed, u_seed * 1.7));
  if (r < u_injectFrac) {
    float angle = hash(v_uv + vec2(u_seed * 2.3, 0.0)) * 6.28318530718;
    float dist = hash(v_uv + vec2(0.0, u_seed * 3.7)) * 0.04 + 0.005;
    float x = u_cursor.x + cos(angle) * dist;
    float y = u_cursor.y + sin(angle) * dist;
    fragColor = vec4(fract(x + 1.0), fract(y + 1.0), hash(v_uv + vec2(u_seed * 5.1, 0.0)), 1.0);
  } else {
    fragColor = a;
  }
}`

const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_trail;
uniform vec2 u_resolution;
uniform vec2 u_cursor;
uniform float u_pulse;
uniform float u_kick;
out vec4 fragColor;

void main() {
  float t = texture(u_trail, v_uv).r;
  float b = smoothstep(0.25, 0.85, t);
  vec3 cream = vec3(0.91);
  vec3 lime = vec3(0.776, 1.0, 0.235);

  vec2 p = (v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.0;
  vec2 cursorP = (u_cursor - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.0;
  float pd = length(p - cursorP);
  float halo = u_pulse * exp(-pd * pd * 1.0);
  float core = u_pulse * exp(-pd * pd * 5.0);

  // kick adds a subtle radial breathe at screen center
  float centerDist = length(p);
  float kickGlow = u_kick * exp(-centerDist * centerDist * 0.7) * 0.15;

  vec3 col = cream * b * (0.95 + kickGlow);
  col = mix(col, col * (1.0 + lime * 0.5), halo * 0.45);
  col += lime * core * 0.30;

  float vig = smoothstep(1.55, 0.6, length((v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0)));
  col *= mix(0.55, 1.0, vig);
  fragColor = vec4(col, 1.0);
}`

const SEED_AGENTS_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
void main() {
  float angle = hash(v_uv + vec2(0.1, 0.0)) * 6.28318530718;
  float r = hash(v_uv + vec2(0.0, 0.7)) * 0.20 + 0.05;
  float x = 0.5 + cos(angle) * r;
  float y = 0.5 + sin(angle) * r;
  float heading = hash(v_uv + vec2(0.7, 0.7));
  fragColor = vec4(x, y, heading, 1.0);
}`

const AGENT_TEX_W = 128
const AGENT_TEX_H = 128
const N_AGENTS = AGENT_TEX_W * AGENT_TEX_H

// ────────────────────── music constants ──────────────────────
const BPM = 125
const STEP_S = 60 / BPM / 4 // 16th note = 0.12s
const STEPS_PER_BAR = 16
const BARS_LOOP = 32

// pre-rendered source buffers for chopped-voice playback
type SrcKind = 'stab' | 'ping'

async function renderSources(sampleRate: number): Promise<Record<SrcKind, AudioBuffer>> {
  // Cm9 chord stab — 0.45s of detuned saw chord through resonant LP
  const stab = await renderOffline(sampleRate, 0.45, (ctx, dur) => {
    const master = ctx.createGain()
    master.gain.value = 0.6
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(700, 0)
    lp.frequency.exponentialRampToValueAtTime(1800, 0.04)
    lp.frequency.exponentialRampToValueAtTime(420, dur * 0.7)
    lp.Q.value = 4.0
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, 0)
    env.gain.linearRampToValueAtTime(0.9, 0.005)
    env.gain.exponentialRampToValueAtTime(0.001, dur)
    // Cm9 voicing: C3 Eb3 G3 Bb3 D4
    for (const f of [130.81, 155.56, 196.0, 233.08, 293.66]) {
      for (const det of [-7, 6]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = f
        o.detune.value = det
        o.connect(lp)
        o.start(0)
        o.stop(dur)
      }
    }
    lp.connect(env)
    env.connect(master)
    master.connect(ctx.destination)
  })

  // metallic FM ping — 0.32s
  const ping = await renderOffline(sampleRate, 0.32, (ctx, dur) => {
    const master = ctx.createGain()
    master.gain.value = 0.5
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, 0)
    env.gain.linearRampToValueAtTime(0.7, 0.003)
    env.gain.exponentialRampToValueAtTime(0.001, dur)
    // FM: carrier 660Hz, mod 990Hz (3:2 ratio for metallic clang)
    const carrier = ctx.createOscillator()
    carrier.type = 'sine'
    carrier.frequency.value = 660
    const mod = ctx.createOscillator()
    mod.type = 'sine'
    mod.frequency.value = 990
    const modGain = ctx.createGain()
    modGain.gain.value = 600
    mod.connect(modGain)
    modGain.connect(carrier.frequency)
    carrier.connect(env)
    env.connect(master)
    master.connect(ctx.destination)
    mod.start(0); mod.stop(dur)
    carrier.start(0); carrier.stop(dur)
  })

  return { stab, ping }
}

function renderOffline(
  sampleRate: number,
  duration: number,
  build: (ctx: OfflineAudioContext, dur: number) => void
): Promise<AudioBuffer> {
  const Ctx =
    (window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext })
      .OfflineAudioContext || OfflineAudioContext
  const ctx = new Ctx(2, Math.floor(sampleRate * duration), sampleRate)
  build(ctx, duration)
  return ctx.startRendering()
}

export default function ScentPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fallbackRef = useRef<HTMLDivElement>(null)
  const [started, setStarted] = useState(false)
  const startedRef = useRef(false)

  // audio refs
  const audioCtxRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)
  const masterLPFRef = useRef<BiquadFilterNode | null>(null)
  const sliceBusRef = useRef<GainNode | null>(null) // chopped voices go through bitcrush+tilt
  const buffersRef = useRef<Record<SrcKind, AudioBuffer> | null>(null)
  const startedAtRef = useRef(0)
  const nextStepRef = useRef(0)
  const schedulerRef = useRef<number | null>(null)
  const kickGlowRef = useRef(0)

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
        console.error('Shader error:', gl.getShaderInfoLog(sh))
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

    const vsFull = compile(gl.VERTEX_SHADER, VERT)
    const agentUpdateProg = link(vsFull, compile(gl.FRAGMENT_SHADER, AGENT_UPDATE_FRAG))
    const trailDecayProg  = link(vsFull, compile(gl.FRAGMENT_SHADER, TRAIL_DECAY_FRAG))
    const injectProg      = link(vsFull, compile(gl.FRAGMENT_SHADER, INJECT_FRAG))
    const displayProg     = link(vsFull, compile(gl.FRAGMENT_SHADER, DISPLAY_FRAG))
    const seedAgentsProg  = link(vsFull, compile(gl.FRAGMENT_SHADER, SEED_AGENTS_FRAG))
    const depositVs = compile(gl.VERTEX_SHADER, DEPOSIT_VERT)
    const depositProg = link(depositVs, compile(gl.FRAGMENT_SHADER, DEPOSIT_FRAG))

    const quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

    const indices = new Float32Array(N_AGENTS)
    for (let i = 0; i < N_AGENTS; i++) indices[i] = i
    const indexBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, indexBuf)
    gl.bufferData(gl.ARRAY_BUFFER, indices, gl.STATIC_DRAW)

    const setupQuadAttrib = (prog: WebGLProgram) => {
      gl.useProgram(prog)
      gl.bindBuffer(gl.ARRAY_BUFFER, quad)
      const aPos = gl.getAttribLocation(prog, 'a_pos')
      gl.enableVertexAttribArray(aPos)
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
    }
    const setupIndexAttrib = (prog: WebGLProgram) => {
      gl.useProgram(prog)
      gl.bindBuffer(gl.ARRAY_BUFFER, indexBuf)
      const aIdx = gl.getAttribLocation(prog, 'a_index')
      gl.enableVertexAttribArray(aIdx)
      gl.vertexAttribPointer(aIdx, 1, gl.FLOAT, false, 0, 0)
    }

    const isMobile = window.matchMedia('(max-width: 600px)').matches
    const TRAIL_W = isMobile ? 480 : 768
    const TRAIL_H = isMobile
      ? Math.floor((480 * window.innerHeight) / window.innerWidth)
      : Math.floor((768 * window.innerHeight) / window.innerWidth)

    const makeTex = (w: number, h: number) => {
      const t = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
      return t
    }
    const makeFbo = (tex: WebGLTexture) => {
      const f = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, f)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      return f
    }

    let trailA = makeTex(TRAIL_W, TRAIL_H)
    let trailB = makeTex(TRAIL_W, TRAIL_H)
    let trailFboA = makeFbo(trailA)
    let trailFboB = makeFbo(trailB)
    for (const f of [trailFboA, trailFboB]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, f)
      gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }

    let agentsA = makeTex(AGENT_TEX_W, AGENT_TEX_H)
    let agentsB = makeTex(AGENT_TEX_W, AGENT_TEX_H)
    let agentFboA = makeFbo(agentsA)
    let agentFboB = makeFbo(agentsB)

    gl.bindFramebuffer(gl.FRAMEBUFFER, agentFboA)
    gl.viewport(0, 0, AGENT_TEX_W, AGENT_TEX_H)
    setupQuadAttrib(seedAgentsProg)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

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

    setupQuadAttrib(agentUpdateProg)
    const u_agents_au   = gl.getUniformLocation(agentUpdateProg, 'u_agents')
    const u_trail_au    = gl.getUniformLocation(agentUpdateProg, 'u_trail')
    const u_trailRes_au = gl.getUniformLocation(agentUpdateProg, 'u_trailRes')
    const u_aspectScale_au = gl.getUniformLocation(agentUpdateProg, 'u_aspectScale')
    const u_senseDist   = gl.getUniformLocation(agentUpdateProg, 'u_senseDist')
    const u_senseAngle  = gl.getUniformLocation(agentUpdateProg, 'u_senseAngle')
    const u_turnAngle   = gl.getUniformLocation(agentUpdateProg, 'u_turnAngle')
    const u_moveDist    = gl.getUniformLocation(agentUpdateProg, 'u_moveDist')
    const u_cursor_au   = gl.getUniformLocation(agentUpdateProg, 'u_cursor')
    const u_cursorPull  = gl.getUniformLocation(agentUpdateProg, 'u_cursorPull')
    const u_time_au     = gl.getUniformLocation(agentUpdateProg, 'u_time')

    setupIndexAttrib(depositProg)
    const u_agents_dep    = gl.getUniformLocation(depositProg, 'u_agents')
    const u_agentTexRes   = gl.getUniformLocation(depositProg, 'u_agentTexRes')

    setupQuadAttrib(trailDecayProg)
    const u_trail_dec     = gl.getUniformLocation(trailDecayProg, 'u_trail')
    const u_texelSize_dec = gl.getUniformLocation(trailDecayProg, 'u_texelSize')
    const u_decay         = gl.getUniformLocation(trailDecayProg, 'u_decay')
    const u_diffuse       = gl.getUniformLocation(trailDecayProg, 'u_diffuse')

    setupQuadAttrib(injectProg)
    const u_agents_inj    = gl.getUniformLocation(injectProg, 'u_agents')
    const u_cursor_inj    = gl.getUniformLocation(injectProg, 'u_cursor')
    const u_seed_inj      = gl.getUniformLocation(injectProg, 'u_seed')
    const u_injectFrac    = gl.getUniformLocation(injectProg, 'u_injectFrac')

    setupQuadAttrib(displayProg)
    const u_trail_disp    = gl.getUniformLocation(displayProg, 'u_trail')
    const u_resolution    = gl.getUniformLocation(displayProg, 'u_resolution')
    const u_cursor_disp   = gl.getUniformLocation(displayProg, 'u_cursor')
    const u_pulse         = gl.getUniformLocation(displayProg, 'u_pulse')
    const u_kick          = gl.getUniformLocation(displayProg, 'u_kick')

    // ────────────────────── audio engine ──────────────────────

    const startAudio = async () => {
      if (audioCtxRef.current) return
      startedRef.current = true
      setStarted(true)
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      audioCtxRef.current = ctx

      const master = ctx.createGain()
      master.gain.setValueAtTime(0, ctx.currentTime)
      master.gain.linearRampToValueAtTime(0.85, ctx.currentTime + 3)
      masterRef.current = master

      const lpf = ctx.createBiquadFilter()
      lpf.type = 'lowpass'
      lpf.frequency.value = 5500
      lpf.Q.value = 0.7
      masterLPFRef.current = lpf

      master.connect(lpf)
      lpf.connect(ctx.destination)

      // slice bus — bitcrush (6-bit waveshaper) + tilt LP at 5kHz
      // chopped voices go through here; kick + sub bypass for punch
      const sliceBus = ctx.createGain()
      sliceBus.gain.value = 0.85
      const crushCurve = new Float32Array(2048)
      for (let i = 0; i < 2048; i++) {
        const x = (i / 2048) * 2 - 1
        // 6-bit quantization
        crushCurve[i] = Math.round(x * 32) / 32
      }
      const crusher = ctx.createWaveShaper()
      crusher.curve = crushCurve
      crusher.oversample = '2x'
      const tiltLP = ctx.createBiquadFilter()
      tiltLP.type = 'lowpass'
      tiltLP.frequency.value = 5000
      tiltLP.Q.value = 0.5
      sliceBus.connect(crusher)
      crusher.connect(tiltLP)
      tiltLP.connect(master)
      sliceBusRef.current = sliceBus

      // sub bass — continuous C1 sine, bypasses bitcrush
      const subOsc = ctx.createOscillator()
      subOsc.type = 'sine'
      subOsc.frequency.value = 32.7
      const subGain = ctx.createGain()
      subGain.gain.value = 0.10
      subOsc.connect(subGain)
      subGain.connect(master)
      subOsc.start()
      const subLFO = ctx.createOscillator()
      subLFO.frequency.value = 0.06
      const subLFOGain = ctx.createGain()
      subLFOGain.gain.value = 0.04
      subLFO.connect(subLFOGain)
      subLFOGain.connect(subGain.gain)
      subLFO.start()

      // pre-render the source buffers (stab + ping)
      try {
        buffersRef.current = await renderSources(ctx.sampleRate)
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('failed to render sources', e)
      }

      startedAtRef.current = ctx.currentTime + 0.15
      nextStepRef.current = 0
      schedulerRef.current = window.setInterval(() => scheduleAhead(), 50)
    }

    const scheduleAhead = () => {
      const ctx = audioCtxRef.current
      if (!ctx) return
      const horizon = ctx.currentTime + 0.2
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const stepTime = startedAtRef.current + nextStepRef.current * STEP_S
        if (stepTime > horizon) break
        const absStep = nextStepRef.current
        const stepInBar = absStep % STEPS_PER_BAR
        const bar = Math.floor(absStep / STEPS_PER_BAR) % BARS_LOOP
        scheduleStep(stepTime, stepInBar, bar)
        nextStepRef.current++
      }
    }

    // deterministic-feeling pseudo-random for parameter locks
    // (uses bar+step as seed so the groove varies each bar without being noisy)
    const lockRand = (a: number, b: number) => {
      const s = Math.sin(a * 374.41 + b * 127.13) * 43758.5453
      return s - Math.floor(s)
    }

    const scheduleStep = (time: number, step: number, bar: number) => {
      // KICK on every quarter starting bar 2 (driving 4/4 = the spine)
      if (bar >= 2 && step % 4 === 0) {
        playKick(time, 0.6)
        const dt = (time - (audioCtxRef.current?.currentTime || time)) * 1000
        setTimeout(() => { kickGlowRef.current = 1 }, Math.max(0, dt))
      }
      // HIHAT — closed hat on every 16th from bar 6, with stutter retriggers
      // on certain steps for the agent-darting feel
      if (bar >= 6) {
        const off = step % 4
        let amp = 0
        if (off === 0) amp = 0.04 // ghost on kick
        else if (off === 1) amp = 0.08
        else if (off === 2) amp = 0.12 // accent on offbeat
        else if (off === 3) amp = 0.08
        if (amp > 0) {
          // 1-in-8 chance the hat stutters 3-4 times in this step
          const stutter = lockRand(bar, step) < 0.12 ? (lockRand(bar + 1, step) < 0.5 ? 4 : 3) : 1
          for (let s = 0; s < stutter; s++) {
            playHat(time + (s * STEP_S) / stutter, amp * (1 - s * 0.15))
          }
        }
      }
      // STAB chops — every off-beat (steps 2, 6, 10, 14) starting bar 8,
      // chopped from the pre-rendered Cm9 buffer with random rate, occasional
      // reverse, occasional stutter cluster
      if (bar >= 8 && step % 4 === 2) {
        const r1 = lockRand(bar, step)
        const r2 = lockRand(bar, step + 100)
        const r3 = lockRand(bar, step + 200)
        const rate = 0.7 + r1 * 0.7  // 0.7x..1.4x
        const reverse = r2 < 0.18
        const sliceStart = r3 * 0.3 // start anywhere in first 30% of buffer
        const stutter = lockRand(bar + 7, step) < 0.18 ? 4 : (lockRand(bar + 11, step) < 0.10 ? 6 : 1)
        playSlice(time, 'stab', { rate, reverse, sliceStart, gain: 0.55, stutter })
      }
      // PING chops — sparser, on step 6 every other bar starting bar 12
      if (bar >= 12 && bar % 2 === 0 && step === 6) {
        const r1 = lockRand(bar, step + 50)
        const rate = 0.85 + r1 * 0.5
        const stutter = lockRand(bar + 3, step) < 0.30 ? 5 : 1
        playSlice(time, 'ping', { rate, reverse: false, sliceStart: 0.05, gain: 0.45, stutter })
      }
      // big stutter cluster every 8 bars at bar boundary (bar 7 last 3 steps)
      // — the "build" tension before the next 8-bar chord cycle
      if (bar >= 8 && bar % 8 === 7 && (step === 13 || step === 14 || step === 15)) {
        const stutter = step === 15 ? 6 : 4
        playSlice(time, 'stab', { rate: 1.2, reverse: false, sliceStart: 0.0, gain: 0.5, stutter })
      }
    }

    const playKick = (time: number, amp: number) => {
      const ctx = audioCtxRef.current!
      const master = masterRef.current!
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(72, time)
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.06)
      const env = ctx.createGain()
      env.gain.setValueAtTime(0, time)
      env.gain.linearRampToValueAtTime(amp, time + 0.005)
      env.gain.exponentialRampToValueAtTime(0.001, time + 0.24)
      osc.connect(env); env.connect(master)
      osc.start(time); osc.stop(time + 0.26)

      // click
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.022), ctx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      const noise = ctx.createBufferSource()
      noise.buffer = buf
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'; hp.frequency.value = 1800
      const ng = ctx.createGain()
      ng.gain.setValueAtTime(amp * 0.12, time)
      ng.gain.exponentialRampToValueAtTime(0.001, time + 0.018)
      noise.connect(hp); hp.connect(ng); ng.connect(master)
      noise.start(time); noise.stop(time + 0.025)
    }

    const playHat = (time: number, amp: number) => {
      const ctx = audioCtxRef.current!
      const master = masterRef.current!
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.04), ctx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      const noise = ctx.createBufferSource()
      noise.buffer = buf
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'; hp.frequency.value = 7400
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'; lp.frequency.value = 11000
      const env = ctx.createGain()
      env.gain.setValueAtTime(amp, time)
      env.gain.exponentialRampToValueAtTime(0.001, time + 0.038)
      noise.connect(hp); hp.connect(lp); lp.connect(env); env.connect(master)
      noise.start(time); noise.stop(time + 0.05)
    }

    // playSlice — trigger a chopped voice from a pre-rendered buffer.
    // params: rate (playback speed), reverse, sliceStart (0..1 into buffer),
    // sliceLen (duration in seconds at native rate, defaults to ~0.18s),
    // gain, stutter (number of sub-step retriggers within one 16th).
    type SliceDef = {
      rate: number
      reverse: boolean
      sliceStart: number
      sliceLen?: number
      gain: number
      stutter?: number
    }
    const playSlice = (time: number, kind: SriceKindAlias, def: SliceDef) => {
      const ctx = audioCtxRef.current!
      const sliceBus = sliceBusRef.current
      const buffers = buffersRef.current
      if (!ctx || !sliceBus || !buffers) return
      const buf = buffers[kind]
      const stutter = Math.max(1, def.stutter ?? 1)
      const stutterStep = STEP_S / stutter
      const sliceLen = def.sliceLen ?? 0.16

      for (let s = 0; s < stutter; s++) {
        const triggerT = time + s * stutterStep
        const src = ctx.createBufferSource()
        src.buffer = buf
        src.playbackRate.value = def.rate * (def.reverse ? -1 : 1)
        // WebAudio doesn't support negative playbackRate cleanly across all
        // browsers — for reverse, we'll just stutter forward at higher rate
        // (good enough for the glitchy feel)
        if (def.reverse) src.playbackRate.value = def.rate * 1.6
        const env = ctx.createGain()
        env.gain.setValueAtTime(0, triggerT)
        env.gain.linearRampToValueAtTime(def.gain * (1 - s * 0.10), triggerT + 0.003)
        env.gain.exponentialRampToValueAtTime(0.001, triggerT + sliceLen)
        src.connect(env)
        env.connect(sliceBus)
        const offset = def.sliceStart * buf.duration
        try {
          src.start(triggerT, offset, sliceLen * Math.abs(def.rate) + 0.05)
        } catch {
          src.start(triggerT)
        }
      }
    }
    type SriceKindAlias = SrcKind

    // ────────────────────── interaction ──────────────────────
    let cursorX = -1
    let cursorY = -1
    let dragging = false
    let pulseStart = -1
    let pendingTapInject = false

    const handleMove = (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect()
      cursorX = (clientX - r.left) / r.width
      cursorY = 1 - (clientY - r.top) / r.height
      // ride master LPF: cursor at top → 1500Hz (foggy), bottom → 8000Hz (bright)
      const ctx = audioCtxRef.current
      const lp = masterLPFRef.current
      if (ctx && lp && dragging) {
        const target = 1500 + (1 - Math.min(1, Math.max(0, cursorY))) * 6500
        lp.frequency.setTargetAtTime(target, ctx.currentTime, 0.08)
      }
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
      dragging = true
      try { canvas.setPointerCapture(e.pointerId) } catch {}
      startAudio()
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
      dragging = false
      try { canvas.releasePointerCapture(e.pointerId) } catch {}
      const dur = performance.now() - downT
      if (!moved && dur < 350) {
        pulseStart = performance.now() / 1000
        pendingTapInject = true
        // also fire a stutter cluster on the stab buffer — manual chop
        if (audioCtxRef.current && buffersRef.current && sliceBusRef.current) {
          playSlice(audioCtxRef.current.currentTime + 0.01, 'stab', {
            rate: 1.1,
            reverse: false,
            sliceStart: 0.0,
            gain: 0.55,
            stutter: 5,
          })
        }
      } else {
        cursorX = -1
        cursorY = -1
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
      down = true; moved = false
      downX = t.clientX - r.left; downY = t.clientY - r.top
      downT = performance.now()
      handleMove(t.clientX, t.clientY)
      dragging = true
      startAudio()
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
      dragging = false
      const dur = performance.now() - downT
      if (!moved && dur < 350) {
        pulseStart = performance.now() / 1000
        pendingTapInject = true
        if (audioCtxRef.current && buffersRef.current && sliceBusRef.current) {
          playSlice(audioCtxRef.current.currentTime + 0.01, 'stab', {
            rate: 1.1,
            reverse: false,
            sliceStart: 0.0,
            gain: 0.55,
            stutter: 5,
          })
        }
      } else {
        cursorX = -1; cursorY = -1
      }
    }
    canvas.addEventListener('touchstart', onTouchStart, { passive: true })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd)
    canvas.addEventListener('touchcancel', onTouchEnd)

    // ────────────────────── render loop ──────────────────────
    let raf = 0
    const startT = performance.now() / 1000

    const tick = (now: number) => {
      const t = now / 1000 - startT
      let pulse = 0
      if (pulseStart > 0) {
        const age = now / 1000 - pulseStart
        if (age < 1.4) pulse = (1 - age / 1.4) * Math.exp(-age * 0.7)
        else pulseStart = -1
      }
      kickGlowRef.current *= 0.86

      // ── 1. agent update ──
      gl.useProgram(agentUpdateProg)
      setupQuadAttrib(agentUpdateProg)
      gl.bindFramebuffer(gl.FRAMEBUFFER, agentFboB)
      gl.viewport(0, 0, AGENT_TEX_W, AGENT_TEX_H)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, agentsA); gl.uniform1i(u_agents_au, 0)
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, trailA); gl.uniform1i(u_trail_au, 1)
      gl.uniform2f(u_trailRes_au, TRAIL_W, TRAIL_H)
      gl.uniform2f(u_aspectScale_au, 1.0, TRAIL_W / TRAIL_H)
      gl.uniform1f(u_senseDist, 0.012)
      gl.uniform1f(u_senseAngle, 0.40)
      gl.uniform1f(u_turnAngle, 0.30)
      gl.uniform1f(u_moveDist, 0.0017)
      gl.uniform2f(u_cursor_au, dragging ? cursorX : -1, dragging ? cursorY : -1)
      gl.uniform1f(u_cursorPull, 0.06)
      gl.uniform1f(u_time_au, t)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      const tA = agentsA, tFA = agentFboA
      agentsA = agentsB; agentFboA = agentFboB
      agentsB = tA; agentFboB = tFA

      // 1.5 inject on tap
      if (pendingTapInject && cursorX >= 0) {
        gl.useProgram(injectProg)
        setupQuadAttrib(injectProg)
        gl.bindFramebuffer(gl.FRAMEBUFFER, agentFboB)
        gl.viewport(0, 0, AGENT_TEX_W, AGENT_TEX_H)
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, agentsA); gl.uniform1i(u_agents_inj, 0)
        gl.uniform2f(u_cursor_inj, cursorX, cursorY)
        gl.uniform1f(u_seed_inj, t)
        gl.uniform1f(u_injectFrac, 0.06)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        const tA2 = agentsA, tFA2 = agentFboA
        agentsA = agentsB; agentFboA = agentFboB
        agentsB = tA2; agentFboB = tFA2
        pendingTapInject = false
      }

      // ── 2. trail decay + diffuse ──
      gl.useProgram(trailDecayProg)
      setupQuadAttrib(trailDecayProg)
      gl.bindFramebuffer(gl.FRAMEBUFFER, trailFboB)
      gl.viewport(0, 0, TRAIL_W, TRAIL_H)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, trailA); gl.uniform1i(u_trail_dec, 0)
      gl.uniform2f(u_texelSize_dec, 1 / TRAIL_W, 1 / TRAIL_H)
      gl.uniform1f(u_decay, 0.96)
      gl.uniform1f(u_diffuse, 0.45)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      const tT = trailA, tTF = trailFboA
      trailA = trailB; trailFboA = trailFboB
      trailB = tT; trailFboB = tTF

      // ── 3. trail deposit ──
      gl.useProgram(depositProg)
      setupIndexAttrib(depositProg)
      gl.bindFramebuffer(gl.FRAMEBUFFER, trailFboA)
      gl.viewport(0, 0, TRAIL_W, TRAIL_H)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, agentsA); gl.uniform1i(u_agents_dep, 0)
      gl.uniform2f(u_agentTexRes, AGENT_TEX_W, AGENT_TEX_H)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
      gl.blendEquation(gl.FUNC_ADD)
      gl.drawArrays(gl.POINTS, 0, N_AGENTS)
      gl.disable(gl.BLEND)

      // ── 4. display ──
      gl.useProgram(displayProg)
      setupQuadAttrib(displayProg)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, trailA); gl.uniform1i(u_trail_disp, 0)
      gl.uniform2f(u_resolution, canvas.width, canvas.height)
      gl.uniform2f(u_cursor_disp, cursorX, cursorY)
      gl.uniform1f(u_pulse, pulse)
      gl.uniform1f(u_kick, kickGlowRef.current)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

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
      if (schedulerRef.current) clearInterval(schedulerRef.current)
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close() } catch {}
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
            tap to start.
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
          OCTATRACK · CM · 125 BPM
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
            SCENT.
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
            a track for L66.
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
