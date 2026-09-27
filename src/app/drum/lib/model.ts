// DRUM — the shared model: inks, the stencil (the "master" on each drum),
// the sheet geometry, and how one step of one drum becomes marks on paper.
// Used by the browser (Press) and by the share-card route on the server.

export const STEPS = 16 // one drum revolution = one bar of 16ths
export const BARS_PER_SHEET = 4
export const STEPS_PER_SHEET = STEPS * BARS_PER_SHEET
export const X_COLS = 24 // stencil columns across the drum

// Sheet geometry, in sheet widths (the sheet is 1 wide, 4/3 tall).
export const SHEET_H = 4 / 3
export const PRINT_TOP = 0.09
export const PRINT_H = 1.08
export const PRINT_X0 = 0.12
export const PRINT_W = 0.76
export const BAR_H = PRINT_H / BARS_PER_SHEET

// Riso drums run at a handful of fixed speeds. One revolution is one bar,
// so rpm × 4 = bpm, and the top speed is a record.
export const SPEEDS = [29, 30, 31, 32, 100 / 3]
export const DEFAULT_SPEED = 2
export const rpmLabel = (i: number) => (i === 4 ? '33⅓' : String(SPEEDS[i]))
export const bpmOf = (i: number) => SPEEDS[i] * 4

export type Ink = {
  name: string
  short: string
  voice: string
  hex: string
  rgb: [number, number, number]
  // what the ink lets through when printed over paper or another ink
  // (multiply). Blue passes a little more green than its screen color so
  // blue over gold goes dark olive, the way real riso overprints do.
  mul: [number, number, number]
}

// Top to bottom on the machine = last to first under the paper.
export const INKS: Ink[] = [
  { name: 'Black', short: 'BLACK', voice: 'kick', hex: '#1d1b1e', rgb: [29, 27, 30], mul: [29, 27, 30] },
  { name: 'Federal Blue', short: 'FEDERAL BLUE', voice: 'hat', hex: '#3d5588', rgb: [61, 85, 136], mul: [58, 90, 150] },
  { name: 'Brick', short: 'BRICK', voice: 'stab', hex: '#a75154', rgb: [167, 81, 84], mul: [176, 84, 84] },
  { name: 'Flat Gold', short: 'FLAT GOLD', voice: 'wash', hex: '#bb8b41', rgb: [187, 139, 65], mul: [200, 150, 72] },
]
export const PAPER: [number, number, number] = [247, 239, 223]
export const VERMILLION = '#ff4b1f'
export const STONE = '#b7b1a6' // the background: neutral, so the inks and the paper carry the color
export const INK = '#16121c'
export const CREAM = '#f7efdf'
export const LIME = '#bb8b41' // START, the motor light, the impression flash: flat gold

export type Hole = { step: number; col: number }
export type Master = { holes: Hole[]; regX: number; regY: number }
export type PressState = { speed: number; drums: Master[] }

// Chamber's chords (A3 = 220 Hz), one per 8 bars.
export const CHORDS = [
  { name: 'Am7', semis: [0, 3, 7, 10, 12] },
  { name: 'Dm9', semis: [5, 8, 12, 15, 17] },
  { name: 'Em7', semis: [7, 10, 14, 17, 19] },
]
export const mod = (a: number, n: number) => ((a % n) + n) % n
export const chordAt = (step: number) => CHORDS[mod(Math.floor(step / (STEPS * 8)), CHORDS.length)]

export const colX = (col: number) => (col + 0.5) / X_COLS // 0..1 across the drum

// The master the press ships with. A staircase of kicks, closed ticks on the
// left edge and open hats on the right, chamber's two off-beat stabs, one
// wash per bar. It prints a pattern that looks set on purpose.
export function defaultPress(): PressState {
  return {
    speed: DEFAULT_SPEED,
    drums: [
      { regX: 0, regY: 0, holes: [0, 4, 8, 12].map((step, i) => ({ step, col: 5 + i * 4 })) },
      {
        regX: 0,
        regY: 0,
        holes: [
          ...[2, 6, 10, 14].map((step) => ({ step, col: 18 })),
          ...[3, 7, 11, 15].map((step) => ({ step, col: 3 })),
        ],
      },
      { regX: 0, regY: 0, holes: [2, 10].map((step) => ({ step, col: 10 })) },
      { regX: 0, regY: 0, holes: [{ step: 0, col: 12 }] },
    ],
  }
}

// ─── share links: the whole master in a few dozen bytes ───

const b64u = {
  enc(bytes: Uint8Array) {
    let s = ''
    for (const b of bytes) s += String.fromCharCode(b)
    const b64 = typeof btoa === 'function' ? btoa(s) : Buffer.from(bytes).toString('base64')
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  },
  dec(str: string) {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
    const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary')
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  },
}

const q = (v: number) => Math.max(0, Math.min(254, Math.round(v * 100) + 127))
const uq = (b: number) => Math.max(-1, Math.min(1, (b - 127) / 100))

export function encodePress(p: PressState): string {
  const bytes: number[] = [1, p.speed]
  for (const d of p.drums) {
    const holes = d.holes.slice(0, 64)
    bytes.push(q(d.regX), q(d.regY), holes.length)
    for (const h of holes) bytes.push(h.step, h.col)
  }
  return b64u.enc(Uint8Array.from(bytes))
}

export function decodePress(s: string | null | undefined): PressState | null {
  if (!s) return null
  try {
    const b = b64u.dec(s)
    if (b[0] !== 1) return null
    let i = 1
    const speed = Math.min(SPEEDS.length - 1, b[i++] ?? DEFAULT_SPEED)
    const drums: Master[] = []
    for (let d = 0; d < 4; d++) {
      const regX = uq(b[i++]), regY = uq(b[i++])
      const n = b[i++]
      if (n === undefined || i + n * 2 > b.length) return null
      const holes: Hole[] = []
      for (let k = 0; k < n; k++) {
        const step = b[i++], col = b[i++]
        if (step < STEPS && col < X_COLS) holes.push({ step, col })
      }
      drums.push({ regX, regY, holes })
    }
    return { speed, drums }
  } catch {
    return null
  }
}

// ─── marks: what a hole leaves on paper ───

export type MarkKind = 'kick' | 'hat' | 'stab' | 'wash' | 'finger' | 'reg' | 'crop' | 'swatch'
export type Mark = {
  ink: number
  kind: MarkKind
  x: number // sheet units
  y: number
  a?: number // hat openness / stab brightness / wash register / crop orientation
  semis?: number[]
  dens: number // ink on the drum when it printed: 0 starved … 1 full … 1.35 flooded
  seed: number
  rot?: number
  smear?: number // hand-cranked prints stretch with the speed of the turn
}

export function hashInt(...n: number[]) {
  let h = 2166136261
  for (const v of n) {
    h ^= v | 0
    h = Math.imul(h, 16777619)
    h ^= h >>> 13
  }
  return h >>> 0
}

// Where a stencil column and a (possibly fractional) absolute step land on the sheet.
export function sheetXY(col: number, k: number, sheetStart: number, regX: number, regY: number) {
  const f = Math.max(0, Math.min(1, (k - sheetStart) / STEPS_PER_SHEET))
  return {
    x: PRINT_X0 + colX(col) * PRINT_W + regX * 0.022,
    y: PRINT_TOP + f * PRINT_H + regY * 0.022,
  }
}

export function skewPoint(x: number, y: number, skew: number) {
  if (!skew) return { x, y }
  const cx = 0.5, cy = SHEET_H / 2
  const c = Math.cos(skew), s = Math.sin(skew)
  return { x: cx + (x - cx) * c - (y - cy) * s, y: cy + (x - cx) * s + (y - cy) * c }
}

export function marksForStep(
  d: number,
  holes: Hole[],
  k: number,
  sheetStart: number,
  master: { regX: number; regY: number },
  dens: number,
  sheetNo: number,
  skew = 0,
  smear = 0,
): Mark[] {
  const out: Mark[] = []
  const chord = chordAt(Math.floor(k))
  for (const h of holes) {
    const p = sheetXY(h.col, k, sheetStart, master.regX, master.regY)
    const seed = hashInt(d, Math.floor(k), h.col, sheetNo)
    const a = h.col / (X_COLS - 1)
    let m: Mark
    if (d === 0) m = { ink: 0, kind: 'kick', x: p.x, y: p.y, dens, seed }
    else if (d === 1) m = { ink: 1, kind: 'hat', x: p.x, y: p.y, a, dens, seed }
    else if (d === 2) m = { ink: 2, kind: 'stab', x: p.x, y: p.y, a, semis: chord.semis, dens, seed }
    else m = { ink: 3, kind: 'wash', x: p.x, y: p.y + BAR_H * 0.42, a, dens, seed }
    const sp = skewPoint(m.x, m.y, skew)
    m.x = sp.x
    m.y = sp.y
    if (smear) m.smear = smear
    out.push(m)
  }
  return out
}

// Registration targets and crop marks, printed in all four inks at the
// drums' current offsets — so the corners of every sheet show the groove.
export function frameMarks(top: boolean, masters: { regX: number; regY: number }[], dens: number[], seed: number): Mark[] {
  const out: Mark[] = []
  const y = top ? 0.042 : SHEET_H - 0.05
  for (const x of [0.055, 0.945]) {
    masters.forEach((m, i) => {
      out.push({ ink: i, kind: 'reg', x: x + m.regX * 0.022, y: y + m.regY * 0.022, dens: Math.max(0.25, dens[i]), seed: seed + i })
    })
  }
  // crop marks at the corners, black only
  const cy = top ? 0.02 : SHEET_H - 0.02
  for (const cx of [0.02, 0.98]) out.push({ ink: 0, kind: 'crop', x: cx, y: cy, a: top ? 0 : 1, dens: 1, seed })
  return out
}

export function swatchMarks(dens: number[], seed: number): Mark[] {
  return dens.map((dn, i) => ({ ink: i, kind: 'swatch' as const, x: 0.78 + i * 0.045, y: SHEET_H - 0.105, dens: dn, seed: seed + i }))
}

// A whole sheet printed straight from a master at full ink — the share card.
export function proofMarks(p: PressState): Mark[] {
  const marks: Mark[] = []
  marks.push(...frameMarks(true, p.drums, [1, 1, 1, 1], 7))
  for (let k = 0; k < STEPS_PER_SHEET; k++) {
    p.drums.forEach((m, d) => {
      const holes = m.holes.filter((h) => h.step === k % STEPS)
      if (holes.length) marks.push(...marksForStep(d, holes, k, 0, m, 1, 0))
    })
  }
  marks.push(...frameMarks(false, p.drums, [1, 1, 1, 1], 11))
  marks.push(...swatchMarks([1, 1, 1, 1], 13))
  return marks
}
