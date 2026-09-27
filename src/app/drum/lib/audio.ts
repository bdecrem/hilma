// DRUM — the sound of the press.
//
// Kick and sub are chamber's, verbatim (src/app/amber/chamber/page.tsx): the
// proven sound. The stab is chamber's too, with its filter opened or closed by
// where the hole sits across the red drum. Hats, the sunflower wash and the
// machine's own noises (paper feed, tearing, punching, ink) are new.
//
// Routing: every voice goes into its drum's chain (flood drive → pan) and the
// dry sum passes a "paper" low-pass: with no sheet under the drums, the press
// sounds muffled, as if printing onto the roller. Delay and reverb returns
// join after that filter, so a pulled sheet leaves the echoes in the clear.
// Scheduled (motor) voices pass through gates; grabbing a drum closes them,
// and hand-turned hits go straight into the chains.

const semi = (s: number) => 220 * Math.pow(2, s / 12)

export type Out = { dry: AudioNode; wet: AudioNode; verb: AudioNode }

type Chunk = { f: number; l: Float32Array; r: Float32Array }

export class PressAudio {
  readonly ctx: AudioContext
  private master: GainNode
  private paperLP: BiquadFilterNode
  private bus: GainNode
  private comp: DynamicsCompressorNode
  private limiter: DynamicsCompressorNode
  private out_: GainNode
  private delay: DelayNode
  private delayFb: GainNode
  private delayIn: GainNode
  private verbIn: GainNode
  private motorDry: GainNode[] = []
  private motorWet: GainNode
  private motorVerb: GainNode
  private chainIn: GainNode[] = []
  private clean: GainNode[] = []
  private drive: GainNode[] = []
  private pan: StereoPannerNode[] = []
  private noise: AudioBuffer
  private chunks: Chunk[] = []
  recording = false

  constructor(bpm: number) {
    try {
      const nav = navigator as unknown as { audioSession?: { type: string } }
      if (nav.audioSession) nav.audioSession.type = 'playback' // play through the iPhone's silent switch
    } catch {}
    const Ctx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    this.ctx = ctx

    // chamber's kick and sub land on the same instant and sum past full scale;
    // the voices stay as they are, the master comes down and a limiter catches the rest
    this.master = ctx.createGain()
    this.master.gain.value = 0.62
    this.paperLP = ctx.createBiquadFilter()
    this.paperLP.type = 'lowpass'
    this.paperLP.frequency.value = 18000
    this.paperLP.Q.value = 0.7
    this.bus = ctx.createGain()
    this.comp = ctx.createDynamicsCompressor()
    this.comp.threshold.value = -12
    this.comp.knee.value = 10
    this.comp.ratio.value = 3
    this.comp.attack.value = 0.004
    this.comp.release.value = 0.2
    this.limiter = ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -2.5
    this.limiter.knee.value = 0
    this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.001
    this.limiter.release.value = 0.09
    const out = ctx.createGain()
    out.gain.value = 0.94
    this.master.connect(this.paperLP)
    this.paperLP.connect(this.bus)
    this.bus.connect(this.comp)
    this.comp.connect(this.limiter)
    this.limiter.connect(out)
    out.connect(ctx.destination)
    this.out_ = out

    // chamber's dub delay: 3/16, lowpass inside the feedback so each repeat darkens
    this.delayIn = ctx.createGain()
    this.delay = ctx.createDelay(2.5)
    this.delay.delayTime.value = (60 / bpm) * (3 / 16) * 4
    this.delayFb = ctx.createGain()
    this.delayFb.gain.value = 0.62
    const delayLP = ctx.createBiquadFilter()
    delayLP.type = 'lowpass'
    delayLP.frequency.value = 1700
    const delayBus = ctx.createGain()
    delayBus.gain.value = 0.85
    this.delayIn.connect(this.delay)
    this.delay.connect(delayLP)
    delayLP.connect(this.delayFb)
    this.delayFb.connect(this.delay)
    this.delay.connect(delayBus)
    delayBus.connect(this.bus)

    // a plate for the wash: generated, stereo, dark
    this.verbIn = ctx.createGain()
    const verb = ctx.createConvolver()
    verb.buffer = this.impulse(3.2)
    const verbBus = ctx.createGain()
    verbBus.gain.value = 0.55
    this.verbIn.connect(verb)
    verb.connect(verbBus)
    verbBus.connect(this.bus)

    this.motorWet = ctx.createGain()
    this.motorWet.connect(this.delayIn)
    this.motorVerb = ctx.createGain()
    this.motorVerb.connect(this.verbIn)

    const curve = new Float32Array(1024)
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / 1023) * 2 - 1) * 3)
    for (let d = 0; d < 4; d++) {
      const gate = ctx.createGain()
      const input = ctx.createGain()
      const clean = ctx.createGain()
      const pre = ctx.createGain()
      pre.gain.value = 2.5
      const shaper = ctx.createWaveShaper()
      shaper.curve = curve
      shaper.oversample = '2x'
      const drive = ctx.createGain()
      drive.gain.value = 0
      const pan = ctx.createStereoPanner()
      gate.connect(input)
      input.connect(clean)
      input.connect(pre)
      pre.connect(shaper)
      shaper.connect(drive)
      clean.connect(pan)
      drive.connect(pan)
      pan.connect(this.master)
      this.motorDry.push(gate)
      this.chainIn.push(input)
      this.clean.push(clean)
      this.drive.push(drive)
      this.pan.push(pan)
    }

    // shared noise for hats and paper
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const nd = this.noise.getChannelData(0)
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1

    // paper hiss under everything (chamber's crackle, quieter, pre-filter)
    const crackleBuf = ctx.createBuffer(1, ctx.sampleRate * 6, ctx.sampleRate)
    const cd = crackleBuf.getChannelData(0)
    for (let i = 0; i < cd.length; i++) {
      cd[i] = (Math.random() * 2 - 1) * 0.18
      if (Math.random() < 0.0003) cd[i] += (Math.random() * 2 - 1) * 0.7
    }
    const crackle = ctx.createBufferSource()
    crackle.buffer = crackleBuf
    crackle.loop = true
    const crackleHP = ctx.createBiquadFilter()
    crackleHP.type = 'highpass'
    crackleHP.frequency.value = 2200
    const crackleGain = ctx.createGain()
    crackleGain.gain.value = 0.035
    crackle.connect(crackleHP)
    crackleHP.connect(crackleGain)
    crackleGain.connect(this.master)
    crackle.start()

    // unlock on iOS: one silent sample inside the gesture
    const s = ctx.createBufferSource()
    s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    s.connect(ctx.destination)
    s.start()

    this.startRecorder().catch(() => {})
  }

  private impulse(seconds: number) {
    const { ctx } = this
    const n = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(2, n, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c)
      let lp = 0
      for (let i = 0; i < n; i++) {
        const t = i / n
        lp += 0.28 * ((Math.random() * 2 - 1) - lp)
        d[i] = lp * Math.pow(1 - t, 2.6) * (i < 400 ? i / 400 : 1)
      }
    }
    return buf
  }

  // ─── the tape: the last ~50 s of the master bus, for "save sound" ───

  private async startRecorder() {
    const { ctx } = this
    if (!ctx.audioWorklet) return
    const src = `class R extends AudioWorkletProcessor{constructor(){super();this.n=0;this.l=new Float32Array(8192);this.r=new Float32Array(8192)}process(i){const x=i[0];if(!x||!x.length)return true;const a=x[0],b=x[1]||x[0];this.l.set(a,this.n);this.r.set(b,this.n);this.n+=a.length;if(this.n>=8192){this.port.postMessage({f:currentFrame+a.length-8192,l:this.l,r:this.r},[this.l.buffer,this.r.buffer]);this.l=new Float32Array(8192);this.r=new Float32Array(8192);this.n=0}return true}}registerProcessor('drum-tape',R)`
    const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }))
    await ctx.audioWorklet.addModule(url)
    const node = new AudioWorkletNode(ctx, 'drum-tape', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 2,
      channelCountMode: 'explicit',
    })
    const keep = Math.ceil((ctx.sampleRate * 50) / 8192)
    node.port.onmessage = (e: MessageEvent<Chunk>) => {
      this.chunks.push(e.data)
      if (this.chunks.length > keep) this.chunks.shift()
    }
    this.out_.connect(node)
    const z = ctx.createGain()
    z.gain.value = 0
    node.connect(z)
    z.connect(ctx.destination)
    this.recording = true
  }

  hasAudio(t0: number, t1: number) {
    if (!this.chunks.length) return false
    const sr = this.ctx.sampleRate
    const first = this.chunks[0].f, last = this.chunks[this.chunks.length - 1].f + 8192
    // the tape starts a moment after the press does; up to half a second of
    // head is written as silence rather than losing the whole sheet
    return Math.round(t0 * sr) >= first - sr * 0.5 && Math.round(t1 * sr) <= last
  }

  wav(t0: number, t1: number): Blob | null {
    if (!this.hasAudio(t0, t1)) return null
    const sr = this.ctx.sampleRate
    const f0 = Math.round(t0 * sr), f1 = Math.round(t1 * sr)
    const n = f1 - f0
    const pcm = new Int16Array(n * 2)
    for (const c of this.chunks) {
      const a = Math.max(f0, c.f), b = Math.min(f1, c.f + 8192)
      for (let f = a; f < b; f++) {
        const i = f - c.f, o = (f - f0) * 2
        pcm[o] = Math.max(-1, Math.min(1, c.l[i])) * 32767
        pcm[o + 1] = Math.max(-1, Math.min(1, c.r[i])) * 32767
      }
    }
    const header = new DataView(new ArrayBuffer(44))
    const w = (o: number, s: string) => [...s].forEach((ch, i) => header.setUint8(o + i, ch.charCodeAt(0)))
    w(0, 'RIFF')
    header.setUint32(4, 36 + pcm.byteLength, true)
    w(8, 'WAVE')
    w(12, 'fmt ')
    header.setUint32(16, 16, true)
    header.setUint16(20, 1, true)
    header.setUint16(22, 2, true)
    header.setUint32(24, sr, true)
    header.setUint32(28, sr * 4, true)
    header.setUint16(32, 4, true)
    header.setUint16(34, 16, true)
    w(36, 'data')
    header.setUint32(40, pcm.byteLength, true)
    return new Blob([header.buffer, pcm.buffer], { type: 'audio/wav' })
  }

  // ─── controls ───

  out(d: number, hand: boolean): Out {
    return hand
      ? { dry: this.chainIn[d], wet: this.delayIn, verb: this.verbIn }
      : { dry: this.motorDry[d], wet: this.motorWet, verb: this.motorVerb }
  }

  gateMotor(open: boolean, at?: number) {
    const t = Math.max(this.ctx.currentTime, at ?? 0)
    for (const g of [...this.motorDry, this.motorWet, this.motorVerb]) {
      g.gain.cancelScheduledValues(this.ctx.currentTime)
      g.gain.setTargetAtTime(open ? 1 : 0, t, 0.006)
    }
  }

  setBpm(bpm: number) {
    // the delay slews to the new time: the repeats bend, the way a tape echo does
    this.delay.delayTime.setTargetAtTime((60 / bpm) * (3 / 16) * 4, this.ctx.currentTime, 0.09)
  }

  setPan(d: number, v: number) {
    this.pan[d].pan.setTargetAtTime(v, this.ctx.currentTime, 0.03)
  }

  setFlood(d: number, f: number) {
    const t = this.ctx.currentTime
    this.clean[d].gain.setTargetAtTime(1 - 0.45 * f, t, 0.05)
    this.drive[d].gain.setTargetAtTime(0.85 * f, t, 0.05)
  }

  paperOut(feedAt: number | null, barDur: number) {
    const now = this.ctx.currentTime
    const f = this.paperLP.frequency, q = this.paperLP.Q
    f.cancelScheduledValues(now)
    q.cancelScheduledValues(now)
    f.setValueAtTime(f.value, now)
    q.setValueAtTime(q.value, now)
    f.setTargetAtTime(330, now, 0.05)
    q.setTargetAtTime(7, now, 0.05)
    if (feedAt !== null && feedAt > now + 0.3) {
      const rise = Math.max(now + 0.25, feedAt - barDur)
      f.setValueAtTime(330, rise)
      f.exponentialRampToValueAtTime(18000, feedAt)
      q.setValueAtTime(7, rise)
      q.linearRampToValueAtTime(0.7, feedAt)
    }
  }

  paperIn() {
    const now = this.ctx.currentTime
    const f = this.paperLP.frequency, q = this.paperLP.Q
    if (f.value > 15000) return
    f.cancelScheduledValues(now)
    q.cancelScheduledValues(now)
    f.setValueAtTime(Math.max(40, f.value), now)
    q.setValueAtTime(q.value, now)
    f.exponentialRampToValueAtTime(18000, now + 0.14)
    q.linearRampToValueAtTime(0.7, now + 0.14)
  }

  throwDelay(barDur: number) {
    const now = this.ctx.currentTime
    this.delayFb.gain.cancelScheduledValues(now)
    this.delayFb.gain.setTargetAtTime(0.84, now, 0.02)
    this.delayFb.gain.setTargetAtTime(0.62, now + barDur, 0.4)
  }

  // ─── voices: chamber's kick + sub, verbatim ───

  kick(time: number, amp: number, out: AudioNode) {
    const ctx = this.ctx
    const master = out
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

  sub(time: number, amp: number, out: AudioNode) {
    const ctx = this.ctx
    const master = out
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

  // ─── chamber's stab, its filter scaled by position across the red drum ───

  stab(time: number, semis: number[], amp: number, bright: number, o: Out) {
    const ctx = this.ctx
    const f = 0.55 + bright * 1.1

    const stabLP = ctx.createBiquadFilter()
    stabLP.type = 'lowpass'
    stabLP.frequency.setValueAtTime(700 * f, time)
    stabLP.frequency.linearRampToValueAtTime(1300 * f, time + 0.035)
    stabLP.frequency.exponentialRampToValueAtTime(380 * f, time + 0.18)
    stabLP.Q.value = 4.5

    const env = ctx.createGain()
    env.gain.setValueAtTime(0, time)
    env.gain.linearRampToValueAtTime(amp, time + 0.005)
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.18)

    for (const s of semis) {
      for (const det of [-7, 5]) {
        const osc = ctx.createOscillator()
        osc.type = 'sawtooth'
        osc.frequency.value = semi(s)
        osc.detune.value = det
        osc.connect(stabLP)
        osc.start(time)
        osc.stop(time + 0.22)
      }
    }
    stabLP.connect(env)

    const wetSend = ctx.createGain()
    wetSend.gain.value = 0.85
    env.connect(wetSend)
    wetSend.connect(o.wet)

    const dry = ctx.createGain()
    dry.gain.value = 0.32
    env.connect(dry)
    dry.connect(o.dry)
  }

  // ─── new voices ───

  // Blue: left of the drum is a closed tick, right is an open hat that
  // rings and leaks into the echo.
  hat(time: number, amp: number, open: number, o: Out) {
    const ctx = this.ctx
    const dur = 0.034 + open * open * 0.3
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 7200 - open * 1500
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 11500
    const env = ctx.createGain()
    env.gain.setValueAtTime(amp, time)
    env.gain.exponentialRampToValueAtTime(0.001, time + dur)
    src.connect(hp)
    hp.connect(lp)
    lp.connect(env)
    env.connect(o.dry)
    const send = ctx.createGain()
    send.gain.value = 0.06 + open * 0.24
    env.connect(send)
    send.connect(o.wet)
    src.start(time, Math.random() * 1.5)
    src.stop(time + dur + 0.02)
  }

  // Sunflower: a rootless voicing of the chord, one octave down, slow to
  // open, sent to the plate. Left is low and dark, right is high and open.
  wash(time: number, semis: number[], amp: number, reg: number, dur: number, o: Out) {
    const ctx = this.ctx
    const shift = reg < 0.5 ? -12 : 0
    const cut = 380 + reg * 2400
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 0.9
    lp.frequency.setValueAtTime(cut * 0.45, time)
    lp.frequency.linearRampToValueAtTime(cut, time + 0.5)
    lp.frequency.exponentialRampToValueAtTime(cut * 0.55, time + dur)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, time)
    env.gain.linearRampToValueAtTime(amp, time + 0.34)
    env.gain.exponentialRampToValueAtTime(amp * 0.55, time + dur * 0.55)
    env.gain.exponentialRampToValueAtTime(0.0008, time + dur)
    const notes = [semis[1], semis[2], semis[3]]
    for (const s of notes) {
      const f = semi(s - 12 + shift)
      for (const [type, det, g] of [
        ['triangle', -7, 0.6],
        ['sawtooth', 6, 0.22],
      ] as const) {
        const osc = ctx.createOscillator()
        osc.type = type
        osc.frequency.value = f
        osc.detune.value = det
        const og = ctx.createGain()
        og.gain.value = g
        osc.connect(og)
        og.connect(lp)
        osc.start(time)
        osc.stop(time + dur + 0.05)
      }
    }
    lp.connect(env)
    const dry = ctx.createGain()
    dry.gain.value = 0.55
    env.connect(dry)
    dry.connect(o.dry)
    const send = ctx.createGain()
    send.gain.value = 0.8
    env.connect(send)
    send.connect(o.verb)
  }

  // ─── the machine's own noises ───

  private burst(time: number, dur: number, type: BiquadFilterType, freq: number, q: number, amp: number, to: AudioNode, sweepTo?: number) {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(freq, time)
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, time + dur)
    f.Q.value = q
    const env = ctx.createGain()
    env.gain.setValueAtTime(amp, time)
    env.gain.exponentialRampToValueAtTime(0.0006, time + dur)
    src.connect(f)
    f.connect(env)
    env.connect(to)
    src.start(time, Math.random() * 1.5)
    src.stop(time + dur + 0.02)
  }

  // ka-chunk: the feed rollers grab the next sheet
  feed(time: number) {
    this.burst(time, 0.035, 'bandpass', 1150, 3, 0.07, this.bus)
    this.burst(time + 0.075, 0.05, 'bandpass', 820, 2.5, 0.1, this.bus)
    this.burst(time + 0.02, 0.24, 'highpass', 3800, 0.7, 0.016, this.bus, 7000)
  }

  // a sheet torn out of the rollers
  rip(time: number) {
    const ctx = this.ctx
    const n = Math.floor(ctx.sampleRate * 0.46)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let tear = 0
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.004) tear = 0.6 + Math.random() * 0.4
      tear *= 0.9985
      d[i] = (Math.random() * 2 - 1) * (0.25 + tear) * (1 - i / n)
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 0.9
    bp.frequency.setValueAtTime(1300, time)
    bp.frequency.exponentialRampToValueAtTime(3600, time + 0.4)
    const g = ctx.createGain()
    g.gain.value = 0.34
    src.connect(bp)
    bp.connect(g)
    g.connect(this.bus)
    src.start(time)
  }

  // the stencil being cut or taped
  punch(time: number, cut: boolean) {
    if (cut) this.burst(time, 0.018, 'bandpass', 3200, 2, 0.09, this.bus)
    else this.burst(time, 0.05, 'bandpass', 1600, 1.2, 0.04, this.bus, 900)
  }

  // an ink tube squeezed
  squelch(time: number) {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(240 + Math.random() * 60, time)
    osc.frequency.exponentialRampToValueAtTime(110, time + 0.13)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, time)
    env.gain.linearRampToValueAtTime(0.05, time + 0.01)
    env.gain.exponentialRampToValueAtTime(0.0008, time + 0.14)
    osc.connect(env)
    env.connect(this.bus)
    osc.start(time)
    osc.stop(time + 0.16)
    this.burst(time, 0.07, 'lowpass', 900, 1, 0.03, this.bus)
  }
}
