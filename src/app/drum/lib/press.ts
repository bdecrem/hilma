// DRUM — the press itself: one transport (the drums and the paper are geared
// together), four stencils, four ink wells, and the sheets it pulls.
//
// Position `pos` is in steps (16ths) and is the only clock the eye sees:
// the drums' angle, the paper's travel and every print are functions of it.
// With the motor on, `pos` follows the audio clock and a lookahead scheduler
// plays the notes; with a hand on a drum (or the motor off and the drum
// coasting) every hole that crosses the impression line plays right then.

import {
  STEPS, STEPS_PER_SHEET, SPEEDS, INKS, chordAt, mod, marksForStep, frameMarks, swatchMarks,
  encodePress, rpmLabel, bpmOf, type Hole, type Mark, type PressState,
} from './model'
import { Plate } from './raster'
import { PressAudio } from './audio'
import { drawColophon, renderManual, renderSheet, type Fonts, type SheetMeta } from './paper'

export type Patch = { step: number; col: number; rot: number }

export type DrumState = {
  holes: Hole[]
  byStep: Hole[][]
  patches: Patch[]
  regX: number
  regY: number
  ink: number
  flash: Map<number, number>
  peel: number
  peeled: boolean
  squeezing: boolean
  squeeze: number
  squeezeY: number
  lastSquelch: number
  flood: number
}

export type Sheet = SheetMeta & {
  start: number
  t0: number | null
  t1: number | null
  master: string
  canvas: HTMLCanvasElement | null
  plate: Plate | null
  img: ImageData | null
  thumb: HTMLCanvasElement | null
  url: string | null
  jit: { dx: number; dy: number; rot: number }
  done: boolean
}

export const holeKey = (h: Hole) => h.step * 32 + h.col
const clock = () => performance.now() / 1000
const INK_MAX = 1.35

export const inkFactor = (ink: number) => {
  const t = Math.max(0, Math.min(1, (ink - 0.02) / 0.43))
  return 0.1 + 0.9 * t * t * (3 - 2 * t)
}

const USE: Record<Mark['kind'], number> = {
  kick: 0.0018, hat: 0.0006, stab: 0.003, wash: 0.0055, finger: 0, reg: 0, crop: 0, swatch: 0,
}

export class Press {
  audio: PressAudio | null = null
  drums: DrumState[]
  speed: number
  motor = false
  anchorTime = 0
  anchorStep = 0
  nextStep = 0
  scheduledUpTo = -1e9
  pos = -1e-4
  vel = 0
  grabbed = false
  handSpeed = 0
  sheets: Sheet[] = []
  cur: Sheet | null = null
  ejecting: { sheet: Sheet; t0: number; vis: number }[] = []
  sheetStart = 0
  paperless = false
  nextFeedAt = 0
  finger: { ink: number; charges: number } | null = null
  sheetPx = 528
  fonts: Fonts = { display: 'sans-serif', mono: 'monospace', serif: 'serif' }
  counter = 0
  onChange?: () => void
  private lastHand = [0, 0, 0, 0]
  private lastFrame = clock()
  private timer: number | null = null

  constructor(state: PressState) {
    this.speed = state.speed
    this.drums = state.drums.map((m) => ({
      holes: m.holes.map((h) => ({ ...h })),
      byStep: [],
      patches: [],
      regX: m.regX,
      regY: m.regY,
      ink: 1,
      flash: new Map(),
      peel: 0,
      peeled: true,
      squeezing: false,
      squeeze: 0,
      squeezeY: 0,
      lastSquelch: 0,
      flood: 0,
    }))
    this.drums.forEach((d) => this.index(d))
  }

  // ─── the manual: sheet zero, already in the tray ───

  addManual() {
    const s = this.blankSheet(0)
    s.kind = 'manual'
    s.done = true
    s.canvas = renderManual(this.sheetPx, this.fonts)
    s.jit = { dx: -2, dy: 2, rot: -0.012 }
    this.sheets.push(s)
    this.makeUrl(s)
  }

  // ─── clocks ───

  stepDur() {
    return 60 / bpmOf(this.speed) / 4
  }
  barDur() {
    return this.stepDur() * STEPS
  }
  audioNow() {
    return this.audio ? this.audio.ctx.currentTime : clock()
  }
  private visNow() {
    const c = this.audio!.ctx
    return c.currentTime - (c.outputLatency || c.baseLatency || 0)
  }
  motorTimeOf(k: number) {
    return this.anchorTime + (k - this.anchorStep) * this.stepDur()
  }
  private off(d: number) {
    return this.drums[d].regY * 0.35
  }

  // ─── audio lifecycle ───

  ensureAudio() {
    if (!this.audio) {
      try {
        this.audio = new PressAudio(bpmOf(this.speed))
      } catch {
        return
      }
      this.drums.forEach((d, i) => {
        this.audio!.setPan(i, d.regX * 0.8)
        this.audio!.setFlood(i, d.flood)
      })
      this.audio.gateMotor(false)
      this.timer = window.setInterval(() => this.schedule(), 25)
    }
    if (this.audio.ctx.state !== 'running') this.audio.ctx.resume().catch(() => {})
  }

  dispose() {
    if (this.timer) clearInterval(this.timer)
    this.audio?.ctx.close().catch(() => {})
    for (const s of this.sheets) if (s.url) URL.revokeObjectURL(s.url)
  }

  // ─── transport ───

  start() {
    this.ensureAudio()
    const a = this.audio
    if (!a || this.motor) return
    this.motor = true
    this.vel = 0
    if (!this.cur && !this.paperless) this.feedSheet(Math.floor((this.pos + 1e-3) / STEPS_PER_SHEET) * STEPS_PER_SHEET)
    // a hair behind the step it rests on, so that step prints when the paper moves
    if (Number.isInteger(this.pos)) this.pos -= 1e-4
    this.anchorTime = a.ctx.currentTime + 0.06
    this.anchorStep = this.pos
    this.nextStep = Math.ceil(this.pos - 1e-6)
    a.gateMotor(true)
    if (this.paperless) a.paperOut(this.motorTimeOf(this.nextFeedAt), this.barDur())
  }

  stop(coast = true) {
    if (!this.motor) return
    this.motor = false
    this.vel = coast ? 1 / this.stepDur() : 0
    this.audio?.gateMotor(false)
    if (this.paperless) this.audio?.paperOut(null, this.barDur())
  }

  setSpeed(i: number) {
    if (i === this.speed) return
    if (this.motor && this.audio) {
      const t = this.audio.ctx.currentTime
      this.anchorStep = this.anchorStep + (t - this.anchorTime) / this.stepDur()
      this.anchorTime = t
    }
    this.speed = i
    this.audio?.setBpm(bpmOf(i))
    if (this.paperless && this.motor) this.audio?.paperOut(this.motorTimeOf(this.nextFeedAt), this.barDur())
  }

  private schedule() {
    const a = this.audio
    if (!a || !this.motor || this.grabbed) return
    const dur = this.stepDur()
    const horizon = a.ctx.currentTime + 0.12
    for (let guard = 0; guard < 64; guard++) {
      const k = this.nextStep
      const tk = this.motorTimeOf(k)
      if (tk - 0.35 * dur > horizon) break
      for (let d = 0; d < 4; d++) {
        const holes = this.drums[d].byStep[mod(k, STEPS)]
        if (!holes.length) continue
        const t = Math.max(a.ctx.currentTime, tk + this.off(d) * dur)
        this.voice(d, holes, t, k, false, 1)
      }
      this.scheduledUpTo = k
      this.nextStep++
    }
  }

  private voice(d: number, holes: Hole[], t: number, k: number, hand: boolean, vAmp: number) {
    const a = this.audio
    if (!a) return
    const o = a.out(d, hand)
    const f = inkFactor(this.drums[d].ink) * vAmp
    const chord = chordAt(k)
    const mean = holes.reduce((s, h) => s + h.col, 0) / holes.length / 23
    if (d === 0) {
      a.kick(t, 0.7 * f, o.dry)
      a.sub(t, 0.6 * f, o.dry)
    } else if (d === 1) {
      const g = 1 / Math.sqrt(holes.length)
      for (const h of holes) {
        const open = h.col / 23
        a.hat(t, (0.1 + 0.05 * open) * f * g, open, o)
      }
    } else if (d === 2) {
      a.stab(t, chord.semis, 0.42 * f * (holes.length > 1 ? 1.12 : 1), mean, o)
    } else {
      a.wash(t, chord.semis, 0.05 * f, mean, this.barDur() * 0.95, o)
    }
  }

  // ─── the frame: move the paper, print what crosses the line ───

  update() {
    const now = clock()
    const dt = Math.min(0.05, Math.max(0.001, now - this.lastFrame))
    this.lastFrame = now
    const prev = this.pos
    if (this.grabbed) {
      // pos is moved by the hand
    } else if (this.motor && this.audio) {
      this.pos = Math.max(prev, this.anchorStep + (this.visNow() - this.anchorTime) / this.stepDur())
    } else if (this.vel !== 0) {
      this.pos += this.vel * dt
      this.vel *= Math.exp(-dt / 0.75)
      if (Math.abs(this.vel) < 0.3) this.vel = 0
    }
    const moved = this.pos - prev
    this.handSpeed = this.handSpeed * 0.7 + (Math.abs(moved) / dt) * 0.3
    if (moved !== 0 && Math.abs(moved) < 12) this.crossings(prev, this.pos)
    this.paper()
    this.inkTick(dt, now)
  }

  private crossings(p0: number, p1: number) {
    const hand = !this.motor || this.grabbed
    const motorSpeed = 1 / this.stepDur()
    const vAmp = Math.max(0.5, Math.min(1, 0.5 + (0.5 * this.handSpeed) / motorSpeed))
    const fwd = p1 > p0
    // every hole that crossed the line this frame, in the order the paper met them,
    // so a step that belongs to the next sheet lands on the next sheet
    const events: { d: number; k: number; t: number; holes: Hole[] }[] = []
    for (let d = 0; d < 4; d++) {
      const o = this.off(d)
      const from = fwd ? Math.floor(p0 - o) + 1 : Math.ceil(p1 - o)
      const to = fwd ? Math.floor(p1 - o) : Math.ceil(p0 - o) - 1
      for (let k = from; k <= to; k++) {
        const holes = this.drums[d].byStep[mod(k, STEPS)]
        if (holes.length) events.push({ d, k, t: k + o, holes })
      }
    }
    events.sort((a, b) => (fwd ? a.t - b.t : b.t - a.t))
    for (const e of events) {
      if (fwd) this.paperTo(e.k)
      this.hit(e.d, e.holes, e.k, hand, vAmp)
    }
  }

  private hit(d: number, holes: Hole[], k: number, hand: boolean, vAmp: number) {
    const dr = this.drums[d]
    const t = clock()
    for (const h of holes) dr.flash.set(holeKey(h), t)
    const motorSpeed = 1 / this.stepDur()
    const smear = hand ? Math.max(0, Math.min(3, this.handSpeed / motorSpeed - 1.2)) * 0.006 : 0
    let use = 0
    if (this.cur && !this.paperless) {
      for (const m of marksForStep(d, holes, k, this.sheetStart, dr, dr.ink, this.cur.no, this.cur.skew, smear)) {
        this.addMark(this.cur, m)
        use += USE[m.kind]
      }
    } else use = USE[['kick', 'hat', 'stab', 'wash'][d] as Mark['kind']] * holes.length * 0.6
    dr.ink = Math.max(0, dr.ink - use * (dr.ink > 1 ? 1.6 : 1))
    if (hand && this.audio && t - this.lastHand[d] > 0.03) {
      this.lastHand[d] = t
      this.voice(d, holes, this.audio.ctx.currentTime, k, true, vAmp)
    }
  }

  // ─── paper ───

  private paper() {
    this.paperTo(this.pos)
  }

  // the paper has reached position k: finish the sheet it ran off, feed the next
  private paperTo(k: number) {
    if (this.paperless) {
      if (k >= this.nextFeedAt) {
        this.paperless = false
        this.audio?.paperIn()
        this.feedSheet(this.nextFeedAt)
      }
      return
    }
    if (this.cur && k >= this.sheetStart + STEPS_PER_SHEET) {
      this.finishSheet(false)
      this.feedSheet(Math.floor(k / STEPS_PER_SHEET) * STEPS_PER_SHEET)
    }
  }

  private blankSheet(no: number): Sheet {
    return {
      no, kind: 'print', marks: [], chord: '', rpm: rpmLabel(this.speed), speed: this.speed,
      partial: false, skew: 0, inks: [], pulledAt: 0, start: 0, t0: null, t1: null, master: '',
      canvas: null, plate: null, img: null, thumb: null, url: null,
      jit: { dx: Math.random() * 8 - 4, dy: Math.random() * 5 - 2.5, rot: (Math.random() - 0.5) * 0.045 },
      done: false,
    }
  }

  private feedSheet(start: number) {
    this.sheetStart = start
    const s = this.blankSheet(++this.counter)
    s.start = start
    s.chord = chordAt(start).name
    // one sheet in fourteen goes through crooked
    if (Math.random() < 1 / 14) s.skew = (Math.random() < 0.5 ? -1 : 1) * (0.012 + Math.random() * 0.014)
    s.jit.rot += s.skew * 0.5
    s.master = encodePress(this.snapshot())
    s.t0 = this.motor && this.audio ? this.motorTimeOf(start) : this.audioNow()
    this.attachPlate(s)
    this.cur = s
    for (const m of frameMarks(true, this.drums, this.drums.map((d) => d.ink), s.no * 7)) this.addMark(s, m)
    this.audio?.feed(this.audio.ctx.currentTime)
  }

  private attachPlate(s: Sheet) {
    const plate = new Plate(this.sheetPx)
    plate.paper()
    for (const m of s.marks) plate.mark(m)
    const c = s.canvas && s.canvas.width === plate.w ? s.canvas : document.createElement('canvas')
    c.width = plate.w
    c.height = plate.h
    s.plate = plate
    s.img = new ImageData(plate.data, plate.w, plate.h)
    c.getContext('2d')!.putImageData(s.img, 0, 0)
    s.canvas = c
  }

  private addMark(s: Sheet, m: Mark) {
    s.marks.push(m)
    if (!s.plate || !s.canvas || !s.img) return
    const r = s.plate.mark(m)
    if (r) s.canvas.getContext('2d')!.putImageData(s.img, 0, 0, r.x, r.y, r.w, r.h)
  }

  private finishSheet(partial: boolean) {
    const s = this.cur
    if (!s) return
    const vis = this.visibleUnits()
    this.cur = null
    s.partial = partial
    if (partial) s.jit.rot = (Math.random() - 0.5) * 0.16
    s.inks = this.drums.map((d) => d.ink)
    for (const m of frameMarks(false, this.drums, s.inks, s.no * 11)) this.addMark(s, m)
    for (const m of swatchMarks(s.inks, s.no * 13)) this.addMark(s, m)
    s.pulledAt = Date.now()
    s.t1 = this.motor && this.audio && !partial ? this.motorTimeOf(s.start + STEPS_PER_SHEET) : this.audioNow()
    if (s.canvas) drawColophon(s.canvas.getContext('2d')!, s, s.canvas.width, this.fonts)
    s.plate = null
    s.img = null
    s.done = true
    this.sheets.push(s)
    this.ejecting.push({ sheet: s, t0: clock(), vis })
    this.makeUrl(s)
    // full-size canvases only for the top of the stack; the rest live as thumbnails
    const prints = this.sheets.filter((x) => x.canvas)
    for (const x of prints.slice(0, Math.max(0, prints.length - 3))) {
      if (!x.thumb) x.thumb = this.thumbOf(x)
      x.canvas = null
    }
    this.onChange?.()
  }

  thumbOf(s: Sheet) {
    const src = s.canvas ?? renderSheet(s, this.sheetPx, this.fonts)
    const t = document.createElement('canvas')
    t.width = Math.max(60, Math.round(src.width / 2.4))
    t.height = Math.round(t.width * (src.height / src.width))
    const ctx = t.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(src, 0, 0, t.width, t.height)
    return t
  }

  private makeUrl(s: Sheet) {
    s.canvas?.toBlob((b) => {
      if (b) {
        s.url = URL.createObjectURL(b)
        this.onChange?.()
      }
    }, 'image/png')
  }

  // the canvases for whatever is on screen, re-pulled when the size changes
  resize(px: number) {
    if (px === this.sheetPx) return
    this.sheetPx = px
    if (this.cur) this.attachPlate(this.cur)
    const onTop = this.sheets.slice(-3)
    for (const s of onTop) s.canvas = renderSheet(s, px, this.fonts)
  }

  visibleUnits() {
    const f = Math.max(0, Math.min(1, (this.pos - this.sheetStart) / STEPS_PER_SHEET))
    return 0.09 + f * 1.08
  }

  // ─── things hands do ───

  private index(d: DrumState) {
    d.byStep = Array.from({ length: STEPS }, () => [])
    for (const h of d.holes) d.byStep[h.step].push(h)
  }

  punch(d: number, stepF: number, col: number): 'cut' | 'taped' | null {
    const dr = this.drums[d]
    const k = Math.round(stepF)
    const s = mod(k, STEPS)
    const i = dr.holes.findIndex((h) => h.step === s && Math.abs(h.col - col) <= 1)
    const now = this.audioNow()
    if (i >= 0) {
      const [h] = dr.holes.splice(i, 1)
      dr.patches.push({ step: s, col: h.col, rot: (Math.random() - 0.5) * 0.5 })
      if (dr.patches.length > 40) dr.patches.shift()
      this.index(dr)
      this.audio?.punch(now, false)
      return 'taped'
    }
    if (dr.byStep[s].length >= 3) return null
    const pi = dr.patches.findIndex((p) => p.step === s && Math.abs(p.col - col) <= 1)
    if (pi >= 0) dr.patches.splice(pi, 1)
    const hole = { step: s, col }
    dr.holes.push(hole)
    this.index(dr)
    this.audio?.punch(now, true)
    // live feedback: a hole punched on the line plays now, not a bar later
    const a = this.audio
    if (a) {
      if (!this.motor || this.grabbed) this.voice(d, [hole], a.ctx.currentTime, k, true, 0.9)
      else if (k <= this.scheduledUpTo) {
        const tk = this.motorTimeOf(k + this.off(d))
        if (Math.abs(a.ctx.currentTime - tk) < 0.6 * this.stepDur()) this.voice(d, [hole], a.ctx.currentTime, k, true, 0.9)
      }
    }
    return 'cut'
  }

  remaster(d: number) {
    const dr = this.drums[d]
    dr.peel = clock()
    dr.peeled = false
    if (this.audio) this.audio.rip(this.audio.ctx.currentTime)
  }

  grabStart() {
    this.ensureAudio()
    this.grabbed = true
    this.vel = 0
    if (this.motor) this.audio?.gateMotor(false)
    if (!this.cur && !this.paperless) this.feedSheet(Math.floor((this.pos + 1e-3) / STEPS_PER_SHEET) * STEPS_PER_SHEET)
  }

  grabMove(dSteps: number) {
    this.pos += dSteps
  }

  grabEnd(flick: number) {
    this.grabbed = false
    const a = this.audio
    if (this.motor && a) {
      // the clutch re-engages where the hand let go
      this.anchorTime = a.ctx.currentTime + 0.03
      this.anchorStep = this.pos + ((a.ctx.outputLatency || a.ctx.baseLatency || 0) + 0.03) / this.stepDur()
      this.nextStep = Math.ceil(this.anchorStep - 1e-6)
      a.gateMotor(true, this.anchorTime - 0.005)
    } else {
      this.vel = Math.max(-40, Math.min(40, flick))
    }
  }

  squeezeStart(d: number, y: number) {
    this.ensureAudio()
    const dr = this.drums[d]
    dr.squeezing = true
    dr.squeezeY = y
    dr.ink = Math.min(INK_MAX, dr.ink + 0.04)
    this.finger = { ink: d, charges: 4 }
    if (this.audio) this.audio.squelch(this.audio.ctx.currentTime)
    dr.lastSquelch = clock()
  }

  squeezeEnd(d: number) {
    this.drums[d].squeezing = false
  }

  setReg(d: number, x: number, y: number) {
    const r = Math.hypot(x, y)
    if (r > 1) {
      x /= r
      y /= r
    }
    if (Math.hypot(x, y) < 0.08) x = y = 0
    const dr = this.drums[d]
    dr.regX = x
    dr.regY = y
    this.audio?.setPan(d, x * 0.8)
  }

  yank(): boolean {
    if (!this.cur || this.paperless) return false
    this.finishSheet(true)
    this.paperless = true
    this.nextFeedAt = this.sheetStart + STEPS_PER_SHEET
    const a = this.audio
    if (a) {
      a.rip(a.ctx.currentTime)
      a.paperOut(this.motor ? this.motorTimeOf(this.nextFeedAt) : null, this.barDur())
    }
    return true
  }

  fingerprint(u: number, v: number): boolean {
    if (!this.finger || !this.cur || this.paperless) return false
    const d = this.finger.ink
    this.addMark(this.cur, {
      ink: d, kind: 'finger', x: u, y: v, dens: 1.1, seed: (Math.random() * 1e9) | 0, rot: (Math.random() - 0.5) * 0.9,
    })
    this.finger.charges--
    if (this.finger.charges <= 0) this.finger = null
    const a = this.audio
    if (a) {
      // a dub throw: that ink's voice straight into a swelling echo
      const t = a.ctx.currentTime
      const o = a.out(d, true)
      const k = Math.floor(this.pos)
      const chord = chordAt(k)
      if (d === 0) {
        a.kick(t, 0.6, o.dry)
        a.kick(t, 0.5, o.wet)
      } else if (d === 1) a.hat(t, 0.16, 1, o)
      else if (d === 2) a.stab(t, chord.semis, 0.45, 0.85, o)
      else a.wash(t, chord.semis, 0.07, 0.8, this.barDur(), o)
      a.throwDelay(this.barDur())
    }
    return true
  }

  // ─── ink ───

  private inkTick(dt: number, now: number) {
    this.drums.forEach((dr, i) => {
      if (dr.squeezing) {
        dr.ink = Math.min(INK_MAX, dr.ink + 0.42 * dt)
        if (now - dr.lastSquelch > 0.32 && dr.ink < INK_MAX && this.audio) {
          dr.lastSquelch = now
          this.audio.squelch(this.audio.ctx.currentTime)
        }
      }
      dr.squeeze += ((dr.squeezing ? 1 : 0) - dr.squeeze) * Math.min(1, dt * 14)
      const flood = Math.max(0, dr.ink - 1) / (INK_MAX - 1)
      if (Math.abs(flood - dr.flood) > 0.02) {
        dr.flood = flood
        this.audio?.setFlood(i, flood)
      }
      if (dr.peel && !dr.peeled && now - dr.peel > 0.38) {
        dr.holes = []
        dr.patches = []
        this.index(dr)
        dr.peeled = true
      }
      if (dr.peel && now - dr.peel > 1.1) dr.peel = 0
    })
    this.ejecting = this.ejecting.filter((e) => now - e.t0 < 0.5)
  }

  snapshot(): PressState {
    return { speed: this.speed, drums: this.drums.map((d) => ({ holes: d.holes.map((h) => ({ ...h })), regX: d.regX, regY: d.regY })) }
  }

  inkName(d: number) {
    return INKS[d].name
  }
  rpm() {
    return rpmLabel(this.speed)
  }
  speeds() {
    return SPEEDS.length
  }
}
