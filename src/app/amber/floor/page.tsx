'use client'

import { useEffect, useRef, useState } from 'react'

// floor — underground berlin techno + caustics visualizer.
// audio: synthesized straight in WebAudio (no jambot). 132 bpm 4/4, with a
// 32-bar arrangement that loops:
//   bars 0-7   INTRO  — kick + sub only
//   bars 8-15  BUILD  — + closed hat + clap
//   bars 16-19 BRIDGE — everything drops; sparse open hat with long decay
//                        behind a master lowpass that closes; screen dims
//   bars 20-31 PEAK   — full kit back with knob-jammed hat decays (LFOs
//                        modulate the closed/open hat envelopes so the
//                        groove breathes — tribal feel) + per-bar hat
//                        variation; bar 20 is the drop, marked with an
//                        extra-large flare burst at center
// lookahead scheduler (50ms tick, 200ms ahead). every scheduled drum hit
// also enqueues a ripple event with the audio-time it should fire — the
// animation loop reads AudioContext.currentTime and triggers visual
// ripples on the same clock as the drums, so it's always tight.
// visuals: same caustics algorithm as L58. base wave amplitudes "duck"
// briefly on each kick. during the bridge a `dim` factor cuts splat
// brightness and accelerates fade so the floor visibly darkens.
// after starting, you can also tap to drop your own manual stone.

const FIELD = '#0A0A0A'
const LIME = '#C6FF3C'
const FLARE = '#FF2F7E'

const BPM = 132
const BEAT_DUR = 60 / BPM
const SIXTEENTH = BEAT_DUR / 4
const BARS_PER_LOOP = 32

// ---- arrangement -------------------------------------------------------
type Section = {
  name: 'intro' | 'build' | 'bridge' | 'peak'
  start: number
  end: number
  kick: boolean
  bass: boolean
  hatClosed: boolean
  hatOpen: boolean
  clap: boolean
  knobJam: boolean
  dim: number          // 0 = normal, 1 = full dark
  filterCutoff: number // master LPF target Hz at this section's start
}

const SECTIONS: Section[] = [
  { name: 'intro',  start: 0,  end: 8,  kick: true,  bass: true,  hatClosed: false, hatOpen: false, clap: false, knobJam: false, dim: 0,   filterCutoff: 18000 },
  { name: 'build',  start: 8,  end: 16, kick: true,  bass: true,  hatClosed: true,  hatOpen: false, clap: true,  knobJam: false, dim: 0,   filterCutoff: 18000 },
  { name: 'bridge', start: 16, end: 20, kick: false, bass: false, hatClosed: false, hatOpen: true,  clap: false, knobJam: false, dim: 0.7, filterCutoff: 720 },
  { name: 'peak',   start: 20, end: 32, kick: true,  bass: true,  hatClosed: true,  hatOpen: true,  clap: true,  knobJam: true,  dim: 0,   filterCutoff: 18000 },
]

function sectionForBar(barIdx: number): Section {
  for (const s of SECTIONS) {
    if (barIdx >= s.start && barIdx < s.end) return s
  }
  return SECTIONS[0]
}

// per-bar pattern variation
function kickSteps(barIdx: number): number[] {
  // straight 4-on-the-floor; every 4 bars drop the LAST kick of bar (3-bar lift)
  if ((barIdx + 1) % 4 === 0) return [0, 4, 8] // miss the 4th — gives the build a "lift"
  return [0, 4, 8, 12]
}
function bassSteps(barIdx: number): number[] {
  return kickSteps(barIdx)
}
function hatClosedSteps(barIdx: number): number[] {
  // base offbeats + bar-conditional ghost notes for tribal variation
  const base = [2, 6, 10, 14]
  const variant = barIdx % 4
  if (variant === 1) return [...base, 13]
  if (variant === 2) return [...base, 5, 13]
  if (variant === 3) return [2, 6, 10, 12, 14, 15] // tighter end-of-bar fill
  return base
}
function hatOpenSteps(barIdx: number, section: Section): number[] {
  if (section.name === 'bridge') {
    // bridge — only on beats 1 and 3 (positions 0 and 8) for sparse, ringing feel
    return barIdx % 2 === 0 ? [0, 8] : [4, 12]
  }
  if (section.name === 'peak') {
    // 'and' of 3 always, with extra on 'and' of 4 every other bar
    return barIdx % 2 === 0 ? [11] : [11, 15]
  }
  return [11]
}
function clapSteps(barIdx: number): number[] {
  // beats 2 and 4 always; every 4th bar add a ghost clap at 16th 13 (the
  // "and-uh" of beat 4) for a roll-into-next-bar feeling
  const base = [4, 12]
  if ((barIdx + 1) % 4 === 0) return [...base, 13]
  return base
}

// ---- caustics constants ------------------------------------------------
const SAMPLES_X = 70
const SAMPLES_Y = 40
const REFRACT_D = 200
const SPLAT_RADIUS = 2
const BASE_WAVES = [
  { kx: 0.0085, ky: 0.0042, omega: 0.42, amp: 1.0,  phase: 0.0 },
  { kx: 0.0050, ky: 0.0098, omega: 0.31, amp: 0.85, phase: 1.1 },
  { kx: 0.0124, ky: 0.0029, omega: 0.55, amp: 0.55, phase: 2.4 },
  { kx: 0.0036, ky: 0.0056, omega: 0.24, amp: 0.95, phase: 0.7 },
  { kx: 0.0072, ky: 0.0078, omega: 0.49, amp: 0.45, phase: 3.1 },
]

type Ripple = {
  x: number
  y: number
  born: number
  amp: number
  speed: number
  life: number
  color: 'lime' | 'flare' | 'cream'
}

type RippleEvent = {
  audioTime: number
  spec: Omit<Ripple, 'born'>
  done: boolean
}

type KickEvent = {
  audioTime: number
  done: boolean
}

type SectionTransition = {
  audioTime: number
  toName: Section['name']
  done: boolean
}

export default function FloorPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [started, setStarted] = useState(false)
  const startedRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    let W = window.innerWidth
    let H = window.innerHeight

    function resize() {
      W = window.innerWidth
      H = window.innerHeight
      canvas!.width = W * DPR
      canvas!.height = H * DPR
      canvas!.style.width = W + 'px'
      canvas!.style.height = H + 'px'
      ctx!.setTransform(1, 0, 0, 1, 0, 0)
      ctx!.scale(DPR, DPR)
    }
    resize()
    window.addEventListener('resize', resize)

    let audioCtx: AudioContext | null = null
    let masterGain: GainNode | null = null
    let masterLPF: BiquadFilterNode | null = null
    let noiseBuf: AudioBuffer | null = null

    let nextSixteenthTime = 0
    let nextSixteenthIdx = 0
    let nextBarIdx = 0
    let schedTimer: number | null = null

    const rippleEvents: RippleEvent[] = []
    const kickEvents: KickEvent[] = []
    const sectionTransitions: SectionTransition[] = []
    let currentSectionName: Section['name'] = 'intro'
    let currentSectionDim = 0

    const ripples: Ripple[] = []

    function setupAudio() {
      if (audioCtx) return audioCtx
      audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      masterLPF = audioCtx.createBiquadFilter()
      masterLPF.type = 'lowpass'
      masterLPF.frequency.value = 18000
      masterLPF.Q.value = 0.5
      masterGain = audioCtx.createGain()
      masterGain.gain.value = 0
      masterGain.connect(masterLPF).connect(audioCtx.destination)
      const len = audioCtx.sampleRate * 1
      noiseBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate)
      const d = noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      const t = audioCtx.currentTime
      masterGain.gain.linearRampToValueAtTime(0.85, t + 0.3)
      return audioCtx
    }

    function noiseSource(): AudioBufferSourceNode {
      const a = audioCtx!
      const src = a.createBufferSource()
      src.buffer = noiseBuf
      return src
    }

    // ---- drum synthesis ----
    function scheduleKick(at: number) {
      const a = audioCtx!
      const osc = a.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(140, at)
      osc.frequency.exponentialRampToValueAtTime(48, at + 0.09)
      const og = a.createGain()
      og.gain.setValueAtTime(0, at)
      og.gain.linearRampToValueAtTime(1.0, at + 0.002)
      og.gain.exponentialRampToValueAtTime(0.001, at + 0.36)
      const omix = a.createGain()
      omix.gain.value = 0.55
      osc.connect(og).connect(omix).connect(masterGain!)
      osc.start(at)
      osc.stop(at + 0.4)
      const click = noiseSource()
      const cf = a.createBiquadFilter()
      cf.type = 'highpass'
      cf.frequency.value = 1800
      const cg = a.createGain()
      cg.gain.setValueAtTime(0.18, at)
      cg.gain.exponentialRampToValueAtTime(0.001, at + 0.012)
      click.connect(cf).connect(cg).connect(masterGain!)
      click.start(at)
      click.stop(at + 0.02)
    }

    function scheduleHatClosed(at: number, decayS: number) {
      const a = audioCtx!
      const src = noiseSource()
      const hp = a.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 7200
      const lp = a.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 11000
      const g = a.createGain()
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(0.18, at + 0.001)
      g.gain.exponentialRampToValueAtTime(0.001, at + decayS)
      src.connect(hp).connect(lp).connect(g).connect(masterGain!)
      src.start(at)
      src.stop(at + decayS + 0.04)
    }

    function scheduleHatOpen(at: number, decayS: number) {
      const a = audioCtx!
      const src = noiseSource()
      const hp = a.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 5400
      const g = a.createGain()
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(0.16, at + 0.002)
      g.gain.exponentialRampToValueAtTime(0.001, at + decayS)
      src.connect(hp).connect(g).connect(masterGain!)
      src.start(at)
      src.stop(at + decayS + 0.05)
    }

    function scheduleClap(at: number) {
      const a = audioCtx!
      const bursts = [0, 0.013, 0.024, 0.040]
      for (let i = 0; i < bursts.length; i++) {
        const t = at + bursts[i]
        const src = noiseSource()
        const bp = a.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.value = 1400
        bp.Q.value = 1.4
        const g = a.createGain()
        const peak = i === bursts.length - 1 ? 0.18 : 0.30
        const dur = i === bursts.length - 1 ? 0.16 : 0.025
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(peak, t + 0.001)
        g.gain.exponentialRampToValueAtTime(0.001, t + dur)
        src.connect(bp).connect(g).connect(masterGain!)
        src.start(t)
        src.stop(t + dur + 0.05)
      }
    }

    function scheduleBass(at: number) {
      const a = audioCtx!
      const osc = a.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(82, at)
      osc.frequency.exponentialRampToValueAtTime(55, at + 0.04)
      const g = a.createGain()
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(0.45, at + 0.005)
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.34)
      osc.connect(g).connect(masterGain!)
      osc.start(at)
      osc.stop(at + 0.4)
    }

    // ---- knob-jam hat decays ----
    // closed hat: 25–105ms, breathing on a slow LFO
    // open hat:  140–520ms, longer LFO
    function knobJamClosedDecay(audioT: number): number {
      return 0.065 + 0.040 * Math.sin(audioT * 0.40)
    }
    function knobJamOpenDecay(audioT: number): number {
      return 0.330 + 0.190 * Math.sin(audioT * 0.27)
    }

    // ---- viz ripple-event helpers ----
    function enqueueRipple(audioTime: number, spec: Omit<Ripple, 'born'>) {
      rippleEvents.push({ audioTime, spec, done: false })
    }

    function scheduleStep(barIdx: number, stepIdx: number, when: number) {
      const section = sectionForBar(barIdx)

      // BRIDGE handling — almost everything cut, just open hat
      if (section.kick && kickSteps(barIdx).includes(stepIdx)) {
        scheduleKick(when)
        kickEvents.push({ audioTime: when, done: false })
        // big lime stone at center; bigger on the drop (bar 20 step 0)
        const isDrop = barIdx === 20 && stepIdx === 0
        enqueueRipple(when, {
          x: W * 0.5,
          y: H * 0.5,
          amp: isDrop ? 7.5 : 4.0,
          speed: isDrop ? 360 : 280,
          life: isDrop ? 3600 : 2400,
          color: isDrop ? 'flare' : 'lime',
        })
      }
      if (section.hatClosed && hatClosedSteps(barIdx).includes(stepIdx)) {
        const decay = section.knobJam ? knobJamClosedDecay(when) : 0.045
        scheduleHatClosed(when, decay)
        // ripple size scales with decay — longer decay = bigger ring
        const decayMix = Math.max(0, Math.min(1, (decay - 0.025) / 0.08))
        enqueueRipple(when, {
          x: W * (0.2 + Math.random() * 0.6),
          y: H * (0.15 + Math.random() * 0.25),
          amp: 1.0 + decayMix * 1.5,
          speed: 200 + decayMix * 80,
          life: 600 + decayMix * 600,
          color: 'cream',
        })
      }
      if (section.clap && clapSteps(barIdx).includes(stepIdx)) {
        scheduleClap(when)
        enqueueRipple(when, {
          x: W * 0.1,
          y: H * 0.5,
          amp: 2.6, speed: 240, life: 1600, color: 'flare',
        })
        enqueueRipple(when, {
          x: W * 0.9,
          y: H * 0.5,
          amp: 2.6, speed: 240, life: 1600, color: 'flare',
        })
      }
      if (section.hatOpen && hatOpenSteps(barIdx, section).includes(stepIdx)) {
        const decay = section.knobJam
          ? knobJamOpenDecay(when)
          : (section.name === 'bridge' ? 0.75 : 0.32)
        scheduleHatOpen(when, decay)
        const decayMix = Math.max(0, Math.min(1, (decay - 0.15) / 0.6))
        enqueueRipple(when, {
          x: W * 0.5 + (Math.random() - 0.5) * 200,
          y: H * 0.18,
          amp: 1.6 + decayMix * 2.0,
          speed: 240 + decayMix * 80,
          life: 1200 + decayMix * 1600,
          color: 'cream',
        })
      }
      if (section.bass && bassSteps(barIdx).includes(stepIdx)) {
        scheduleBass(when)
      }
    }

    function startSequencer() {
      const a = audioCtx!
      nextSixteenthTime = a.currentTime + 0.12
      nextSixteenthIdx = 0
      nextBarIdx = 0
      function tick() {
        const lookahead = a.currentTime + 0.2
        while (nextSixteenthTime < lookahead) {
          // detect section transitions on bar boundaries
          if (nextSixteenthIdx === 0) {
            const sec = sectionForBar(nextBarIdx)
            sectionTransitions.push({
              audioTime: nextSixteenthTime,
              toName: sec.name,
              done: false,
            })
            // schedule master LPF automation toward this section's cutoff
            // ramp over 0.6s — quick enough to feel intentional
            if (masterLPF) {
              const tgt = sec.filterCutoff
              masterLPF.frequency.setTargetAtTime(tgt, nextSixteenthTime, 0.18)
            }
          }
          scheduleStep(nextBarIdx, nextSixteenthIdx, nextSixteenthTime)
          nextSixteenthTime += SIXTEENTH
          nextSixteenthIdx++
          if (nextSixteenthIdx >= 16) {
            nextSixteenthIdx = 0
            nextBarIdx = (nextBarIdx + 1) % BARS_PER_LOOP
          }
        }
        schedTimer = window.setTimeout(tick, 50)
      }
      tick()
    }

    // ---- caustics buffer ----
    let imgData: ImageData | null = null
    let imgW = 0
    let imgH = 0
    function ensureImgData() {
      const targetW = Math.floor(W * 0.5)
      const targetH = Math.floor(H * 0.5)
      if (!imgData || imgW !== targetW || imgH !== targetH) {
        imgW = targetW
        imgH = targetH
        imgData = new ImageData(imgW, imgH)
        const d = imgData.data
        for (let i = 0; i < d.length; i += 4) {
          d[i] = 0x0A; d[i + 1] = 0x0A; d[i + 2] = 0x0A; d[i + 3] = 0xff
        }
      }
    }

    // ---- pointer (manual stones after start) ----
    let down = false
    let lastDripT = 0
    let lastRippleX = 0, lastRippleY = 0
    let downX = 0, downY = 0
    let downT = 0
    let moved = false

    function getXY(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    function spawnImmediateRipple(x: number, y: number, amp: number, life: number, color: Ripple['color']) {
      ripples.push({
        x, y, born: performance.now(),
        amp, speed: 240 + Math.random() * 80, life, color,
      })
      if (ripples.length > 80) ripples.shift()
    }

    canvas.addEventListener('pointerdown', async (e) => {
      const p = getXY(e)
      if (!startedRef.current) {
        const ac = setupAudio()
        if (ac.state === 'suspended') {
          try { await ac.resume() } catch {}
        }
        startSequencer()
        startedRef.current = true
        setStarted(true)
        return
      }
      down = true
      lastDripT = performance.now()
      lastRippleX = p.x; lastRippleY = p.y
      downX = p.x; downY = p.y
      downT = performance.now()
      moved = false
    })
    canvas.addEventListener('pointermove', (e) => {
      if (!down) return
      const p = getXY(e)
      if (Math.hypot(p.x - downX, p.y - downY) > 4) moved = true
      const d = Math.hypot(p.x - lastRippleX, p.y - lastRippleY)
      const now = performance.now()
      if (d > 26 || now - lastDripT > 90) {
        spawnImmediateRipple(p.x, p.y, 1.4, 1500, 'cream')
        lastRippleX = p.x; lastRippleY = p.y
        lastDripT = now
      }
    })
    canvas.addEventListener('pointerup', (e) => {
      if (!down) return
      const p = getXY(e)
      const dt = performance.now() - downT
      down = false
      if (!moved && dt < 280) {
        spawnImmediateRipple(p.x, p.y, 4.0, 3200, 'lime')
      }
    })
    canvas.addEventListener('pointerleave', () => { down = false })

    // ---- main loop ----
    let lastKickAudioTime = -10
    function loop() {
      ensureImgData()
      if (!imgData) return
      const data = imgData!.data
      const now = performance.now()

      if (audioCtx) {
        const aT = audioCtx.currentTime
        for (const ev of rippleEvents) {
          if (ev.done) continue
          if (ev.audioTime <= aT) {
            const s = ev.spec
            ripples.push({
              x: s.x, y: s.y, born: now,
              amp: s.amp, speed: s.speed, life: s.life, color: s.color,
            })
            if (ripples.length > 80) ripples.shift()
            ev.done = true
          }
        }
        for (let i = rippleEvents.length - 1; i >= 0; i--) {
          if (rippleEvents[i].done && rippleEvents[i].audioTime < aT - 1) rippleEvents.splice(i, 1)
        }
        for (const k of kickEvents) {
          if (k.done) continue
          if (k.audioTime <= aT) {
            lastKickAudioTime = aT
            k.done = true
          }
        }
        for (let i = kickEvents.length - 1; i >= 0; i--) {
          if (kickEvents[i].done && kickEvents[i].audioTime < aT - 1) kickEvents.splice(i, 1)
        }
        // section transitions — set currentSectionName/dim
        for (const tr of sectionTransitions) {
          if (tr.done) continue
          if (tr.audioTime <= aT) {
            currentSectionName = tr.toName
            tr.done = true
          }
        }
        for (let i = sectionTransitions.length - 1; i >= 0; i--) {
          if (sectionTransitions[i].done && sectionTransitions[i].audioTime < aT - 1) sectionTransitions.splice(i, 1)
        }
      }

      // smoothly ease currentSectionDim toward the target (avoid hard cuts)
      const targetDim = SECTIONS.find(s => s.name === currentSectionName)?.dim ?? 0
      currentSectionDim += (targetDim - currentSectionDim) * 0.06

      const t = now / 1000

      // sidechain — base waves duck briefly after each kick
      let sidechain = 1
      if (audioCtx && lastKickAudioTime > 0) {
        const sinceKick = audioCtx.currentTime - lastKickAudioTime
        const dur = 0.14
        if (sinceKick < dur) {
          const x = sinceKick / dur
          sidechain = x * x * (3 - 2 * x)
        }
      }

      // dim modulates fade speed AND splat brightness
      const dimAmount = currentSectionDim
      const FADE = Math.floor(22 + dimAmount * 38) // bridge fades faster
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        data[i]     = r > 0x0A + FADE ? r - FADE : 0x0A
        data[i + 1] = g > 0x0A + FADE ? g - FADE : 0x0A
        data[i + 2] = b > 0x0A + FADE ? b - FADE : 0x0A
      }

      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i]
        if (now - r.born > r.life) ripples.splice(i, 1)
      }

      const xstride = W / SAMPLES_X
      const ystride = H / SAMPLES_Y
      const splatScale = 1 - dimAmount * 0.65 // bridge has dimmer splats

      for (let iy = 0; iy < SAMPLES_Y; iy++) {
        for (let ix = 0; ix < SAMPLES_X; ix++) {
          const sx = ix * xstride + xstride * 0.5
          const sy = iy * ystride + ystride * 0.5
          let dhx = 0, dhy = 0
          for (const w of BASE_WAVES) {
            const phase = w.kx * sx + w.ky * sy + w.omega * t + w.phase
            const cosp = Math.cos(phase)
            const a = w.amp * (0.45 + 0.55 * sidechain)
            dhx += a * w.kx * cosp
            dhy += a * w.ky * cosp
          }
          for (const r of ripples) {
            const age = (now - r.born) / 1000
            const front = r.speed * age
            const rdx = sx - r.x
            const rdy = sy - r.y
            const d = Math.hypot(rdx, rdy)
            const dFromFront = d - front
            const env = Math.exp(-(dFromFront * dFromFront) / 220) * Math.exp(-age * 0.85)
            if (d > 0.5) {
              const dh_dd = r.amp * env * (-2 * dFromFront / 220)
              dhx += dh_dd * (rdx / d)
              dhy += dh_dd * (rdy / d)
            }
          }
          const fx = sx - dhx * REFRACT_D
          const fy = sy - dhy * REFRACT_D
          const ix2 = Math.floor((fx / W) * imgW)
          const iy2 = Math.floor((fy / H) * imgH)
          if (ix2 < 1 || ix2 > imgW - 2 || iy2 < 1 || iy2 > imgH - 2) continue
          for (let oy = -SPLAT_RADIUS; oy <= SPLAT_RADIUS; oy++) {
            for (let ox = -SPLAT_RADIUS; ox <= SPLAT_RADIUS; ox++) {
              const px = ix2 + ox
              const py = iy2 + oy
              if (px < 0 || px >= imgW || py < 0 || py >= imgH) continue
              const odist = ox * ox + oy * oy
              const w = Math.max(0, 1 - odist / (SPLAT_RADIUS * SPLAT_RADIUS + 0.5))
              if (w <= 0) continue
              const bumpR = Math.floor(36 * w * splatScale)
              const bumpG = Math.floor(36 * w * splatScale)
              const bumpB = Math.floor(34 * w * splatScale)
              const i2 = (py * imgW + px) * 4
              data[i2]     = Math.min(255, data[i2] + bumpR)
              data[i2 + 1] = Math.min(255, data[i2 + 1] + bumpG)
              data[i2 + 2] = Math.min(255, data[i2 + 2] + bumpB)
            }
          }
        }
      }

      const memo = (loop as unknown as { __temp?: HTMLCanvasElement; __tempCtx?: CanvasRenderingContext2D })
      if (!memo.__temp) {
        memo.__temp = document.createElement('canvas')
        memo.__tempCtx = memo.__temp.getContext('2d')!
      }
      const temp = memo.__temp!
      const tempCtx = memo.__tempCtx!
      if (temp.width !== imgW || temp.height !== imgH) {
        temp.width = imgW
        temp.height = imgH
      }
      tempCtx.putImageData(imgData!, 0, 0)
      ctx!.fillStyle = FIELD
      ctx!.fillRect(0, 0, W, H)
      ctx!.imageSmoothingEnabled = true
      ctx!.imageSmoothingQuality = 'high'
      ctx!.drawImage(temp, 0, 0, W, H)

      // ripple origin rings
      for (const r of ripples) {
        const age = (now - r.born) / 1000
        const tt = age / (r.life / 1000)
        if (tt > 1) continue
        const front = r.speed * age
        const alpha = (1 - tt) * 0.65 * (1 - dimAmount * 0.4)
        const stroke =
          r.color === 'lime' ? `rgba(198, 255, 60, ${alpha.toFixed(3)})` :
          r.color === 'flare' ? `rgba(255, 47, 126, ${alpha.toFixed(3)})` :
          `rgba(232, 232, 232, ${(alpha * 0.7).toFixed(3)})`
        ctx!.strokeStyle = stroke
        ctx!.lineWidth = 1.2
        ctx!.beginPath()
        ctx!.arc(r.x, r.y, Math.max(2, front), 0, Math.PI * 2)
        ctx!.stroke()
        ctx!.fillStyle = stroke
        ctx!.beginPath()
        ctx!.arc(r.x, r.y, 2.8, 0, Math.PI * 2)
        ctx!.fill()
      }

      requestAnimationFrame(loop)
    }
    loop()

    return () => {
      window.removeEventListener('resize', resize)
      if (schedTimer) window.clearTimeout(schedTimer)
      if (audioCtx) {
        try { audioCtx.close() } catch {}
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

        {!started && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#E8E8E8',
              pointerEvents: 'none',
              gap: 16,
            }}
          >
            <div
              style={{
                fontFamily: '"Courier Prime", monospace',
                fontWeight: 700,
                fontSize: 22,
                letterSpacing: '0.32em',
                opacity: 0.88,
              }}
            >
              FLOOR
            </div>
            <div
              style={{
                fontFamily: '"Fraunces", serif',
                fontStyle: 'italic',
                fontWeight: 300,
                fontSize: 18,
                opacity: 0.7,
              }}
            >
              tap to start. 132 bpm.
            </div>
          </div>
        )}

        <div
          style={{
            position: 'fixed',
            top: 'calc(20px + env(safe-area-inset-top, 0px))',
            right: 'calc(22px + env(safe-area-inset-right, 0px))',
            color: '#E8E8E8',
            fontFamily: '"Courier Prime", monospace',
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: '0.22em',
            opacity: 0.32,
            pointerEvents: 'none',
            textAlign: 'right',
            mixBlendMode: 'difference',
          }}
        >
          FLOOR · 132 BPM · TOY · 009
        </div>

        {started && (
          <div
            style={{
              position: 'fixed',
              top: 'calc(20px + env(safe-area-inset-top, 0px))',
              left: 'calc(22px + env(safe-area-inset-left, 0px))',
              color: '#E8E8E8',
              fontFamily: '"Fraunces", serif',
              fontStyle: 'italic',
              fontWeight: 300,
              fontSize: 18,
              opacity: 0.6,
              pointerEvents: 'none',
              mixBlendMode: 'difference',
            }}
          >
            tap. drop your own stone.
          </div>
        )}

        <a
          href="/amber"
          style={{
            position: 'fixed',
            bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
            right: 'calc(22px + env(safe-area-inset-right, 0px))',
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
          <span style={{ color: FLARE }}>·</span>
        </a>
        <span style={{ display: 'none' }}>{LIME}</span>
      </div>
    </>
  )
}
