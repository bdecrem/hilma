// DRUM — the machine on screen: drawing, hit-testing, gestures.
//
// Everything in the machine column is laid out on a 390 × 800 grid and
// scaled to fit; the desktop wall (where old prints get taped up) lives in
// screen pixels around it. The machine is drawn the way the press prints:
// flat ink, halftone shading, one color slightly off register.

import { Press, holeKey, type Sheet } from './press'
import { INKS, PAPER, SHEET_H, STEPS, X_COLS, STONE, INK, CREAM, LIME, SPEEDS, rpmLabel, chordAt, hashInt, type PressState } from './model'
import type { Fonts } from './paper'

const VW = 390
const VH = 800
const SH = { x: 63, y: 48, w: 264, h: 352 }
const SLOT = 400
const BODY = { x: 8, y: 400, w: 374, h: 392 }
const CYL = { x: 58, w: 260, R: 29 }
const TUBE = { x: 18, w: 26 }
const REG = { cx: 350, half: 21, travel: 15 }
const KEY_START = { x: 18, y: 734, w: 108, h: 44 }
const KEY_STOP = { x: 134, y: 734, w: 70, h: 44 }
const keySpeed = (i: number) => ({ x: 214 + i * 32, y: 734, w: 28, h: 44 })
const TRAY = { x: 292, y: 11, w: 86, h: 25 }
const rowY0 = (i: number) => 412 + i * 78
const rowCy = (i: number) => rowY0(i) + 40
const TAU = Math.PI * 2
const STEP_ANG = TAU / STEPS
const colScreenX = (col: number) => CYL.x + 10 + ((col + 0.5) / X_COLS) * (CYL.w - 20)

const wrapAng = (a: number) => {
  a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI
  return a
}
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t))
const rgb = (c: number[], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`
const FILM = INKS.map((ink) => rgb(mix(ink.rgb, PAPER, 0.74)))
const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3)
const clock = () => performance.now() / 1000

type Rect = { x: number; y: number; w: number; h: number }
const inRect = (r: Rect, x: number, y: number, pad = 0) =>
  x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad

type Gesture =
  | { kind: 'drum'; d: number; x0: number; y0: number; t0: number; stepF: number; col: number; moved: boolean; grabbing: boolean; long: boolean; lastY: number; lastT: number; v: number; px: number; py: number }
  | { kind: 'tube'; d: number }
  | { kind: 'reg'; d: number }
  | { kind: 'key'; id: string; inside: boolean }
  | { kind: 'sheet'; x0: number; y0: number; yanked: boolean; top: number }
  | { kind: 'tray'; no?: number }
  | { kind: 'none' }

export type MachineOpts = { onTray: (no?: number) => void; onChange: () => void }

export class Machine {
  readonly press: Press
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private fonts: Fonts
  private opts: MachineOpts
  private dpr = 1
  private vw = 0
  private vh = 0
  private s = 1
  private ox = 0
  private oy = 0
  private desk = false
  private bg: HTMLCanvasElement | null = null
  private shade: HTMLCanvasElement | null = null
  private gestures = new Map<number, Gesture>()
  private raf = 0
  private started = false
  private lastRegTap: { d: number; t: number } = { d: -1, t: 0 }
  private slots: { x: number; y: number; rot: number }[] = []
  private tw = 150
  private wall = new Map<Sheet, { slot: number; t0: number }>()
  private seen = 0
  private insets = { top: 0, bottom: 0 }
  private disposed = false

  constructor(canvas: HTMLCanvasElement, state: PressState, fonts: Fonts, opts: MachineOpts, insets: { top: number; bottom: number }) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.fonts = fonts
    this.opts = opts
    this.insets = insets
    this.press = new Press(state)
    this.press.fonts = fonts
    this.press.onChange = () => {
      this.onSheets()
      opts.onChange()
    }
    this.resize()
    this.press.addManual()
    this.seen = this.press.sheets.length
    canvas.addEventListener('pointerdown', this.down)
    canvas.addEventListener('pointermove', this.move)
    canvas.addEventListener('pointerup', this.up)
    canvas.addEventListener('pointercancel', this.up)
    window.addEventListener('keydown', this.key)
    document.addEventListener('visibilitychange', this.visibility)
    this.raf = requestAnimationFrame(this.frame)
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.canvas.removeEventListener('pointerdown', this.down)
    this.canvas.removeEventListener('pointermove', this.move)
    this.canvas.removeEventListener('pointerup', this.up)
    this.canvas.removeEventListener('pointercancel', this.up)
    window.removeEventListener('keydown', this.key)
    document.removeEventListener('visibilitychange', this.visibility)
    this.press.dispose()
  }

  // ─── layout ───

  resize(insets?: { top: number; bottom: number }) {
    if (insets) this.insets = insets
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const vw = window.innerWidth, vh = window.innerHeight
    this.dpr = dpr
    this.vw = vw
    this.vh = vh
    this.canvas.width = Math.round(vw * dpr)
    this.canvas.height = Math.round(vh * dpr)
    const availH = vh - this.insets.top - this.insets.bottom
    this.s = Math.min(vw / VW, availH / VH, 1.6)
    this.ox = (vw - VW * this.s) / 2
    this.oy = this.insets.top + (availH - VH * this.s) / 2
    this.desk = vw - VW * this.s > 2 * 180 && vw > 820
    this.press.resize(Math.round(SH.w * this.s * dpr))
    this.buildShade()
    this.buildWall()
    this.buildBg()
  }

  private buildShade() {
    // halftone shading for a cylinder: dots grow toward the edges, a touch
    // heavier underneath. Cached once per size, multiplied over each drum.
    const W = Math.round(CYL.w * this.s * this.dpr), H = Math.round(2 * CYL.R * this.s * this.dpr)
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const x = c.getContext('2d')!
    x.fillStyle = '#fff'
    x.fillRect(0, 0, W, H)
    x.fillStyle = INK
    const P = 4.2 * this.s * this.dpr
    const ang = Math.PI / 4
    const ca = Math.cos(ang), sa = Math.sin(ang)
    const span = Math.hypot(W, H)
    for (let i = -span / P; i < span / P; i++) {
      for (let j = -span / P; j < span / P; j++) {
        const u = i * P, v = j * P
        const px = u * ca - v * sa + W / 2, py = u * sa + v * ca + H / 2
        if (px < -P || py < -P || px > W + P || py > H + P) continue
        const t = Math.max(-1, Math.min(1, (py / H) * 2 - 1))
        const phi = Math.asin(t)
        const shade = 0.95 * Math.pow(1 - Math.cos(phi), 1.35) + 0.12 * Math.pow(Math.max(0, Math.sin(phi)), 2)
        const r = P * 0.56 * Math.sqrt(Math.min(1, shade))
        if (r < 0.25) continue
        x.beginPath()
        x.arc(px, py, r, 0, TAU)
        x.fill()
      }
    }
    this.shade = c
  }

  private buildWall() {
    this.slots = []
    if (!this.desk) return
    const colX0 = this.ox, colX1 = this.ox + VW * this.s
    this.tw = Math.min(210, Math.max(118, this.vw * 0.105))
    const tw = this.tw, th = tw * SHEET_H
    const regions: { x0: number; x1: number; fromRight: boolean }[] = [
      { x0: colX1 + 36, x1: this.vw - 24, fromRight: false },
      { x0: 24, x1: colX0 - 36, fromRight: true },
    ]
    for (const r of regions) {
      const cols = Math.floor((r.x1 - r.x0) / (tw * 1.12))
      const rows = Math.max(1, Math.floor((this.vh - 40) / (th * 1.06)))
      if (cols < 1) continue
      const cellW = (r.x1 - r.x0) / cols, cellH = (this.vh - 40) / rows
      for (let c = 0; c < cols; c++) {
        const col = r.fromRight ? cols - 1 - c : c
        for (let row = 0; row < rows; row++) {
          const h = hashInt(this.slots.length, 41)
          this.slots.push({
            x: r.x0 + (col + 0.5) * cellW + ((h % 17) - 8),
            y: 20 + (row + 0.5) * cellH + (((h >> 5) % 13) - 6),
            rot: (((h >> 9) % 100) / 100 - 0.5) * 0.12,
          })
        }
      }
    }
  }

  private buildBg() {
    const c = this.bg ?? document.createElement('canvas')
    c.width = this.canvas.width
    c.height = this.canvas.height
    const x = c.getContext('2d')!
    const { dpr, vw, vh, fonts } = this
    x.setTransform(dpr, 0, 0, dpr, 0, 0)
    x.fillStyle = STONE
    x.fillRect(0, 0, vw, vh)
    // a printed field is never flat
    const n = Math.floor((vw * vh) / 70)
    for (let i = 0; i < n; i++) {
      const h = hashInt(i, 3)
      x.fillStyle = h & 1 ? 'rgba(22,18,28,0.06)' : 'rgba(255,236,200,0.07)'
      x.fillRect((h % 10007) / 10007 * vw, ((h >> 11) % 9973) / 9973 * vh, 1.2, 1.2)
    }
    if (this.desk) this.drawPoster(x)

    // the machine column, static parts
    x.setTransform(dpr * this.s, 0, 0, dpr * this.s, dpr * this.ox, dpr * this.oy)
    this.drawNameplate(x)
    this.drawBody(x)
    this.bg = c
  }

  private drawPoster(x: CanvasRenderingContext2D) {
    const { fonts, vh } = this
    const x0 = 44, x1 = this.ox - 44
    const w = x1 - x0
    if (w < 160) return
    const fs = w * 0.34
    x.save()
    x.font = `${fs}px ${fonts.display}`
    x.textBaseline = 'alphabetic'
    x.fillStyle = INKS[1].hex
    x.fillText('DRUM', x0 + fs * 0.035, 40 + fs * 0.86 - fs * 0.02)
    x.fillStyle = INK
    x.fillText('DRUM', x0, 40 + fs * 0.86)
    x.fillStyle = INK
    x.font = `italic ${fs * 0.2}px ${fonts.serif}`
    x.fillText('a four-color stencil', x0, 40 + fs * 1.18)
    x.fillText('duplicator that plays', x0, 40 + fs * 1.4)
    x.fillStyle = INK
    x.font = `${Math.max(11, fs * 0.075)}px ${fonts.mono}`
    x.fillText('DESIGNED AND BUILT BY CLAUDE OPUS 5.5 · SEPTEMBER 2026', x0, 40 + fs * 1.62)
    // 33⅓, very large, bottom right, in flat gold
    const rx0 = this.ox + VW * this.s + 44
    const rw = this.vw - 44 - rx0
    if (rw > 160) {
      const f2 = rw * 0.42
      x.fillStyle = INKS[3].hex
      x.font = `${f2}px ${fonts.display}`
      x.textAlign = 'right'
      x.fillText('33⅓', this.vw - 40, vh - 40)
    }
    x.restore()
  }

  private drawNameplate(x: CanvasRenderingContext2D) {
    const { fonts } = this
    x.save()
    x.textBaseline = 'alphabetic'
    x.font = `31px ${fonts.display}`
    x.fillStyle = INKS[1].hex
    x.fillText('DRUM', 13.6, 35)
    x.fillStyle = INK
    x.fillText('DRUM', 12, 36)
    x.font = `6.8px ${fonts.mono}`
    x.fillStyle = INK
    x.fillText('MODEL 33⅓ · FOUR-COLOR', 124, 21)
    x.fillText('STENCIL DUPLICATOR THAT PLAYS', 124, 31)
    x.restore()
  }

  private drawBody(x: CanvasRenderingContext2D) {
    const { fonts } = this
    x.save()
    // one color off register: the blue plate slipped
    x.fillStyle = INKS[1].hex
    roundRect(x, BODY.x - 2.5, BODY.y + 2.5, BODY.w, BODY.h, 12)
    x.fill()
    x.fillStyle = INK
    roundRect(x, BODY.x, BODY.y, BODY.w, BODY.h, 12)
    x.fill()
    // speckle
    for (let i = 0; i < 900; i++) {
      const h = hashInt(i, 77)
      x.fillStyle = 'rgba(247,239,223,0.05)'
      x.fillRect(BODY.x + ((h % 997) / 997) * BODY.w, BODY.y + (((h >> 10) % 991) / 991) * BODY.h, 0.8, 0.8)
    }
    // the paper exit
    x.fillStyle = '#000'
    x.fillRect(SH.x - 10, SLOT - 1, SH.w + 20, 5)
    x.fillStyle = 'rgba(247,239,223,0.22)'
    x.fillRect(SH.x - 10, SLOT + 4, SH.w + 20, 0.8)
    // screws
    for (const [sx, sy] of [[20, 408], [370, 408], [20, 784], [370, 784]]) {
      x.fillStyle = 'rgba(247,239,223,0.55)'
      x.beginPath()
      x.arc(sx, sy, 3, 0, TAU)
      x.fill()
      x.strokeStyle = INK
      x.lineWidth = 0.9
      x.beginPath()
      x.moveTo(sx - 2, sy - 1)
      x.lineTo(sx + 2, sy + 1)
      x.stroke()
    }
    for (let i = 0; i < 4; i++) {
      const cy = rowCy(i)
      // drum bay
      x.fillStyle = '#0a080d'
      roundRect(x, CYL.x - 9, cy - CYL.R - 3, CYL.w + 18, CYL.R * 2 + 6, 5)
      x.fill()
      // registration window
      x.fillStyle = CREAM
      x.fillRect(REG.cx - REG.half, cy - REG.half, REG.half * 2, REG.half * 2)
      x.strokeStyle = 'rgba(22,18,28,0.14)'
      x.lineWidth = 0.5
      for (let g = -REG.half + 7; g < REG.half; g += 7) {
        x.beginPath()
        x.moveTo(REG.cx + g, cy - REG.half)
        x.lineTo(REG.cx + g, cy + REG.half)
        x.moveTo(REG.cx - REG.half, cy + g)
        x.lineTo(REG.cx + REG.half, cy + g)
        x.stroke()
      }
      x.strokeStyle = 'rgba(22,18,28,0.55)'
      x.lineWidth = 0.7
      x.beginPath()
      x.moveTo(REG.cx - 13, cy)
      x.lineTo(REG.cx + 13, cy)
      x.moveTo(REG.cx, cy - 13)
      x.lineTo(REG.cx, cy + 13)
      x.stroke()
      x.beginPath()
      x.arc(REG.cx, cy, 7.5, 0, TAU)
      x.stroke()
      // ink well behind the tube
      x.fillStyle = '#0a080d'
      roundRect(x, TUBE.x - 4, cy - 34, TUBE.w + 8, 68, 5)
      x.fill()
    }
    x.fillStyle = 'rgba(247,239,223,0.62)'
    x.font = `6.6px ${fonts.mono}`
    x.fillText('PRINT', KEY_START.x, 728)
    x.fillText('SPEED', 214, 728)
    x.fillText('REG', REG.cx - 7, 419)
    x.fillText('INK', TUBE.x + 2, 419)
    x.restore()
  }

  // ─── the frame ───

  private frame = () => {
    if (this.disposed) return
    this.press.update()
    this.checkLongPress()
    this.draw()
    this.raf = requestAnimationFrame(this.frame)
  }

  private toVirtual(sx: number, sy: number) {
    return { x: (sx - this.ox) / this.s, y: (sy - this.oy) / this.s }
  }

  private draw() {
    const c = this.ctx
    const { dpr } = this
    const now = clock()
    c.setTransform(1, 0, 0, 1, 0, 0)
    if (this.bg) c.drawImage(this.bg, 0, 0)

    // wall prints (desktop)
    if (this.desk) this.drawWall(now)

    c.setTransform(dpr * this.s, 0, 0, dpr * this.s, dpr * this.ox, dpr * this.oy)
    this.drawHeader()

    // the tray and the sheet coming out of the slot
    c.save()
    c.beginPath()
    c.rect(-4000, -4000, 8000, 4000 + SLOT)
    c.clip()
    this.drawStack(now)
    this.drawEmerging()
    c.restore()

    for (let i = 0; i < 4; i++) this.drawDrum(i, now)
    for (let i = 0; i < 4; i++) this.drawTube(i)
    for (let i = 0; i < 4; i++) this.drawReg(i)
    this.drawKeys(now)
    this.drawGestures(now)
    if (this.desk) this.drawFlyingToWall(now)
  }

  private drawHeader() {
    const c = this.ctx
    const p = this.press
    c.save()
    c.fillStyle = CREAM
    roundRect(c, TRAY.x, TRAY.y, TRAY.w, TRAY.h, 12.5)
    c.fill()
    c.strokeStyle = INK
    c.lineWidth = 1.2
    c.stroke()
    c.fillStyle = INK
    c.font = `8px ${this.fonts.mono}`
    c.textBaseline = 'middle'
    c.fillText('TRAY', TRAY.x + 11, TRAY.y + TRAY.h / 2 + 0.5)
    c.font = `13px ${this.fonts.display}`
    c.textAlign = 'right'
    const prints = p.sheets.filter((s) => s.kind === 'print').length
    c.fillText(String(prints).padStart(3, '0'), TRAY.x + TRAY.w - 10, TRAY.y + TRAY.h / 2 + 1)
    // an inky finger
    if (p.finger) {
      const fx = TRAY.x - 26, fy = TRAY.y + TRAY.h / 2
      c.strokeStyle = INKS[p.finger.ink].hex
      c.lineWidth = 1.1
      for (let r = 2; r <= 8; r += 2) {
        c.beginPath()
        c.ellipse(fx, fy + r * 0.12, r * 0.8, r, 0, 0, TAU)
        c.stroke()
      }
      c.fillStyle = INK
      c.font = `7.5px ${this.fonts.mono}`
      c.textAlign = 'left'
      c.fillText(`×${p.finger.charges}`, fx + 9, fy + 0.5)
    }
    c.restore()
  }

  private sheetImage(s: Sheet) {
    if (s.canvas) return s.canvas
    if (!s.thumb) s.thumb = this.press.thumbOf(s)
    return s.thumb
  }

  private drawPaper(s: Sheet, x: number, y: number, rot: number, w = SH.w) {
    const c = this.ctx
    const h = w * SHEET_H
    c.save()
    c.translate(x + w / 2, y + h / 2)
    c.rotate(rot)
    c.fillStyle = 'rgba(22,18,28,0.28)'
    c.fillRect(-w / 2 + 3, -h / 2 + 4, w, h)
    c.drawImage(this.sheetImage(s), -w / 2, -h / 2, w, h)
    c.restore()
  }

  private drawStack(now: number) {
    const p = this.press
    const flying = new Set(p.ejecting.map((e) => e.sheet))
    let pile = p.sheets.slice(-3)
    if (this.desk) pile = pile.filter((s) => !this.wall.has(s) || this.wall.get(s)!.t0 > now)
    for (const s of pile) {
      if (flying.has(s)) continue
      this.drawPaper(s, SH.x + s.jit.dx, SH.y + s.jit.dy, s.jit.rot)
    }
    for (const e of p.ejecting) {
      const k = ease((now - e.t0) / 0.42)
      const top0 = SLOT - e.vis * SH.w
      const top1 = SH.y + e.sheet.jit.dy
      this.drawPaper(e.sheet, SH.x + e.sheet.jit.dx * k, top0 + (top1 - top0) * k, e.sheet.jit.rot * k)
    }
  }

  private emergingTop() {
    return SLOT - this.press.visibleUnits() * SH.w
  }

  private drawEmerging() {
    const s = this.press.cur
    if (!s || !s.canvas) return
    const c = this.ctx
    const top = this.emergingTop()
    c.fillStyle = 'rgba(22,18,28,0.25)'
    c.fillRect(SH.x + 3, top + 3, SH.w, SLOT - top)
    c.drawImage(s.canvas, SH.x, top, SH.w, SH.h)
  }

  // ─── the wall ───

  private onSheets() {
    const p = this.press
    if (p.sheets.length <= this.seen) return
    this.seen = p.sheets.length
    if (!this.desk) return
    // the sheet that was on top of the stack goes up on the wall once the new one lands
    const prev = p.sheets[p.sheets.length - 2]
    if (prev && !this.wall.has(prev)) this.wall.set(prev, { slot: this.wall.size, t0: clock() + 0.42 })
  }

  private slotPos(i: number) {
    const n = this.slots.length
    const base = this.slots[i % n]
    const lap = Math.floor(i / n)
    return { x: base.x + lap * 19, y: base.y + lap * 23, rot: base.rot + lap * 0.03 }
  }

  private drawWallPrint(s: Sheet, cx: number, cy: number, w: number, rot: number) {
    const c = this.ctx
    const h = w * SHEET_H
    c.save()
    c.translate(cx, cy)
    c.rotate(rot)
    c.fillStyle = 'rgba(22,18,28,0.26)'
    c.fillRect(-w / 2 + 4, -h / 2 + 5, w, h)
    c.drawImage(this.sheetImage(s), -w / 2, -h / 2, w, h)
    // masking tape
    c.rotate(-0.06)
    c.fillStyle = 'rgba(238,224,182,0.88)'
    c.fillRect(-w * 0.16, -h / 2 - 7, w * 0.32, 14)
    c.fillStyle = 'rgba(22,18,28,0.05)'
    c.fillRect(-w * 0.16, -h / 2 - 7, w * 0.32, 2)
    c.restore()
  }

  private drawWall(now: number) {
    if (!this.slots.length) return
    const c = this.ctx
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    for (const [s, w] of this.wall) {
      if (now < w.t0 + 0.9) continue
      const p = this.slotPos(w.slot)
      this.drawWallPrint(s, p.x, p.y, this.tw, p.rot)
    }
  }

  private drawFlyingToWall(now: number) {
    const c = this.ctx
    c.save()
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    for (const [s, w] of this.wall) {
      const t = (now - w.t0) / 0.9
      if (t < 0 || t >= 1) continue
      const k = ease(t)
      const fromW = SH.w * this.s
      const fx = this.ox + (SH.x + s.jit.dx + SH.w / 2) * this.s
      const fy = this.oy + (SH.y + s.jit.dy + SH.h / 2) * this.s
      const to = this.slotPos(w.slot)
      const x = fx + (to.x - fx) * k
      const y = fy + (to.y - fy) * k - Math.sin(Math.PI * k) * 60
      this.drawWallPrint(s, x, y, fromW + (this.tw - fromW) * k, s.jit.rot + (to.rot - s.jit.rot) * k + Math.sin(Math.PI * k) * 0.25)
    }
    c.restore()
  }

  // ─── drums ───

  private drawDrum(i: number, now: number) {
    const c = this.ctx
    const p = this.press
    const dr = p.drums[i]
    const ink = INKS[i]
    const cy = rowCy(i)
    const { R } = CYL
    const x0 = CYL.x, w = CYL.w
    const pos = p.pos
    const peelT = dr.peel ? now - dr.peel : -1

    c.save()
    c.beginPath()
    c.rect(x0, cy - R, w, 2 * R)
    c.clip()

    const content = (dy: number, alpha: number) => {
      c.save()
      c.translate(0, dy)
      c.globalAlpha = alpha
      c.fillStyle = FILM[i]
      c.fillRect(x0, cy - R, w, 2 * R)
      // step rulings: the master's grid, turning
      c.strokeStyle = ink.hex
      c.lineWidth = 0.6
      for (let j = 0; j < STEPS; j++) {
        const phi = wrapAng((j - pos) * STEP_ANG)
        if (Math.abs(phi) > 1.5) continue
        const y = cy + R * Math.sin(phi)
        c.globalAlpha = alpha * (j % 4 === 0 ? 0.3 : 0.13) * Math.cos(phi)
        c.beginPath()
        c.moveTo(x0, y)
        c.lineTo(x0 + w, y)
        c.stroke()
      }
      c.globalAlpha = alpha
      // the clamp plate where the master is held, between step 15 and 0
      const pc = wrapAng((-0.5 - pos) * STEP_ANG)
      if (Math.abs(pc) < 1.45) {
        const y = cy + R * Math.sin(pc)
        const hh = 3.2 * Math.cos(pc)
        c.fillStyle = '#2b2530'
        c.fillRect(x0, y - hh, w, hh * 2)
        c.fillStyle = 'rgba(247,239,223,0.5)'
        for (let rx = x0 + 12; rx < x0 + w; rx += 40) c.fillRect(rx, y - hh * 0.3, 2, hh * 0.6)
      }
      // tape over retired holes
      for (const pt of dr.patches) {
        const phi = wrapAng((pt.step - pos) * STEP_ANG)
        const cs = Math.cos(phi)
        if (cs < 0.05) continue
        c.save()
        c.translate(colScreenX(pt.col), cy + R * Math.sin(phi))
        c.scale(1, cs)
        c.rotate(pt.rot)
        c.fillStyle = 'rgba(236,222,178,0.95)'
        c.fillRect(-8, -4.5, 16, 9)
        c.fillStyle = 'rgba(22,18,28,0.08)'
        c.fillRect(-8, -4.5, 16, 1.2)
        c.restore()
      }
      // holes
      const chord = chordAt(Math.floor(pos))
      for (const h of dr.holes) {
        const phi = wrapAng((h.step - pos) * STEP_ANG)
        const cs = Math.cos(phi)
        if (cs < 0.04) continue
        const y = cy + R * Math.sin(phi)
        const x = colScreenX(h.col)
        const fl = dr.flash.get(holeKey(h))
        const f = fl ? Math.max(0, 1 - (now - fl) / 0.2) : 0
        this.holeShape(i, h.col, x, y, cs, 1 + 0.4 * f, chord.semis)
      }
      c.restore()
    }

    if (peelT < 0) content(0, 1)
    else {
      // the old master lifts off, the drum shows bare mesh, a new one wraps on
      c.fillStyle = ink.hex
      c.globalAlpha = 0.75
      c.fillRect(x0, cy - R, w, 2 * R)
      c.globalAlpha = 1
      c.strokeStyle = 'rgba(247,239,223,0.25)'
      c.lineWidth = 0.5
      for (let gx = x0; gx < x0 + w; gx += 4) {
        c.beginPath()
        c.moveTo(gx, cy - R)
        c.lineTo(gx + 2 * R, cy + R)
        c.stroke()
      }
      if (peelT < 0.38) content(-ease(peelT / 0.38) * R * 2.3, 1 - peelT / 0.38)
      else if (peelT > 0.45) {
        const k = ease((peelT - 0.45) / 0.4)
        c.save()
        c.beginPath()
        c.rect(x0, cy - R, w, 2 * R * k)
        c.clip()
        content(0, 1)
        c.restore()
      }
    }

    if (this.shade) {
      c.globalCompositeOperation = 'multiply'
      c.globalAlpha = 0.55
      c.drawImage(this.shade, x0, cy - R, w, 2 * R)
      c.globalCompositeOperation = 'source-over'
      c.globalAlpha = 1
    }
    c.fillStyle = 'rgba(255,250,238,0.4)'
    c.fillRect(x0, cy - R * 0.62, w, 2.2)
    c.restore()

    // end caps and bearings
    for (const ex of [x0, x0 + w]) {
      c.fillStyle = ink.hex
      c.beginPath()
      c.ellipse(ex, cy, 4.2, R, 0, 0, TAU)
      c.fill()
      c.strokeStyle = 'rgba(247,239,223,0.35)'
      c.lineWidth = 0.8
      c.stroke()
    }
    // impression line markers: lime when the drum just printed
    let recent = 0
    for (const t of dr.flash.values()) recent = Math.max(recent, t)
    const lit = now - recent < 0.1
    c.fillStyle = lit ? LIME : 'rgba(247,239,223,0.7)'
    tri(c, x0 - 11, cy, 5, 1)
    tri(c, x0 + w + 11, cy, 5, -1)

    // label
    c.font = `6.8px ${this.fonts.mono}`
    c.fillStyle = 'rgba(247,239,223,0.78)'
    c.textBaseline = 'alphabetic'
    c.fillText(`${ink.short} · ${ink.voice}`, x0, rowY0(i) + 7)
    const pct = Math.round(dr.ink * 100)
    const state = dr.ink > 1.02 ? 'FLOODED' : dr.ink < 0.3 ? 'LOW INK' : ''
    c.textAlign = 'right'
    c.fillText(`${state ? state + ' · ' : ''}${pct}%`, x0 + w, rowY0(i) + 7)
    c.textAlign = 'left'
    if (state) {
      const blink = dr.ink < 0.3 ? Math.sin(now * 9) > 0 : true
      c.fillStyle = blink ? (dr.ink > 1.02 ? ink.hex : INKS[2].hex) : 'rgba(247,239,223,0.15)'
      c.beginPath()
      c.arc(x0 + w - c.measureText(`${state} · ${pct}%`).width - 7, rowY0(i) + 4.6, 2.3, 0, TAU)
      c.fill()
    }
  }

  private holeShape(i: number, col: number, x: number, y: number, cs: number, sc: number, semis: number[]) {
    const c = this.ctx
    const ink = INKS[i]
    const a = col / (X_COLS - 1)
    c.fillStyle = ink.hex
    c.strokeStyle = 'rgba(22,18,28,0.4)'
    c.lineWidth = 0.8
    if (i === 0) {
      c.beginPath()
      c.ellipse(x, y, 7.6 * sc, 7.6 * cs * sc, 0, 0, TAU)
      c.fill()
      c.stroke()
    } else if (i === 1) {
      const len = (3 + a * 13) * cs * sc
      c.strokeStyle = ink.hex
      c.lineCap = 'round'
      c.lineWidth = 4.4 * sc
      c.beginPath()
      c.moveTo(x, y)
      c.lineTo(x, y + len)
      c.stroke()
      c.lineCap = 'butt'
    } else if (i === 2) {
      const bw = (9 + a * 16) * sc
      for (const s of semis) c.fillRect(x - bw / 2, y - s * 0.62 * cs, bw, 2.3 * cs * sc)
    } else {
      c.globalAlpha = 0.92
      c.beginPath()
      c.ellipse(x, y, 14 * sc, 9.5 * cs * sc, 0, 0, TAU)
      c.fill()
      c.globalAlpha = 1
      c.stroke()
    }
  }

  private drawTube(i: number) {
    const c = this.ctx
    const dr = this.press.drums[i]
    const ink = INKS[i]
    const cy = rowCy(i)
    const x = TUBE.x, w = TUBE.w
    const top = cy - 24, bot = cy + 25
    const sq = dr.squeeze
    const hw = (y: number) => {
      const shoulder = 0.62 + 0.38 * Math.min(1, (y - top) / 7)
      return (w / 2) * shoulder * (1 - 0.4 * sq * Math.exp(-(((y - dr.squeezeY) / 8) ** 2)))
    }
    const cx = x + w / 2
    const path = () => {
      c.beginPath()
      c.moveTo(cx - hw(top), top)
      for (let y = top; y <= bot - 6; y += 2) c.lineTo(cx - hw(y), y)
      c.lineTo(cx - w / 2, bot - 6)
      c.lineTo(cx - w / 2, bot)
      c.lineTo(cx + w / 2, bot)
      c.lineTo(cx + w / 2, bot - 6)
      for (let y = bot - 6; y >= top; y -= 2) c.lineTo(cx + hw(y), y)
      c.closePath()
    }
    c.save()
    path()
    c.fillStyle = CREAM
    c.fill()
    c.clip()
    const level = Math.min(1, dr.ink)
    const fillTop = bot - 7 - (bot - 7 - top) * level
    c.fillStyle = ink.hex
    c.fillRect(x - 2, fillTop, w + 4, bot - fillTop)
    // a highlight down the tube
    c.fillStyle = 'rgba(255,250,238,0.35)'
    c.fillRect(cx - w * 0.28, top + 6, 2.2, bot - top - 14)
    c.restore()
    path()
    c.strokeStyle = CREAM
    c.lineWidth = 1.1
    c.stroke()
    // crimp
    c.strokeStyle = 'rgba(247,239,223,0.6)'
    c.lineWidth = 0.6
    for (let zx = x + 2; zx < x + w - 1; zx += 3) {
      c.beginPath()
      c.moveTo(zx, bot - 5)
      c.lineTo(zx + 1.5, bot - 1)
      c.stroke()
    }
    // cap and nozzle
    c.fillStyle = CREAM
    c.fillRect(cx - 4, top - 6, 8, 6)
    c.fillStyle = INK
    c.fillRect(cx - 4, top - 3.5, 8, 0.8)
    // too much ink: a bead on the nozzle
    const over = Math.max(0, dr.ink - 1) / 0.35
    const bead = over * 4.5 + sq * 1.5
    if (bead > 0.3) {
      c.fillStyle = ink.hex
      c.beginPath()
      c.arc(cx, top - 6 - bead * 0.7, bead, 0, TAU)
      c.fill()
    }
  }

  private drawReg(i: number) {
    const c = this.ctx
    const dr = this.press.drums[i]
    const ink = INKS[i]
    const cy = rowCy(i)
    const x = REG.cx + dr.regX * REG.travel, y = cy + dr.regY * REG.travel
    const plus = (color: string, width: number) => {
      c.strokeStyle = color
      c.lineWidth = width
      c.beginPath()
      c.arc(x, y, 7.5, 0, TAU)
      c.moveTo(x - 12, y)
      c.lineTo(x + 12, y)
      c.moveTo(x, y - 12)
      c.lineTo(x, y + 12)
      c.stroke()
    }
    c.save()
    c.beginPath()
    c.rect(REG.cx - REG.half, cy - REG.half, REG.half * 2, REG.half * 2)
    c.clip()
    if (i === 3) plus('rgba(22,18,28,0.35)', 2.9)
    plus(ink.hex, 1.9)
    c.restore()
  }

  private drawKeys(now: number) {
    const c = this.ctx
    const p = this.press
    const pressed = new Set<string>()
    for (const g of this.gestures.values()) if (g.kind === 'key' && g.inside) pressed.add(g.id)
    const key = (r: { x: number; y: number; w: number; h: number }, id: string, face: string, label: string, font: string, text = INK) => {
      const down = pressed.has(id)
      const dy = down ? 2.5 : 0
      c.fillStyle = '#000'
      roundRect(c, r.x, r.y + 3, r.w, r.h, 6)
      c.fill()
      c.fillStyle = face
      roundRect(c, r.x, r.y + dy, r.w, r.h, 6)
      c.fill()
      c.fillStyle = text
      c.font = font
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + dy + 1)
    }
    const invite = !this.started && Math.sin(now * 3.2) > 0
    key(KEY_START, 'start', LIME, invite ? 'START ◇' : 'START ◆', `15px ${this.fonts.display}`)
    key(KEY_STOP, 'stop', CREAM, 'STOP', `12px ${this.fonts.display}`)
    for (let i = 0; i < SPEEDS.length; i++) {
      const on = p.speed === i
      key(keySpeed(i), `speed${i}`, on ? INKS[3].hex : CREAM, String(i + 1), `12px ${this.fonts.display}`)
    }
    // motor LED + rpm readout
    c.fillStyle = p.motor ? LIME : 'rgba(247,239,223,0.18)'
    c.beginPath()
    c.arc(KEY_START.x + 34, 725.6, 2.6, 0, TAU)
    c.fill()
    c.fillStyle = 'rgba(247,239,223,0.8)'
    c.font = `6.6px ${this.fonts.mono}`
    c.textAlign = 'right'
    c.textBaseline = 'alphabetic'
    c.fillText(`${rpmLabel(p.speed)} RPM · ${Math.round(SPEEDS[p.speed] * 4)} BPM`, 372, 728)
    c.textAlign = 'left'
  }

  private drawGestures(now: number) {
    const c = this.ctx
    for (const g of this.gestures.values()) {
      if (g.kind !== 'drum' || g.moved || g.long) continue
      const t = (now - g.t0 - 0.18) / 0.45
      if (t <= 0) continue
      c.strokeStyle = CREAM
      c.lineWidth = 2.2
      c.beginPath()
      c.arc(g.px, g.py, 17, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, t))
      c.stroke()
      c.fillStyle = CREAM
      c.font = `7px ${this.fonts.mono}`
      c.textAlign = 'center'
      c.fillText('peel', g.px, g.py - 22)
      c.textAlign = 'left'
    }
  }

  // ─── input ───

  private hitDrum(x: number, y: number) {
    for (let i = 0; i < 4; i++) {
      const cy = rowCy(i)
      if (x >= CYL.x - 4 && x <= CYL.x + CYL.w + 4 && Math.abs(y - cy) <= CYL.R + 2) return i
    }
    return -1
  }

  private down = (e: PointerEvent) => {
    e.preventDefault()
    this.press.ensureAudio()
    this.canvas.setPointerCapture?.(e.pointerId)
    const { x, y } = this.toVirtual(e.clientX, e.clientY)
    const p = this.press
    let g: Gesture = { kind: 'none' }

    if (inRect(KEY_START, x, y, 3)) g = { kind: 'key', id: 'start', inside: true }
    else if (inRect(KEY_STOP, x, y, 3)) g = { kind: 'key', id: 'stop', inside: true }
    else if (inRect(TRAY, x, y, 6)) g = { kind: 'tray' }
    else {
      for (let i = 0; i < SPEEDS.length; i++) if (inRect(keySpeed(i), x, y, 2)) g = { kind: 'key', id: `speed${i}`, inside: true }
    }
    if (g.kind === 'none') {
      for (let i = 0; i < 4; i++) {
        const cy = rowCy(i)
        if (Math.abs(x - REG.cx) <= REG.half + 6 && Math.abs(y - cy) <= REG.half + 6) {
          g = { kind: 'reg', d: i }
          const t = clock()
          if (this.lastRegTap.d === i && t - this.lastRegTap.t < 0.32) p.setReg(i, 0, 0)
          else this.regTo(i, x, y)
          this.lastRegTap = { d: i, t }
          break
        }
        if (x >= TUBE.x - 5 && x <= TUBE.x + TUBE.w + 5 && Math.abs(y - cy) <= 34) {
          g = { kind: 'tube', d: i }
          p.squeezeStart(i, y)
          break
        }
      }
    }
    if (g.kind === 'none') {
      const d = this.hitDrum(x, y)
      if (d >= 0) {
        const cy = rowCy(d)
        const phi = Math.asin(Math.max(-1, Math.min(1, (y - cy) / CYL.R)))
        const col = Math.max(0, Math.min(X_COLS - 1, Math.floor(((x - CYL.x - 10) / (CYL.w - 20)) * X_COLS)))
        g = { kind: 'drum', d, x0: x, y0: y, t0: clock(), stepF: p.pos + phi / STEP_ANG, col, moved: false, grabbing: false, long: false, lastY: y, lastT: clock(), v: 0, px: x, py: y }
      }
    }
    if (g.kind === 'none' && y < SLOT && y > SH.y - 10 && x > SH.x - 10 && x < SH.x + SH.w + 10) {
      const top = this.emergingTop()
      if (p.cur && y >= top) g = { kind: 'sheet', x0: x, y0: y, yanked: false, top }
      else g = { kind: 'tray', no: p.sheets[p.sheets.length - 1]?.no }
    }
    if (g.kind === 'none' && this.desk) {
      const hit = this.hitWall(e.clientX, e.clientY)
      if (hit) g = { kind: 'tray', no: hit.no }
    }
    this.gestures.set(e.pointerId, g)
  }

  private regTo(d: number, x: number, y: number) {
    const cy = rowCy(d)
    this.press.setReg(d, (x - REG.cx) / REG.travel, (y - cy) / REG.travel)
  }

  private move = (e: PointerEvent) => {
    const g = this.gestures.get(e.pointerId)
    if (!g) return
    const { x, y } = this.toVirtual(e.clientX, e.clientY)
    const p = this.press
    if (g.kind === 'drum') {
      g.px = x
      g.py = y
      if (!g.moved && Math.hypot(x - g.x0, y - g.y0) > 7) {
        g.moved = true
        const other = [...this.gestures.values()].some((o) => o !== g && o.kind === 'drum' && o.grabbing)
        if (!other && !g.long) {
          g.grabbing = true
          g.lastY = y
          g.lastT = clock()
          p.grabStart()
        }
      }
      if (g.grabbing) {
        const t = clock()
        const dSteps = (-(y - g.lastY) / CYL.R) / STEP_ANG
        p.grabMove(dSteps)
        const dt = Math.max(0.004, t - g.lastT)
        g.v = g.v * 0.6 + (dSteps / dt) * 0.4
        g.lastY = y
        g.lastT = t
      }
    } else if (g.kind === 'reg') this.regTo(g.d, x, y)
    else if (g.kind === 'tube') p.drums[g.d].squeezeY = Math.max(rowCy(g.d) - 24, Math.min(rowCy(g.d) + 20, y))
    else if (g.kind === 'key') {
      const r = g.id === 'start' ? KEY_START : g.id === 'stop' ? KEY_STOP : keySpeed(Number(g.id.slice(5)))
      g.inside = inRect(r, x, y, 8)
    } else if (g.kind === 'sheet' && !g.yanked && g.y0 - y > 34) {
      g.yanked = p.yank()
    }
  }

  private up = (e: PointerEvent) => {
    const g = this.gestures.get(e.pointerId)
    this.gestures.delete(e.pointerId)
    if (!g) return
    const { x, y } = this.toVirtual(e.clientX, e.clientY)
    const p = this.press
    p.ensureAudio()
    if (g.kind === 'drum') {
      if (g.grabbing) p.grabEnd(clock() - g.lastT > 0.08 ? 0 : g.v)
      else if (!g.moved && !g.long && e.type === 'pointerup') p.punch(g.d, g.stepF, g.col)
    } else if (g.kind === 'tube') p.squeezeEnd(g.d)
    else if (g.kind === 'key' && g.inside && e.type === 'pointerup') {
      if (g.id === 'start') {
        this.started = true
        p.start()
      } else if (g.id === 'stop') p.stop()
      else p.setSpeed(Number(g.id.slice(5)))
    } else if (g.kind === 'tray' && e.type === 'pointerup') this.opts.onTray(g.no)
    else if (g.kind === 'sheet' && !g.yanked && e.type === 'pointerup' && Math.hypot(x - g.x0, y - g.y0) < 10) {
      const top = this.emergingTop()
      const u = (x - SH.x) / SH.w, v = (y - top) / SH.w
      if (!p.fingerprint(u, v)) this.opts.onTray(p.sheets[p.sheets.length - 1]?.no)
    }
  }

  private checkLongPress() {
    const now = clock()
    for (const g of this.gestures.values()) {
      if (g.kind === 'drum' && !g.moved && !g.long && now - g.t0 > 0.63) {
        g.long = true
        this.press.remaster(g.d)
      }
    }
  }

  private hitWall(sx: number, sy: number): Sheet | null {
    const now = clock()
    const hits = [...this.wall].filter(([, w]) => now > w.t0 + 0.9)
    for (let i = hits.length - 1; i >= 0; i--) {
      const [s, w] = hits[i]
      const p = this.slotPos(w.slot)
      if (Math.abs(sx - p.x) < this.tw / 2 && Math.abs(sy - p.y) < (this.tw * SHEET_H) / 2) return s
    }
    return null
  }

  private key = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest('.drum-tray')) return
    const p = this.press
    if (e.code === 'Space') {
      e.preventDefault()
      p.ensureAudio()
      if (p.motor) p.stop()
      else {
        this.started = true
        p.start()
      }
    } else if (/^[1-5]$/.test(e.key)) {
      p.ensureAudio()
      p.setSpeed(Number(e.key) - 1)
    } else if (e.key === 't' || e.key === 'T') this.opts.onTray()
  }

  private visibility = () => {
    if (document.hidden) this.press.stop(false)
  }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2)
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

function tri(c: CanvasRenderingContext2D, x: number, y: number, s: number, dir: number) {
  c.beginPath()
  c.moveTo(x + dir * s, y)
  c.lineTo(x - dir * s * 0.4, y - s * 0.8)
  c.lineTo(x - dir * s * 0.4, y + s * 0.8)
  c.closePath()
  c.fill()
}
