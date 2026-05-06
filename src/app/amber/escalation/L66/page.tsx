'use client'

import { useEffect, useRef } from 'react'

// L66 — Physarum slime-mold simulation. Step in the rendering arc:
// L65 introduced state (single-channel ping-pong reaction-diffusion);
// L66 introduces AGENTS — 16,384 particles whose state is stored in
// a separate texture, updated each frame by reading the trail map,
// sensing 3 angles ahead, turning toward the strongest trail, moving,
// and depositing more trail. The trail map then decays + diffuses.
// Two ping-pong textures (agents + trails), three update passes.
//
// Cursor: drag attracts agents toward the cursor (bias the heading);
// tap injects a fresh ring of randomly-headed agents at the cursor.

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

// ────────────────────── shader sources ──────────────────────

// Agent update — for each pixel in the agent texture, read (x, y, heading)
// and compute new state for next frame.
//   r = x in [0,1]
//   g = y in [0,1]
//   b = heading in radians (mapped from [0, 2π] → [0, 1] via /(2π))
//   a = unused (kept for alignment)
const AGENT_UPDATE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_agents;
uniform sampler2D u_trail;
uniform vec2 u_trailRes;        // trail map resolution
uniform vec2 u_aspectScale;     // sense distance scaled by aspect
uniform float u_senseDist;      // in normalized units
uniform float u_senseAngle;     // radians
uniform float u_turnAngle;      // radians
uniform float u_moveDist;       // in normalized units
uniform vec2 u_cursor;          // 0..1, off-screen if (-1,-1)
uniform float u_cursorPull;     // 0..1, how strongly cursor attracts
uniform float u_time;
out vec4 fragColor;

float hash(float n) { return fract(sin(n) * 43758.5453123); }

float sampleTrail(vec2 p) {
  // wrap-around at edges
  p = fract(p);
  return texture(u_trail, p).r;
}

void main() {
  vec4 a = texture(u_agents, v_uv);
  float x = a.r;
  float y = a.g;
  float heading = a.b * 6.28318530718;

  // sense at 3 positions: forward, forward-left, forward-right
  vec2 fwd  = vec2(cos(heading),                 sin(heading));
  vec2 lft  = vec2(cos(heading + u_senseAngle),  sin(heading + u_senseAngle));
  vec2 rgt  = vec2(cos(heading - u_senseAngle),  sin(heading - u_senseAngle));

  vec2 senseFwd = vec2(x, y) + fwd * u_senseDist * u_aspectScale;
  vec2 senseLft = vec2(x, y) + lft * u_senseDist * u_aspectScale;
  vec2 senseRgt = vec2(x, y) + rgt * u_senseDist * u_aspectScale;

  float sF = sampleTrail(senseFwd);
  float sL = sampleTrail(senseLft);
  float sR = sampleTrail(senseRgt);

  // turn toward strongest
  float turn = 0.0;
  if (sF > sL && sF > sR) {
    turn = 0.0;
  } else if (sL > sR) {
    turn = u_turnAngle;
  } else if (sR > sL) {
    turn = -u_turnAngle;
  } else {
    // ambiguous — small random jitter
    float r = hash(v_uv.x * 13.37 + v_uv.y * 71.41 + u_time);
    turn = (r - 0.5) * u_turnAngle * 1.5;
  }

  // cursor influence — bias heading toward cursor
  if (u_cursor.x >= 0.0) {
    vec2 toCursor = u_cursor - vec2(x, y);
    if (length(toCursor) > 0.001) {
      float targetHeading = atan(toCursor.y, toCursor.x);
      // smallest signed difference from current heading
      float dh = mod(targetHeading - heading + 3.14159265, 6.28318530718) - 3.14159265;
      turn += dh * u_cursorPull;
    }
  }

  heading += turn;

  // move forward
  vec2 fwd2 = vec2(cos(heading), sin(heading));
  x += fwd2.x * u_moveDist * u_aspectScale.x;
  y += fwd2.y * u_moveDist * u_aspectScale.y;

  // wrap at edges
  x = fract(x + 1.0);
  y = fract(y + 1.0);

  fragColor = vec4(x, y, heading / 6.28318530718, 1.0);
}`

// Trail deposit — draw each agent as a single point sprite with intensity.
// Vertex shader picks position from agent texture; fragment writes a soft dot.
const DEPOSIT_VERT = `#version 300 es
in float a_index;             // agent index 0..N-1
uniform sampler2D u_agents;
uniform vec2 u_agentTexRes;   // e.g. (128,128) for 16384 agents
out float v_alpha;
void main() {
  // map index → uv into agent texture
  float ax = mod(a_index, u_agentTexRes.x);
  float ay = floor(a_index / u_agentTexRes.x);
  vec2 uv = (vec2(ax, ay) + 0.5) / u_agentTexRes;
  vec4 a = texture(u_agents, uv);
  vec2 pos = a.rg;
  // map [0,1] → clip space [-1,1]
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
  v_alpha = 1.0;
}`

const DEPOSIT_FRAG = `#version 300 es
precision highp float;
in float v_alpha;
out vec4 fragColor;
void main() {
  fragColor = vec4(v_alpha, 0.0, 0.0, 1.0);
}`

// Trail decay + diffuse — runs on the trail map every frame
const TRAIL_DECAY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_trail;
uniform vec2 u_texelSize;
uniform float u_decay;        // 0..1, multiplied each frame
uniform float u_diffuse;      // 0..1, mix between center and 3x3 average
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

// Agent inject — overwrites a subset of the agent texture with new positions
// (used on tap to scatter fresh agents at cursor).
const INJECT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_agents;
uniform vec2 u_cursor;
uniform float u_seed;       // randomization seed
uniform float u_injectFrac; // probability that an agent is reset this pass
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
    // place near cursor with random heading
    float angle = hash(v_uv + vec2(u_seed * 2.3, 0.0)) * 6.28318530718;
    float dist = hash(v_uv + vec2(0.0, u_seed * 3.7)) * 0.04 + 0.005;
    float x = u_cursor.x + cos(angle) * dist;
    float y = u_cursor.y + sin(angle) * dist;
    fragColor = vec4(fract(x + 1.0), fract(y + 1.0), hash(v_uv + vec2(u_seed * 5.1, 0.0)), 1.0);
  } else {
    fragColor = a;
  }
}`

// Display — render trail map as cream-on-night with optional pulse glow
const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_trail;
uniform vec2 u_resolution;
uniform vec2 u_cursor;
uniform float u_pulse;
out vec4 fragColor;

void main() {
  float t = texture(u_trail, v_uv).r;
  // narrow band — only the dense agent paths show as thin bright lines,
  // sparse trails fade to background
  float b = smoothstep(0.25, 0.85, t);
  vec3 cream = vec3(0.91);
  vec3 lime = vec3(0.776, 1.0, 0.235);

  vec2 p = (v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.0;
  vec2 cursorP = (u_cursor - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.0;
  float pd = length(p - cursorP);
  float halo = u_pulse * exp(-pd * pd * 1.0);
  float core = u_pulse * exp(-pd * pd * 5.0);

  vec3 col = cream * b * 0.95;
  col = mix(col, col * (1.0 + lime * 0.5), halo * 0.45);
  col += lime * core * 0.30;

  float vig = smoothstep(1.55, 0.6, length((v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0)));
  col *= mix(0.55, 1.0, vig);
  fragColor = vec4(col, 1.0);
}`

// Seed agents — initialize the agent texture with random positions + headings
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
  // start in a soft ring at center for visual interest
  float angle = hash(v_uv + vec2(0.1, 0.0)) * 6.28318530718;
  float r = hash(v_uv + vec2(0.0, 0.7)) * 0.20 + 0.05;
  float x = 0.5 + cos(angle) * r;
  float y = 0.5 + sin(angle) * r;
  float heading = hash(v_uv + vec2(0.7, 0.7));
  fragColor = vec4(x, y, heading, 1.0);
}`

const AGENT_TEX_W = 128
const AGENT_TEX_H = 128
const N_AGENTS = AGENT_TEX_W * AGENT_TEX_H // 16384

export default function L66Page() {
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
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        // eslint-disable-next-line no-console
        console.error('Link error:', gl.getProgramInfoLog(p))
      }
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

    // fullscreen quad
    const quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

    // agent index buffer (one float per agent: 0..N-1)
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

    // ── trail map textures (ping-pong) ──
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
    // clear trail map
    for (const f of [trailFboA, trailFboB]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, f)
      gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }

    let agentsA = makeTex(AGENT_TEX_W, AGENT_TEX_H)
    let agentsB = makeTex(AGENT_TEX_W, AGENT_TEX_H)
    let agentFboA = makeFbo(agentsA)
    let agentFboB = makeFbo(agentsB)

    // seed agents into agentsA
    gl.bindFramebuffer(gl.FRAMEBUFFER, agentFboA)
    gl.viewport(0, 0, AGENT_TEX_W, AGENT_TEX_H)
    setupQuadAttrib(seedAgentsProg)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    // canvas size
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

    // ── uniforms ──
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

    // ── interaction ──
    let cursorX = -1
    let cursorY = -1
    let dragging = false
    let pulseStart = -1
    let pendingTapInject = false

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
      dragging = true
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
      dragging = false
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {}
      const dur = performance.now() - downT
      if (!moved && dur < 350) {
        pulseStart = performance.now() / 1000
        pendingTapInject = true
      } else {
        // dragging stops — also park cursor offscreen so attractor turns off
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
      down = true
      moved = false
      downX = t.clientX - r.left
      downY = t.clientY - r.top
      downT = performance.now()
      handleMove(t.clientX, t.clientY)
      dragging = true
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
      dragging = false
      const dur = performance.now() - downT
      if (!moved && dur < 350) {
        pulseStart = performance.now() / 1000
        pendingTapInject = true
      } else {
        cursorX = -1
        cursorY = -1
      }
    }
    canvas.addEventListener('touchstart', onTouchStart, { passive: true })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd)
    canvas.addEventListener('touchcancel', onTouchEnd)

    // ── audio ──
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
      lp.frequency.value = 900
      lp.Q.value = 0.5
      lp.connect(masterGain)
      masterGain.connect(audioCtx.destination)
      // C-minor drone — slightly different from L65's A-minor for variety
      for (const f of [65.41, 97.999, 130.81, 195.998]) {
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
    }

    // ── render loop ──
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

      // ── 1. agent update (read agentsA + trailA, write agentsB) ──
      gl.useProgram(agentUpdateProg)
      setupQuadAttrib(agentUpdateProg)
      gl.bindFramebuffer(gl.FRAMEBUFFER, agentFboB)
      gl.viewport(0, 0, AGENT_TEX_W, AGENT_TEX_H)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, agentsA)
      gl.uniform1i(u_agents_au, 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, trailA)
      gl.uniform1i(u_trail_au, 1)
      gl.uniform2f(u_trailRes_au, TRAIL_W, TRAIL_H)
      // aspect-correct sense distances so behavior matches across devices
      gl.uniform2f(u_aspectScale_au, 1.0, TRAIL_W / TRAIL_H)
      gl.uniform1f(u_senseDist, 0.012)
      gl.uniform1f(u_senseAngle, 0.40)
      gl.uniform1f(u_turnAngle, 0.30)
      gl.uniform1f(u_moveDist, 0.0017)
      gl.uniform2f(u_cursor_au, dragging ? cursorX : -1, dragging ? cursorY : -1)
      gl.uniform1f(u_cursorPull, 0.06)
      gl.uniform1f(u_time_au, t)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      // swap agents
      const tA = agentsA, tFA = agentFboA
      agentsA = agentsB; agentFboA = agentFboB
      agentsB = tA; agentFboB = tFA

      // ── 1.5 inject on tap (overwrite a fraction of agents at cursor) ──
      if (pendingTapInject && cursorX >= 0) {
        gl.useProgram(injectProg)
        setupQuadAttrib(injectProg)
        gl.bindFramebuffer(gl.FRAMEBUFFER, agentFboB)
        gl.viewport(0, 0, AGENT_TEX_W, AGENT_TEX_H)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, agentsA)
        gl.uniform1i(u_agents_inj, 0)
        gl.uniform2f(u_cursor_inj, cursorX, cursorY)
        gl.uniform1f(u_seed_inj, t)
        gl.uniform1f(u_injectFrac, 0.06) // ~6% of agents (~1000) get scattered
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        const tA2 = agentsA, tFA2 = agentFboA
        agentsA = agentsB; agentFboA = agentFboB
        agentsB = tA2; agentFboB = tFA2
        pendingTapInject = false
      }

      // ── 2. trail decay + diffuse (read trailA, write trailB) ──
      gl.useProgram(trailDecayProg)
      setupQuadAttrib(trailDecayProg)
      gl.bindFramebuffer(gl.FRAMEBUFFER, trailFboB)
      gl.viewport(0, 0, TRAIL_W, TRAIL_H)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, trailA)
      gl.uniform1i(u_trail_dec, 0)
      gl.uniform2f(u_texelSize_dec, 1 / TRAIL_W, 1 / TRAIL_H)
      gl.uniform1f(u_decay, 0.96)
      gl.uniform1f(u_diffuse, 0.45)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      // swap trails
      const tT = trailA, tTF = trailFboA
      trailA = trailB; trailFboA = trailFboB
      trailB = tT; trailFboB = tTF

      // ── 3. deposit agents into trail map (additive) ──
      gl.useProgram(depositProg)
      setupIndexAttrib(depositProg)
      gl.bindFramebuffer(gl.FRAMEBUFFER, trailFboA)
      gl.viewport(0, 0, TRAIL_W, TRAIL_H)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, agentsA)
      gl.uniform1i(u_agents_dep, 0)
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
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, trailA)
      gl.uniform1i(u_trail_disp, 0)
      gl.uniform2f(u_resolution, canvas.width, canvas.height)
      gl.uniform2f(u_cursor_disp, cursorX, cursorY)
      gl.uniform1f(u_pulse, pulse)
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
          ENVIRONMENT · L66 · PHYSARUM
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
            L66.
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
            follow the scent.
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
            DRAG · ATTRACT &nbsp; TAP · SCATTER
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
