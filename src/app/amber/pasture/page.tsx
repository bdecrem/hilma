'use client'

import { useEffect, useRef, useState } from 'react'

// pasture — Boards of Canada-flavored soundtrack for the L60 weather field.
// Pure WebAudio, no samples. Chord cycle Am→F→C→G (8s each, 32s loop).
// Pad: detuned saws per chord note through chorus + resonant LP. Tape pitch
// warble: a master ±18-cent LFO at ~0.28Hz drives detune of every voice.
// Pluck: triangle melody on the A natural minor pentatonic, soft envelope,
// slap-back delay (~250ms, 0.45fb). Bass: low sine on the chord root, soft
// envelope. Vinyl crackle bed throughout.
// Visual hookups: chord change → smooth tween of accent color (1.5s);
// pluck note → small lime-bloom at random UV with the current accent color;
// bass kick → tightens the vignette briefly. The L60 weather shader is
// reused with three new uniforms (u_accent, u_pluckPulse, u_pluckPos,
// u_bassEnv).

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
uniform vec3 u_accent;
uniform float u_pluckPulse;
uniform vec2 u_pluckPos;
uniform float u_bassEnv;
out vec4 fragColor;

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
  vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.4;
  float t = u_time * 0.07;
  vec2 q = vec2(fbm(p + vec2(t, 0.0)), fbm(p + vec2(-t, 1.7)));
  vec2 r = vec2(
    fbm(p + 2.0 * q + vec2(1.7, 9.2) + 0.10 * t),
    fbm(p + 2.0 * q + vec2(8.3, 2.8) - 0.07 * t)
  );
  float n = fbm(p + 3.6 * r);
  float cloud = smoothstep(0.30, 0.78, n);

  // cursor light
  vec2 cursor = (u_cursor - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.4;
  float dC = length(p - cursor);
  float light = exp(-dC * dC * 0.55);
  float pulse = u_pulse * exp(-dC * dC * 1.4);

  vec3 cream = vec3(0.910, 0.910, 0.910);
  vec3 col = mix(cream, u_accent, clamp(light * 0.62 + pulse * 1.3, 0.0, 1.0));

  // pluck bloom — small bright spot at random position on each pluck event
  vec2 pluckP = (u_pluckPos - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.4;
  float dP = length(p - pluckP);
  float pluckBloom = u_pluckPulse * exp(-dP * dP * 6.0);
  col = mix(col, u_accent, clamp(pluckBloom * 0.7, 0.0, 1.0));

  float bright = cloud * (0.55 + light * 0.55 + pluckBloom * 0.5) + pulse * 0.45;
  col *= bright;

  // vignette — bass tightens it
  float vigR = 1.45 - u_bassEnv * 0.30;
  float vig = smoothstep(vigR, 0.55, length((uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0)));
  col *= mix(0.55, 1.0, vig);

  fragColor = vec4(col, 1.0);
}`

// Chord progression — Am natural minor → F → C → G. 8s per chord, 32s loop.
// accents are vec3 RGB (0..1) — each chord shifts the cursor-light color.
const CHORDS = [
  { name: 'Am', notes: [220.0, 261.63, 329.63], root: 110, accent: [0.776, 1.0, 0.235] },   // LIME
  { name: 'F',  notes: [174.61, 220.0, 261.63], root: 87.31, accent: [0.659, 0.329, 0.969] }, // UV
  { name: 'C',  notes: [261.63, 329.63, 392.0], root: 130.81, accent: [0.91, 0.91, 0.91] },   // CREAM (rest)
  { name: 'G',  notes: [196.0, 246.94, 293.66], root: 98.0, accent: [1.0, 0.478, 0.102] },    // SODIUM
]
const CHORD_DUR = 8

// composed motif — 7 notes + rest, ~12s phrase, in A natural minor.
// works over the Am→F→C→G cycle (most notes are common chord tones).
// each entry: time offset within the 12s phrase, frequency, relative gain
const PHRASE: { offset: number; freq: number; gain: number }[] = [
  { offset: 0.0,  freq: 440.0,  gain: 1.00 }, // A4
  { offset: 1.5,  freq: 392.0,  gain: 0.85 }, // G4
  { offset: 3.0,  freq: 329.63, gain: 0.95 }, // E4
  { offset: 4.5,  freq: 440.0,  gain: 0.90 }, // A4 (answer)
  { offset: 6.0,  freq: 493.88, gain: 0.78 }, // B4 (passing color)
  { offset: 7.5,  freq: 523.25, gain: 0.92 }, // C5 (lift)
  { offset: 9.0,  freq: 440.0,  gain: 0.82 }, // A4 (return)
  // 9.0 → 12.0 = rest, lets the phrase breathe
]
const PHRASE_DUR = 12

// per-cycle variations applied when scheduling — keeps the motif breathing
function applyPhraseVariation(idx: number, cycle: number) {
  // every 4th cycle drop the lift+return an octave (the "lo-fi tape ducks down")
  if (cycle % 4 === 3 && (idx === 5 || idx === 6)) {
    return { skip: false, freq: PHRASE[idx].freq * 0.5, gain: PHRASE[idx].gain * 0.85 }
  }
  // every 3rd cycle skip the passing B4 — leave a hole
  if (cycle % 3 === 1 && idx === 4) return { skip: true, freq: 0, gain: 0 }
  // every 5th cycle double the opening A4 with an octave-up ghost
  if (cycle % 5 === 2 && idx === 0) {
    return { skip: false, freq: PHRASE[idx].freq * 2, gain: PHRASE[idx].gain * 0.6 }
  }
  return { skip: false, freq: PHRASE[idx].freq, gain: PHRASE[idx].gain }
}

// bitcrush waveshaper — quantize amplitude to N steps for that 8-bit grit
function makeBitcrushCurve(steps: number) {
  const curve = new Float32Array(2048)
  for (let i = 0; i < 2048; i++) {
    const x = i / 1023.5 - 1
    curve[i] = Math.max(-1, Math.min(1, Math.round(x * steps) / steps))
  }
  return curve
}

// tape-style soft saturation curve — tanh
function makeSatCurve(drive: number) {
  const curve = new Float32Array(2048)
  const norm = Math.tanh(1 + drive * 3)
  for (let i = 0; i < 2048; i++) {
    const x = i / 1023.5 - 1
    curve[i] = Math.tanh(x * (1 + drive * 3)) / norm
  }
  return curve
}

type AudioEvent =
  | { when: number; type: 'pluck'; freq: number }
  | { when: number; type: 'bass'; freq: number }
  | { when: number; type: 'chord'; idx: number }

export default function PasturePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fallbackRef = useRef<HTMLDivElement>(null)
  const [needsTap, setNeedsTap] = useState(true)
  const [playing, setPlaying] = useState(false)

  // audio refs
  const audioCtxRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)
  const padBusRef = useRef<GainNode | null>(null)
  const padLPRef = useRef<BiquadFilterNode | null>(null)
  const warbleLFORef = useRef<OscillatorNode | null>(null)
  const warbleGainRef = useRef<GainNode | null>(null) // outputs cents to detune of any voice
  const pluckDelayRef = useRef<DelayNode | null>(null)
  const startedAtRef = useRef(0)
  const schedulerRef = useRef<number | null>(null)
  const eventQueueRef = useRef<AudioEvent[]>([])
  const nextChordRef = useRef(0)
  const phraseCycleRef = useRef(0)
  const phraseNoteIdxRef = useRef(0)
  const currentPadVoicesRef = useRef<{ stop: (t: number) => void }[]>([])
  const pluckChainRef = useRef<AudioNode | null>(null) // lo-fi pluck input

  // visual state (mutable refs to avoid React churn)
  const accentRef = useRef<[number, number, number]>([0.776, 1.0, 0.235])
  const accentTargetRef = useRef<[number, number, number]>([0.776, 1.0, 0.235])
  const pluckPulseRef = useRef(0)
  const pluckPosRef = useRef<[number, number]>([0.5, 0.5])
  const bassEnvRef = useRef(0)

  // ────────────────────────── audio engine ──────────────────────────

  const startAudio = () => {
    if (audioCtxRef.current) return
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    audioCtxRef.current = ctx

    const master = ctx.createGain()
    master.gain.setValueAtTime(0, ctx.currentTime)
    master.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 4)
    masterRef.current = master
    // master lo-fi chain: master → tape saturation → tilt LP → destination.
    // mild settings — enough to dirty the high end without mashing the mids.
    const masterSat = ctx.createWaveShaper()
    masterSat.curve = makeSatCurve(0.35)
    masterSat.oversample = '2x'
    const masterTilt = ctx.createBiquadFilter()
    masterTilt.type = 'lowpass'
    masterTilt.frequency.value = 5800
    masterTilt.Q.value = 0.7
    master.connect(masterSat)
    masterSat.connect(masterTilt)
    masterTilt.connect(ctx.destination)

    // ── tape warble — master detune LFO ──
    // Outputs in cents; connect to any voice's detune AudioParam.
    const warble = ctx.createOscillator()
    warble.type = 'sine'
    warble.frequency.value = 0.28 // ~3.5s period — slow tape wow
    const warbleGain = ctx.createGain()
    warbleGain.gain.value = 18 // ±18 cents
    warble.connect(warbleGain)
    warble.start()
    warbleLFORef.current = warble
    warbleGainRef.current = warbleGain

    // ── pad bus ──
    const padLP = ctx.createBiquadFilter()
    padLP.type = 'lowpass'
    padLP.frequency.value = 1100
    padLP.Q.value = 1.2
    padLPRef.current = padLP
    // very slow LFO on padLP cutoff (BoC's slow filter sweeps)
    const padLPLFO = ctx.createOscillator()
    padLPLFO.frequency.value = 0.03
    const padLPLFOGain = ctx.createGain()
    padLPLFOGain.gain.value = 500
    padLPLFO.connect(padLPLFOGain)
    padLPLFOGain.connect(padLP.frequency)
    padLPLFO.start()

    const padBus = ctx.createGain()
    padBus.gain.value = 0.55
    padBusRef.current = padBus
    padLP.connect(padBus)
    padBus.connect(master)

    // ── pluck chain — bitcrush + tilt LP for lo-fi music-box character ──
    // every pluck note routes to pluckIn → bitcrush → pluckTilt → pluckBus → master
    // a parallel send goes from pluckIn → pluckDelay (slap echo) and the delay
    // output also passes through the same pluck bus so echoes share the texture.
    const pluckIn = ctx.createGain()
    pluckIn.gain.value = 1
    const pluckCrush = ctx.createWaveShaper()
    pluckCrush.curve = makeBitcrushCurve(28) // ~5-bit
    pluckCrush.oversample = '2x'
    const pluckTilt = ctx.createBiquadFilter()
    pluckTilt.type = 'lowpass'
    pluckTilt.frequency.value = 4200
    pluckTilt.Q.value = 0.9
    const pluckBus = ctx.createGain()
    pluckBus.gain.value = 0.65
    pluckIn.connect(pluckCrush)
    pluckCrush.connect(pluckTilt)
    pluckTilt.connect(pluckBus)
    pluckBus.connect(master)
    pluckChainRef.current = pluckIn

    // slap-back delay for the pluck — wet feeds back through its own LP and
    // returns to the same lo-fi pluck chain so echoes stay textured.
    const pluckDelay = ctx.createDelay(1)
    pluckDelay.delayTime.value = 0.255
    const pluckFb = ctx.createGain()
    pluckFb.gain.value = 0.42
    const pluckDelayLP = ctx.createBiquadFilter()
    pluckDelayLP.type = 'lowpass'
    pluckDelayLP.frequency.value = 2200
    pluckDelay.connect(pluckDelayLP)
    pluckDelayLP.connect(pluckFb)
    pluckFb.connect(pluckDelay)
    pluckDelay.connect(pluckIn) // echoes pass through the bitcrush+tilt too
    pluckDelayRef.current = pluckDelay

    // ── vinyl crackle bed ──
    const crackleBuf = ctx.createBuffer(1, ctx.sampleRate * 6, ctx.sampleRate)
    const cd = crackleBuf.getChannelData(0)
    for (let i = 0; i < cd.length; i++) {
      cd[i] = (Math.random() * 2 - 1) * 0.16
      if (Math.random() < 0.0003) cd[i] += (Math.random() * 2 - 1) * 0.6
    }
    const crackleSrc = ctx.createBufferSource()
    crackleSrc.buffer = crackleBuf
    crackleSrc.loop = true
    const crackleHP = ctx.createBiquadFilter()
    crackleHP.type = 'highpass'
    crackleHP.frequency.value = 2200
    const crackleGain = ctx.createGain()
    crackleGain.gain.value = 0.045
    crackleSrc.connect(crackleHP)
    crackleHP.connect(crackleGain)
    crackleGain.connect(master)
    crackleSrc.start()

    startedAtRef.current = ctx.currentTime + 0.2
    nextChordRef.current = 0
    phraseCycleRef.current = 0
    phraseNoteIdxRef.current = 0
    eventQueueRef.current = []

    schedulerRef.current = window.setInterval(() => scheduleAhead(), 50)
  }

  const stopAudio = () => {
    if (schedulerRef.current) {
      clearInterval(schedulerRef.current)
      schedulerRef.current = null
    }
    if (audioCtxRef.current) {
      const ctx = audioCtxRef.current
      const m = masterRef.current
      if (m) {
        const t = ctx.currentTime
        m.gain.cancelScheduledValues(t)
        m.gain.setValueAtTime(m.gain.value, t)
        m.gain.linearRampToValueAtTime(0, t + 0.6)
      }
      setTimeout(() => {
        try {
          audioCtxRef.current?.close()
        } catch {}
        audioCtxRef.current = null
        masterRef.current = null
        currentPadVoicesRef.current = []
      }, 700)
    }
  }

  const scheduleAhead = () => {
    const ctx = audioCtxRef.current
    if (!ctx) return
    const horizon = ctx.currentTime + 0.3

    // schedule chord changes
    while (true) {
      const chordTime = startedAtRef.current + nextChordRef.current * CHORD_DUR
      if (chordTime > horizon) break
      const idx = nextChordRef.current % CHORDS.length
      scheduleChord(chordTime, idx)
      nextChordRef.current++
    }

    // schedule pluck notes — composed motif, walks through PHRASE notes one
    // at a time and advances to the next cycle when the phrase ends.
    while (true) {
      const phraseStart =
        startedAtRef.current + phraseCycleRef.current * PHRASE_DUR
      const note = PHRASE[phraseNoteIdxRef.current]
      const noteTime = phraseStart + note.offset
      if (noteTime > horizon) break
      const v = applyPhraseVariation(phraseNoteIdxRef.current, phraseCycleRef.current)
      if (!v.skip) schedulePluck(noteTime, v.freq, v.gain)
      phraseNoteIdxRef.current++
      if (phraseNoteIdxRef.current >= PHRASE.length) {
        phraseNoteIdxRef.current = 0
        phraseCycleRef.current++
      }
    }
  }

  const scheduleChord = (time: number, idx: number) => {
    const ctx = audioCtxRef.current!
    const padLP = padLPRef.current!
    const warbleGain = warbleGainRef.current!
    const chord = CHORDS[idx]

    // fade out previous pad voices
    for (const v of currentPadVoicesRef.current) v.stop(time + 0.05)
    currentPadVoicesRef.current = []

    // build a new pad: 4 detuned saws per chord note
    const newVoices: { stop: (t: number) => void }[] = []
    for (const f of chord.notes) {
      for (const det of [-9, -3, 4, 8]) {
        const osc = ctx.createOscillator()
        osc.type = 'sawtooth'
        osc.frequency.value = f
        osc.detune.value = det
        // tape warble drives detune (cents) too — additive with the per-voice det
        warbleGain.connect(osc.detune)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, time)
        g.gain.linearRampToValueAtTime(0.06, time + 0.7) // slow attack
        osc.connect(g)
        g.connect(padLP)
        osc.start(time)
        newVoices.push({
          stop: (releaseT) => {
            g.gain.cancelScheduledValues(releaseT)
            g.gain.setValueAtTime(g.gain.value, releaseT)
            g.gain.linearRampToValueAtTime(0, releaseT + 0.8) // slow release
            osc.stop(releaseT + 0.85)
          },
        })
      }
    }
    currentPadVoicesRef.current = newVoices

    // also play a bass note on chord change
    schedulePadBass(time, chord.root)

    // push visual events
    eventQueueRef.current.push({ when: time, type: 'chord', idx })
    eventQueueRef.current.push({ when: time, type: 'bass', freq: chord.root })
  }

  const schedulePadBass = (time: number, freq: number) => {
    const ctx = audioCtxRef.current!
    const master = masterRef.current!
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq * 0.5 // octave down — sub
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, time)
    env.gain.linearRampToValueAtTime(0.32, time + 0.04)
    env.gain.exponentialRampToValueAtTime(0.001, time + 1.6)
    osc.connect(env)
    env.connect(master)
    osc.start(time)
    osc.stop(time + 1.7)
  }

  const schedulePluck = (time: number, freq: number, gain: number) => {
    const ctx = audioCtxRef.current!
    const pluckChain = pluckChainRef.current!
    const pluckDelay = pluckDelayRef.current!
    const warbleGain = warbleGainRef.current!

    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = freq
    warbleGain.connect(osc.detune)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, time)
    env.gain.linearRampToValueAtTime(0.20 * gain, time + 0.012)
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.85)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 180
    osc.connect(hp)
    hp.connect(env)

    // dry → lo-fi pluck chain (bitcrush + tilt LP) → master
    const dry = ctx.createGain()
    dry.gain.value = 0.65
    env.connect(dry)
    dry.connect(pluckChain)

    // wet → slap delay (which also returns through the pluck chain)
    const wet = ctx.createGain()
    wet.gain.value = 0.6
    env.connect(wet)
    wet.connect(pluckDelay)

    osc.start(time)
    osc.stop(time + 0.9)

    eventQueueRef.current.push({ when: time + 0.012, type: 'pluck', freq })
  }

  // ────────────────────────── visuals (WebGL) ──────────────────────────

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
    const uAccent = gl.getUniformLocation(prog, 'u_accent')
    const uPluckPulse = gl.getUniformLocation(prog, 'u_pluckPulse')
    const uPluckPos = gl.getUniformLocation(prog, 'u_pluckPos')
    const uBassEnv = gl.getUniformLocation(prog, 'u_bassEnv')

    const DPR = Math.min(window.devicePixelRatio || 1, 1.5)
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
    let down = false
    let downX = 0,
      downY = 0,
      downT = 0
    let moved = false

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

    const startT = performance.now() / 1000
    let raf = 0
    const tick = (now: number) => {
      const t = now / 1000 - startT
      const audioT = audioCtxRef.current?.currentTime ?? 0

      // process audio events
      const queue = eventQueueRef.current
      while (queue.length > 0 && queue[0].when <= audioT + 0.02) {
        const ev = queue.shift()!
        if (ev.type === 'chord') {
          accentTargetRef.current = [...CHORDS[ev.idx].accent] as [number, number, number]
        } else if (ev.type === 'pluck') {
          pluckPulseRef.current = 1
          pluckPosRef.current = [Math.random() * 0.85 + 0.075, Math.random() * 0.7 + 0.15]
        } else if (ev.type === 'bass') {
          bassEnvRef.current = Math.min(1, bassEnvRef.current + 0.85)
        }
      }

      // tween accent → target
      const easeRate = 0.06
      for (let i = 0; i < 3; i++) {
        accentRef.current[i] += (accentTargetRef.current[i] - accentRef.current[i]) * easeRate
      }

      // decay pluck and bass envelopes
      pluckPulseRef.current *= 0.93
      bassEnvRef.current *= 0.97

      // pulse decay (tap)
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
      gl.uniform3f(uAccent, accentRef.current[0], accentRef.current[1], accentRef.current[2])
      gl.uniform1f(uPluckPulse, pluckPulseRef.current)
      gl.uniform2f(uPluckPos, pluckPosRef.current[0], pluckPosRef.current[1])
      gl.uniform1f(uBassEnv, bassEnvRef.current)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

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
    }
  }, [])

  // ────────────────────────── lifecycle ──────────────────────────

  useEffect(() => {
    return () => {
      if (schedulerRef.current) clearInterval(schedulerRef.current)
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close()
        } catch {}
      }
    }
  }, [])

  const handleTap = () => {
    if (playing) {
      stopAudio()
      setPlaying(false)
      setNeedsTap(true)
    } else {
      startAudio()
      setPlaying(true)
      setNeedsTap(false)
    }
  }

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
          style={{ display: 'block', touchAction: 'none', cursor: 'crosshair' }}
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

        {needsTap && (
          <button
            onClick={handleTap}
            aria-label="play"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 5,
            }}
          >
            <span
              style={{
                fontFamily: '"Courier Prime", monospace',
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: '0.3em',
                color: '#E8E8E8',
                opacity: 0.85,
                padding: '14px 22px',
                border: '1px solid rgba(232,232,232,0.35)',
                textTransform: 'uppercase',
                background: 'rgba(10,10,10,0.45)',
              }}
            >
              tap to begin
              <span style={{ color: '#C6FF3C', marginLeft: 6 }}>·</span>
            </span>
          </button>
        )}

        {!needsTap && (
          <button
            onClick={handleTap}
            aria-label={playing ? 'stop' : 'play'}
            style={{
              position: 'fixed',
              top: 'calc(20px + env(safe-area-inset-top, 0px))',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 4,
              background: 'transparent',
              border: '1px solid rgba(232,232,232,0.25)',
              padding: '5px 12px',
              cursor: 'pointer',
              fontFamily: '"Courier Prime", monospace',
              fontWeight: 700,
              fontSize: 9,
              letterSpacing: '0.22em',
              color: '#E8E8E8',
              opacity: 0.7,
              textTransform: 'uppercase',
            }}
          >
            {playing ? '■ stop' : '▶ play'}
          </button>
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
          PASTURE · BOC · 32S LOOP
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
            pasture
            <span style={{ color: '#C6FF3C' }}>.</span>
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
            in a quiet field.
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
