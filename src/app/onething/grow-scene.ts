// The payoff scene: a hand-drawn plant growing from a seed to old growth, on
// canvas. Ported from Bart's "onething — grow a year" sketch (2026-09-22).
// This module only draws. The HUD, the copy and the buttons are React
// (Payoff.tsx), which drives it through the Scene handle.
//
// Growth is one number P in [0, 6]: the level index plus the fraction of the
// way to the next level, so a Sapling at 60% is a sapling well on its way to
// a tree. Companion trees, a meadow, pollen and butterflies arrive at fixed
// points along the way; petals fall from P 4.2 on and the leaves warm from 5.
//
// Colours come from the `.ot` tokens on the canvas's ancestors, so the scene
// sits on the same paper as the page.

export type Scene = {
  /** Jump straight to a growth value. */
  setP(p: number): void
  /** Grow (or shrink) to `p` over `seconds`; `onProgress` ticks, `onArrive` fires once at the end. */
  growTo(p: number, seconds: number): void
  /** Petals and rings from the branch tips — the moment of arrival. */
  burst(): void
  readonly p: number
  destroy(): void
}

export type SceneOpts = {
  reduceMotion?: boolean
  /** While a growTo runs: the fraction done (0..1) and the current P. */
  onProgress?: (fraction: number, p: number) => void
  onArrive?: () => void
  /** The level index (0..6) the scene is showing changed. */
  onStage?: (index: number) => void
  /** The first tap or swipe on the canvas (to hide the hint). */
  onFirstTouch?: () => void
}

type Leaf = { da: number; dist: number; s: number; ci: number; ph: number; warm: number }
type Branch = { depth: number; len: number; ang: number; phase: number; bend: number; kids: Branch[]; bloom: number; bc: number; leaves: Leaf[] }
type Tree = { root: Branch; maxDepth: number }
type Flower = { x: number; y: number; h: number; c: string; ph: number; kind: number; s: number; appear: number; born: number }
type Blade = { x: number; y: number; h: number; appear: number; ph: number }
type Mote = { x: number; y: number; sp: number; ph: number; s: number; appear: number }
type Petal = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; col: string; s: number; life: number; max: number; burst: boolean; ph: number }
type Ring = { x: number; y: number; life: number }
type Butterfly = { x: number; y: number; vx: number; vy: number; tx: number; ty: number; retarget: number; c: [string, string]; flap: number; s: number; leaving: boolean }
type Pal = keyof typeof PAL
type Companion = { tree: Tree; fx: number; appear: number; size: number; pal: Pal; back: number }
type RenderOpts = { t: number; wind: number; warm?: number; bloom?: number; baseAng?: number; noLeaves?: boolean; rootStyle?: string; trunk?: string; tips?: number[] }
type Colors = { ink: string; muted: string; rust: string; outline: string; trunk: string; soil: string; hatch: string; paper: string; hatchPat: CanvasPattern | null }

const PAL = {
  green: ['#2f7d4f', '#4fa35a', '#7cc36a', '#a9d86e', '#3c9a78'],
  autumn: ['#f4a237', '#e8743b', '#f6c945', '#d9542f', '#ffb84d'],
  cherry: ['#f48fb1', '#ec6593', '#f8bbd0', '#e2447c', '#ffd1dc'],
  amber: ['#f4a237', '#e8743b', '#f6c945', '#d9542f', '#ffb84d'],
  teal: ['#2bb3a3', '#3fc1c9', '#1f8a91', '#6fd6c1', '#48a9a6'],
  violet: ['#9b7fe6', '#7e6bd6', '#b89cf0', '#6c8ef0', '#c7a6f7'],
}
const BLOOM = ['#ff5d8f', '#ffc93c', '#ff7a59', '#fff3df', '#b388eb', '#4fc3f7']
const BFLY: [string, string][] = [['#ff8a3d', '#ffd166'], ['#3fa7f0', '#b3e5fc'], ['#ff5d8f', '#ffc1d6'], ['#9b7fe6', '#e3d6ff'], ['#ffc93c', '#fff1a8'], ['#2bb3a3', '#b8f0e6']]

const TAU = Math.PI * 2
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
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

  // ---------- colours from the page ----------
  const C: Colors = { ink: '#2a251c', muted: '#6f665a', rust: '#a8341f', outline: '#2a251c', trunk: '#7a5236', soil: 'rgba(122,82,54,.07)', hatch: 'rgba(42,37,28,.13)', paper: '#f7f1e1', hatchPat: null }
  function readColors() {
    const s = getComputedStyle(cv)
    const get = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback
    C.ink = get('--ink', C.ink); C.muted = get('--mute', C.muted); C.rust = get('--red', C.rust); C.paper = get('--paper', C.paper)
    C.outline = get('--outline', C.ink); C.trunk = get('--trunk', C.trunk); C.soil = get('--soil', C.soil); C.hatch = get('--hatch', C.hatch)
    const pc = document.createElement('canvas'); pc.width = pc.height = 7
    const p = pc.getContext('2d')
    if (p) { p.strokeStyle = C.hatch; p.lineWidth = 1.2; p.beginPath(); p.moveTo(-1, 8); p.lineTo(8, -1); p.stroke() }
    C.hatchPat = ctx!.createPattern(pc, 'repeat')
  }
  readColors()

  // ---------- scene state ----------
  let W = 0, H = 0, DPR = 1, groundY = 0, TL = 0, cx = 0
  const meadow: Flower[] = [], grass: Blade[] = [], motes: Mote[] = [], planted: Flower[] = [], parts: Petal[] = [], rings: Ring[] = [], bflies: Butterfly[] = []
  let tips: number[] = []
  let P = 0
  let grow: { from: number; to: number; t0: number; dur: number } | null = null
  let wind = 0, gust = 0
  let now = 0, last = 0, raf = 0, shownStage = -1, touched = false
  const pointer = { x: -999, y: -999, active: false, lastX: 0, downX: 0, downY: 0, downT: 0, moved: 0 }

  function layout() {
    groundY = H * 0.84
    TL = Math.min(groundY * 0.21, W * 0.2)
    cx = W * 0.5
    meadow.length = 0; grass.length = 0; motes.length = 0
    const r = mulberry32(5)
    const nM = Math.round(Math.min(60, W / 11))
    for (let i = 0; i < nM; i++) {
      let x = r() * W
      if (Math.abs(x - cx) < TL * 0.35) x += (x < cx ? -1 : 1) * TL * 0.4
      meadow.push({ x, y: groundY + 2 + r() * (H - groundY) * 0.55, h: 8 + r() * 18, c: BLOOM[(r() * BLOOM.length) | 0], appear: 1.3 + r() * 4.6, ph: r() * TAU, kind: (r() * 3) | 0, s: 0.8 + r() * 0.6, born: 0 })
    }
    meadow.sort((a, b) => a.y - b.y)
    for (let i = 0; i < Math.round(W / 14); i++) grass.push({ x: r() * W, y: groundY + 1 + r() * (H - groundY) * 0.6, h: 5 + r() * 9, appear: 0.5 + r() * 3.5, ph: r() * TAU })
    grass.sort((a, b) => a.y - b.y)
    for (let i = 0; i < 34; i++) motes.push({ x: r() * W, y: r() * groundY, sp: 6 + r() * 14, ph: r() * TAU, s: 1 + r() * 2, appear: 2.4 + r() * 3.4 })
  }
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1) // DPR 3 canvases are too large on phones
    const r = cv.getBoundingClientRect()
    W = r.width; H = r.height
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR)
    ctx!.setTransform(DPR, 0, 0, DPR, 0, 0)
    layout()
  }

  // ---------- tree rendering ----------
  function renderTree(T: Tree, ox: number, oy: number, tl: number, g: number, pal: string[], o: RenderOpts) {
    const c = ctx!
    const md = T.maxDepth, G = g * (md + 1)
    const segs: Path2D[] = []; for (let d = 0; d <= md; d++) segs.push(new Path2D())
    const leafOut = new Path2D(), leafAll = new Path2D(), fills = new Map<string, Path2D>()
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
          const rx = Rr * 0.6 * l.s, ry = Rr * 0.3 * l.s, rot = la - Math.PI / 2
          ell(leafOut, lx, ly, rx + 1.7, ry + 1.7, rot)
          const col = l.warm < warm ? PAL.autumn[l.ci] : pal[l.ci]
          let fp = fills.get(col); if (!fp) { fp = new Path2D(); fills.set(col, fp) }
          ell(fp, lx, ly, rx, ry, rot)
          ell(leafAll, lx, ly, rx, ry, rot)
        }
        if (terminal && b.bloom < bloom) {
          const fr = Math.max(2.2, tl * 0.047 * lw) * (1 + 0.08 * Math.sin(t * 1.5 + b.phase))
          const fx = x1 + Math.sin(a) * Rr * 0.3, fy = y1 - Math.cos(a) * Rr * 0.3
          const col = BLOOM[b.bc]
          let pp = pets.get(col); if (!pp) { pp = new Path2D(); pets.set(col, pp) }
          const spin = b.phase + t * 0.2
          for (let i = 0; i < 5; i++) {
            const pa2 = spin + (i * TAU) / 5
            const px = fx + Math.cos(pa2) * fr, py = fy + Math.sin(pa2) * fr
            circ(petOut, px, py, fr * 0.78 + 1.1); circ(pp, px, py, fr * 0.78)
          }
          circ(centers, fx, fy, fr * 0.5)
        }
        if (terminal && o.tips && lw > 0.6) o.tips.push(x1, y1)
      }
      for (const k of b.kids) rec(k, x1, y1, a)
    }
    rec(T.root, ox, oy, o.baseAng || 0)

    c.lineCap = 'round'; c.lineJoin = 'round'
    const ws: number[] = []; for (let d = 0; d <= md; d++) ws.push(tl * 0.13 * Math.pow(0.64, d) + 0.7)
    if (o.rootStyle) {
      c.strokeStyle = o.rootStyle
      for (let d = 0; d <= md; d++) { c.lineWidth = Math.max(0.8, ws[d] * 0.45); c.stroke(segs[d]) }
      return
    }
    c.strokeStyle = C.outline
    for (let d = 0; d <= md; d++) { c.lineWidth = ws[d] + 2.6; c.stroke(segs[d]) }
    c.strokeStyle = o.trunk || C.trunk
    for (let d = 0; d <= md; d++) { c.lineWidth = ws[d]; c.stroke(segs[d]) }
    c.fillStyle = C.outline; c.fill(leafOut)
    for (const [col, p] of fills) { c.fillStyle = col; c.fill(p) }
    if (C.hatchPat) { c.fillStyle = C.hatchPat; c.fill(leafAll) }
    if (pets.size) {
      c.fillStyle = C.outline; c.fill(petOut)
      for (const [col, p] of pets) { c.fillStyle = col; c.fill(p) }
      c.fillStyle = '#ffcf33'; c.fill(centers)
      c.lineWidth = 1; c.strokeStyle = C.outline; c.stroke(centers)
    }
  }

  // ---------- particles ----------
  function spawnPetal(x: number, y: number, burst: boolean) {
    if (parts.length > 220) parts.shift()
    const leaf = !burst && Math.random() < 0.35 + Math.max(0, P - 5) * 0.3
    const col = leaf ? PAL.autumn[(Math.random() * 5) | 0] : BLOOM[(Math.random() * BLOOM.length) | 0]
    const a = Math.random() * TAU, sp = burst ? 80 + Math.random() * 220 : 5 + Math.random() * 20
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (burst ? 60 : 0), rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 6, col, s: burst ? 3 + Math.random() * 4 : 3 + Math.random() * 3, life: 0, max: burst ? 1.4 + Math.random() * 0.8 : 5 + Math.random() * 3, burst, ph: Math.random() * TAU })
  }
  function plantFlower(x: number) {
    if (planted.length > 40) planted.shift()
    planted.push({ x, y: groundY + 2 + Math.random() * Math.max(4, (H - groundY) * 0.35), h: 14 + Math.random() * 20, c: BLOOM[(Math.random() * BLOOM.length) | 0], born: now, ph: Math.random() * TAU, kind: (Math.random() * 3) | 0, s: 1 + Math.random() * 0.5, appear: 0 })
  }

  // ---------- drawing helpers ----------
  function drawFlower(f: Flower, g0: number, t: number) {
    const c = ctx!
    if (g0 <= 0) return
    const g = easeOut(g0)
    const lean = Math.sin(t * 1.6 + f.ph) * 0.08 + wind * 0.12
    const h = f.h * g
    const tx = f.x + Math.sin(lean) * h, ty = f.y - Math.cos(lean) * h
    c.strokeStyle = '#3f8f4a'; c.lineWidth = 1.6
    c.beginPath(); c.moveTo(f.x, f.y); c.quadraticCurveTo(f.x, f.y - h * 0.5, tx, ty); c.stroke()
    if (g > 0.5) {
      c.fillStyle = '#5bb35f'
      c.beginPath(); c.ellipse(f.x + Math.sin(lean) * h * 0.4 + 4, f.y - h * 0.35, 4 * g, 1.8 * g, -0.5, 0, TAU); c.fill()
    }
    const r = 3.2 * f.s * smooth(0.45, 1, g0)
    if (r <= 0.2) return
    c.lineWidth = 1; c.strokeStyle = C.outline; c.fillStyle = f.c
    if (f.kind === 0) {
      for (let i = 0; i < 5; i++) {
        const a = (i * TAU) / 5 + t * 0.3 + f.ph
        c.beginPath(); c.arc(tx + Math.cos(a) * r, ty + Math.sin(a) * r, r * 0.75, 0, TAU); c.fill(); c.stroke()
      }
      c.fillStyle = '#ffcf33'; c.beginPath(); c.arc(tx, ty, r * 0.55, 0, TAU); c.fill(); c.stroke()
    } else if (f.kind === 1) {
      c.beginPath()
      c.moveTo(tx - r * 1.1, ty - r * 0.2)
      c.lineTo(tx - r * 0.6, ty - r * 1.5); c.lineTo(tx, ty - r * 0.7); c.lineTo(tx + r * 0.6, ty - r * 1.5); c.lineTo(tx + r * 1.1, ty - r * 0.2)
      c.quadraticCurveTo(tx, ty + r * 1.3, tx - r * 1.1, ty - r * 0.2)
      c.fill(); c.stroke()
    } else {
      c.beginPath(); c.arc(tx, ty, r * 1.1, 0, TAU); c.fill(); c.stroke()
      c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.arc(tx - r * 0.35, ty - r * 0.35, r * 0.35, 0, TAU); c.fill()
    }
  }

  function drawButterfly(b: Butterfly) {
    const c = ctx!
    const flap = Math.abs(Math.cos(b.flap))
    c.save(); c.translate(b.x, b.y); c.rotate(Math.max(-0.5, Math.min(0.5, b.vx * 0.004)))
    c.lineWidth = 1; c.strokeStyle = C.outline
    const s = b.s
    for (const side of [-1, 1]) {
      c.save(); c.scale(side * (0.25 + 0.75 * flap), 1)
      c.fillStyle = b.c[0]
      c.beginPath(); c.ellipse(5 * s, -4 * s, 6 * s, 4.5 * s, -0.5, 0, TAU); c.fill(); c.stroke()
      c.fillStyle = b.c[1]
      c.beginPath(); c.ellipse(4 * s, 3 * s, 4 * s, 3.2 * s, 0.5, 0, TAU); c.fill(); c.stroke()
      c.fillStyle = C.outline; c.beginPath(); c.arc(6 * s, -5 * s, 1.1 * s, 0, TAU); c.fill()
      c.restore()
    }
    c.strokeStyle = C.outline; c.lineWidth = 2 * s
    c.beginPath(); c.moveTo(0, -5 * s); c.lineTo(0, 6 * s); c.stroke()
    c.lineWidth = 0.8
    c.beginPath(); c.moveTo(0, -5 * s); c.quadraticCurveTo(-2 * s, -10 * s, -4 * s, -11 * s); c.moveTo(0, -5 * s); c.quadraticCurveTo(2 * s, -10 * s, 4 * s, -11 * s); c.stroke()
    c.restore()
  }

  function updateButterflies(dt: number, t: number) {
    const want = P < 2.4 ? 0 : Math.min(6, Math.round((P - 2.4) * 1.7))
    const active = bflies.filter((b) => !b.leaving)
    if (active.length < want && Math.random() < dt * 1.5) {
      const left = Math.random() < 0.5
      bflies.push({ x: left ? -20 : W + 20, y: groundY * (0.2 + Math.random() * 0.5), vx: 0, vy: 0, tx: 0, ty: 0, retarget: 0, c: BFLY[(Math.random() * BFLY.length) | 0], flap: Math.random() * TAU, s: 0.8 + Math.random() * 0.5, leaving: false })
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

  // ---------- scene ----------
  function drawSky(t: number) {
    const c = ctx!
    const k = P / 6
    const glows = [
      { x: 0.5 + Math.sin(t * 0.07) * 0.05, y: 0.35, r: 0.6, a: [255, 214, 120], b: [255, 170, 110] },
      { x: 0.18 + Math.sin(t * 0.05 + 1) * 0.04, y: 0.22, r: 0.42, a: [255, 190, 160], b: [255, 120, 170] },
      { x: 0.84 + Math.sin(t * 0.06 + 2) * 0.04, y: 0.4, r: 0.45, a: [190, 230, 170], b: [110, 210, 200] },
      { x: 0.62, y: 0.08, r: 0.35, a: [230, 210, 255], b: [170, 150, 245] },
    ]
    for (const g of glows) {
      const col = g.a.map((v, i) => Math.round(lerp(v, g.b[i], k)))
      const R0 = Math.max(W, H) * g.r
      const gr = c.createRadialGradient(g.x * W, g.y * H, 0, g.x * W, g.y * H, R0)
      const al = 0.12 + 0.26 * smooth(0, 6, P)
      gr.addColorStop(0, `rgba(${col},${al})`); gr.addColorStop(1, `rgba(${col},0)`)
      c.fillStyle = gr; c.fillRect(0, 0, W, H)
    }
    // sun
    const sx = W * 0.86, sy = Math.min(H * 0.16, 110), sr = 14 + 10 * smooth(0, 4, P)
    c.save(); c.translate(sx, sy); c.rotate(t * 0.1)
    c.strokeStyle = C.rust; c.lineWidth = 1.6; c.setLineDash([3, 5])
    c.beginPath(); c.arc(0, 0, sr + 9, 0, TAU); c.stroke(); c.setLineDash([])
    for (let i = 0; i < 10; i++) { const a = (i * TAU) / 10; c.beginPath(); c.moveTo(Math.cos(a) * (sr + 15), Math.sin(a) * (sr + 15)); c.lineTo(Math.cos(a) * (sr + 21), Math.sin(a) * (sr + 21)); c.stroke() }
    c.restore()
    c.fillStyle = '#ffcf4a'; c.strokeStyle = C.outline; c.lineWidth = 1.6
    c.beginPath(); c.arc(sx, sy, sr, 0, TAU); c.fill(); c.stroke()
    if (C.hatchPat) { c.fillStyle = C.hatchPat; c.fill() }
  }

  function drawGround() {
    const c = ctx!
    c.fillStyle = C.soil; c.fillRect(0, groundY, W, H - groundY)
    c.strokeStyle = C.ink; c.lineWidth = 2; c.setLineDash([7, 5])
    c.beginPath(); c.moveTo(0, groundY); c.lineTo(W, groundY); c.stroke(); c.setLineDash([])
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
    const gl = c.createRadialGradient(0, 0, 0, 0, 0, 34)
    gl.addColorStop(0, 'rgba(255,205,80,.45)'); gl.addColorStop(1, 'rgba(255,205,80,0)')
    c.fillStyle = gl; c.beginPath(); c.arc(0, 0, 34 * pulse, 0, TAU); c.fill()
    c.fillStyle = '#b07a45'; c.strokeStyle = C.outline; c.lineWidth = 1.8
    c.beginPath(); c.ellipse(0, 0, 11 * pulse, 7 * pulse, 0, 0, TAU); c.fill(); c.stroke()
    if (C.hatchPat) { c.fillStyle = C.hatchPat; c.fill() }
    if (crack > 0) {
      c.strokeStyle = C.outline; c.lineWidth = 1.4
      c.beginPath(); c.moveTo(-6, -1); c.lineTo(-2, 2 * crack); c.lineTo(2, -2 * crack); c.lineTo(6 * crack, 1); c.stroke()
      c.strokeStyle = '#6fbf5a'; c.lineWidth = 2.2
      c.beginPath(); c.moveTo(2, -5); c.quadraticCurveTo(4, -12 * crack, 1, -16 * crack); c.stroke()
    }
    c.restore()
  }

  function drawLife(dt: number, t: number) {
    const c = ctx!
    // pollen / fireflies
    const moteVis = smooth(2.4, 4.5, P)
    if (moteVis > 0) {
      for (const m of motes) {
        const v = smooth(m.appear, m.appear + 0.6, P); if (v <= 0) continue
        m.y -= m.sp * dt; m.x += (Math.sin(t * 0.8 + m.ph) * 10 + wind * 20) * dt
        if (m.y < -10) { m.y = groundY - 10; m.x = Math.random() * W }
        const tw = 0.5 + 0.5 * Math.sin(t * 2.5 + m.ph)
        c.fillStyle = `rgba(255,200,70,${0.18 * v * tw})`; c.beginPath(); c.arc(m.x, m.y, m.s * 4, 0, TAU); c.fill()
        c.fillStyle = `rgba(255,236,160,${0.9 * v * tw})`; c.beginPath(); c.arc(m.x, m.y, m.s, 0, TAU); c.fill()
      }
    }
    // falling petals
    const rate = P > 4.2 ? (P - 4.2) * 5 : 0
    if (tips.length && Math.random() < rate * dt) { const k = ((Math.random() * tips.length) / 2 | 0) * 2; spawnPetal(tips[k], tips[k + 1], false) }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life += dt
      if (p.burst) { p.vy += 260 * dt; p.vx *= Math.pow(0.2, dt); p.vy *= Math.pow(0.5, dt) }
      else { p.vy = 22 + Math.sin(p.life * 2 + p.ph) * 8; p.vx = Math.sin(p.life * 1.6 + p.ph) * 24 + wind * 40 }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt
      if (!p.burst && p.y > groundY - 1) { p.y = groundY - 1; p.vx = 0; p.vr = 0 }
      const a = 1 - smooth(p.max * 0.7, p.max, p.life)
      if (p.life > p.max) { parts.splice(i, 1); continue }
      c.save(); c.globalAlpha = a; c.translate(p.x, p.y); c.rotate(p.rot)
      c.fillStyle = p.col; c.strokeStyle = C.outline; c.lineWidth = 0.8
      c.beginPath(); c.ellipse(0, 0, p.s, p.s * 0.55, 0, 0, TAU); c.fill(); c.stroke()
      c.restore()
    }
    updateButterflies(dt, t)
    for (const b of bflies) drawButterfly(b)
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.life += dt
      if (r.life > 0.9) { rings.splice(i, 1); continue }
      const k = r.life / 0.9
      c.strokeStyle = C.rust; c.globalAlpha = 1 - k; c.lineWidth = 2 * (1 - k) + 0.5
      c.setLineDash([4, 4]); c.beginPath(); c.arc(r.x, r.y, 8 + k * 50, 0, TAU); c.stroke(); c.setLineDash([])
      c.globalAlpha = 1
    }
  }

  // ---------- pointer: tap plants a flower or shakes the tree, a swipe is wind ----------
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
      rings.push({ x, y, life: 0 })
      for (let i = 0; i < 22; i++) spawnPetal(x, y, true)
      if (y > groundY - 50) plantFlower(Math.max(6, Math.min(W - 6, x)))
      else {
        gust += (x < cx ? 1 : -1) * 1.3
        for (let i = 0; i < tips.length && i < 400; i += 2) {
          if (Math.hypot(tips[i] - x, tips[i + 1] - y) < 60 && Math.random() < 0.5) spawnPetal(tips[i], tips[i + 1], false)
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

    // companion trees (behind)
    for (const co of COMPANIONS) {
      const g = clamp01((P - co.appear) / 1.7)
      if (g <= 0) continue
      const gg = Math.pow(g, 0.8)
      const tl = TL * co.size * (0.35 + 0.65 * gg)
      c.globalAlpha = 0.96
      renderTree(co.tree, W * co.fx, groundY - co.back * (H / 700), tl, 0.12 + 0.88 * gg, PAL[co.pal], { t: t + co.fx * 9, wind: wind * 0.8, bloom: co.pal === 'cherry' ? 0.3 * g : 0 })
      c.globalAlpha = 1
    }

    drawGround()

    // roots
    const rg = smooth(0.7, 5, P)
    if (rg > 0) {
      c.save(); c.beginPath(); c.rect(0, groundY + 1, W, H); c.clip()
      c.globalAlpha = 0.35
      renderTree(ROOTS, cx, groundY + 2, TL * 0.55 * (0.3 + 0.7 * rg), rg, PAL.green, { t, wind: 0, baseAng: Math.PI, noLeaves: true, rootStyle: C.trunk })
      c.restore(); c.globalAlpha = 1
    }
    drawSeed(t)

    // meadow + grass
    c.lineCap = 'round'
    for (const gr of grass) {
      const v = smooth(gr.appear, gr.appear + 0.6, P); if (v <= 0) continue
      const l = gr.h * v, sw = Math.sin(t * 1.8 + gr.ph) * 2 + wind * 3
      c.strokeStyle = '#4f9a4f'; c.lineWidth = 1.3
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

    drawLife(dt, t)

    const si = stageIndex(P)
    if (si !== shownStage) { shownStage = si; opts.onStage?.(si) }
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
      // petals from up to eight branch tips, a ring on each, and a shake
      const n = Math.min(8, tips.length / 2)
      const from = tips.length ? tips : [cx, groundY - 24]
      for (let i = 0; i < Math.max(1, n); i++) {
        const k = ((Math.random() * from.length) / 2 | 0) * 2
        rings.push({ x: from[k], y: from[k + 1], life: 0 })
        for (let j = 0; j < 14; j++) spawnPetal(from[k], from[k + 1], true)
      }
      gust += 1.2
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
