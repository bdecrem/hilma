'use client'

import { useEffect, useRef, useState } from 'react'

// chamber — dub techno + L59 aurora visualizer.
// 122 BPM, 32-bar loop, lookahead-scheduled WebAudio (no jambot, no samples).
// soft 4/4 kick + sub bass anchor; quiet hi-hat shuffle; minor-7 chord stabs
// on the off-beats sent to a long feedback delay (3/16 note ≈ 369ms, 0.62 fb)
// for the dub feel; vinyl crackle and a slow master-LPF sweep underneath.
// arrangement: bars 1-3 intro (kick + sub), 4-7 add hat, 8-15 stab in Am7,
// 16-23 Dm9, 24-31 Em7, then loop. visualizer: kick = small center substorm,
// stab = big substorm with cream→lime peak, hat-offbeat = baseline brightness
// pulse, sub envelope = continuous baseline modulation. tap during play =
// manual stab + substorm at the tap position.

const FIELD = '#0A0A0A'
const CREAM_RGB = [232, 232, 232]
const LIME_RGB = [198, 255, 60]

const BPM = 122
const STEP_S = 60 / BPM / 4 // 16th note (~0.123s)
const STEPS_PER_BAR = 16
const BARS_LOOP = 32

const RIBBONS = 180
const ARC_WIDTH = 9.0
const ARC_DEPTH = 0.8
const RIBBON_H = 2.4
const CAM_DIST = 3.6
const CAM_HEIGHT = 0.55

// chord progressions — frequencies (A3 = 220 Hz)
// Am7: A C E G   (open dub root)
// Dm9: D F A C E (subdominant lift)
// Em7: E G B D   (dominant)
const semi = (s: number) => 220 * Math.pow(2, s / 12)
const CHORDS = [
  { name: 'Am7', notes: [semi(0), semi(3), semi(7), semi(10), semi(12)] },
  { name: 'Dm9', notes: [semi(5), semi(8), semi(12), semi(15), semi(17)] },
  { name: 'Em7', notes: [semi(7), semi(10), semi(14), semi(17), semi(19)] },
]

type Substorm = {
  origin: number
  born: number // audio time
  life: number
  amp: number
  lime: number // 0..1, how lime-tinted the peak is
}

type AudioEvent =
  | { when: number; type: 'substorm-center'; amp: number }
  | { when: number; type: 'substorm-stab'; amp: number; origin: number; lime: number }
  | { when: number; type: 'hat-pulse'; amp: number }
  | { when: number; type: 'sub-env'; amp: number }

export default function ChamberPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [playing, setPlaying] = useState(false)
  const [needsTap, setNeedsTap] = useState(true)

  // audio refs
  const audioCtxRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)
  const masterLPFRef = useRef<BiquadFilterNode | null>(null)
  const dubDelayRef = useRef<DelayNode | null>(null)
  const startedAtRef = useRef<number>(0)
  const nextStepRef = useRef<number>(0)
  const schedulerRef = useRef<number | null>(null)
  const stabIdxRef = useRef<number>(0) // which stab so we rotate visualizer position

  // event queue (audio-time scheduled visual events)
  const eventQueueRef = useRef<AudioEvent[]>([])

  // mutable runtime state for renderer (avoid re-render churn)
  const stateRef = useRef({
    intensityBoost: 0, // pulses on hat / stab events
    intensityBoostDecay: 0.92,
    subLevel: 0, // tracks sub bass envelope for baseline mod
  })

  // ───────────────────── audio engine ─────────────────────

  const startAudio = () => {
    if (audioCtxRef.current) return
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    audioCtxRef.current = ctx

    // master chain: master → LPF → destination
    const master = ctx.createGain()
    master.gain.value = 0.85
    masterRef.current = master

    const lpf = ctx.createBiquadFilter()
    lpf.type = 'lowpass'
    lpf.frequency.value = 8000
    lpf.Q.value = 0.7
    masterLPFRef.current = lpf

    master.connect(lpf)
    lpf.connect(ctx.destination)

    // dub delay loop — 3/16 note (~369ms) with high feedback for the chord stabs.
    // input to `delay` from the stab voice; output to delayBus → master.
    const delay = ctx.createDelay(2.5)
    delay.delayTime.value = (60 / BPM) * (3 / 16) * 4 // 3/16 of a quarter note
    dubDelayRef.current = delay
    const delayFb = ctx.createGain()
    delayFb.gain.value = 0.62
    const delayLP = ctx.createBiquadFilter()
    delayLP.type = 'lowpass'
    delayLP.frequency.value = 1700 // each repeat darkens
    const delayBus = ctx.createGain()
    delayBus.gain.value = 0.85
    delay.connect(delayLP)
    delayLP.connect(delayFb)
    delayFb.connect(delay)
    delay.connect(delayBus)
    delayBus.connect(master)

    // vinyl crackle — runs constantly, base of the dub texture
    const crackleBuf = ctx.createBuffer(1, ctx.sampleRate * 6, ctx.sampleRate)
    const cd = crackleBuf.getChannelData(0)
    for (let i = 0; i < cd.length; i++) {
      cd[i] = (Math.random() * 2 - 1) * 0.18
      if (Math.random() < 0.0003) cd[i] += (Math.random() * 2 - 1) * 0.7 // pops
    }
    const crackleSrc = ctx.createBufferSource()
    crackleSrc.buffer = crackleBuf
    crackleSrc.loop = true
    const crackleHP = ctx.createBiquadFilter()
    crackleHP.type = 'highpass'
    crackleHP.frequency.value = 2200
    const crackleGain = ctx.createGain()
    crackleGain.gain.value = 0.055
    crackleSrc.connect(crackleHP)
    crackleHP.connect(crackleGain)
    crackleGain.connect(master)
    crackleSrc.start()

    // master LPF sweep — very slow, 32-bar period, sweeps cutoff
    const sweep = ctx.createOscillator()
    const sweepPeriod = (60 / BPM) * 4 * 32 // 32 bars
    sweep.frequency.value = 1 / sweepPeriod
    const sweepGain = ctx.createGain()
    sweepGain.gain.value = 3200
    sweep.connect(sweepGain)
    sweepGain.connect(lpf.frequency)
    sweep.start()

    startedAtRef.current = ctx.currentTime + 0.15
    nextStepRef.current = 0
    stabIdxRef.current = 0
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
        m.gain.linearRampToValueAtTime(0, t + 0.4)
      }
      setTimeout(() => {
        try {
          audioCtxRef.current?.close()
        } catch {}
        audioCtxRef.current = null
        masterRef.current = null
        masterLPFRef.current = null
        dubDelayRef.current = null
      }, 500)
    }
  }

  const scheduleAhead = () => {
    const ctx = audioCtxRef.current
    if (!ctx) return
    const horizon = ctx.currentTime + 0.2
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
    // KICK + SUB on every quarter note (steps 0/4/8/12), starting bar 0 step 4
    // (intro: skip first kick so it lands on the "and-1" feel)
    const kickActive = bar > 0 || step >= 4
    if (kickActive && step % 4 === 0) {
      playKick(time, 0.7)
      playSub(time, 0.6)
      eventQueueRef.current.push({ when: time, type: 'substorm-center', amp: 0.55 })
      eventQueueRef.current.push({ when: time, type: 'sub-env', amp: 0.6 })
    }

    // HI-HAT — every 16th step from bar 4, very quiet, slight emphasis on offbeat
    if (bar >= 4) {
      const isOff = step % 4 === 2
      const isMid = step % 4 === 1 || step % 4 === 3
      let amp = 0.0
      if (step % 4 === 0) amp = 0.07 // ghost on the kick
      else if (isMid) amp = 0.10
      else if (isOff) amp = 0.16
      if (amp > 0) playHat(time, amp)
      if (isOff) {
        eventQueueRef.current.push({ when: time, type: 'hat-pulse', amp: 0.15 })
      }
    }

    // CHORD STAB — off-beats only (steps 2, 6, 10, 14), starting bar 8.
    // Pattern: hit on every other off-beat (so 2 stabs per bar, not 4) for sparseness.
    // Chord choice rotates every 8 bars: Am7 → Dm9 → Em7 → Am7 → ...
    if (bar >= 8 && (step === 2 || step === 10)) {
      const segment = Math.floor((bar - 8) / 8) % 3
      const chord = CHORDS[segment]
      playStab(time, chord.notes, 0.42)
      // visual stab — origin rotates around the curtain so successive stabs land in different places
      const stabIdx = stabIdxRef.current++
      const golden = 0.618033988749
      const origin = (stabIdx * golden) % 1 // golden-ratio low-discrepancy sequence
      eventQueueRef.current.push({
        when: time + 0.04,
        type: 'substorm-stab',
        amp: 0.8,
        origin,
        lime: 0.85,
      })
    }
  }

  // ───────────────────── voices ─────────────────────

  const playKick = (time: number, amp: number) => {
    const ctx = audioCtxRef.current!
    const master = masterRef.current!
    // body — sine pitch envelope
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(70, time)
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.06)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, time)
    env.gain.linearRampToValueAtTime(amp, time + 0.005)
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.22)
    osc.connect(env)
    env.connect(master)
    osc.start(time)
    osc.stop(time + 0.24)

    // click — short HP-filtered noise burst
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

  const playSub = (time: number, amp: number) => {
    const ctx = audioCtxRef.current!
    const master = masterRef.current!
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(82, time) // E2-ish
    osc.frequency.exponentialRampToValueAtTime(55, time + 0.04) // → A1
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, time)
    env.gain.linearRampToValueAtTime(amp, time + 0.012)
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.36)
    osc.connect(env)
    env.connect(master)
    osc.start(time)
    osc.stop(time + 0.38)
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
    hp.frequency.value = 7200
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

    // resonant LP filter — opens fast, closes (the dub vintage stab character)
    const stabLP = ctx.createBiquadFilter()
    stabLP.type = 'lowpass'
    stabLP.frequency.setValueAtTime(700, time)
    stabLP.frequency.linearRampToValueAtTime(1300, time + 0.035)
    stabLP.frequency.exponentialRampToValueAtTime(380, time + 0.18)
    stabLP.Q.value = 4.5

    const env = ctx.createGain()
    env.gain.setValueAtTime(0, time)
    env.gain.linearRampToValueAtTime(amp, time + 0.005)
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.18)

    for (const f of notes) {
      for (const det of [-7, 5]) {
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

    // wet send — into the dub delay loop
    const wetSend = ctx.createGain()
    wetSend.gain.value = 0.85
    env.connect(wetSend)
    wetSend.connect(delay)

    // small dry signal so the first hit is audible before the delay returns
    const dry = ctx.createGain()
    dry.gain.value = 0.32
    env.connect(dry)
    dry.connect(master)
  }

  // ───────────────────── visuals ─────────────────────

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth
    let H = window.innerHeight

    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * DPR
      canvas.height = H * DPR
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(DPR, DPR)
    }
    resize()
    window.addEventListener('resize', resize)

    let camYaw = 0
    const intensityBase = 0.7
    const substorms: Substorm[] = []
    const startT = performance.now()

    // pointer
    let down = false
    let lastX = 0,
      lastY = 0
    let downX = 0,
      downY = 0,
      downT = 0
    let moved = false

    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const onDown = (e: PointerEvent) => {
      down = true
      moved = false
      const p = pos(e)
      lastX = p.x
      lastY = p.y
      downX = p.x
      downY = p.y
      downT = performance.now()
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {}
    }
    const onMove = (e: PointerEvent) => {
      if (!down) return
      const p = pos(e)
      const dx = p.x - lastX
      camYaw -= dx * 0.005
      if (Math.abs(p.x - downX) > 6 || Math.abs(p.y - downY) > 6) moved = true
      lastX = p.x
      lastY = p.y
    }
    const onUp = (e: PointerEvent) => {
      down = false
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {}
      const dur = performance.now() - downT
      if (!moved && dur < 350) {
        const p = pos(e)
        const tapU = mapTapToU(p.x)
        // manual stab + substorm if audio is playing
        if (audioCtxRef.current) {
          const t = audioCtxRef.current.currentTime + 0.05
          // pick the current chord based on bar
          const absStep = nextStepRef.current
          const bar = Math.floor(absStep / STEPS_PER_BAR) % BARS_LOOP
          const segment = bar < 8 ? 0 : Math.floor((bar - 8) / 8) % 3
          playStab(t, CHORDS[segment].notes, 0.5)
          eventQueueRef.current.push({
            when: t + 0.04,
            type: 'substorm-stab',
            amp: 0.9,
            origin: tapU,
            lime: 1,
          })
        } else {
          // not playing — just a quiet visual substorm
          substorms.push({
            origin: tapU,
            born: 0,
            life: 4,
            amp: 0.7,
            lime: 0.7,
          })
        }
      }
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    function mapTapToU(sx: number): number {
      const t = (performance.now() - startT) / 1000
      let best = 0.5
      let bestDist = Infinity
      const cy = Math.cos(camYaw),
        sy2 = Math.sin(camYaw)
      const focal = Math.min(W, H) * 0.62
      for (let i = 0; i < RIBBONS; i++) {
        const u = i / (RIBBONS - 1)
        const x3 = ARC_WIDTH * (u - 0.5)
        const z3 = ARC_DEPTH * Math.sin(u * Math.PI * 1.2 + t * 0.04)
        const xR = x3 * cy + z3 * sy2
        const zR = -x3 * sy2 + z3 * cy
        const zCam = zR + CAM_DIST
        if (zCam < 0.1) continue
        const f = focal / zCam
        const sx2 = W / 2 + xR * f
        const d = Math.abs(sx - sx2)
        if (d < bestDist) {
          bestDist = d
          best = u
        }
      }
      return best
    }

    let raf = 0
    const tick = (now: number) => {
      const t = (now - startT) / 1000
      const audioT = audioCtxRef.current?.currentTime ?? 0

      // process audio events whose time has arrived
      const queue = eventQueueRef.current
      while (queue.length > 0 && queue[0].when <= audioT + 0.02) {
        const ev = queue.shift()!
        switch (ev.type) {
          case 'substorm-center':
            substorms.push({
              origin: 0.5,
              born: audioT,
              life: 1.4,
              amp: ev.amp,
              lime: 0.0,
            })
            break
          case 'substorm-stab':
            substorms.push({
              origin: ev.origin,
              born: audioT,
              life: 4.5,
              amp: ev.amp,
              lime: ev.lime,
            })
            break
          case 'hat-pulse':
            stateRef.current.intensityBoost = Math.min(
              0.35,
              stateRef.current.intensityBoost + ev.amp
            )
            break
          case 'sub-env':
            stateRef.current.subLevel = Math.min(1, stateRef.current.subLevel + ev.amp)
            break
        }
      }

      // decay state
      stateRef.current.intensityBoost *= stateRef.current.intensityBoostDecay
      stateRef.current.subLevel *= 0.94

      const intensity = intensityBase + stateRef.current.intensityBoost + stateRef.current.subLevel * 0.18

      // bg
      ctx.fillStyle = FIELD
      ctx.fillRect(0, 0, W, H)

      // age out substorms — use audio time when available
      const ageRef = audioCtxRef.current ? audioT : t
      for (let s = substorms.length - 1; s >= 0; s--) {
        const ss = substorms[s]
        const age = ss.born === 0 ? t - ss.born : ageRef - ss.born
        if (age > ss.life) substorms.splice(s, 1)
      }

      const cy = Math.cos(camYaw),
        sy = Math.sin(camYaw)
      const focal = Math.min(W, H) * 0.62
      const horizonY = H * 0.66

      let totalBrightness = 0

      // depth-sort for clean layering
      const order: { i: number; zCam: number }[] = []
      for (let i = 0; i < RIBBONS; i++) {
        const u = i / (RIBBONS - 1)
        const x3 = ARC_WIDTH * (u - 0.5)
        const z3 = ARC_DEPTH * Math.sin(u * Math.PI * 1.2 + t * 0.04)
        const zR = -x3 * sy + z3 * cy
        order.push({ i, zCam: zR + CAM_DIST })
      }
      order.sort((a, b) => b.zCam - a.zCam)

      ctx.globalCompositeOperation = 'lighter'

      for (const o of order) {
        const i = o.i
        const u = i / (RIBBONS - 1)
        const x3 = ARC_WIDTH * (u - 0.5)
        const z3 = ARC_DEPTH * Math.sin(u * Math.PI * 1.2 + t * 0.04)
        const xR = x3 * cy + z3 * sy
        const zR = -x3 * sy + z3 * cy
        const zCam = zR + CAM_DIST
        if (zCam < 0.2) continue
        const f = focal / zCam
        const sx = W / 2 + xR * f
        const sBase = horizonY + CAM_HEIGHT * f
        const sTop = horizonY + (CAM_HEIGHT - RIBBON_H) * f

        const sinSum =
          0.55 * Math.sin(u * Math.PI * 4 - t * 0.5) +
          0.45 * Math.sin(u * Math.PI * 9 + t * 0.85)
        const wave = 0.6 + 0.4 * sinSum
        const breath = 0.75 + 0.25 * Math.sin(t * 0.11 + u * 3.2)
        let brightness = intensity * wave * breath

        // substorm contributions
        let substormPeak = 0
        let substormLime = 0
        for (const ss of substorms) {
          const age = ss.born === 0 ? t - ss.born : ageRef - ss.born
          if (age < 0) continue
          const speed = 0.16
          const pkt = 0.07
          const distLeft = u - (ss.origin - speed * age)
          const distRight = u - (ss.origin + speed * age)
          const dMin = Math.min(Math.abs(distLeft), Math.abs(distRight))
          const env = Math.exp(-(dMin * dMin) / (2 * pkt * pkt))
          const decay = Math.max(0, 1 - age / ss.life)
          const contrib = ss.amp * env * decay
          substormPeak += contrib
          substormLime += contrib * ss.lime
        }
        brightness += substormPeak * 0.85

        brightness = Math.max(0, Math.min(1.6, brightness))
        totalBrightness += brightness

        const fog = Math.max(0.5, 1 - (zCam - CAM_DIST) * 0.22)
        const finalAlpha = brightness * fog

        const limeMix = Math.min(1, substormLime * 1.4)
        const r = CREAM_RGB[0] * (1 - limeMix) + LIME_RGB[0] * limeMix
        const g = CREAM_RGB[1] * (1 - limeMix) + LIME_RGB[1] * limeMix
        const b = CREAM_RGB[2] * (1 - limeMix) + LIME_RGB[2] * limeMix

        const grad = ctx.createLinearGradient(sx, sTop, sx, sBase)
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`)
        grad.addColorStop(0.18, `rgba(${r}, ${g}, ${b}, ${(finalAlpha * 0.95).toFixed(3)})`)
        grad.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${(finalAlpha * 0.7).toFixed(3)})`)
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(sx, sTop)
        ctx.lineTo(sx, sBase)
        ctx.stroke()

        if (substormPeak > 0.15) {
          const glowAlpha = Math.min(0.5, substormPeak * 0.45) * fog
          const gg = ctx.createLinearGradient(sx, sTop, sx, sBase)
          gg.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`)
          gg.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${glowAlpha.toFixed(3)})`)
          gg.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, ${(glowAlpha * 0.6).toFixed(3)})`)
          gg.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
          ctx.strokeStyle = gg
          ctx.lineWidth = 6
          ctx.beginPath()
          ctx.moveTo(sx, sTop)
          ctx.lineTo(sx, sBase)
          ctx.stroke()
        }
      }

      ctx.globalCompositeOperation = 'source-over'

      // suppress unused — totalBrightness used by future audio mods
      void totalBrightness

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
    }
  }, [])

  // ───────────────────── start/stop ─────────────────────

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

  // ───────────────────── render ─────────────────────

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
          background: FIELD,
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

        {/* tap overlay — first start */}
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
              }}
            >
              tap to begin
              <span style={{ color: '#C6FF3C', marginLeft: 6 }}>·</span>
            </span>
          </button>
        )}

        {/* play/stop toggle once started — small, top-center */}
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
          DUB · 122 BPM · CHAMBER
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
            chamber
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
            dub for the curtain.
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
            DRAG · ORBIT &nbsp; TAP · CHORD STAB
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
