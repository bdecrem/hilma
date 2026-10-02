// The payoff scene: a plant growing from a seed to old growth, on canvas, in
// the candy journal's style (2026-10-01; the pencil-on-paper original was a
// port of Bart's "onething — grow a year" sketch, 2026-09-22). This module
// only draws. The HUD, the copy and the buttons are React (Payoff.tsx), which
// drives it through the Scene handle.
//
// Growth is one number P in [0, 6]: the level index plus the fraction of the
// way to the next level, so a Sapling at 60% is a sapling well on its way to
// a tree. Companion trees, a meadow, pollen and butterflies arrive at fixed
// points along the way; petals fall from P 4.2 on and the leaves warm from 5.
//
// The look: a sky in the milestone's colour, rolling grass, glossy candy
// leaves under an ink outline that sits a little off register and boils at
// 5 fps like the doodles. The story: the ink drop falls onto the seed, the
// plant grows (a pop at the crown on every new stage), and on arrival the
// drop pops up beside it to cheer while the milestone's finale plays —
// confetti always, plus a rainbow, balloons, fireworks or a blossom storm
// (themeFor). 365 gets all of it under a sky that turns through every colour.

export type Scene = {
  /** Jump straight to a growth value. */
  setP(p: number): void
  /** Grow (or shrink) to `p` over `seconds`; `onProgress` ticks, `onArrive` fires once at the end. */
  growTo(p: number, seconds: number): void
  /** The moment of arrival: confetti from the branch tips, the drop, the milestone's finale. */
  burst(): void
  readonly p: number
  destroy(): void
}

export type Finale = 'rainbow' | 'balloons' | 'fireworks' | 'blossom'
export type Theme = { name: string; sky: [string, string]; finale: Finale[]; cycle?: boolean }

export type SceneOpts = {
  reduceMotion?: boolean
  theme?: Theme
  /** While a growTo runs: the fraction done (0..1) and the current P. */
  onProgress?: (fraction: number, p: number) => void
  onArrive?: () => void
  /** The level index (0..6) the scene is showing changed. */
  onStage?: (index: number) => void
  /** The first tap or swipe on the canvas (to hide the hint). */
  onFirstTouch?: () => void
}

// ---------- the milestones ----------
const SKIES: Record<string, [string, string]> = {
  violet: ['#b9a2ff', '#7b4dff'],
  orange: ['#ffc08f', '#ff7a2f'],
  sky: ['#a8e2ff', '#33b6ff'],
  yellow: ['#fff3b0', '#ffc71f'],
  pink: ['#ffbcdc', '#ff5fa8'],
  lime: ['#ddf7b4', '#7fcf3a'],
}
const THEMES: Record<number, Theme> = {
  3: { name: 'violet', sky: SKIES.violet, finale: [] },
  7: { name: 'orange', sky: SKIES.orange, finale: ['rainbow'] },
  14: { name: 'sky', sky: SKIES.sky, finale: ['balloons'] },
  30: { name: 'yellow', sky: SKIES.yellow, finale: ['fireworks'] },
  60: { name: 'pink', sky: SKIES.pink, finale: ['blossom', 'balloons'] },
  100: { name: 'lime', sky: SKIES.lime, finale: ['fireworks', 'rainbow'] },
  365: { name: 'violet', sky: SKIES.violet, finale: ['rainbow', 'balloons', 'fireworks', 'blossom'], cycle: true },
}
/// The milestone at or below `streak` (a replay or a preview may pass any number).
export function themeFor(streak: number): Theme {
  const keys = Object.keys(THEMES).map(Number).sort((a, b) => a - b)
  let k = keys[0]
  for (const m of keys) if (streak >= m) k = m
  return THEMES[k]
}

type Leaf = { da: number; dist: number; s: number; ci: number; ph: number; warm: number }
type Branch = { depth: number; len: number; ang: number; phase: number; bend: number; kids: Branch[]; bloom: number; bc: number; leaves: Leaf[] }
type Tree = { root: Branch; maxDepth: number }
type Flower = { x: number; y: number; h: number; c: string; ph: number; kind: number; s: number; appear: number; born: number }
type Blade = { x: number; y: number; h: number; appear: number; ph: number }
type Mote = { x: number; y: number; sp: number; ph: number; s: number; appear: number }
/** shape 0 = petal, 1 = confetti strip, 2 = dot, 3 = water drop */
type Bit = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; col: string; s: number; life: number; max: number; burst: boolean; ph: number; shape: number }
type Ring = { x: number; y: number; life: number; col: string }
type Butterfly = { x: number; y: number; vx: number; vy: number; tx: number; ty: number; retarget: number; c: [string, string]; flap: number; s: number; leaving: boolean }
type Balloon = { x: number; y: number; vy: number; ph: number; c: string; s: number; pop: number }
type Rocket = { x: number; y: number; ty: number; vy: number; c: string; trail: number[] }
type Spark = { x: number; y: number; vx: number; vy: number; c: string; life: number; max: number }
type Cloud = { x: number; y: number; s: number; sp: number }
type Pal = keyof typeof PAL
type Companion = { tree: Tree; fx: number; appear: number; size: number; pal: Pal; back: number }
type RenderOpts = { t: number; wind: number; warm?: number; bloom?: number; baseAng?: number; noLeaves?: boolean; rootStyle?: string; trunk?: string; tips?: number[] }

const INK = '#1d1625'
const TRUNK = '#c27a3e'
const CANDY = ['#7b4dff', '#ff7a2f', '#33b6ff', '#ffd23f', '#ff5fa8', '#93d94e']
const PAL = {
  green: ['#4cae3c', '#6fcf4a', '#9be35c', '#3f9a36', '#86d957'],
  autumn: ['#ffb02e', '#ff7a2f', '#ffd23f', '#f25a2a', '#ffc35a'],
  cherry: ['#ff8fc4', '#ff5fa8', '#ffc2de', '#f0418f', '#ffd6ea'],
  amber: ['#ffb02e', '#ff7a2f', '#ffd23f', '#f25a2a', '#ffc35a'],
  teal: ['#38c7c0', '#33b6ff', '#1fa1a8', '#7fe0d3', '#4fb8e8'],
  violet: ['#a98bff', '#7b4dff', '#c7b3ff', '#6a8cff', '#d6c7ff'],
}
const BLOOM = ['#ff5fa8', '#ffd23f', '#ff7a2f', '#ffffff', '#a98bff', '#33b6ff']
const BFLY: [string, string][] = [['#ff7a2f', '#ffd23f'], ['#33b6ff', '#bfe9ff'], ['#ff5fa8', '#ffc2de'], ['#7b4dff', '#d6c7ff'], ['#ffd23f', '#fff3b0'], ['#93d94e', '#ddf7b4']]
/** The ink sits a little off the colour, and moves: three positions, five times a second. */
const BOIL: [number, number][] = [[0.9, 0.7], [-0.6, 1.1], [0.4, -0.5]]

const TAU = Math.PI * 2
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const pick = <T,>(xs: T[]) => xs[(Math.random() * xs.length) | 0]
/** Elastic settle: overshoots, then rests at 1. */
const elastic = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1)

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b)
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`
}

// ---------- tree generation (deterministic: the same plant every time) ----------
function genTree(seed: number, maxDepth: number, opt: { spread?: number; widen?: number; tri?: number; r0?: number } = {}): Tree {
  const rng = mulberry32(seed)
  function gen(depth: number, len: number): Branch {
    const b: Branch = { depth, len, ang: 0, phase: rng() * TAU, bend: (rng() - 0.5) * 0.35, kids: [], bloom: rng(), bc: (rng() * BLOOM.length) | 0, leaves: [] }
    const nl = depth < 3 ? 6 : 5
    for (let i = 0; i < nl; i++) b.leaves.push({ da: (rng() - 0.5) * Math.PI * 1.8, dist: 0.2 + rng() * 0.75, s: 0.7 + rng() * 0.55, ci: (rng() * 5) | 0, ph: rng() * TAU, warm: rng() })
    if (depth < maxDepth) {
      const n = depth === 0 ? 2 : rng() < (opt.tri ?? 0.35) ? 3 : 2
      const base = (opt.spread ?? 0.4) + depth * (opt.widen ?? 0.04)
      for (let i = 0; i < n; i++) {
        const r = depth === 0 ? (opt.r0 ?? 0.8) + rng() * 0.08 : 0.7 + rng() * 0.12
        const k = gen(depth + 1, len * r)
        const side = n === 2 ? (i ? 1 : -1) : i - 1
        k.ang = side * (base + rng() * 0.28) + (rng() - 0.5) * 0.18
        if (n === 3 && i === 1) k.ang = (rng() - 0.5) * 0.3
        b.kids.push(k)
      }
    }
    return b
  }
  const root = gen(0, 1)
  root.ang = (rng() - 0.5) * 0.05
  return { root, maxDepth }
}

const CENTRAL = genTree(20260922, 7, { spread: 0.3, widen: 0.045, tri: 0.3, r0: 0.86 })
const ROOTS = genTree(99, 4, { spread: 0.55, tri: 0.3, r0: 0.7 })
const COMPANIONS: Companion[] = [
  { tree: genTree(11, 5, { spread: 0.45 }), fx: 0.21, appear: 3.55, size: 0.52, pal: 'cherry', back: 10 },
  { tree: genTree(23, 5, { spread: 0.42 }), fx: 0.8, appear: 3.8, size: 0.58, pal: 'amber', back: 8 },
  { tree: genTree(37, 5, { spread: 0.5 }), fx: 0.05, appear: 4.5, size: 0.44, pal: 'teal', back: 16 },
  { tree: genTree(41, 5, { spread: 0.45 }), fx: 0.95, appear: 4.75, size: 0.47, pal: 'violet', back: 14 },
]

export function stageIndex(p: number): number { return Math.min(6, Math.floor(p + 0.25)) }

export function createScene(cv: HTMLCanvasElement, opts: SceneOpts = {}): Scene {
  const ctx = cv.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  const reduceMotion = !!opts.reduceMotion
  const theme = opts.theme ?? THEMES[3]
  const has = (f: Finale) => theme.finale.includes(f)

  // ---------- scene state ----------
  let W = 0, H = 0, DPR = 1, groundY = 0, TL = 0, cx = 0
  const meadow: Flower[] = [], grass: Blade[] = [], motes: Mote[] = [], planted: Flower[] = [], bits: Bit[] = [], rings: Ring[] = [], bflies: Butterfly[] = []
  const balloons: Balloon[] = [], rockets: Rocket[] = [], sparks: Spark[] = [], clouds: Cloud[] = []
  let tips: number[] = []
  let P = 0
  let grow: { from: number; to: number; t0: number; dur: number } | null = null
  let wind = 0, gust = 0
  let now = 0, last = 0, raf = 0, shownStage = -1, touched = false
  let boil = 0
  // the story: the drop falls (intro), and comes back to cheer (finale)
  const introT0 = reduceMotion ? -99 : 0.05
  let splashed = reduceMotion
  let finaleT0 = -1
  let nextRocket = Infinity
  const pointer = { x: -999, y: -999, active: false, lastX: 0, downX: 0, downY: 0, downT: 0, moved: 0 }

  function layout() {
    groundY = H * 0.8
    // Old Growth's crown reaches ~5.6 trunk lengths up: keep it under the stage name (the HUD's ~170px)
    TL = Math.max(30, Math.min(groundY * 0.21, W * 0.2, (groundY - 170) / 5.6))
    cx = W * 0.5
    meadow.length = 0; grass.length = 0; motes.length = 0; clouds.length = 0
    const r = mulberry32(5)
    const nM = Math.round(Math.min(60, W / 11))
    for (let i = 0; i < nM; i++) {
      let x = r() * W
      if (Math.abs(x - cx) < TL * 0.35) x += (x < cx ? -1 : 1) * TL * 0.4
      meadow.push({ x, y: groundY + 8 + r() * (H - groundY) * 0.6, h: 8 + r() * 18, c: BLOOM[(r() * BLOOM.length) | 0], appear: 1.3 + r() * 4.6, ph: r() * TAU, kind: (r() * 3) | 0, s: 0.8 + r() * 0.6, born: 0 })
    }
    meadow.sort((a, b) => a.y - b.y)
    for (let i = 0; i < Math.round(W / 12); i++) grass.push({ x: r() * W, y: groundY + 6 + r() * (H - groundY) * 0.7, h: 6 + r() * 10, appear: 0.5 + r() * 3.5, ph: r() * TAU })
    grass.sort((a, b) => a.y - b.y)
    for (let i = 0; i < 34; i++) motes.push({ x: r() * W, y: r() * groundY, sp: 6 + r() * 14, ph: r() * TAU, s: 1 + r() * 2, appear: 2.4 + r() * 3.4 })
    for (let i = 0; i < 4; i++) clouds.push({ x: r() * W, y: H * (0.1 + r() * 0.3), s: 0.6 + r() * 0.7, sp: 4 + r() * 8 })
  }
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1) // DPR 3 canvases are too large on phones
    const r = cv.getBoundingClientRect()
    W = r.width; H = r.height
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR)
    ctx!.setTransform(DPR, 0, 0, DPR, 0, 0)
    layout()
  }
  /** The ground's top edge: a gentle roll, level under the tree. */
  function groundAt(x: number): number {
    const away = smooth(0, 1, Math.abs(x - cx) / (W * 0.5))
    return groundY + Math.sin((x / W) * TAU * 1.2 + 0.6) * 10 * away
  }

  // ---------- tree rendering ----------
  function renderTree(T: Tree, ox: number, oy: number, tl: number, g: number, pal: string[], o: RenderOpts) {
    const c = ctx!
    const md = T.maxDepth, G = g * (md + 1)
    const segs: Path2D[] = []; for (let d = 0; d <= md; d++) segs.push(new Path2D())
    const leafOut = new Path2D(), shine = new Path2D(), fills = new Map<string, Path2D>()
    const petOut = new Path2D(), pets = new Map<string, Path2D>(), centers = new Path2D()
    const t = o.t, w = o.wind, warm = o.warm || 0, bloom = o.bloom || 0
    function ell(path: Path2D, x: number, y: number, rx: number, ry: number, rot: number) {
      path.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot))
      path.ellipse(x, y, rx, ry, rot, 0, TAU)
    }
    function circ(path: Path2D, x: number, y: number, r: number) { path.moveTo(x + r, y); path.arc(x, y, r, 0, TAU) }
    function rec(b: Branch, x: number, y: number, pa: number) {
      const p = clamp01(G - b.depth); if (p <= 0) return
      const ep = easeOut(p)
      const flex = 0.18 + b.depth * 0.3
      const sway = (Math.sin(t * 1.2 + b.phase) * 0.028 + Math.sin(t * 2.3 + b.phase * 1.7) * 0.01 + w * 0.075) * flex
      const a = pa + b.ang * ep + sway
      const L = tl * b.len * ep
      const sa = Math.sin(a), ca = Math.cos(a)
      const x1 = x + sa * L, y1 = y - ca * L
      const bx = (x + x1) / 2 + ca * b.bend * L * 0.5, by = (y + y1) / 2 + sa * b.bend * L * 0.5
      const sp = segs[b.depth]; sp.moveTo(x, y); sp.quadraticCurveTo(bx, by, x1, y1)
      const terminal = !b.kids.length
      const kp = terminal ? 0 : clamp01(G - b.depth - 1)
      const lw = terminal ? ep : ep * (1 - smooth(0, 1, kp))
      if (lw > 0.02 && !o.noLeaves) {
        const Rr = tl * (terminal ? Math.max(b.len * 1.25, 0.22) : Math.min(b.len, 0.55) * 0.75) * lw
        for (const l of b.leaves) {
          const la = a + l.da + Math.sin(t * 2.4 + l.ph) * 0.13 + w * 0.14
          const d = Rr * l.dist
          const lx = x1 + Math.sin(la) * d, ly = y1 - Math.cos(la) * d
          const rx = Rr * 0.62 * l.s, ry = Rr * 0.36 * l.s, rot = la - Math.PI / 2
          ell(leafOut, lx, ly, rx + 2, ry + 2, rot)
          const col = l.warm < warm ? PAL.autumn[l.ci] : pal[l.ci]
          let fp = fills.get(col); if (!fp) { fp = new Path2D(); fills.set(col, fp) }
          ell(fp, lx, ly, rx, ry, rot)
          // the candy shine: a small highlight toward the top-left of every leaf
          if (rx > 7) ell(shine, lx - rx * 0.28 * Math.cos(rot) - 0.5, ly - ry * 0.45, rx * 0.3, ry * 0.26, rot)
        }
        if (terminal && b.bloom < bloom) {
          const fr = Math.max(2.4, tl * 0.05 * lw) * (1 + 0.08 * Math.sin(t * 1.5 + b.phase))
          const fx = x1 + Math.sin(a) * Rr * 0.3, fy = y1 - Math.cos(a) * Rr * 0.3
          const col = BLOOM[b.bc]
          let pp = pets.get(col); if (!pp) { pp = new Path2D(); pets.set(col, pp) }
          const spin = b.phase + t * 0.2
          for (let i = 0; i < 5; i++) {
            const pa2 = spin + (i * TAU) / 5
            const px = fx + Math.cos(pa2) * fr, py = fy + Math.sin(pa2) * fr
            circ(petOut, px, py, fr * 0.8 + 1.4); circ(pp, px, py, fr * 0.8)
          }
          circ(centers, fx, fy, fr * 0.5)
        }
        if (terminal && o.tips && lw > 0.6) o.tips.push(x1, y1)
      }
      for (const k of b.kids) rec(k, x1, y1, a)
    }
    rec(T.root, ox, oy, o.baseAng || 0)

    c.lineCap = 'round'; c.lineJoin = 'round'
    const ws: number[] = []; for (let d = 0; d <= md; d++) ws.push(tl * 0.14 * Math.pow(0.64, d) + 0.9)
    if (o.rootStyle) {
      c.strokeStyle = o.rootStyle
      for (let d = 0; d <= md; d++) { c.lineWidth = Math.max(0.8, ws[d] * 0.45); c.stroke(segs[d]) }
      return
    }
    const [bx, by] = BOIL[boil]
    // ink first (off register), colour on top
    c.save(); c.translate(bx, by)
    c.strokeStyle = INK
    for (let d = 0; d <= md; d++) { c.lineWidth = ws[d] + 3.2; c.stroke(segs[d]) }
    c.fillStyle = INK; c.fill(leafOut)
    if (pets.size) c.fill(petOut)
    c.restore()
    c.strokeStyle = o.trunk || TRUNK
    for (let d = 0; d <= md; d++) { c.lineWidth = ws[d]; c.stroke(segs[d]) }
    for (const [col, p] of fills) { c.fillStyle = col; c.fill(p) }
    c.fillStyle = 'rgba(255,255,255,.5)'; c.fill(shine)
    if (pets.size) {
      for (const [col, p] of pets) { c.fillStyle = col; c.fill(p) }
      c.fillStyle = '#ffd23f'; c.fill(centers)
      c.lineWidth = 1.2; c.strokeStyle = INK; c.stroke(centers)
    }
  }

  // ---------- particles ----------
  function spawnBit(x: number, y: number, burst: boolean, shape?: number, col?: string) {
    if (bits.length > 320) bits.shift()
    const leaf = !burst && Math.random() < 0.35 + Math.max(0, P - 5) * 0.3
    const s = shape ?? (burst ? (Math.random() < 0.55 ? 1 : 2) : 0)
    const c = col ?? (leaf ? pick(PAL.autumn) : burst ? pick(CANDY) : pick(BLOOM))
    const a = Math.random() * TAU, sp = burst ? 90 + Math.random() * 240 : 5 + Math.random() * 20
    bits.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (burst ? 80 : 0), rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 9, col: c, s: burst ? 3.5 + Math.random() * 3.5 : 3 + Math.random() * 3, life: 0, max: burst ? 1.6 + Math.random() * 1 : 5 + Math.random() * 3, burst, ph: Math.random() * TAU, shape: s })
  }
  /** Confetti falling from the top of the sky. */
  function rainConfetti(n: number) {
    for (let i = 0; i < n; i++) {
      if (bits.length > 320) bits.shift()
      bits.push({ x: Math.random() * W, y: -10 - Math.random() * H * 0.4, vx: 0, vy: 0, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 8, col: pick(CANDY), s: 4 + Math.random() * 3, life: 0, max: 5 + Math.random() * 2, burst: false, ph: Math.random() * TAU, shape: Math.random() < 0.7 ? 1 : 2 })
    }
  }
  function plantFlower(x: number) {
    if (planted.length > 40) planted.shift()
    const y = groundAt(x) + 6 + Math.random() * Math.max(4, (H - groundY) * 0.4)
    planted.push({ x, y, h: 14 + Math.random() * 20, c: pick(BLOOM), born: now, ph: Math.random() * TAU, kind: (Math.random() * 3) | 0, s: 1 + Math.random() * 0.5, appear: 0 })
  }
  function popAt(x: number, y: number, n: number, col?: string) {
    rings.push({ x, y, life: 0, col: col ?? '#ffffff' })
    for (let i = 0; i < n; i++) spawnBit(x, y, true)
  }

  // ---------- drawing helpers ----------
  function drawFlower(f: Flower, g0: number, t: number) {
    const c = ctx!
    if (g0 <= 0) return
    const g = easeOut(g0)
    const lean = Math.sin(t * 1.6 + f.ph) * 0.08 + wind * 0.12
    const h = f.h * g
    const tx = f.x + Math.sin(lean) * h, ty = f.y - Math.cos(lean) * h
    c.strokeStyle = '#2f7d2a'; c.lineWidth = 2
    c.beginPath(); c.moveTo(f.x, f.y); c.quadraticCurveTo(f.x, f.y - h * 0.5, tx, ty); c.stroke()
    const r = 3.6 * f.s * smooth(0.45, 1, g0)
    if (r <= 0.2) return
    c.lineWidth = 1.4; c.strokeStyle = INK; c.fillStyle = f.c
    if (f.kind === 0) {
      for (let i = 0; i < 5; i++) {
        const a = (i * TAU) / 5 + t * 0.3 + f.ph
        c.beginPath(); c.arc(tx + Math.cos(a) * r, ty + Math.sin(a) * r, r * 0.78, 0, TAU); c.fill(); c.stroke()
      }
      c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(tx, ty, r * 0.55, 0, TAU); c.fill(); c.stroke()
    } else if (f.kind === 1) {
      c.beginPath()
      c.moveTo(tx - r * 1.1, ty - r * 0.2)
      c.lineTo(tx - r * 0.6, ty - r * 1.5); c.lineTo(tx, ty - r * 0.7); c.lineTo(tx + r * 0.6, ty - r * 1.5); c.lineTo(tx + r * 1.1, ty - r * 0.2)
      c.quadraticCurveTo(tx, ty + r * 1.3, tx - r * 1.1, ty - r * 0.2)
      c.fill(); c.stroke()
    } else {
      c.beginPath(); c.arc(tx, ty, r * 1.15, 0, TAU); c.fill(); c.stroke()
      c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.arc(tx - r * 0.38, ty - r * 0.38, r * 0.36, 0, TAU); c.fill()
    }
  }

  function drawButterfly(b: Butterfly) {
    const c = ctx!
    const flap = Math.abs(Math.cos(b.flap))
    c.save(); c.translate(b.x, b.y); c.rotate(Math.max(-0.5, Math.min(0.5, b.vx * 0.004)))
    c.lineWidth = 1.4; c.strokeStyle = INK
    const s = b.s
    for (const side of [-1, 1]) {
      c.save(); c.scale(side * (0.25 + 0.75 * flap), 1)
      c.fillStyle = b.c[0]
      c.beginPath(); c.ellipse(5.5 * s, -4 * s, 6.5 * s, 5 * s, -0.5, 0, TAU); c.fill(); c.stroke()
      c.fillStyle = b.c[1]
      c.beginPath(); c.ellipse(4 * s, 3.2 * s, 4.4 * s, 3.4 * s, 0.5, 0, TAU); c.fill(); c.stroke()
      c.restore()
    }
    c.strokeStyle = INK; c.lineWidth = 2.4 * s
    c.beginPath(); c.moveTo(0, -5 * s); c.lineTo(0, 6 * s); c.stroke()
    c.lineWidth = 1
    c.beginPath(); c.moveTo(0, -5 * s); c.quadraticCurveTo(-2 * s, -10 * s, -4 * s, -11 * s); c.moveTo(0, -5 * s); c.quadraticCurveTo(2 * s, -10 * s, 4 * s, -11 * s); c.stroke()
    c.restore()
  }

  function updateButterflies(dt: number, t: number) {
    const want = P < 2.4 ? 0 : Math.min(6, Math.round((P - 2.4) * 1.7))
    const active = bflies.filter((b) => !b.leaving)
    if (active.length < want && Math.random() < dt * 1.5) {
      const left = Math.random() < 0.5
      bflies.push({ x: left ? -20 : W + 20, y: groundY * (0.2 + Math.random() * 0.5), vx: 0, vy: 0, tx: 0, ty: 0, retarget: 0, c: pick(BFLY), flap: Math.random() * TAU, s: 0.85 + Math.random() * 0.5, leaving: false })
    } else if (active.length > want) {
      active[0].leaving = true
    }
    for (let i = bflies.length - 1; i >= 0; i--) {
      const b = bflies[i]
      if (b.leaving) { b.tx = b.x < W / 2 ? -80 : W + 80; b.ty = b.y - 40 }
      else if (t > b.retarget || Math.hypot(b.tx - b.x, b.ty - b.y) < 12) {
        if (tips.length && Math.random() < 0.6) { const k = ((Math.random() * tips.length) / 2 | 0) * 2; b.tx = tips[k]; b.ty = tips[k + 1] - 6 }
        else if (Math.random() < 0.5) { const m = meadow[(Math.random() * meadow.length) | 0]; b.tx = m ? m.x : W / 2; b.ty = m ? m.y - m.h - 6 : groundY - 30 }
        else { b.tx = W * (0.1 + Math.random() * 0.8); b.ty = groundY * (0.15 + Math.random() * 0.6) }
        b.retarget = t + 2 + Math.random() * 3
      }
      let ax = (b.tx - b.x) * 1.4, ay = (b.ty - b.y) * 1.4
      ax += Math.sin(t * 3 + b.flap) * 60; ay += Math.cos(t * 2.3 + b.flap * 1.3) * 80
      const dx = b.x - pointer.x, dy = b.y - pointer.y, dd = Math.hypot(dx, dy)
      if (pointer.active && dd < 90) { ax += (dx / dd) * 900; ay += (dy / dd) * 900 }
      ax += wind * 40
      b.vx += ax * dt; b.vy += ay * dt
      const sp = Math.hypot(b.vx, b.vy), mx = b.leaving ? 140 : 95
      if (sp > mx) { b.vx *= mx / sp; b.vy *= mx / sp }
      b.x += b.vx * dt; b.y += b.vy * dt
      b.flap += dt * (16 + sp * 0.05)
      if (b.leaving && (b.x < -60 || b.x > W + 60)) bflies.splice(i, 1)
    }
  }

  /** The ink drop, standing on its tip-less bottom at (x, y). `sq` squashes (+) or stretches (−). */
  function drawDrop(x: number, y: number, size: number, sq: number, happy: boolean) {
    const c = ctx!
    const s = size / 100
    c.save(); c.translate(x, y); c.scale(1 + sq, 1 - sq); c.translate(-50 * s, -96 * s); c.scale(s, s)
    const body = new Path2D('M50 6 C60 28 82 44 82 64 A32 30 0 0 1 18 64 C18 44 40 28 50 6 Z')
    c.save(); c.translate(BOIL[boil][0] / s, BOIL[boil][1] / s); c.lineWidth = 7; c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke(body); c.restore()
    const g = c.createRadialGradient(36, 40, 2, 44, 52, 62)
    g.addColorStop(0, '#efe6ff'); g.addColorStop(0.5, '#a77bf2'); g.addColorStop(1, '#5a2fb2')
    c.fillStyle = g; c.fill(body)
    c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.ellipse(35, 46, 6, 11, 0.5, 0, TAU); c.fill()
    c.strokeStyle = '#2a1650'; c.fillStyle = '#2a1650'; c.lineWidth = 3.4; c.lineCap = 'round'
    if (happy) {
      c.beginPath(); c.arc(40, 68, 4.5, Math.PI * 1.1, Math.PI * 1.9); c.stroke()
      c.beginPath(); c.arc(60, 68, 4.5, Math.PI * 1.1, Math.PI * 1.9); c.stroke()
      c.beginPath(); c.arc(50, 74, 6, 0.15 * Math.PI, 0.85 * Math.PI); c.fill()
    } else {
      c.beginPath(); c.arc(40, 66, 3.6, 0, TAU); c.fill(); c.beginPath(); c.arc(60, 66, 3.6, 0, TAU); c.fill()
      c.beginPath(); c.arc(50, 72, 4.5, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke()
    }
    c.fillStyle = 'rgba(255,143,196,.75)'
    c.beginPath(); c.ellipse(31, 75, 5.5, 3.2, 0, 0, TAU); c.fill(); c.beginPath(); c.ellipse(69, 75, 5.5, 3.2, 0, 0, TAU); c.fill()
    c.restore()
  }

  // ---------- scene ----------
  function skyColors(t: number): [string, string] {
    if (!theme.cycle) return theme.sky
    // 365: the sky turns slowly through all six colours
    const names = ['violet', 'pink', 'orange', 'yellow', 'lime', 'sky'] // hue order, so neighbours blend clean
    const k = (t * 0.12) % names.length
    const a = SKIES[names[Math.floor(k)]], b = SKIES[names[(Math.floor(k) + 1) % names.length]]
    const f = smooth(0, 1, k % 1)
    return [mix(a[0], b[0], f), mix(a[1], b[1], f)]
  }
  function drawSky(t: number) {
    const c = ctx!
    const [top, bottom] = skyColors(t)
    const g = c.createLinearGradient(0, 0, 0, groundY)
    g.addColorStop(0, bottom); g.addColorStop(1, top)
    c.fillStyle = g; c.fillRect(0, 0, W, H)
    // two soft riso washes drifting
    for (const [fx, fy, fr, al] of [[0.2 + Math.sin(t * 0.07) * 0.05, 0.25, 0.45, 0.22], [0.85 + Math.sin(t * 0.05 + 2) * 0.04, 0.55, 0.4, 0.18]] as const) {
      const R = Math.max(W, H) * fr
      const rg = c.createRadialGradient(fx * W, fy * H, 0, fx * W, fy * H, R)
      rg.addColorStop(0, `rgba(255,255,255,${al})`); rg.addColorStop(1, 'rgba(255,255,255,0)')
      c.fillStyle = rg; c.fillRect(0, 0, W, H)
    }
    // clouds: white puffs
    for (const cl of clouds) {
      cl.x += cl.sp * 0.016 * (1 + wind * 0.5)
      if (cl.x > W + 80) cl.x = -80
      const s = cl.s * Math.max(0.8, W / 500)
      c.fillStyle = 'rgba(255,255,255,.85)'
      c.beginPath()
      c.arc(cl.x, cl.y, 16 * s, 0, TAU); c.arc(cl.x + 18 * s, cl.y - 8 * s, 20 * s, 0, TAU); c.arc(cl.x + 38 * s, cl.y, 15 * s, 0, TAU)
      c.rect(cl.x, cl.y - 2 * s, 38 * s, 16 * s)
      c.fill()
    }
    // the jelly sun, smiling with its eyes shut
    const sx = W * 0.84, sy = Math.min(H * 0.17, 120), sr = 18 + 10 * smooth(0, 4, P)
    c.save(); c.translate(sx, sy); c.rotate(t * 0.15)
    c.fillStyle = '#ffe680'
    for (let i = 0; i < 10; i++) {
      c.save(); c.rotate((i * TAU) / 10)
      c.beginPath(); c.roundRect(sr + 6, -3.5, 12, 7, 3.5); c.fill(); c.restore()
    }
    c.restore()
    c.save(); c.translate(BOIL[boil][0], BOIL[boil][1]); c.fillStyle = INK; c.beginPath(); c.arc(sx, sy, sr + 2.2, 0, TAU); c.fill(); c.restore()
    const sg = c.createRadialGradient(sx - sr * 0.35, sy - sr * 0.4, 1, sx, sy, sr)
    sg.addColorStop(0, '#fff7c9'); sg.addColorStop(0.55, '#ffd43a'); sg.addColorStop(1, '#f0a800')
    c.fillStyle = sg; c.beginPath(); c.arc(sx, sy, sr, 0, TAU); c.fill()
    c.strokeStyle = INK; c.lineWidth = 2.2; c.lineCap = 'round'
    c.beginPath(); c.arc(sx - sr * 0.33, sy, sr * 0.16, Math.PI * 1.1, Math.PI * 1.9); c.stroke()
    c.beginPath(); c.arc(sx + sr * 0.33, sy, sr * 0.16, Math.PI * 1.1, Math.PI * 1.9); c.stroke()
    c.beginPath(); c.arc(sx, sy + sr * 0.22, sr * 0.2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke()
  }

  function drawRainbow() {
    if (!has('rainbow') || finaleT0 < 0) return
    const c = ctx!
    const k = reduceMotion ? 1 : easeOut(clamp01((now - finaleT0 - 0.3) / 1.8))
    if (k <= 0) return
    const R = Math.min(W * 0.62, groundY * 0.8)
    const bands = ['#ff5fa8', '#ff7a2f', '#ffd23f', '#93d94e', '#33b6ff', '#7b4dff']
    const bw = Math.max(7, R * 0.045)
    c.save(); c.lineCap = 'round'; c.globalAlpha = 0.9
    bands.forEach((col, i) => {
      const r = R - i * bw
      c.strokeStyle = col; c.lineWidth = bw + 0.6
      c.beginPath(); c.arc(cx, groundY + 4, r, Math.PI, Math.PI + Math.PI * k); c.stroke()
    })
    c.restore()
  }

  function drawGround() {
    const c = ctx!
    const edge = new Path2D()
    edge.moveTo(-20, groundAt(0))
    for (let x = 0; x <= W + 20; x += 8) edge.lineTo(x, groundAt(x))
    const fill = new Path2D(edge)
    fill.lineTo(W + 20, H + 20); fill.lineTo(-20, H + 20); fill.closePath()
    // a back hill, lighter, for depth
    c.fillStyle = 'rgba(255,255,255,.28)'
    c.beginPath(); c.ellipse(W * 0.2, groundY + 6, W * 0.45, 40, 0, Math.PI, TAU); c.ellipse(W * 0.82, groundY + 4, W * 0.4, 30, 0, Math.PI, TAU); c.fill()
    const g = c.createLinearGradient(0, groundY - 10, 0, H)
    g.addColorStop(0, theme.name === 'lime' && !theme.cycle ? '#5fb52f' : '#9ee05a'); g.addColorStop(1, theme.name === 'lime' && !theme.cycle ? '#3f8f22' : '#6cc23a')
    c.fillStyle = g; c.fill(fill)
    c.save(); c.translate(BOIL[boil][0], BOIL[boil][1]); c.strokeStyle = INK; c.lineWidth = 3; c.lineJoin = 'round'; c.stroke(edge); c.restore()
  }

  function drawSeed(t: number) {
    const c = ctx!
    const vis = 1 - smooth(0.8, 1.5, P)
    if (vis <= 0) return
    const crack = smooth(0.35, 1, P)
    const wob = Math.sin(t * 3) * 0.08 * (0.3 + crack)
    const sx = cx, sy = groundY + 16
    c.save(); c.globalAlpha = vis; c.translate(sx, sy); c.rotate(-0.3 + wob)
    const pulse = 1 + Math.sin(t * 2) * 0.04
    const gl = c.createRadialGradient(0, 0, 0, 0, 0, 38)
    gl.addColorStop(0, 'rgba(255,230,128,.7)'); gl.addColorStop(1, 'rgba(255,230,128,0)')
    c.fillStyle = gl; c.beginPath(); c.arc(0, 0, 38 * pulse, 0, TAU); c.fill()
    c.fillStyle = INK; c.beginPath(); c.ellipse(BOIL[boil][0], BOIL[boil][1], 13 * pulse + 2, 8.5 * pulse + 2, 0, 0, TAU); c.fill()
    const sg = c.createRadialGradient(-4, -3, 1, 0, 0, 13)
    sg.addColorStop(0, '#f2b77a'); sg.addColorStop(1, '#a8622c')
    c.fillStyle = sg; c.beginPath(); c.ellipse(0, 0, 13 * pulse, 8.5 * pulse, 0, 0, TAU); c.fill()
    c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(-4, -3.5, 4, 2, -0.2, 0, TAU); c.fill()
    if (crack > 0) {
      c.strokeStyle = INK; c.lineWidth = 1.8
      c.beginPath(); c.moveTo(-7, -1); c.lineTo(-2, 2 * crack); c.lineTo(2, -2 * crack); c.lineTo(7 * crack, 1); c.stroke()
      c.strokeStyle = '#4cae3c'; c.lineWidth = 3
      c.beginPath(); c.moveTo(2, -6); c.quadraticCurveTo(4, -13 * crack, 1, -18 * crack); c.stroke()
    }
    c.restore()
  }

  /** The drop falls from the sky onto the seed, and splashes. */
  function drawIntro() {
    if (splashed) return
    const k = (now - introT0) / 0.6
    if (k < 0) return
    const y = lerp(-70, groundY + 8, k * k)
    if (k >= 1) {
      splashed = true
      rings.push({ x: cx, y: groundY + 6, life: 0, col: '#ffffff' })
      for (let i = 0; i < 16; i++) spawnBit(cx, groundY + 4, true, 3, pick(['#a77bf2', '#c7b3ff', '#7b4dff', '#e8dbff']))
      return
    }
    drawDrop(cx, y, 44, -0.18 * k, false) // stretched as it falls
  }

  /** On arrival the drop pops up beside the tree and cheers, hopping now and then. */
  function drawMascot() {
    if (finaleT0 < 0) return
    const k = reduceMotion ? 1 : clamp01((now - finaleT0 - 0.4) / 0.9)
    if (k <= 0) return
    const mx = Math.min(W - 34, Math.max(34, cx + Math.max(TL * 1.75, 92)))
    const base = groundAt(mx) + 4
    const e = elastic(k)
    let y = base + (1 - e) * 60, sq = 0
    if (!reduceMotion && k >= 1) {
      const h = ((now - finaleT0) % 1.6) / 1.6 // a hop every 1.6 s
      if (h < 0.12) sq = 0.12 * Math.sin((h / 0.12) * Math.PI) // crouch
      else if (h < 0.5) { const j = (h - 0.12) / 0.38; y -= Math.sin(j * Math.PI) * 26; sq = -0.08 * Math.sin(j * Math.PI) }
      else if (h < 0.6) sq = 0.1 * Math.sin(((h - 0.5) / 0.1) * Math.PI) // land
    }
    const size = Math.max(54, Math.min(84, W * 0.14))
    // its shadow
    const c = ctx!
    c.fillStyle = 'rgba(29,22,37,.18)'; c.beginPath(); c.ellipse(mx, base, size * 0.3 * (1 - (base - y) / 80), 4, 0, 0, TAU); c.fill()
    c.save(); c.beginPath(); c.rect(0, 0, W, base + 2); c.clip() // rises out of the ground
    drawDrop(mx, y, size, sq, true)
    c.restore()
  }

  function updateBalloons(dt: number, t: number) {
    if (!has('balloons') || finaleT0 < 0 || reduceMotion) return
    const want = Math.min(9, Math.floor((now - finaleT0) * 4))
    if (balloons.length < want || (balloons.length < 7 && Math.random() < dt * 0.6)) {
      balloons.push({ x: W * (0.08 + Math.random() * 0.84), y: H + 30, vy: 38 + Math.random() * 34, ph: Math.random() * TAU, c: pick(CANDY), s: 0.85 + Math.random() * 0.45, pop: -1 })
    }
    const c = ctx!
    for (let i = balloons.length - 1; i >= 0; i--) {
      const b = balloons[i]
      b.y -= b.vy * dt; b.x += (Math.sin(t * 1.3 + b.ph) * 14 + wind * 30) * dt
      if (b.y < -60) { balloons.splice(i, 1); continue }
      const r = 17 * b.s
      // string
      c.strokeStyle = INK; c.lineWidth = 1.3
      c.beginPath(); c.moveTo(b.x, b.y + r * 1.2)
      c.bezierCurveTo(b.x + Math.sin(t * 3 + b.ph) * 6, b.y + r * 2, b.x - Math.sin(t * 2 + b.ph) * 6, b.y + r * 2.8, b.x, b.y + r * 3.6); c.stroke()
      c.fillStyle = INK; c.beginPath(); c.ellipse(b.x + BOIL[boil][0], b.y + BOIL[boil][1], r + 2, r * 1.2 + 2, 0, 0, TAU); c.fill()
      c.fillStyle = b.c; c.beginPath(); c.ellipse(b.x, b.y, r, r * 1.2, 0, 0, TAU); c.fill()
      c.beginPath(); c.moveTo(b.x - 3, b.y + r * 1.2 + 4); c.lineTo(b.x + 3, b.y + r * 1.2 + 4); c.lineTo(b.x, b.y + r * 1.15); c.fill()
      c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.ellipse(b.x - r * 0.38, b.y - r * 0.45, r * 0.22, r * 0.34, -0.4, 0, TAU); c.fill()
    }
  }

  function updateFireworks(dt: number) {
    if (!has('fireworks') || finaleT0 < 0 || reduceMotion) return
    const c = ctx!
    if (now >= nextRocket) {
      rockets.push({ x: W * (0.15 + Math.random() * 0.7), y: groundY, ty: H * (0.1 + Math.random() * 0.28), vy: -(H * 0.9), c: pick(CANDY), trail: [] })
      const since = now - finaleT0
      nextRocket = now + (since < 4 ? 0.45 + Math.random() * 0.4 : 2 + Math.random() * 1.5)
    }
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i]
      r.y += r.vy * dt; r.vy *= Math.pow(0.35, dt)
      r.trail.push(r.x, r.y); if (r.trail.length > 16) r.trail.splice(0, 2)
      c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 2.5; c.lineCap = 'round'
      c.beginPath(); for (let k = 0; k < r.trail.length; k += 2) (k ? c.lineTo : c.moveTo).call(c, r.trail[k], r.trail[k + 1]); c.stroke()
      if (r.y <= r.ty) {
        rockets.splice(i, 1)
        rings.push({ x: r.x, y: r.y, life: 0, col: '#ffffff' })
        const n = 46
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU + Math.random() * 0.1, sp = 120 + Math.random() * 90
          sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, c: Math.random() < 0.25 ? '#ffffff' : r.c, life: 0, max: 1.1 + Math.random() * 0.5 })
        }
        if (sparks.length > 600) sparks.splice(0, sparks.length - 600)
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.life += dt
      if (s.life > s.max) { sparks.splice(i, 1); continue }
      s.vx *= Math.pow(0.3, dt); s.vy = s.vy * Math.pow(0.3, dt) + 90 * dt
      s.x += s.vx * dt; s.y += s.vy * dt
      const a = 1 - s.life / s.max
      c.globalAlpha = a
      c.fillStyle = INK; c.beginPath(); c.arc(s.x + 0.8, s.y + 0.8, 3.4 * a + 1.2, 0, TAU); c.fill()
      c.fillStyle = s.c; c.beginPath(); c.arc(s.x, s.y, 3 * a + 1, 0, TAU); c.fill()
      c.globalAlpha = 1
    }
  }

  function drawLife(dt: number, t: number) {
    const c = ctx!
    // pollen
    const moteVis = smooth(2.4, 4.5, P)
    if (moteVis > 0) {
      for (const m of motes) {
        const v = smooth(m.appear, m.appear + 0.6, P); if (v <= 0) continue
        m.y -= m.sp * dt; m.x += (Math.sin(t * 0.8 + m.ph) * 10 + wind * 20) * dt
        if (m.y < -10) { m.y = groundY - 10; m.x = Math.random() * W }
        const tw = 0.5 + 0.5 * Math.sin(t * 2.5 + m.ph)
        c.fillStyle = `rgba(255,255,255,${0.25 * v * tw})`; c.beginPath(); c.arc(m.x, m.y, m.s * 4, 0, TAU); c.fill()
        c.fillStyle = `rgba(255,250,210,${0.95 * v * tw})`; c.beginPath(); c.arc(m.x, m.y, m.s * 1.2, 0, TAU); c.fill()
      }
    }
    // falling petals; the blossom finale is a storm
    const storm = has('blossom') && finaleT0 >= 0 && !reduceMotion ? Math.max(0, 1 - (now - finaleT0) / 7) : 0
    const rate = (P > 4.2 ? (P - 4.2) * 5 : 0) + storm * 60
    if (Math.random() < rate * dt) {
      if (storm > 0 && Math.random() < 0.7) {
        if (bits.length > 320) bits.shift()
        bits.push({ x: -10, y: Math.random() * groundY * 0.9, vx: 0, vy: 0, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 6, col: pick(PAL.cherry), s: 3.5 + Math.random() * 3, life: 0, max: 6, burst: false, ph: Math.random() * TAU, shape: 0 })
      } else if (tips.length) { const k = ((Math.random() * tips.length) / 2 | 0) * 2; spawnBit(tips[k], tips[k + 1], false) }
    }
    if (storm > 0) gust = Math.max(gust, 1.2 * storm)
    for (let i = bits.length - 1; i >= 0; i--) {
      const p = bits[i]; p.life += dt
      if (p.burst) { p.vy += 300 * dt; p.vx *= Math.pow(0.25, dt); p.vy *= Math.pow(0.55, dt) }
      else { p.vy = (p.shape === 1 || p.shape === 2 ? 60 : 22) + Math.sin(p.life * 2 + p.ph) * 10; p.vx = Math.sin(p.life * 1.6 + p.ph) * 26 + wind * 50 }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt
      const floor = groundAt(p.x) + 2
      if (!p.burst && p.y > floor) { p.y = floor; p.vx = 0; p.vr = 0 }
      const a = 1 - smooth(p.max * 0.7, p.max, p.life)
      if (p.life > p.max || p.x > W + 40) { bits.splice(i, 1); continue }
      c.save(); c.globalAlpha = a; c.translate(p.x, p.y); c.rotate(p.rot)
      c.fillStyle = p.col; c.strokeStyle = INK; c.lineWidth = 1.1
      if (p.shape === 1) { c.scale(Math.cos(p.life * 7 + p.ph), 1); c.beginPath(); c.roundRect(-p.s, -p.s * 0.45, p.s * 2, p.s * 0.9, 1.5); c.fill(); c.stroke() }
      else if (p.shape === 2) { c.beginPath(); c.arc(0, 0, p.s * 0.7, 0, TAU); c.fill(); c.stroke() }
      else if (p.shape === 3) { c.beginPath(); c.arc(0, 0, p.s * 0.6, 0, TAU); c.fill() }
      else { c.beginPath(); c.ellipse(0, 0, p.s, p.s * 0.58, 0, 0, TAU); c.fill(); c.stroke() }
      c.restore()
    }
    updateButterflies(dt, t)
    for (const b of bflies) drawButterfly(b)
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.life += dt
      if (r.life > 0.8) { rings.splice(i, 1); continue }
      const k = r.life / 0.8
      c.strokeStyle = r.col; c.globalAlpha = 1 - k; c.lineWidth = 4 * (1 - k) + 1
      c.beginPath(); c.arc(r.x, r.y, 8 + easeOut(k) * 60, 0, TAU); c.stroke()
      c.globalAlpha = 1
    }
  }

  // ---------- pointer: tap plants a flower, shakes the tree or pops a balloon; a swipe is wind ----------
  function localXY(e: PointerEvent): [number, number] { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
  function touch() { if (!touched) { touched = true; opts.onFirstTouch?.() } }
  const onDown = (e: PointerEvent) => {
    const [x, y] = localXY(e)
    Object.assign(pointer, { x, y, active: true, lastX: x, downX: x, downY: y, downT: now, moved: 0 })
  }
  const onMove = (e: PointerEvent) => {
    const [x, y] = localXY(e)
    const dx = x - pointer.lastX
    if (pointer.active || e.pointerType === 'mouse') pointer.moved += Math.abs(dx) + Math.abs(y - pointer.y)
    gust = Math.max(-2.6, Math.min(2.6, gust + (dx / W) * (e.pointerType === 'mouse' ? 3 : 7)))
    Object.assign(pointer, { x, y, lastX: x, active: true })
    if (pointer.moved > 30) touch()
  }
  const onUp = (e: PointerEvent) => {
    const [x, y] = localXY(e)
    if (pointer.moved < 12 && now - pointer.downT < 0.6) {
      touch()
      const hit = balloons.findIndex((b) => Math.hypot(b.x - x, b.y - y) < 26 * b.s)
      if (hit >= 0) {
        const b = balloons[hit]; balloons.splice(hit, 1)
        rings.push({ x: b.x, y: b.y, life: 0, col: '#ffffff' })
        for (let i = 0; i < 26; i++) spawnBit(b.x, b.y, true, Math.random() < 0.6 ? 1 : 2, Math.random() < 0.5 ? b.c : undefined)
      } else {
        popAt(x, y, 22)
        if (y > groundY - 50) plantFlower(Math.max(6, Math.min(W - 6, x)))
        else {
          gust += (x < cx ? 1 : -1) * 1.3
          for (let i = 0; i < tips.length && i < 400; i += 2) {
            if (Math.hypot(tips[i] - x, tips[i + 1] - y) < 60 && Math.random() < 0.5) spawnBit(tips[i], tips[i + 1], false)
          }
        }
      }
    }
    if (e.pointerType !== 'mouse') pointer.active = false
  }
  const onLeave = () => { pointer.active = false }
  cv.addEventListener('pointerdown', onDown)
  cv.addEventListener('pointermove', onMove)
  cv.addEventListener('pointerup', onUp)
  cv.addEventListener('pointerleave', onLeave)

  // ---------- the loop ----------
  function frame(ms: number) {
    const dt = Math.min(0.05, (ms - last) / 1000); last = ms; now += dt
    const t = now
    boil = reduceMotion ? 0 : Math.floor(now * 5) % 3

    if (grow) {
      const k = clamp01((now - grow.t0) / grow.dur)
      P = lerp(grow.from, grow.to, k * k * (3 - 2 * k))
      opts.onProgress?.(k, P)
      if (k >= 1) { P = grow.to; grow = null; opts.onArrive?.() }
    }

    gust *= Math.exp(-dt * 1.4)
    wind = (reduceMotion ? 0 : Math.sin(t * 0.5) * 0.22 + Math.sin(t * 0.17 + 2) * 0.18) + gust

    const c = ctx!
    c.clearRect(0, 0, W, H)
    drawSky(t)
    drawRainbow()

    // companion trees (behind)
    for (const co of COMPANIONS) {
      const g = clamp01((P - co.appear) / 1.7)
      if (g <= 0) continue
      const gg = Math.pow(g, 0.8)
      const tl = TL * co.size * (0.35 + 0.65 * gg)
      renderTree(co.tree, W * co.fx, groundAt(W * co.fx) - co.back * (H / 700) + 6, tl, 0.12 + 0.88 * gg, PAL[co.pal], { t: t + co.fx * 9, wind: wind * 0.8, bloom: co.pal === 'cherry' ? 0.3 * g : 0 })
    }

    drawGround()

    // roots, faint under the grass
    const rg = smooth(0.7, 5, P)
    if (rg > 0) {
      c.save(); c.beginPath(); c.rect(0, groundY + 3, W, H); c.clip()
      c.globalAlpha = 0.22
      renderTree(ROOTS, cx, groundY + 2, TL * 0.55 * (0.3 + 0.7 * rg), rg, PAL.green, { t, wind: 0, baseAng: Math.PI, noLeaves: true, rootStyle: INK })
      c.restore(); c.globalAlpha = 1
    }
    drawSeed(t)

    // meadow + grass
    c.lineCap = 'round'
    for (const gr of grass) {
      const v = smooth(gr.appear, gr.appear + 0.6, P); if (v <= 0) continue
      const l = gr.h * v, sw = Math.sin(t * 1.8 + gr.ph) * 2 + wind * 3
      c.strokeStyle = '#3f9a36'; c.lineWidth = 1.8
      c.beginPath()
      c.moveTo(gr.x, gr.y); c.quadraticCurveTo(gr.x - 2, gr.y - l * 0.6, gr.x - 3 + sw, gr.y - l)
      c.moveTo(gr.x, gr.y); c.quadraticCurveTo(gr.x + 1, gr.y - l * 0.7, gr.x + 3 + sw, gr.y - l * 0.8)
      c.stroke()
    }
    for (const f of meadow) drawFlower(f, smooth(f.appear, f.appear + 0.5, P), t)
    for (const f of planted) drawFlower(f, clamp01((now - f.born) / 1.2), t)

    // the central tree
    const u = clamp01((P - 0.6) / 5.4)
    const g = Math.min(1, Math.pow(u, 0.8))
    if (g > 0) {
      const tl = TL * (0.3 + 0.7 * Math.pow(u, 1.15))
      tips = []
      renderTree(CENTRAL, cx, groundY, tl, g, PAL.green, { t, wind, tips, bloom: 0.32 * smooth(3.6, 5.2, P), warm: 0.35 * smooth(5, 6, P) })
    } else tips = []

    drawMascot()
    updateBalloons(dt, t)
    drawLife(dt, t)
    updateFireworks(dt)
    drawIntro()

    const si = stageIndex(P)
    if (si !== shownStage) {
      // a new stage while growing: a pop at the crown
      if (shownStage >= 0 && grow && !reduceMotion) {
        let top = 0
        for (let i = 1; i < tips.length; i += 2) if (tips[i] < tips[top + 1]) top = i - 1
        const x = tips.length ? tips[top] : cx, y = tips.length ? tips[top + 1] : groundY - 20
        popAt(x, y, 14)
      }
      shownStage = si; opts.onStage?.(si)
    }
    raf = requestAnimationFrame(frame)
  }

  const ro = new ResizeObserver(() => resize())
  ro.observe(cv)
  resize()
  raf = requestAnimationFrame((ms) => { last = ms; frame(ms) })

  return {
    get p() { return P },
    setP(p) { grow = null; P = Math.max(0, Math.min(6, p)) },
    growTo(p, seconds) { grow = { from: P, to: Math.max(0, Math.min(6, p)), t0: now, dur: Math.max(0.01, seconds) } },
    burst() {
      finaleT0 = now
      if (reduceMotion) return
      // confetti from up to eight branch tips, and from the top of the sky
      const n = Math.min(8, tips.length / 2)
      const from = tips.length ? tips : [cx, groundY - 24]
      for (let i = 0; i < Math.max(1, n); i++) {
        const k = ((Math.random() * from.length) / 2 | 0) * 2
        popAt(from[k], from[k + 1], 16)
      }
      rainConfetti(90)
      gust += 1.2
      if (has('fireworks')) nextRocket = now + 0.3
    },
    destroy() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      cv.removeEventListener('pointerdown', onDown)
      cv.removeEventListener('pointermove', onMove)
      cv.removeEventListener('pointerup', onUp)
      cv.removeEventListener('pointerleave', onLeave)
    },
  }
}
