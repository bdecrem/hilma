/* olasound.js: Ola's sound kit for web pages. Copy it beside the page and load it with
 *   <script src="olasound.js"></script>
 *
 * One quiet family of interface sounds (a soft felt-marimba voice in D major, a short room), a way to
 * play a written melody, and two music beds taken from work the owner approved: "pad" (an Eno-style
 * ambient pad, two related chords crossfading, no melody) and "dub" (the dub techno engine of the
 * chamber piece: its kick, sub, hat and chord stab copied exactly, the stab into a delay with a lowpass
 * inside the feedback loop). Nothing plays before a click: the sound system is made on the first
 * play() call, which must come from a click or a key press. The on/off choice is remembered, and a
 * person whose device asks for reduced motion starts with sound off.
 *
 *   OlaSound.play('tap' | 'toggle' | 'notify' | 'message' | 'reminder' | 'success' | 'error' | 'celebrate')
 *   OlaSound.melody('D4 q, F#4 e, A4 e, B4 h, ...', { bpm: 96, chords: 'D | Bm | G | A', echo: true })
 *   const bed = OlaSound.loop('pad' | 'dub', { level: 0.5 })   ...  bed.stop()
 *   OlaSound.toggleButton(document.querySelector('#sound'))    // a sound on/off button that stays in sync
 *   OlaSound.setOn(true | false), OlaSound.isOn()
 *   OlaSound.render(name, seconds)  -> Promise<AudioBuffer>   (the same sound, offline, for checks)
 *
 * Every voice is a function (ctx, out, t, ...) so the same code plays live and renders offline.
 */
(function (root) {
  'use strict'
  const KEY = 'ola-sound-on'
  let ctx = null, out = null, on = null, beds = []
  const listeners = []

  // ---------------------------------------------------------------- the on/off choice
  function storedChoice() { try { const v = root.localStorage.getItem(KEY); return v === null ? null : v === '1' } catch (e) { return null } }
  function quietByDefault() { try { return root.matchMedia('(prefers-reduced-motion: reduce)').matches } catch (e) { return false } }
  function isOn() { if (on === null) { const s = storedChoice(); on = s === null ? !quietByDefault() : s } return on }
  function setOn(v, after) {
    on = !!v
    try { root.localStorage.setItem(KEY, on ? '1' : '0') } catch (e) {}
    // turning off waits for a sound already playing (the switch's own) to fade, then fades out
    if (out && ctx) { const g = out.sw.gain, t = ctx.currentTime + (after || 0); g.cancelScheduledValues(ctx.currentTime); g.setValueAtTime(on ? 0 : 1, t); g.linearRampToValueAtTime(on ? 1 : 0, t + (on ? 0.05 : 0.25)) }
    if (!on) { beds.forEach((b) => b.stop()); beds = [] }
    listeners.forEach((f) => f(on))
  }

  // ---------------------------------------------------------------- the chain: one context, one master
  // voices -> out (on/off) -> bus -> soft compressor (a safety net, it does nothing at these levels) -> speakers
  function chain(c) {
    const o = c.createGain()
    const bus = c.createGain(); bus.gain.value = 0.9
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25
    // the on/off switch comes after the room, so turning sound off silences the echoes too
    const sw = c.createGain()
    o.connect(sw); sw.connect(bus); bus.connect(comp); comp.connect(c.destination)
    const room = makeRoom(c); room.connect(sw)
    o.room = room; o.sw = sw
    // interface sounds go through a quieter door (-6 dB) than music
    o.ui = c.createGain(); o.ui.gain.value = 0.5; o.ui.connect(o); o.ui.room = room
    return o
  }
  function unlock() {
    if (!ctx) {
      const C = root.AudioContext || root.webkitAudioContext
      if (!C) return null
      ctx = new C()
      out = chain(ctx)
      out.sw.gain.value = isOn() ? 1 : 0
    }
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  }
  // A short, dark room: decaying noise, lowpassed, as an impulse response (about 0.9 s).
  function makeRoom(c) {
    const len = Math.floor(c.sampleRate * 0.9), ir = c.createBuffer(2, len, c.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let lp = 0, seed = 7 + ch * 13
      for (let i = 0; i < len; i++) {
        seed = (seed * 16807) % 2147483647
        const n = (seed / 2147483647) * 2 - 1
        lp += 0.18 * (n - lp)
        d[i] = lp * Math.pow(1 - i / len, 3)
      }
    }
    const conv = c.createConvolver(); conv.buffer = ir
    const send = c.createGain(); send.gain.value = 0.22
    const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2800
    send.connect(tone); tone.connect(conv)
    const ret = c.createGain(); ret.gain.value = 1
    conv.connect(ret)
    ret.input = send
    return ret
  }

  // ---------------------------------------------------------------- the interface voice
  // A felt marimba: a sine with one quiet partial at 3.9x that dies first. Soft 6 ms attack, an
  // exponential decay to silence before it stops (no click at either end), a lowpass at 3.2 kHz.
  const hz = (name) => {
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(String(name).trim())
    if (!m) throw new Error('OlaSound: not a note name: ' + name)
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
    return 440 * Math.pow(2, (base + (Number(m[3]) + 1) * 12 - 69) / 12)
  }
  function felt(c, o, t, freq, amp, decay, opts) {
    opts = opts || {}
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = opts.tone || 3200; lp.Q.value = 0.5
    const env = c.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(amp, t + 0.006)
    env.gain.exponentialRampToValueAtTime(0.0008, t + decay)
    env.gain.linearRampToValueAtTime(0, t + decay + 0.02)
    const a = c.createOscillator(); a.type = 'sine'; a.frequency.value = freq
    const b = c.createOscillator(); b.type = 'sine'; b.frequency.value = freq * 3.9
    const bg = c.createGain()
    bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(0.12, t + 0.004); bg.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(0.12, decay * 0.4))
    a.connect(env); b.connect(bg); bg.connect(env); env.connect(lp); lp.connect(o)
    if (o.room && opts.room !== false) { const s = c.createGain(); s.gain.value = opts.room || 1; lp.connect(s); s.connect(o.room.input) }
    for (const x of [a, b]) { x.start(t); x.stop(t + decay + 0.05) }
  }
  // A soft "tock": the felt voice, very short, with its pitch dropping a little.
  function tock(c, o, t, freq, amp) {
    const env = c.createGain()
    env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(amp, t + 0.003); env.gain.exponentialRampToValueAtTime(0.0006, t + 0.07)
    env.gain.linearRampToValueAtTime(0, t + 0.08)
    const a = c.createOscillator(); a.type = 'sine'
    a.frequency.setValueAtTime(freq, t); a.frequency.exponentialRampToValueAtTime(freq * 0.78, t + 0.05)
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400
    a.connect(env); env.connect(lp); lp.connect(o)
    a.start(t); a.stop(t + 0.09)
  }

  // Interface sounds, all in D major, all near -18 dBFS at the peak. One family: change pitch and
  // rhythm, never the voice. Two notes rising = something arrived; falling and lower = gently no.
  const UI = {
    tap: (c, o, t) => tock(c, o, t, hz('A5'), 0.05),
    toggle: (c, o, t, v) => { const up = v !== false; felt(c, o, t, hz(up ? 'A5' : 'D6'), 0.06, 0.18, { room: false }); felt(c, o, t + 0.05, hz(up ? 'D6' : 'A5'), 0.06, 0.22, { room: false }) },
    notify: (c, o, t) => { felt(c, o, t, hz('D5'), 0.11, 0.6); felt(c, o, t + 0.11, hz('A5'), 0.1, 0.8) },
    message: (c, o, t) => { felt(c, o, t, hz('F#5'), 0.1, 0.45); felt(c, o, t + 0.09, hz('B5'), 0.09, 0.6) },
    reminder: (c, o, t) => { felt(c, o, t, hz('A4'), 0.12, 0.7); felt(c, o, t + 0.16, hz('D5'), 0.11, 0.7); felt(c, o, t + 0.32, hz('A4'), 0.1, 0.9) },
    success: (c, o, t) => { felt(c, o, t, hz('D5'), 0.1, 0.5); felt(c, o, t + 0.07, hz('F#5'), 0.1, 0.5); felt(c, o, t + 0.14, hz('A5'), 0.1, 0.9) },
    error: (c, o, t) => { felt(c, o, t, hz('A4'), 0.11, 0.35, { tone: 1800 }); felt(c, o, t + 0.12, hz('F#4'), 0.11, 0.5, { tone: 1800 }) },
    // a small win: a quick rising D major arpeggio over a soft chord that swells and fades (1.9 s)
    celebrate: (c, o, t) => {
      ;['D5', 'F#5', 'A5', 'D6'].forEach((n, i) => felt(c, o, t + i * 0.075, hz(n), 0.09, i === 3 ? 1.3 : 0.5))
      padChord(c, o, t + 0.05, ['D4', 'A4', 'F#5', 'E5'].map(hz), 0.035, 0.25, 1.6)
    },
  }
  // a soft chord: sines, slow-ish swell, long fade
  function padChord(c, o, t, freqs, amp, attack, release) {
    const env = c.createGain()
    env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(amp, t + attack); env.gain.exponentialRampToValueAtTime(0.0006, t + attack + release)
    env.gain.linearRampToValueAtTime(0, t + attack + release + 0.03)
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200
    freqs.forEach((f, i) => { const x = c.createOscillator(); x.type = i % 2 ? 'triangle' : 'sine'; x.frequency.value = f; x.detune.value = i % 2 ? 5 : -5; x.connect(lp); x.start(t); x.stop(t + attack + release + 0.05) })
    lp.connect(env); env.connect(o)
    if (o.room) { const s = c.createGain(); s.gain.value = 1; env.connect(s); s.connect(o.room.input) }
  }

  function play(name, arg) {
    const voice = UI[name]
    if (!voice) throw new Error('OlaSound: no sound named ' + name + ' (try ' + Object.keys(UI).join(', ') + ')')
    if (!isOn()) return
    const c = unlock(); if (!c) return
    voice(c, out.ui, c.currentTime + 0.01, arg)
  }

  // ---------------------------------------------------------------- melody
  // 'D4 q, F#4 e, A4 e, B4 h, r q' : note and length (w whole, h half, q quarter, e eighth, s
  // sixteenth, a dot adds half: q. ; r is a rest). Played by the felt voice a little longer, with an
  // optional soft chord per bar underneath ('D | Bm | G | A') and an optional dub echo.
  const LEN = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 }
  function parse(score) {
    return String(score).split(/[,\n]+/).map((x) => x.trim()).filter(Boolean).map((tok) => {
      const [n, l = 'q'] = tok.split(/\s+/)
      const beats = LEN[l.replace('.', '')] * (l.endsWith('.') ? 1.5 : 1)
      if (!beats) throw new Error('OlaSound: bad length in ' + tok)
      return { note: n === 'r' ? null : n, beats }
    })
  }
  const CHORD = { '': [0, 4, 7], m: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], 7: [0, 4, 7, 10], sus2: [0, 2, 7], sus4: [0, 5, 7], add9: [0, 4, 7, 14], m9: [0, 3, 7, 10, 14] }
  function chordHz(sym) {
    const m = /^([A-G][#b]?)(.*)$/.exec(sym.trim()); if (!m) throw new Error('OlaSound: bad chord ' + sym)
    const iv = CHORD[m[2]]; if (!iv) throw new Error('OlaSound: unknown chord kind ' + m[2])
    const root3 = hz(m[1] + '3')
    return iv.map((s) => root3 * Math.pow(2, s / 12))
  }
  function scheduleMelody(c, o, t0, score, opts) {
    opts = opts || {}
    const beat = 60 / (opts.bpm || 96)
    let dest = o
    if (opts.echo) { dest = c.createGain(); dest.connect(o); const d = dubDelay(c, o, opts.bpm || 96, 0.35); dest.connect(d) }
    let t = t0
    for (const n of parse(score)) {
      if (n.note) felt(c, dest, t, hz(n.note), 0.16, Math.max(0.35, n.beats * beat * 1.1))
      t += n.beats * beat
    }
    if (opts.chords) String(opts.chords).split('|').map((s) => s.trim()).filter(Boolean).forEach((sym, i) => padChord(c, o, t0 + i * 4 * beat, chordHz(sym), 0.028, 0.4, 4 * beat * 1.05))
    return t - t0
  }
  function melody(score, opts) {
    if (!isOn()) return 0
    const c = unlock(); if (!c) return 0
    return scheduleMelody(c, out, c.currentTime + 0.05, score, opts)
  }
  // the dub echo: a delay with a lowpass inside its feedback loop, so every repeat is darker
  function dubDelay(c, o, bpm, send) {
    const inp = c.createGain(); inp.gain.value = send
    const delay = c.createDelay(2.5); delay.delayTime.value = (60 / bpm) * 0.75
    const fb = c.createGain(); fb.gain.value = 0.5
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700
    inp.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); delay.connect(o)
    return inp
  }

  // ---------------------------------------------------------------- music beds
  // Each bed is { setup(c, o) -> state, step(c, state, from, to) } so it plays live (a lookahead
  // scheduler every 50 ms, 200 ms ahead) and renders offline (one step over the whole length).
  const BEDS = {}

  // "pad": the An Ending (Ascent)-style pad Bart approved. No melody. Two related chords (Amaj9 and
  // F#m11, as in the original) take turns every 26 to 34 s; voices of the current chord fade in over
  // 7 to 14 s, hold 5 to 12 s, fade out over 12 to 21 s; a new voice every 1.4 to 3.8 s; mostly sines,
  // about a quarter triangles, +-7 cents; the whole through a 2200 Hz lowpass that a 0.04 Hz LFO moves.
  // opts.key moves it (semitones from A); opts.level is the bed's loudness (0.5 is a quiet page bed).
  BEDS.pad = {
    setup(c, o, opts) {
      const m = c.createGain(); m.gain.setValueAtTime(0.0001, c.currentTime); m.gain.exponentialRampToValueAtTime(opts.level || 0.5, c.currentTime + 6)
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 0.5
      const lfo = c.createOscillator(); lfo.frequency.value = 0.04; const lg = c.createGain(); lg.gain.value = 700
      lfo.connect(lg); lg.connect(lp.frequency); lfo.start()
      lp.connect(m); m.connect(o)
      if (o.room) { const s = c.createGain(); s.gain.value = 0.8; m.connect(s); s.connect(o.room.input) }
      const k = opts.key || 0, A = (s) => 220 * Math.pow(2, (s + k) / 12)
      const chords = [[0, 4, 7, 11, 14, 16, 19].map(A), [-3, 0, 4, 7, 11, 14].map(A)] // Amaj9 (A C# E G# B, E), F#m11 (F# A C# E B)
      let seed = 12345
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
      return { m, lp, lfo, chords, rnd, next: c.currentTime + 0.1, chord: 0, switchAt: c.currentTime + 26 + rnd() * 8, nodes: [] }
    },
    step(c, s, from, to) {
      while (s.next < to) {
        const t = s.next
        if (t >= s.switchAt) { s.chord = 1 - s.chord; s.switchAt = t + 26 + s.rnd() * 8 }
        const notes = s.chords[s.chord], f = notes[Math.floor(s.rnd() * notes.length)]
        // the first three voices come in over 2 to 4 s, so a page is not silent for ten seconds
        const fin = (s.count = (s.count || 0) + 1) <= 3 ? 2 + s.rnd() * 2 : 7 + s.rnd() * 7, hold = 5 + s.rnd() * 7, fout = 12 + s.rnd() * 9
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + fin); g.gain.setValueAtTime(0.06, t + fin + hold); g.gain.linearRampToValueAtTime(0.0001, t + fin + hold + fout)
        const x = c.createOscillator(); x.type = s.rnd() < 0.25 ? 'triangle' : 'sine'; x.frequency.value = f; x.detune.value = (s.rnd() * 2 - 1) * 7
        x.connect(g); g.connect(s.lp); x.start(t); x.stop(t + fin + hold + fout + 0.1)
        s.next = t + 1.4 + s.rnd() * 2.4
      }
    },
    stop(c, s) { const t = c.currentTime; s.m.gain.cancelScheduledValues(t); s.m.gain.setValueAtTime(s.m.gain.value, t); s.m.gain.linearRampToValueAtTime(0.0001, t + 1.2); try { s.lfo.stop(t + 1.3) } catch (e) {} },
  }

  // "dub": the chamber engine (dub techno, 122 BPM in the original; opts.bpm 110 to 124). Kick, sub,
  // hat and stab are chamber's own, number for number: do not change them. Arrangement for a page:
  // bars 1-2 kick and sub, hat from bar 3, stabs from bar 5 (Am7, then Dm9, then Em7, 8 bars each).
  BEDS.dub = {
    setup(c, o, opts) {
      const BPM = opts.bpm || 122
      const master = c.createGain(); master.gain.value = 0.85 * (opts.level || 0.33)
      const lpf = c.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 8000; lpf.Q.value = 0.7
      master.connect(lpf); lpf.connect(o)
      const delay = c.createDelay(2.5); delay.delayTime.value = (60 / BPM) * (3 / 16) * 4
      const delayFb = c.createGain(); delayFb.gain.value = 0.62
      const delayLP = c.createBiquadFilter(); delayLP.type = 'lowpass'; delayLP.frequency.value = 1700
      const delayBus = c.createGain(); delayBus.gain.value = 0.85
      delay.connect(delayLP); delayLP.connect(delayFb); delayFb.connect(delay); delay.connect(delayBus); delayBus.connect(master)
      const sweep = c.createOscillator(); sweep.frequency.value = 1 / ((60 / BPM) * 4 * 32)
      const sweepGain = c.createGain(); sweepGain.gain.value = 3200
      sweep.connect(sweepGain); sweepGain.connect(lpf.frequency); sweep.start()
      const semi = (s) => 220 * Math.pow(2, s / 12)
      const CHORDS = [[semi(0), semi(3), semi(7), semi(10), semi(12)], [semi(5), semi(8), semi(12), semi(15), semi(17)], [semi(7), semi(10), semi(14), semi(17), semi(19)]]
      return { BPM, STEP: 60 / BPM / 4, master, delay, sweep, CHORDS, start: c.currentTime + 0.15, n: 0 }
    },
    step(c, s, from, to) {
      while (s.start + s.n * s.STEP <= to) {
        const time = s.start + s.n * s.STEP, step = s.n % 16, bar = Math.floor(s.n / 16) % 28
        if (step % 4 === 0) { dubKick(c, s.master, time, 0.7); dubSub(c, s.master, time, 0.6) }
        if (bar >= 2) {
          let amp = 0
          if (step % 4 === 0) amp = 0.07; else if (step % 4 === 1 || step % 4 === 3) amp = 0.10; else amp = 0.16
          dubHat(c, s.master, time, amp)
        }
        if (bar >= 4 && (step === 2 || step === 10)) dubStab(c, s.master, s.delay, time, s.CHORDS[Math.floor((bar - 4) / 8) % 3], 0.42)
        s.n++
      }
    },
    stop(c, s) { const t = c.currentTime; s.master.gain.cancelScheduledValues(t); s.master.gain.setValueAtTime(s.master.gain.value, t); s.master.gain.linearRampToValueAtTime(0, t + 0.4); try { s.sweep.stop(t + 0.5) } catch (e) {} },
  }
  // chamber's voices, verbatim
  function dubKick(ctx, master, time, amp) {
    const osc = ctx.createOscillator(); osc.type = 'sine'
    osc.frequency.setValueAtTime(70, time); osc.frequency.exponentialRampToValueAtTime(45, time + 0.06)
    const env = ctx.createGain(); env.gain.setValueAtTime(0, time); env.gain.linearRampToValueAtTime(amp, time + 0.005); env.gain.exponentialRampToValueAtTime(0.001, time + 0.22)
    osc.connect(env); env.connect(master); osc.start(time); osc.stop(time + 0.24)
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.022), ctx.sampleRate), d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const noise = ctx.createBufferSource(); noise.buffer = buf
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800
    const ng = ctx.createGain(); ng.gain.setValueAtTime(amp * 0.12, time); ng.gain.exponentialRampToValueAtTime(0.001, time + 0.018)
    noise.connect(hp); hp.connect(ng); ng.connect(master); noise.start(time); noise.stop(time + 0.025)
  }
  function dubSub(ctx, master, time, amp) {
    const osc = ctx.createOscillator(); osc.type = 'sine'
    osc.frequency.setValueAtTime(82, time); osc.frequency.exponentialRampToValueAtTime(55, time + 0.04)
    const env = ctx.createGain(); env.gain.setValueAtTime(0, time); env.gain.linearRampToValueAtTime(amp, time + 0.012); env.gain.exponentialRampToValueAtTime(0.001, time + 0.36)
    osc.connect(env); env.connect(master); osc.start(time); osc.stop(time + 0.38)
  }
  function dubHat(ctx, master, time, amp) {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.04), ctx.sampleRate), d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const noise = ctx.createBufferSource(); noise.buffer = buf
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7200
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 11000
    const env = ctx.createGain(); env.gain.setValueAtTime(amp, time); env.gain.exponentialRampToValueAtTime(0.001, time + 0.038)
    noise.connect(hp); hp.connect(lp); lp.connect(env); env.connect(master); noise.start(time); noise.stop(time + 0.05)
  }
  function dubStab(ctx, master, delay, time, notes, amp) {
    const stabLP = ctx.createBiquadFilter(); stabLP.type = 'lowpass'
    stabLP.frequency.setValueAtTime(700, time); stabLP.frequency.linearRampToValueAtTime(1300, time + 0.035); stabLP.frequency.exponentialRampToValueAtTime(380, time + 0.18)
    stabLP.Q.value = 4.5
    const env = ctx.createGain(); env.gain.setValueAtTime(0, time); env.gain.linearRampToValueAtTime(amp, time + 0.005); env.gain.exponentialRampToValueAtTime(0.001, time + 0.18)
    for (const f of notes) for (const det of [-7, 5]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; o.connect(stabLP); o.start(time); o.stop(time + 0.22) }
    stabLP.connect(env)
    const wetSend = ctx.createGain(); wetSend.gain.value = 0.85; env.connect(wetSend); wetSend.connect(delay)
    const dry = ctx.createGain(); dry.gain.value = 0.32; env.connect(dry); dry.connect(master)
  }

  function loop(name, opts) {
    const bed = BEDS[name]
    if (!bed) throw new Error('OlaSound: no bed named ' + name + ' (pad or dub)')
    opts = opts || {}
    const handle = { playing: false, stop() { if (!this.playing) return; this.playing = false; clearInterval(this.timer); if (this.state) bed.stop(ctx, this.state); beds = beds.filter((b) => b !== this) } }
    if (!isOn()) return handle
    const c = unlock(); if (!c) return handle
    const st = bed.setup(c, out, opts)
    handle.state = st; handle.playing = true
    bed.step(c, st, c.currentTime, c.currentTime + 0.2)
    handle.timer = setInterval(() => bed.step(c, st, c.currentTime, c.currentTime + 0.2), 50)
    beds.push(handle)
    return handle
  }

  // ---------------------------------------------------------------- a sound on/off button
  // <button id="sound" type="button" aria-pressed="true">Sound on</button>
  function toggleButton(el, opts) {
    opts = opts || {}
    const show = (v) => { el.setAttribute('aria-pressed', v ? 'true' : 'false'); if (opts.label !== false) el.textContent = v ? (opts.onText || 'Sound on') : (opts.offText || 'Sound off') }
    show(isOn())
    listeners.push(show)
    el.addEventListener('click', () => {
      const v = !isOn()
      if (v) { setOn(true); unlock(); play('toggle', true) } else { play('toggle', false); setOn(false, 0.3) }
      if (opts.onChange) opts.onChange(v)
    })
    return el
  }

  // ---------------------------------------------------------------- offline, for checks
  function render(name, seconds, opts) {
    const C = root.OfflineAudioContext || root.webkitOfflineAudioContext
    const c = new C(2, Math.ceil(44100 * (seconds || 3)), 44100)
    const o = chain(c)
    if (UI[name]) UI[name](c, o.ui, 0.01, opts)
    else if (BEDS[name]) { const st = BEDS[name].setup(c, o, opts || {}); BEDS[name].step(c, st, 0, (seconds || 3) - 0.5) }
    else if (name === 'melody') scheduleMelody(c, o, 0.05, opts.score, opts)
    else throw new Error('OlaSound: nothing named ' + name)
    return c.startRendering()
  }

  root.OlaSound = { play, melody, loop, toggleButton, setOn, isOn, unlock, render, names: Object.keys(UI), beds: Object.keys(BEDS), hz }
})(typeof window !== 'undefined' ? window : this)
