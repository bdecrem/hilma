// Things printed with type: the colophon every sheet gets on its way out,
// the operating instructions that sit in the tray when the press is new,
// and full-size pulls for saving.

import { Plate } from './raster'
import { INKS, INK, SHEET_H, frameMarks, hashInt, type Mark } from './model'

export type Fonts = { display: string; mono: string; serif: string }

export type SheetMeta = {
  no: number
  kind: 'print' | 'manual'
  marks: Mark[]
  chord: string
  rpm: string
  speed: number
  partial: boolean
  skew: number
  inks: number[]
  pulledAt: number
}

const pad3 = (n: number) => String(n).padStart(3, '0')
const pct = (v: number) => `${Math.round(Math.max(0, v) * 100)}`

export function pulledTime(ms: number) {
  const d = new Date(ms)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function drawColophon(ctx: CanvasRenderingContext2D, s: SheetMeta, W: number, fonts: Fonts) {
  const U = W
  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = INK
  ctx.textBaseline = 'alphabetic'
  const x = 0.12 * U
  ctx.font = `${0.028 * U}px ${fonts.display}`
  ctx.fillText(`DRUM  No. ${pad3(s.no)}`, x, 1.232 * U)
  ctx.font = `${0.0158 * U}px ${fonts.mono}`
  const how = s.partial ? 'pulled early' : s.skew ? 'misfed, kept' : 'four bars'
  ctx.fillText(`${s.chord} · ${s.rpm} rpm${s.speed === 4 ? ' (a record)' : ''} · ${how}`, x, 1.259 * U)
  ctx.fillText(`${pulledTime(s.pulledAt)} · printed by Claude Opus 5.5`, x, 1.28 * U)
  ctx.font = `${0.0115 * U}px ${fonts.mono}`
  ctx.textAlign = 'center'
  s.inks.forEach((v, i) => ctx.fillText(pct(v), (0.78 + i * 0.045) * U, 1.256 * U))
  ctx.restore()
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width > width && line) {
      lines.push(line)
      line = w
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

export const MANUAL_STEPS = [
  'Press START.',
  'Tap a drum to punch a hole. Tap a hole to tape it shut.',
  'Drag a drum to turn the press by hand.',
  'Hold a drum to peel off its master.',
  'Squeeze the ink. Too little fades, too much bleeds.',
  'Drag a ⊕ off true to push or drag that ink.',
  'Flick the sheet up to pull it early.',
  'Squeezing ink inks your finger. Touch the paper.',
]

// The first sheet in the tray. Printed in three inks, like everything else.
export function renderManual(W: number, fonts: Fonts): HTMLCanvasElement {
  const plate = new Plate(W)
  plate.paper()
  const marks: Mark[] = [
    ...frameMarks(true, [0, 1, 2, 3].map(() => ({ regX: 0, regY: 0 })), [1, 1, 1, 1], 3),
    ...frameMarks(false, [0, 1, 2, 3].map(() => ({ regX: 0, regY: 0 })), [1, 1, 1, 1], 5),
    // the maker's mark, top right: a wash, a stab, a kick
    { ink: 3, kind: 'wash', x: 0.8, y: 0.19, a: 0.55, dens: 1, seed: 21 },
    { ink: 2, kind: 'stab', x: 0.76, y: 0.2, a: 0.5, semis: [0, 3, 7, 10, 12], dens: 1, seed: 22 },
    { ink: 0, kind: 'kick', x: 0.85, y: 0.15, dens: 1, seed: 23 },
    { ink: 1, kind: 'hat', x: 0.9, y: 0.2, a: 0.8, dens: 1, seed: 24 },
  ]
  for (const m of marks) plate.mark(m)
  const c = document.createElement('canvas')
  c.width = plate.w
  c.height = plate.h
  const ctx = c.getContext('2d')!
  ctx.putImageData(new ImageData(plate.data, plate.w, plate.h), 0, 0)
  const U = plate.w
  ctx.globalCompositeOperation = 'multiply'
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = INKS[2].hex
  ctx.font = `italic ${0.092 * U}px ${fonts.serif}`
  ctx.fillText('Operating', 0.1 * U, 0.17 * U)
  ctx.fillText('instructions', 0.1 * U, 0.255 * U)

  ctx.fillStyle = INK
  ctx.font = `${0.02 * U}px ${fonts.mono}`
  ctx.fillText('DRUM · MODEL 33⅓ · A FOUR-COLOR', 0.1 * U, 0.31 * U)
  ctx.fillText('STENCIL DUPLICATOR THAT PLAYS', 0.1 * U, 0.335 * U)

  let y = 0.42
  const size = 0.0325
  MANUAL_STEPS.forEach((step, i) => {
    ctx.fillStyle = INKS[1].hex
    ctx.font = `${size * 1.05 * U}px ${fonts.display}`
    ctx.fillText(String(i + 1), 0.1 * U, y * U)
    ctx.fillStyle = INK
    ctx.font = `${size * U}px ${fonts.mono}`
    const lines = wrap(ctx, step, 0.74 * U)
    lines.forEach((l, j) => ctx.fillText(l, 0.17 * U, (y + j * size * 1.28) * U))
    y += lines.length * size * 1.28 + size * 0.5
  })

  // the four inks and what they play, each in its own ink
  y = Math.max(y + 0.01, SHEET_H - 0.2)
  ctx.font = `${0.03 * U}px ${fonts.display}`
  let x = 0.1 * U
  const parts: [string, string][] = [
    ['kick', INKS[0].hex],
    ['hat', INKS[1].hex],
    ['stab', INKS[2].hex],
    ['wash', INKS[3].hex],
  ]
  for (const [word, hex] of parts) {
    ctx.fillStyle = hex
    ctx.fillText(word, x, y * U)
    x += ctx.measureText(word + '  ').width
  }

  ctx.fillStyle = INK
  ctx.font = `${0.0165 * U}px ${fonts.mono}`
  ctx.fillText('Designed and built by Claude Opus 5.5', 0.1 * U, (SHEET_H - 0.118) * U)
  ctx.fillText('September 2026 · no two sheets alike', 0.1 * U, (SHEET_H - 0.096) * U)
  return c
}

// A sheet pulled again from its marks, at any width.
export function renderSheet(s: SheetMeta, W: number, fonts: Fonts): HTMLCanvasElement {
  if (s.kind === 'manual') return renderManual(W, fonts)
  const plate = new Plate(W)
  plate.paper()
  for (const m of s.marks) plate.mark(m)
  const c = document.createElement('canvas')
  c.width = plate.w
  c.height = plate.h
  const ctx = c.getContext('2d')!
  ctx.putImageData(new ImageData(plate.data, plate.w, plate.h), 0, 0)
  if (s.pulledAt) drawColophon(ctx, s, plate.w, fonts)
  return c
}

export const seedFor = (...n: number[]) => hashInt(...n)
