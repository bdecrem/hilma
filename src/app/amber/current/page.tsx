'use client'

import { useEffect, useRef, useState } from 'react'

// CURRENT — L64's curl-noise streamline visual + a dub techno track.
// 116 BPM in C minor. Cm9 chord stab routed through a 3/16-note delay
// loop with lowpass-in-feedback (the Basic Channel / Yagya signature).
// Sparse 909-style kick on quarters. Sub bass on root. Hihat shuffle
// from bar 8. Vinyl crackle bed throughout. Master LPF rides the
// cursor's vertical position — dragging up "fogs" the mix the way a
// real dub-techno set rides the desk.
//
// Music recipe: ../vibeceo/jambot/library.json → genres.dub_techno
// Visual: forked from src/app/amber/escalation/L64/page.tsx

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
uniform float u_kick;
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
vec2 curlNoise(vec2 p, float t) {
  float h = 0.01;
  vec2 drift = vec2(t * 0.04, t * 0.03);
  float n1 = fbm2(p + vec2(0.0, h) + drift);
  float n2 = fbm2(p - vec2(0.0, h) + drift);
  float n3 = fbm2(p + vec2(h, 0.0) + drift);
  float n4 = fbm2(p - vec2(h, 0.0) + drift);
  return vec2(-(n1 - n2) / (2.0 * h), (n3 - n4) / (2.0 * h));
}

void main() {
  vec2 uv = v_uv;
  vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.0;
  vec2 cursorP = (u_cursor - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.0;

  vec2 trail = p;
  float brightness = 0.0;
  float weightSum = 0.0;
  float pulseDist = length(p - cursorP);
  float pulseGlow = u_pulse * exp(-pulseDist * pulseDist * 4.0);
  // kick adds a subtle radial breathe from screen center
  float centerDist = length(p);
  float kickGlow = u_kick * exp(-centerDist * centerDist * 0.7) * 0.18;

  for (int i = 0; i < 24; i++) {
    vec2 v = curlNoise(trail * 1.4, u_time);
    vec2 toCursor = cursorP - trail;
    float dC = length(toCursor) + 0.001;
    vec2 vortex = vec2(-toCursor.y, toCursor.x) / dC;
    float vortexStrength = exp(-dC * dC * 2.0) * 0.6;
    v += vortex * vortexStrength;
    trail -= v * 0.02;
    float weight = 1.0 - float(i) / 24.0;
    float sample_ = fbm2(trail * 2.5 + vec2(7.7, 3.1));
    brightness += smoothstep(0.55, 0.85, sample_) * weight;
    weightSum += weight;
  }
  brightness /= weightSum;

  vec3 cream = vec3(0.91);
  vec3 lime = vec3(0.776, 1.0, 0.235);
  vec3 col = cream * brightness * (0.95 + kickGlow) + lime * pulseGlow * 0.7;

  float vig = smoothstep(1.55, 0.6, length((uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0)));
  col *= mix(0.55, 1.0, vig);

  fragColor = vec4(col, 1.0);
}`

// ────────────────────── music constants ──────────────────────
const BPM = 116
const STEP_S = 60 / BPM / 4 // 16th note (~0.1293s)
const STEPS_PER_BAR = 16
const BARS_LOOP = 32

// Cm9 / Fm7 / Gm7 / Abmaj7 — minor-key dub progression rooted in C
// each chord transposed down for that "almost-bass" stab voicing
const CHORDS: { name: string; notes: number[] }[] = [
  { name: 'Cm9', notes: [130.81, 155.56, 196.0, 233.08, 293.66] }, // C3 Eb3 G3 Bb3 D4
  { name: 'Fm7', notes: [174.61, 207.65, 261.63, 311.13] }, // F3 Ab3 C4 Eb4
  { name: 'Gm7', notes: [196.0, 233.08, 293.66, 349.23] }, // G3 Bb3 D4 F4
  { name: 'Abmaj7', notes: [207.65, 261.63, 311.13, 392.0] }, // Ab3 C4 Eb4 G4
]

export default function CurrentPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fallbackRef = useRef<HTMLDivElement>(null)
  const [started, setStarted] = useState(false)
  const startedRef = useRef(false)

  // audio refs
  const audioCtxRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)
  const masterLPFRef = useRef<BiquadFilterNode | null>(null)
  const dubDelayRef = useRef<DelayNode | null>(null)
  const startedAtRef = useRef(0)
  const nextStepRef = useRef(0)
  const schedulerRef = useRef<number | null>(null)
  const stabIdxRef = useRef(0)

  // visual ↔ audio bridge
  const kickGlowRef = useRef(0) // decays each frame, set on each kick

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false })
    if (!gl) {
      if (fallbackRef.current) fallbackRef.current.style.display = 'flex'
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
    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
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
    const uKick = gl.getUniformLocation(prog, 'u_kick')

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
      // ride master LPF: cursorY 0 (bottom) → 8000Hz, cursorY 1 (top) → 1500Hz
      const ctx = audioCtxRef.current
      const lp = masterLPFRef.current
      if (ctx && lp) {
        const target = 1500 + (1 - Math.min(1, Math.max(0, cursorY))) * 6500
        lp.frequency.setTargetAtTime(target, ctx.currentTime, 0.08)
      }
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
      if (!moved && dur < 350) {
        pulseStart = performance.now() / 1000
        // manual stab on the current chord
        if (audioCtxRef.current) {
          const segment = Math.floor(stabIdxRef.current / 4) % CHORDS.length
          playStab(audioCtxRef.current.currentTime + 0.01, CHORDS[segment].notes, 0.42)
        }
      }
    }
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)

    // touch fallback (iOS Safari)
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
      if (!moved && dur < 350) {
        pulseStart = performance.now() / 1000
        if (audioCtxRef.current) {
          const segment = Math.floor(stabIdxRef.current / 4) % CHORDS.length
          playStab(audioCtxRef.current.currentTime + 0.01, CHORDS[segment].notes, 0.42)
        }
      }
    }
    canvas.addEventListener('touchstart', onTouchStart, { passive: true })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd)
    canvas.addEventListener('touchcancel', onTouchEnd)

    // ────────────────────── audio engine ──────────────────────

    const ensureAudio = () => {
      if (audioCtxRef.current) return
      startedRef.current = true
      setStarted(true)
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      audioCtxRef.current = ctx

      // master → master LPF → destination
      const master = ctx.createGain()
      master.gain.setValueAtTime(0, ctx.currentTime)
      master.gain.linearRampToValueAtTime(0.85, ctx.currentTime + 4)
      masterRef.current = master

      const lpf = ctx.createBiquadFilter()
      lpf.type = 'lowpass'
      lpf.frequency.value = 4500
      lpf.Q.value = 0.7
      masterLPFRef.current = lpf

      master.connect(lpf)
      lpf.connect(ctx.destination)

      // dub delay loop — 3/16 note with high feedback + LP-in-loop
      // (per dub_techno production prose: "lowpass filter inside the
      // feedback loop, set around 2-4kHz... each pass loses high-frequency
      // content so the first echo is bright and present, the eighth a
      // deep, warm ghost of the original")
      const delay = ctx.createDelay(2.5)
      delay.delayTime.value = (60 / BPM) * (3 / 16) * 4
      dubDelayRef.current = delay
      const delayFb = ctx.createGain()
      delayFb.gain.value = 0.68
      const delayLP = ctx.createBiquadFilter()
      delayLP.type = 'lowpass'
      delayLP.frequency.value = 2200 // each repeat darkens
      const delayBus = ctx.createGain()
      delayBus.gain.value = 0.85
      delay.connect(delayLP)
      delayLP.connect(delayFb)
      delayFb.connect(delay)
      delay.connect(delayBus)
      delayBus.connect(master)

      // sub bass — continuous C1 sine, very slow LFO breathing
      const subOsc = ctx.createOscillator()
      subOsc.type = 'sine'
      subOsc.frequency.value = 32.7 // C1
      const subGain = ctx.createGain()
      subGain.gain.value = 0.085
      subOsc.connect(subGain)
      subGain.connect(master)
      subOsc.start()
      const subLFO = ctx.createOscillator()
      subLFO.frequency.value = 0.07 // ~14s period
      const subLFOGain = ctx.createGain()
      subLFOGain.gain.value = 0.04
      subLFO.connect(subLFOGain)
      subLFOGain.connect(subGain.gain)
      subLFO.start()

      // vinyl crackle — runs constantly, dub-techno texture bed
      const crackleBuf = ctx.createBuffer(1, ctx.sampleRate * 6, ctx.sampleRate)
      const cd = crackleBuf.getChannelData(0)
      for (let i = 0; i < cd.length; i++) {
        cd[i] = (Math.random() * 2 - 1) * 0.18
        if (Math.random() < 0.0003) cd[i] += (Math.random() * 2 - 1) * 0.7
      }
      const crackleSrc = ctx.createBufferSource()
      crackleSrc.buffer = crackleBuf
      crackleSrc.loop = true
      const crackleHP = ctx.createBiquadFilter()
      crackleHP.type = 'highpass'
      crackleHP.frequency.value = 2400
      const crackleGain = ctx.createGain()
      crackleGain.gain.value = 0.045
      crackleSrc.connect(crackleHP)
      crackleHP.connect(crackleGain)
      crackleGain.connect(master)
      crackleSrc.start()

      // master LPF base sweep — 32-bar period, slowly breathes the cutoff
      // (modulates the cursor-driven base value)
      // we won't use a separate LFO to avoid fighting the cursor — the
      // cursor is the performer. just leave the cursor in charge.

      startedAtRef.current = ctx.currentTime + 0.15
      nextStepRef.current = 0
      stabIdxRef.current = 0
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

    const scheduleStep = (time: number, step: number, bar: number) => {
      // KICK on every quarter starting bar 4 (intro: 4 bars of bass + crackle only)
      if (bar >= 4 && step % 4 === 0) {
        playKick(time, 0.55)
        // kick visual breathe
        const dt = (time - (audioCtxRef.current?.currentTime || time)) * 1000
        setTimeout(() => {
          kickGlowRef.current = 1
        }, Math.max(0, dt))
      }

      // HIHAT shuffle from bar 8 — dub techno hat is super sparse & ghostly
      if (bar >= 8) {
        const off = step % 4
        let amp = 0
        if (off === 0) amp = 0.05 // ghost on the kick
        else if (off === 1) amp = 0.07
        else if (off === 2) amp = 0.13 // accent on offbeat
        else if (off === 3) amp = 0.07
        if (amp > 0) playHat(time, amp)
      }

      // CHORD STAB — off-beats, 2 stabs per bar (steps 2 and 10), starting bar 8
      // chord rotates every 8 bars: Cm9 → Fm7 → Gm7 → Abmaj7 (32-bar progression)
      if (bar >= 8 && (step === 2 || step === 10)) {
        const segment = Math.floor((bar - 8) / 8) % CHORDS.length
        playStab(time, CHORDS[segment].notes, 0.4)
        stabIdxRef.current++
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
      osc.connect(env)
      env.connect(master)
      osc.start(time)
      osc.stop(time + 0.26)

      // click
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.022), ctx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      const noise = ctx.createBufferSource()
      noise.buffer = buf
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 1800
      const ng = ctx.createGain()
      ng.gain.setValueAtTime(amp * 0.12, time)
      ng.gain.exponentialRampToValueAtTime(0.001, time + 0.018)
      noise.connect(hp)
      hp.connect(ng)
      ng.connect(master)
      noise.start(time)
      noise.stop(time + 0.025)
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
      hp.type = 'highpass'
      hp.frequency.value = 7400
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 11000
      const env = ctx.createGain()
      env.gain.setValueAtTime(amp, time)
      env.gain.exponentialRampToValueAtTime(0.001, time + 0.038)
      noise.connect(hp)
      hp.connect(lp)
      lp.connect(env)
      env.connect(master)
      noise.start(time)
      noise.stop(time + 0.05)
    }

    const playStab = (time: number, notes: number[], amp: number) => {
      const ctx = audioCtxRef.current!
      const master = masterRef.current!
      const delay = dubDelayRef.current!

      // resonant LP with the classic stab sweep — opens fast, closes
      const stabLP = ctx.createBiquadFilter()
      stabLP.type = 'lowpass'
      stabLP.frequency.setValueAtTime(620, time)
      stabLP.frequency.linearRampToValueAtTime(1450, time + 0.035)
      stabLP.frequency.exponentialRampToValueAtTime(360, time + 0.20)
      stabLP.Q.value = 4.8

      const env = ctx.createGain()
      env.gain.setValueAtTime(0, time)
      env.gain.linearRampToValueAtTime(amp, time + 0.005)
      env.gain.exponentialRampToValueAtTime(0.001, time + 0.18)

      // detuned saw pair per note for the warm Juno-ish polysynth feel
      for (const f of notes) {
        for (const det of [-7, 6]) {
          const o = ctx.createOscillator()
          o.type = 'sawtooth'
          o.frequency.value = f
          o.detune.value = det
          o.connect(stabLP)
          o.start(time)
          o.stop(time + 0.22)
        }
      }
      stabLP.connect(env)

      // wet send into the dub delay loop (the genre's soul)
      const wetSend = ctx.createGain()
      wetSend.gain.value = 0.95
      env.connect(wetSend)
      wetSend.connect(delay)

      // small dry so first hit is audible before delay returns
      const dry = ctx.createGain()
      dry.gain.value = 0.28
      env.connect(dry)
      dry.connect(master)
    }

    // ────────────────────── render loop ──────────────────────

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
      kickGlowRef.current *= 0.86 // decay each frame

      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform2f(uCursor, cursorX, cursorY)
      gl.uniform1f(uTime, t)
      gl.uniform1f(uPulse, pulse)
      gl.uniform1f(uKick, kickGlowRef.current)
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
        try {
          audioCtxRef.current.close()
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

        {/* tap-to-start overlay — fades out once audio begins */}
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
          DUB TECHNO · CM · 116 BPM
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
            CURRENT.
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
            a track for L64.
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
            DRAG · RIDE THE FILTER &nbsp; TAP · STAB
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
