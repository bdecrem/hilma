'use client'

import { useEffect, useRef, useState } from 'react'

// slice — Octatrack-style glitch sampler over the L60 weather field.
// Pure WebAudio. No samples on disk: at startup, four "source buffers" are
// rendered offline via OfflineAudioContext — a chord pad, a vocal-formant
// noise sweep, a percussion hit, a metallic shimmer. Then a 124 BPM, 16-step
// sequencer triggers SLICES of those buffers (random start points, variable
// playback rate, occasional reverse, stutter re-triggers) through a bitcrush
// + tilt-LP chain into a feedback delay. Trig conditions / step probability
// keep the rhythm broken instead of 4-on-the-floor. Sub-kick on key beats
// for grounding. Visual: the L60 field with one accent-colored bloom per
// slice (color per buffer family); stutters create rapid-fire blooms; the
// field intensity tracks total slice activity.

const FIELD_HEX = '#0A0A0A'
const CREAM_RGB: [number, number, number] = [0.91, 0.91, 0.91]
const LIME_RGB: [number, number, number] = [0.776, 1.0, 0.235]
const UV_RGB: [number, number, number] = [0.659, 0.329, 0.969]
const SODIUM_RGB: [number, number, number] = [1.0, 0.478, 0.102]
const FLARE_RGB: [number, number, number] = [1.0, 0.184, 0.494]

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
uniform float u_intensity;       // tracks total slice activity (0..1)
// up to 8 simultaneous bloom slots — each with position + age + color + amp
uniform vec2 u_bloomPos[8];
uniform float u_bloomAge[8];
uniform vec3 u_bloomCol[8];
uniform float u_bloomAmp[8];
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
  float v = 0.0; float a = 0.5;
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

  vec2 cursor = (u_cursor - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.4;
  float dC = length(p - cursor);
  float light = exp(-dC * dC * 0.55);
  float pulse = u_pulse * exp(-dC * dC * 1.4);

  vec3 cream = vec3(0.910);
  vec3 col = mix(cream, u_accent, clamp(light * 0.5 + pulse * 1.3, 0.0, 1.0));

  // accumulate up to 8 simultaneous blooms
  float bloomBoost = 0.0;
  vec3 bloomCol = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    if (u_bloomAmp[i] <= 0.0) continue;
    vec2 bp = (u_bloomPos[i] - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0) * 2.4;
    float dB = length(p - bp);
    // each bloom: tight gaussian peak that shrinks with age
    float radius = 0.10 + u_bloomAge[i] * 0.45; // grows as it ages
    float falloff = exp(-dB * dB / (radius * radius * 0.8 + 0.001));
    float amp = u_bloomAmp[i] * (1.0 - u_bloomAge[i]); // fades out
    bloomBoost += amp * falloff;
    bloomCol += amp * falloff * u_bloomCol[i];
  }
  // mix bloom color over base
  col = mix(col, bloomCol / max(bloomBoost, 0.001), clamp(bloomBoost * 1.2, 0.0, 0.85));

  // intensity raises the cloud floor when slices are firing fast
  float floorBoost = u_intensity * 0.20;
  float bright = (cloud + floorBoost) * (0.55 + light * 0.55 + bloomBoost * 0.4) + pulse * 0.45;
  col *= bright;

  // gentle vignette
  float vig = smoothstep(1.45, 0.55, length((uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0)));
  col *= mix(0.55, 1.0, vig);

  fragColor = vec4(col, 1.0);
}`

// ─── audio config ───
const BPM = 124
const STEP_S = 60 / BPM / 4 // 16th note ≈ 0.121s
const STEPS_PER_BAR = 16
const BARS_LOOP = 16

type SrcKind = 'pad' | 'vox' | 'perc' | 'metal'

type Bloom = {
  active: boolean
  posX: number
  posY: number
  age: number
  life: number
  color: [number, number, number]
  amp: number
}

// ─── offline-rendered source buffers ───
async function renderSources(sampleRate = 44100): Promise<Record<SrcKind, AudioBuffer>> {
  // pad: a sustained Am9 chord (A C E G B), 1.5s, smoothly enveloped
  const pad = await renderOffline(sampleRate, 1.5, (ctx, dur) => {
    const out = ctx.createGain()
    out.gain.setValueAtTime(0, 0)
    out.gain.linearRampToValueAtTime(0.6, 0.18)
    out.gain.linearRampToValueAtTime(0.55, dur - 0.25)
    out.gain.linearRampToValueAtTime(0, dur)
    out.connect(ctx.destination)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1400
    lp.Q.value = 1.0
    lp.connect(out)
    for (const f of [220, 261.63, 329.63, 392, 493.88]) {
      for (const det of [-9, 4, 8]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = f
        o.detune.value = det
        const g = ctx.createGain()
        g.gain.value = 0.05
        o.connect(g)
        g.connect(lp)
        o.start(0)
        o.stop(dur)
      }
    }
  })

  // vox: vowel-like formant noise sweep, 1.0s — peaks at 750/1100/2400 Hz (Æ-ish)
  const vox = await renderOffline(sampleRate, 1.0, (ctx, dur) => {
    const buf = ctx.createBuffer(1, sampleRate * dur, sampleRate)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = false
    const out = ctx.createGain()
    out.gain.setValueAtTime(0, 0)
    out.gain.linearRampToValueAtTime(0.7, 0.05)
    out.gain.linearRampToValueAtTime(0, dur)
    out.connect(ctx.destination)
    // three formant peaks (vowel character)
    const peaks = [
      { f: 700, q: 8, g: 0.8 },
      { f: 1100, q: 7, g: 0.6 },
      { f: 2400, q: 5, g: 0.5 },
    ]
    let prev: AudioNode = src
    for (const p of peaks) {
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(p.f * 0.85, 0)
      bp.frequency.linearRampToValueAtTime(p.f * 1.15, dur) // sweeping vowel
      bp.Q.value = p.q
      const g = ctx.createGain()
      g.gain.value = p.g
      prev.connect(bp)
      bp.connect(g)
      g.connect(out)
    }
    src.start(0)
  })

  // perc: short percussion hit (kick body + noise click), 0.2s
  const perc = await renderOffline(sampleRate, 0.2, (ctx, dur) => {
    const out = ctx.createGain()
    out.gain.value = 0.95
    out.connect(ctx.destination)
    // kick body
    const k = ctx.createOscillator()
    k.type = 'sine'
    k.frequency.setValueAtTime(110, 0)
    k.frequency.exponentialRampToValueAtTime(45, 0.08)
    const kg = ctx.createGain()
    kg.gain.setValueAtTime(0.9, 0)
    kg.gain.exponentialRampToValueAtTime(0.001, dur)
    k.connect(kg)
    kg.connect(out)
    k.start(0)
    k.stop(dur)
    // click
    const buf = ctx.createBuffer(1, sampleRate * 0.025, sampleRate)
    const cd = buf.getChannelData(0)
    for (let i = 0; i < cd.length; i++) cd[i] = Math.random() * 2 - 1
    const click = ctx.createBufferSource()
    click.buffer = buf
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 1500
    const cg = ctx.createGain()
    cg.gain.setValueAtTime(0.4, 0)
    cg.gain.exponentialRampToValueAtTime(0.001, 0.022)
    click.connect(hp)
    hp.connect(cg)
    cg.connect(out)
    click.start(0)
  })

  // metal: FM-style metallic shimmer, 1.0s, slow decay
  const metal = await renderOffline(sampleRate, 1.0, (ctx, dur) => {
    const out = ctx.createGain()
    out.gain.setValueAtTime(0, 0)
    out.gain.linearRampToValueAtTime(0.5, 0.02)
    out.gain.exponentialRampToValueAtTime(0.001, dur)
    out.connect(ctx.destination)
    // carrier + modulator (FM)
    const carrier = ctx.createOscillator()
    carrier.type = 'sine'
    carrier.frequency.value = 880
    const mod = ctx.createOscillator()
    mod.type = 'sine'
    mod.frequency.value = 1247 // inharmonic ratio
    const modGain = ctx.createGain()
    modGain.gain.value = 600
    mod.connect(modGain)
    modGain.connect(carrier.frequency)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 600
    carrier.connect(hp)
    hp.connect(out)
    carrier.start(0)
    mod.start(0)
    carrier.stop(dur)
    mod.stop(dur)
  })

  return { pad, vox, perc, metal }
}

function renderOffline(
  sampleRate: number,
  duration: number,
  build: (ctx: OfflineAudioContext, dur: number) => void
): Promise<AudioBuffer> {
  const Off =
    (window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext })
      .OfflineAudioContext || OfflineAudioContext
  const ctx = new Off(1, Math.ceil(sampleRate * duration), sampleRate)
  build(ctx, duration)
  return ctx.startRendering()
}

// ─── waveshaper curves ───
function makeBitcrushCurve(steps: number) {
  const c = new Float32Array(2048)
  for (let i = 0; i < 2048; i++) {
    const x = i / 1023.5 - 1
    c[i] = Math.max(-1, Math.min(1, Math.round(x * steps) / steps))
  }
  return c
}
function makeSatCurve(drive: number) {
  const c = new Float32Array(2048)
  const norm = Math.tanh(1 + drive * 3)
  for (let i = 0; i < 2048; i++) {
    const x = i / 1023.5 - 1
    c[i] = Math.tanh(x * (1 + drive * 3)) / norm
  }
  return c
}

const SRC_COLOR: Record<SrcKind, [number, number, number]> = {
  pad: LIME_RGB,
  vox: UV_RGB,
  perc: CREAM_RGB,
  metal: SODIUM_RGB,
}

export default function SlicePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fallbackRef = useRef<HTMLDivElement>(null)
  const [needsTap, setNeedsTap] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)
  const sliceBusRef = useRef<AudioNode | null>(null)
  const sliceDelayRef = useRef<DelayNode | null>(null)
  const buffersRef = useRef<Record<SrcKind, AudioBuffer> | null>(null)
  const startedAtRef = useRef(0)
  const nextStepRef = useRef(0)
  const schedulerRef = useRef<number | null>(null)

  // visual state
  const accentRef = useRef<[number, number, number]>([0.776, 1.0, 0.235])
  const accentTargetRef = useRef<[number, number, number]>([0.776, 1.0, 0.235])
  const intensityRef = useRef(0)
  const bloomsRef = useRef<Bloom[]>(
    Array.from({ length: 8 }, () => ({
      active: false,
      posX: 0.5,
      posY: 0.5,
      age: 0,
      life: 0.6,
      color: [0.91, 0.91, 0.91],
      amp: 0,
    }))
  )

  // ─── sequencer ───

  const startAudio = async () => {
    if (audioCtxRef.current) return
    setLoading(true)
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    audioCtxRef.current = ctx

    // master chain — light tape sat + tilt
    const master = ctx.createGain()
    master.gain.setValueAtTime(0, ctx.currentTime)
    master.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 1.5)
    masterRef.current = master
    const masterSat = ctx.createWaveShaper()
    masterSat.curve = makeSatCurve(0.4)
    masterSat.oversample = '2x'
    const masterTilt = ctx.createBiquadFilter()
    masterTilt.type = 'lowpass'
    masterTilt.frequency.value = 6800
    masterTilt.Q.value = 0.7
    master.connect(masterSat)
    masterSat.connect(masterTilt)
    masterTilt.connect(ctx.destination)

    // slice bus — bitcrush + tilt lp + send into delay
    const sliceIn = ctx.createGain()
    sliceIn.gain.value = 1
    sliceBusRef.current = sliceIn
    const crush = ctx.createWaveShaper()
    crush.curve = makeBitcrushCurve(36) // ~6-bit, more sample-y than the BoC pluck
    crush.oversample = '2x'
    const tilt = ctx.createBiquadFilter()
    tilt.type = 'lowpass'
    tilt.frequency.value = 5500
    tilt.Q.value = 0.9
    const sliceOut = ctx.createGain()
    sliceOut.gain.value = 0.62
    sliceIn.connect(crush)
    crush.connect(tilt)
    tilt.connect(sliceOut)
    sliceOut.connect(master)

    // delay loop — dotted-eighth feel (very dub)
    const delay = ctx.createDelay(2)
    delay.delayTime.value = (60 / BPM) * 0.75 // dotted eighth
    sliceDelayRef.current = delay
    const dfb = ctx.createGain()
    dfb.gain.value = 0.45
    const dlp = ctx.createBiquadFilter()
    dlp.type = 'lowpass'
    dlp.frequency.value = 2000
    delay.connect(dlp)
    dlp.connect(dfb)
    dfb.connect(delay)
    const delayOut = ctx.createGain()
    delayOut.gain.value = 0.55
    delay.connect(delayOut)
    delayOut.connect(master)

    // vinyl crackle bed
    const crackleBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate)
    const cd = crackleBuf.getChannelData(0)
    for (let i = 0; i < cd.length; i++) {
      cd[i] = (Math.random() * 2 - 1) * 0.18
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

    // pre-render the four source buffers
    try {
      buffersRef.current = await renderSources(ctx.sampleRate)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('failed to render sources', e)
    }
    setLoading(false)

    startedAtRef.current = ctx.currentTime + 0.2
    nextStepRef.current = 0
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
        m.gain.linearRampToValueAtTime(0, t + 0.4)
      }
      setTimeout(() => {
        try {
          audioCtxRef.current?.close()
        } catch {}
        audioCtxRef.current = null
        masterRef.current = null
        sliceBusRef.current = null
        sliceDelayRef.current = null
        buffersRef.current = null
      }, 500)
    }
  }

  // ─── sequencer pattern ───
  // The grid is broken by design. Each step has a kind, probability,
  // and a small list of glitch flags. Steps are picked to sound like
  // someone live-slicing on an Octatrack — clusters of activity, holes,
  // stutters, sub-kicks on weight-bearing beats.
  // Pattern is per-bar; bar variation comes from per-bar trig conditions.
  const stepDef = (
    bar: number,
    step: number
  ): {
    fire: boolean
    kind?: SrcKind
    rate?: number
    sliceStart?: number
    sliceLen?: number
    reverse?: boolean
    stutter?: number
    gain?: number
    isKick?: boolean
  } => {
    // sub kick — heavy on 0, light on 8 every other bar, occasional 11
    if (step === 0) return { fire: true, kind: 'perc', isKick: true, gain: 1.0, sliceStart: 0, sliceLen: 0.18 }
    if (step === 8 && bar % 2 === 1) return { fire: true, kind: 'perc', isKick: true, gain: 0.7, sliceStart: 0, sliceLen: 0.18 }
    if (step === 11 && bar % 4 === 2) return { fire: true, kind: 'perc', isKick: true, gain: 0.55, sliceStart: 0, sliceLen: 0.14 }

    // pad slices — long, occasional, heavy on bars 2/6/10/14 (mid-phrase)
    if (step === 4 && bar % 4 === 1) {
      return { fire: true, kind: 'pad', rate: 1.0, sliceStart: Math.random() * 0.5, sliceLen: 0.5 + Math.random() * 0.5, gain: 0.6 }
    }
    if (step === 12 && bar % 4 === 3) {
      return { fire: true, kind: 'pad', rate: 0.5, sliceStart: Math.random() * 0.5, sliceLen: 0.7, gain: 0.5, reverse: true }
    }

    // vox slices — scattered, rare; the "ghost voice" hits
    if ((step === 5 || step === 13) && Math.random() < 0.55) {
      return {
        fire: true,
        kind: 'vox',
        rate: 0.5 + Math.random() * 1.0,
        sliceStart: Math.random() * 0.7,
        sliceLen: 0.08 + Math.random() * 0.2,
        gain: 0.7,
        reverse: Math.random() < 0.18,
      }
    }

    // metal shimmer — sparse, sometimes stutters
    if (step === 14 && bar % 4 === 3) {
      return { fire: true, kind: 'metal', rate: 1.5, sliceStart: 0.1, sliceLen: 0.15, gain: 0.6, stutter: 4 }
    }
    if (step === 6 && bar % 8 === 5) {
      return { fire: true, kind: 'metal', rate: 0.75, sliceStart: 0.2, sliceLen: 0.2, gain: 0.55 }
    }

    // perc fills — broken hi-hat-like ticks at off positions, probabilistic
    const offSteps = [2, 3, 7, 9, 10, 14, 15]
    if (offSteps.includes(step) && Math.random() < 0.25) {
      return {
        fire: true,
        kind: 'perc',
        rate: 1.5 + Math.random() * 1.0,
        sliceStart: 0.04 + Math.random() * 0.05, // skip the kick body, get the click
        sliceLen: 0.04,
        gain: 0.35,
      }
    }

    // every 8 bars: a stutter cluster on step 13/14/15 of bar 7 — the build
    if (bar % 8 === 7 && step === 14) {
      return {
        fire: true,
        kind: Math.random() < 0.5 ? 'metal' : 'vox',
        rate: 0.8 + Math.random() * 0.6,
        sliceStart: Math.random() * 0.5,
        sliceLen: 0.05,
        gain: 0.5,
        stutter: 6,
      }
    }

    return { fire: false }
  }

  const scheduleAhead = () => {
    const ctx = audioCtxRef.current
    if (!ctx || !buffersRef.current) return
    const horizon = ctx.currentTime + 0.25
    while (true) {
      const stepTime = startedAtRef.current + nextStepRef.current * STEP_S
      if (stepTime > horizon) break
      const absStep = nextStepRef.current
      const step = absStep % STEPS_PER_BAR
      const bar = Math.floor(absStep / STEPS_PER_BAR) % BARS_LOOP
      const def = stepDef(bar, step)
      if (def.fire) playSlice(stepTime, def)
      // also push an accent shift event every 8 bars
      if (step === 0 && bar % 4 === 0) {
        const palettes: [number, number, number][] = [
          LIME_RGB,
          UV_RGB,
          SODIUM_RGB,
          FLARE_RGB,
        ]
        accentTargetRef.current = palettes[(bar / 4) % palettes.length]
      }
      nextStepRef.current++
    }
  }

  const playSlice = (
    time: number,
    def: ReturnType<typeof stepDef>
  ) => {
    const ctx = audioCtxRef.current
    if (!ctx || !buffersRef.current || !def.fire || !def.kind) return
    const sliceIn = sliceBusRef.current!
    const delay = sliceDelayRef.current!
    const buf = buffersRef.current[def.kind]

    const stutter = Math.max(1, def.stutter ?? 1)
    const stutterStep = STEP_S / stutter

    for (let s = 0; s < stutter; s++) {
      const triggerT = time + s * stutterStep
      // build the buffer source — possibly reversed, with sliced range
      let src: AudioBufferSourceNode
      if (def.reverse) {
        // reverse the relevant slice into a fresh one-shot buffer
        const len = Math.floor((def.sliceLen ?? 0.2) * buf.sampleRate)
        const startIdx = Math.floor((def.sliceStart ?? 0) * buf.duration * buf.sampleRate)
        const fresh = ctx.createBuffer(1, len, buf.sampleRate)
        const dst = fresh.getChannelData(0)
        const srcData = buf.getChannelData(0)
        for (let i = 0; i < len; i++) {
          const j = Math.min(srcData.length - 1, Math.max(0, startIdx + len - 1 - i))
          dst[i] = srcData[j]
        }
        src = ctx.createBufferSource()
        src.buffer = fresh
      } else {
        src = ctx.createBufferSource()
        src.buffer = buf
      }
      src.playbackRate.value = def.rate ?? 1.0

      const env = ctx.createGain()
      const peak = (def.gain ?? 0.5) * (def.isKick ? 1.0 : 0.65)
      env.gain.setValueAtTime(0, triggerT)
      env.gain.linearRampToValueAtTime(peak, triggerT + 0.005)
      const sliceLen = def.sliceLen ?? 0.2
      env.gain.exponentialRampToValueAtTime(0.001, triggerT + Math.max(0.04, sliceLen))

      src.connect(env)

      if (def.isKick) {
        // kick goes direct to master with its own sub character (skip the bitcrush so it stays punchy)
        env.connect(masterRef.current!)
      } else {
        env.connect(sliceIn)
        // also send a portion to the delay
        const wet = ctx.createGain()
        wet.gain.value = 0.45
        env.connect(wet)
        wet.connect(delay)
      }

      // the source's start offset within the buffer
      const startOffset = def.reverse ? 0 : (def.sliceStart ?? 0) * buf.duration
      const playDur = (def.sliceLen ?? 0.2) / (def.rate ?? 1.0)
      try {
        src.start(triggerT, startOffset, playDur)
      } catch {
        src.start(triggerT)
      }

      // visual event — bloom at random position with the buffer's color
      pushBloom({
        time: triggerT,
        color: def.isKick ? CREAM_RGB : SRC_COLOR[def.kind],
        amp: peak * 1.4,
        kick: !!def.isKick,
      })
    }
  }

  const pendingBloomsRef = useRef<
    { time: number; color: [number, number, number]; amp: number; kick: boolean }[]
  >([])
  const pushBloom = (b: { time: number; color: [number, number, number]; amp: number; kick: boolean }) => {
    pendingBloomsRef.current.push(b)
  }

  const claimBloomSlot = (): Bloom | null => {
    const slots = bloomsRef.current
    // find a slot with the lowest remaining time
    let bestIdx = -1
    let bestRemaining = Infinity
    for (let i = 0; i < slots.length; i++) {
      const remaining = slots[i].active ? slots[i].life - slots[i].age * slots[i].life : -1
      if (remaining < bestRemaining) {
        bestRemaining = remaining
        bestIdx = i
      }
    }
    return bestIdx >= 0 ? slots[bestIdx] : null
  }

  // ─── visuals (WebGL) ───
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
    const uAccent = gl.getUniformLocation(prog, 'u_accent')
    const uIntensity = gl.getUniformLocation(prog, 'u_intensity')
    const uBloomPos = gl.getUniformLocation(prog, 'u_bloomPos')
    const uBloomAge = gl.getUniformLocation(prog, 'u_bloomAge')
    const uBloomCol = gl.getUniformLocation(prog, 'u_bloomCol')
    const uBloomAmp = gl.getUniformLocation(prog, 'u_bloomAmp')

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

    let cursorX = 0.55,
      cursorY = 0.55
    let pulseStart = -1
    let down = false,
      downX = 0,
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

    const startT = performance.now() / 1000
    let lastFrame = startT
    let raf = 0

    const tick = (now: number) => {
      const t = now / 1000 - startT
      const dt = Math.min(0.1, t - (lastFrame - startT))
      lastFrame = now / 1000
      const audioT = audioCtxRef.current?.currentTime ?? 0

      // process pending blooms whose audio time has arrived
      const pending = pendingBloomsRef.current
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i].time <= audioT + 0.03) {
          const b = pending[i]
          pending.splice(i, 1)
          const slot = claimBloomSlot()
          if (slot) {
            slot.active = true
            slot.posX = Math.random() * 0.85 + 0.075
            slot.posY = Math.random() * 0.7 + 0.15
            slot.age = 0
            slot.life = b.kick ? 0.5 : 0.7
            slot.color = b.color
            slot.amp = Math.min(1.0, b.amp)
          }
          intensityRef.current = Math.min(1, intensityRef.current + (b.kick ? 0.25 : 0.10))
        }
      }

      // advance bloom ages
      for (const slot of bloomsRef.current) {
        if (!slot.active) continue
        slot.age += dt / slot.life
        if (slot.age >= 1) {
          slot.active = false
          slot.amp = 0
        }
      }

      // ease intensity down
      intensityRef.current = Math.max(0, intensityRef.current - dt * 0.6)

      // ease accent
      const easeRate = 0.04
      for (let i = 0; i < 3; i++) {
        accentRef.current[i] += (accentTargetRef.current[i] - accentRef.current[i]) * easeRate
      }

      let pulse = 0
      if (pulseStart > 0) {
        const age = now / 1000 - pulseStart
        if (age < 1.2) pulse = (1 - age / 1.2) * Math.exp(-age * 0.7)
        else pulseStart = -1
      }

      // pack bloom uniforms
      const bp = new Float32Array(16)
      const ba = new Float32Array(8)
      const bc = new Float32Array(24)
      const bm = new Float32Array(8)
      const slots = bloomsRef.current
      for (let i = 0; i < 8; i++) {
        const s = slots[i]
        bp[i * 2] = s.posX
        bp[i * 2 + 1] = s.posY
        ba[i] = s.active ? s.age : 1
        bc[i * 3] = s.color[0]
        bc[i * 3 + 1] = s.color[1]
        bc[i * 3 + 2] = s.color[2]
        bm[i] = s.active ? s.amp : 0
      }

      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform2f(uCursor, cursorX, cursorY)
      gl.uniform1f(uTime, t)
      gl.uniform1f(uPulse, pulse)
      gl.uniform3f(uAccent, accentRef.current[0], accentRef.current[1], accentRef.current[2])
      gl.uniform1f(uIntensity, intensityRef.current)
      gl.uniform2fv(uBloomPos, bp)
      gl.uniform1fv(uBloomAge, ba)
      gl.uniform3fv(uBloomCol, bc)
      gl.uniform1fv(uBloomAmp, bm)
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

  const handleTap = async () => {
    if (playing) {
      stopAudio()
      setPlaying(false)
      setNeedsTap(true)
    } else {
      await startAudio()
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
          background: FIELD_HEX,
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

        {needsTap && (
          <button
            onClick={handleTap}
            aria-label="play"
            disabled={loading}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'transparent',
              border: 'none',
              cursor: loading ? 'wait' : 'pointer',
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
              {loading ? 'loading…' : 'tap to begin'}
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
          SLICE · 124 BPM · OCTATRACK
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
            slice
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
            chopped, retriggered, rebuilt.
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
