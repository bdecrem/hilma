// capture.js: put into a page before its own scripts by listen.py, so a program can hear the page.
//
// Every AudioContext the page makes is really an OfflineAudioContext whose clock follows the wall
// clock. The page schedules its sounds as it would in a browser (clicks, timers, a lookahead
// scheduler), nothing plays out loud, and at the end each context is rendered exactly, sample by
// sample, onto one timeline. <audio> elements are decoded into the same timeline. It records which
// sources started when (oscillators with their pitch, so the melody can be read), every click
// listen.py made, which contexts were made before the first click and whether they were resumed.
// window.__olaListen.finish() renders and measures; it returns plain JSON (levels per stretch between
// clicks, brightness above 5 kHz, how sounds start and end, the notes) plus a WAV and a spectrogram.
(() => {
  if (window.__olaListen) return
  const RealOffline = window.OfflineAudioContext || window.webkitOfflineAudioContext
  if (!RealOffline) return
  const SR = 44100
  const SECONDS = Number(window.__olaListenSeconds || 75)
  const T0 = performance.now()
  const clock = () => (performance.now() - T0) / 1000
  const rec = { contexts: [], sources: [], media: [], gestures: [], resumes: [], warnings: [], bypass: false }
  const events = new WeakMap() // AudioParam -> [{k, v, t}]
  const born = new WeakMap() // AudioParam -> context time its node was made
  const lastSet = new WeakMap()
  let latest = null
  window.__olaListen = rec
  const warn = (w) => { if (!rec.warnings.includes(w)) rec.warnings.push(w) }

  class Ctx extends RealOffline {
    constructor() {
      const start = clock()
      super(2, Math.max(SR, Math.ceil(SR * (SECONDS - start))), SR)
      this.__start = start
      this.__id = rec.contexts.length
      this.__closed = false
      rec.contexts.push({ ctx: this, id: this.__id, created: start, before_click: rec.gestures.length === 0 })
      latest = this
    }
    get currentTime() { return Math.max(0, clock() - this.__start) }
    get state() { return this.__closed ? 'closed' : 'running' }
    resume() { rec.resumes.push({ id: this.__id, at: clock(), clicks: rec.gestures.length }); return Promise.resolve() }
    suspend() { return Promise.resolve() }
    close() { if (!this.__closed) { this.__closed = true; this.__closedAt = clock() } return Promise.resolve() }
    get baseLatency() { return 0.005 }
    get outputLatency() { return 0.01 }
    getOutputTimestamp() { return { contextTime: this.currentTime, performanceTime: performance.now() } }
    createMediaElementSource() { warn('media_element_source'); return this.createGain() }
    createMediaStreamDestination() { warn('media_stream_destination'); const g = this.createGain(); g.stream = null; return g }
  }
  // Stamp every node's parameters with the time the node was made (a value set right away is its start value).
  for (const k of Object.getOwnPropertyNames(BaseAudioContext.prototype)) {
    if (!k.startsWith('create')) continue
    const orig = BaseAudioContext.prototype[k]
    if (typeof orig !== 'function') continue
    Ctx.prototype[k] = Ctx.prototype[k] !== orig && Object.prototype.hasOwnProperty.call(Ctx.prototype, k) ? Ctx.prototype[k] : function (...a) {
      const node = orig.apply(this, a)
      if (!rec.bypass && node && typeof node === 'object') {
        const t = this.currentTime
        for (const p in node) { try { const v = node[p]; if (v instanceof AudioParam) born.set(v, t) } catch (e) {} }
      }
      return node
    }
  }
  window.AudioContext = Ctx
  window.webkitAudioContext = Ctx

  const ours = (c) => c instanceof Ctx
  const AS = AudioScheduledSourceNode.prototype
  const oStart = AS.start, oStop = AS.stop
  AS.start = function (when, ...rest) {
    if (rec.bypass || !ours(this.context)) return oStart.call(this, when || 0, ...rest)
    const w = Math.max(Number(when) || 0, this.context.currentTime)
    const info = { ctx: this.context.__id, kind: this.constructor.name, at: this.context.__start + w, clicks: rec.gestures.length, node: this }
    if (this instanceof AudioBufferSourceNode) { info.loop = !!this.loop; info.dur = this.buffer ? this.buffer.duration : 0 }
    this.__ola = info
    if (rec.sources.length < 6000) rec.sources.push(info)
    return oStart.call(this, w, ...rest)
  }
  AS.stop = function (when) {
    if (rec.bypass || !ours(this.context)) return oStop.call(this, when || 0)
    const w = Math.max(Number(when) || 0, this.context.currentTime)
    if (this.__ola) this.__ola.stop = this.context.__start + w
    return oStop.call(this, w)
  }

  const AP = AudioParam.prototype
  const log = (p, e) => { let a = events.get(p); if (!a) events.set(p, (a = [])); if (a.length < 400) a.push(e) }
  for (const [name, k] of [['setValueAtTime', 'set'], ['linearRampToValueAtTime', 'lin'], ['exponentialRampToValueAtTime', 'exp'], ['setTargetAtTime', 'target']]) {
    const orig = AP[name]
    AP[name] = function (v, t, ...r) { if (!rec.bypass) { log(this, { k, v: Number(v), t: Number(t) }); lastSet.delete(this) } return orig.call(this, v, t, ...r) }
  }
  const oCurve = AP.setValueCurveAtTime
  AP.setValueCurveAtTime = function (curve, t, d) { if (!rec.bypass && curve && curve.length) log(this, { k: 'curve', v: Number(curve[curve.length - 1]), t: Number(t) + Number(d) }); return oCurve.call(this, curve, t, d) }
  const desc = Object.getOwnPropertyDescriptor(AP, 'value')
  Object.defineProperty(AP, 'value', {
    configurable: true, enumerable: true,
    get() { return lastSet.has(this) ? lastSet.get(this) : desc.get.call(this) },
    set(v) {
      if (rec.bypass || !latest) return desc.set.call(this, v)
      const b = born.get(this)
      const now = latest.currentTime
      if (!events.get(this) && (b === undefined || now - b < 0.05)) return desc.set.call(this, v)
      try { AP.setValueAtTime.call(this, v, now) } catch (e) { desc.set.call(this, v) }
      lastSet.set(this, Number(v))
    },
  })

  // <audio>: decoded into the timeline when played; nothing plays out loud.
  const playing = new WeakMap()
  HTMLMediaElement.prototype.play = function () {
    const el = this
    const src = el.currentSrc || el.src
    const at = clock()
    rec.media.push({ src: String(src).slice(0, 60), at, loop: !!el.loop, clicks: rec.gestures.length })
    if (src && !rec.bypass) (async () => {
      try {
        const ab = await (await fetch(src)).arrayBuffer()
        const c = latest || new Ctx()
        const buf = await c.decodeAudioData(ab)
        const s = c.createBufferSource()
        s.buffer = buf
        s.loop = !!el.loop
        const g = c.createGain()
        g.gain.value = el.muted ? 0 : el.volume
        s.connect(g)
        g.connect(c.destination)
        s.start(at - c.__start)
        playing.set(el, s)
      } catch (e) { warn('audio_file_not_decoded') }
    })()
    return Promise.resolve()
  }
  HTMLMediaElement.prototype.pause = function () { const s = playing.get(this); if (s) { try { s.stop() } catch (e) {} playing.delete(this) } }
  try { if (window.speechSynthesis) window.speechSynthesis.speak = () => warn('speech_synthesis') } catch (e) {}

  rec.clock = clock
  // still sounding: started in the last second, or not due to stop for another half second, or looping
  rec.live = () => { const now = clock(); return rec.sources.filter((s) => s.at > now - 1 || s.loop || s.stop === undefined || s.stop > now + 0.5).filter((s) => s.clicks === rec.gestures.length && s.clicks > 0).length }
  rec.gesture = (label) => { rec.gestures.push({ at: clock(), label: String(label || '').slice(0, 60) }) }
  // A form submit must not leave the page (its own handlers still run).
  document.addEventListener('submit', (e) => { if (!e.defaultPrevented) e.preventDefault() }, true)

  // ---- measuring ----------------------------------------------------------------------------
  const db = (v) => (v > 1e-9 ? Math.round(200 * Math.log10(v)) / 10 : -180)
  function paramAt(p, t, rel) {
    const ev = (events.get(p) || []).filter((e) => e.t <= t + 1e-4)
    let v = desc.get.call(p)
    for (const e of ev) v = e.v
    return v
  }
  function sweeps(p, t0) {
    const ev = (events.get(p) || []).filter((e) => (e.k === 'exp' || e.k === 'lin' || e.k === 'target') && e.t > t0 - 1e-4 && e.t <= t0 + 0.2)
    if (!ev.length) return false
    const v0 = paramAt(p, t0)
    return ev.some((e) => v0 > 0 && e.v > 0 && Math.max(e.v / v0, v0 / e.v) > 1.25)
  }
  function fft(re, im) {
    const n = re.length
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang)
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0
        for (let j = 0; j < len / 2; j++) {
          const a = i + j, b = a + len / 2
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr
        }
      }
    }
  }
  const N_FFT = 2048
  const hann = Float32Array.from({ length: N_FFT }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N_FFT - 1)))
  function spectrum(x, a, b) { // power above 5 kHz / total, and the centroid, over [a, b)
    let hi = 0, tot = 0, cen = 0
    const re = new Float32Array(N_FFT), im = new Float32Array(N_FFT)
    const cut = Math.round((5000 * N_FFT) / SR)
    for (let s = a; s + N_FFT <= b; s += N_FFT) {
      for (let i = 0; i < N_FFT; i++) { re[i] = x[s + i] * hann[i]; im[i] = 0 }
      fft(re, im)
      for (let k = 1; k < N_FFT / 2; k++) { const p = re[k] * re[k] + im[k] * im[k]; tot += p; cen += p * k; if (k >= cut) hi += p }
    }
    return { hf: tot > 0 ? hi / tot : 0, centroid: tot > 0 ? Math.round(((cen / tot) * SR) / N_FFT) : 0 }
  }
  function measure(L, R, M, a, b, label) {
    const out = { label, start: +(a / SR).toFixed(2), end: +(b / SR).toFixed(2) }
    const W = Math.round(SR * 0.01)
    let peak = 0, clipped = 0
    for (let i = a; i < b; i++) { const m = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (m > peak) peak = m; if (m >= 0.999) clipped++ }
    out.peak_dbfs = db(peak); out.clipped_samples = clipped
    if (peak < 0.001) { out.silent = true; return out }
    // 10 ms windows: where it sounds, and its loudness while it sounds
    const win = []
    for (let s = a; s < b; s += W) { let e = 0, n = 0; for (let i = s; i < Math.min(b, s + W); i++) { e += M[i] * M[i]; n++ } win.push(Math.sqrt(e / Math.max(1, n))) }
    const act = win.map((v) => v > 0.001)
    const first = act.indexOf(true), last = act.lastIndexOf(true)
    if (first < 0) { out.silent = true; return out }
    let e = 0, n = 0, dc = 0
    const s0 = a + first * W, s1 = Math.min(b, a + (last + 1) * W)
    for (let i = s0; i < s1; i++) { e += M[i] * M[i]; dc += M[i]; n++ }
    out.rms_dbfs = db(Math.sqrt(e / n)); out.dc = +(dc / n).toFixed(4)
    out.sound_starts = +((s0 - a) / SR).toFixed(2); out.sound_length = +((s1 - s0) / SR).toFixed(2)
    out.continues = win.slice(-30).filter(Boolean).length > 0 && win.slice(-30).every((v) => v > 0.0005) && b - a > SR * 0.6
    Object.assign(out, spectrum(M, s0, s1))
    // how it starts: 10% to 90% of the first sound's own peak, on a 1 ms peak-hold envelope
    const H = Math.round(SR * 0.00025), P = Math.round(SR * 0.001)
    const env = []
    const e1 = Math.min(b, s1 + Math.round(SR * 0.6)) // past the -60 dBFS point, so a quiet sound's fade is seen whole
    for (let s = s0 - P; s < e1; s += H) { let m = 0; for (let i = Math.max(a, s); i < Math.min(e1, s + P); i++) m = Math.max(m, Math.abs(M[i])); env.push(m) }
    const firstPeakAt = (() => { let m = 0, k = 0; for (let i = 0; i < Math.min(env.length, Math.round(0.08 * SR / H)); i++) if (env[i] > m) { m = env[i]; k = i } return [m, k] })()
    const [fp, fk] = firstPeakAt
    let i10 = 0; while (i10 < fk && env[i10] < 0.1 * fp) i10++
    let i90 = i10; while (i90 < fk && env[i90] < 0.9 * fp) i90++
    out.attack_ms = +(((i90 - i10) * H * 1000) / SR).toFixed(1)
    // how it ends: the level 3 ms before it falls silent
    let lastLoud = env.length - 1; while (lastLoud > 0 && env[lastLoud] < peak * 0.001) lastLoud--
    const before = env[Math.max(0, lastLoud - Math.round(0.003 * SR / H))] || 0
    out.ends_abruptly = !out.continues && before > peak * 0.05
    // sharp jumps inside the sound (a click when a note is cut or starts at full level)
    let jumps = 0
    for (let i = s0 + 1; i < s1; i++) { const d = Math.abs(M[i] - M[i - 1]); if (d > 0.25 && d > peak * 0.5) jumps++ }
    out.jumps = jumps
    return out
  }
  function spectrogram(M, total, marks) {
    const Wd = 1000, Ht = 320, top = 20, bottom = 26, left = 44
    const c = document.createElement('canvas'); c.width = Wd; c.height = Ht
    const g = c.getContext('2d')
    g.fillStyle = '#f7f4ee'; g.fillRect(0, 0, Wd, Ht)
    const plotW = Wd - left - 8, plotH = Ht - top - bottom
    const cols = plotW, hop = Math.max(1, Math.floor(total / cols))
    const re = new Float32Array(N_FFT), im = new Float32Array(N_FFT)
    const fmin = 40, fmax = 16000
    const img = g.createImageData(plotW, plotH)
    for (let cI = 0; cI < cols; cI++) {
      const s = cI * hop
      if (s + N_FFT > M.length) break
      for (let i = 0; i < N_FFT; i++) { re[i] = M[s + i] * hann[i]; im[i] = 0 }
      fft(re, im)
      for (let y = 0; y < plotH; y++) {
        const f = fmin * Math.pow(fmax / fmin, 1 - y / plotH)
        const k = Math.min(N_FFT / 2 - 1, Math.max(1, Math.round((f * N_FFT) / SR)))
        const p = (re[k] * re[k] + im[k] * im[k]) / (N_FFT * N_FFT / 16)
        const d = 10 * Math.log10(p + 1e-12)
        const v = Math.max(0, Math.min(1, (d + 100) / 80))
        const o = (y * plotW + cI) * 4
        img.data[o] = 247 - v * 225; img.data[o + 1] = 244 - v * 214; img.data[o + 2] = 238 - v * 170; img.data[o + 3] = 255
      }
    }
    g.putImageData(img, left, top)
    g.fillStyle = '#333'; g.font = '12px sans-serif'
    for (const f of [100, 1000, 5000, 10000]) {
      const y = top + plotH * (1 - Math.log(f / fmin) / Math.log(fmax / fmin))
      g.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), 4, y + 4)
      g.strokeStyle = f === 5000 ? '#b3261e' : '#0002'; g.setLineDash(f === 5000 ? [4, 3] : []); g.beginPath(); g.moveTo(left, y); g.lineTo(left + plotW, y); g.stroke()
    }
    g.setLineDash([])
    for (const m of marks) {
      const x = left + (m.at * SR) / hop
      g.strokeStyle = '#1f4e8c'; g.beginPath(); g.moveTo(x, top); g.lineTo(x, top + plotH); g.stroke()
      g.fillStyle = '#1f4e8c'; g.fillText(m.label.slice(0, 18), x + 2, top - 6)
    }
    g.fillStyle = '#333'; g.fillText(`${(total / SR).toFixed(1)} s; frequency on the left (Hz), loudness as darkness; dashed red line at 5 kHz`, left, Ht - 8)
    return c.toDataURL('image/png')
  }
  function wav(L, R, a, b) {
    const n = b - a, buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf)
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true)
    v.setUint32(24, SR, true); v.setUint32(28, SR * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 4, true)
    for (let i = 0; i < n; i++) {
      v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[a + i])) * 32767, true)
      v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[a + i])) * 32767, true)
    }
    let s = ''; const u = new Uint8Array(buf)
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000))
    return btoa(s)
  }

  rec.finish = async (opts = {}) => {
    const end = clock()
    rec.bypass = true
    const N = Math.max(SR, Math.ceil(Math.min(end, SECONDS) * SR))
    const L = new Float32Array(N), R = new Float32Array(N)
    for (const c of rec.contexts) {
      const ctx = c.ctx
      try {
        const buf = await RealOffline.prototype.startRendering.call(ctx)
        const off = Math.round(ctx.__start * SR)
        const stopAt = ctx.__closed ? Math.round((ctx.__closedAt - ctx.__start) * SR) : buf.length
        const l = buf.getChannelData(0), r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l
        for (let i = 0; i < Math.min(stopAt, buf.length) && off + i < N; i++) { L[off + i] += l[i]; R[off + i] += r[i] }
      } catch (e) { warn('render_failed: ' + String(e && e.message).slice(0, 80)) }
    }
    const M = new Float32Array(N)
    for (let i = 0; i < N; i++) M[i] = (L[i] + R[i]) / 2
    const marks = rec.gestures.filter((g) => g.at < N / SR)
    const bounds = [0, ...marks.map((g) => Math.round(g.at * SR)), N]
    const segments = []
    for (let i = 0; i + 1 < bounds.length; i++) segments.push(measure(L, R, M, bounds[i], bounds[i + 1], i === 0 ? 'before any click' : marks[i - 1].label))
    const whole = measure(L, R, M, 0, N, 'everything')
    const notes = rec.sources.map((s) => {
      const o = { kind: s.kind, at: +s.at.toFixed(3), stop: s.stop !== undefined ? +s.stop.toFixed(3) : null, clicks: s.clicks, ctx: s.ctx }
      if (s.node instanceof OscillatorNode) {
        const w = s.at - rec.contexts[s.ctx].ctx.__start
        o.type = s.node.type; o.freq = +paramAt(s.node.frequency, w).toFixed(2); o.detune = +paramAt(s.node.detune, w).toFixed(1)
        o.sweep = sweeps(s.node.frequency, w)
        o.to_param = false
      }
      if (s.loop !== undefined) { o.loop = s.loop; o.dur = +(s.dur || 0).toFixed(3) }
      return o
    })
    const keepClips = opts.clips !== false
    const clips = keepClips ? segments.map((s, i) => (s.silent ? null : wav(L, R, Math.round(s.start * SR), Math.min(N, Math.round(s.end * SR))))) : []
    return JSON.stringify({
      seconds: +(N / SR).toFixed(2), sample_rate: SR, clicks: rec.gestures, segments, whole,
      contexts: rec.contexts.map((c) => ({ id: c.id, created: +c.created.toFixed(2), before_click: c.before_click, resumed_after_click: rec.resumes.some((r) => r.id === c.id && r.clicks > 0), closed: c.ctx.__closed })),
      notes, media: rec.media, warnings: rec.warnings,
      wav: opts.wav === false ? null : wav(L, R, 0, N), clips,
      spectrogram: opts.picture === false ? null : spectrogram(M, N, marks),
    })
  }
})()
