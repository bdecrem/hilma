// A tiny software riso: every mark is a coverage function in sheet units,
// every ink multiplies into the paper, and a grain field decides which bits
// of each mark the drum actually managed to push through. Deterministic from
// the mark list alone, so a sheet can be re-pulled at any size, in the
// browser or on the server.

import { INKS, PAPER, SHEET_H, BAR_H, type Mark } from './model'

export type Rect = { x: number; y: number; w: number; h: number }

const GRAIN = 700 // grain cells per sheet width, whatever the pixel size

function h3(x: number, y: number, z: number) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function vnoise(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf)
  const a = h3(xi, yi, z), b = h3(xi + 1, yi, z), c = h3(xi, yi + 1, z), d = h3(xi + 1, yi + 1, z)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const vx = bx - ax, vy = by - ay
  const t = clamp01(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1))
  return Math.hypot(px - ax - vx * t, py - ay - vy * t)
}

function boxSD(dx: number, dy: number, hw: number, hh: number) {
  const qx = Math.abs(dx) - hw, qy = Math.abs(dy) - hh
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0)
}

type Shape = { box: [number, number, number, number]; cov: (u: number, v: number, U: number) => number }

function shapeOf(m: Mark): Shape {
  const r = rng(m.seed)
  const smear = m.smear ?? 0
  switch (m.kind) {
    case 'kick': {
      const bleed = Math.max(0, m.dens - 1) / 0.35
      const R = 0.04 * (1 + 0.22 * bleed)
      const p1 = r() * 6.28, p2 = r() * 6.28, p3 = r() * 6.28
      const j1 = 0.02 + r() * 0.03, j2 = 0.01 + r() * 0.02, j3 = 0.006 + r() * 0.01
      const pad = R * 1.5
      return {
        box: [m.x - pad, m.y - pad, m.x + pad, m.y + pad + smear],
        cov(u, v, U) {
          const dx = u - m.x
          let dy = v - m.y
          if (smear > 0 && dy > 0) dy = Math.max(0, dy - smear)
          const d = Math.hypot(dx, dy)
          const th = Math.atan2(dy, dx)
          const rr = R * (1 + j1 * Math.sin(3 * th + p1) + j2 * Math.sin(5 * th + p2) + j3 * Math.sin(11 * th + p3))
          let c = clamp01(0.5 - (d - rr) * U)
          if (bleed > 0 && d > rr) c = Math.max(c, clamp01(1 - (d - rr) / (R * 0.4)) * 0.4 * bleed)
          return c
        },
      }
    }
    case 'hat': {
      const a = m.a ?? 0
      const L = 0.01 + a * 0.042 + smear
      const w = 0.0075 * (1 + Math.max(0, m.dens - 1) * 0.8)
      const lean = (r() - 0.5) * 0.006
      return {
        box: [m.x - 0.02, m.y - 0.02, m.x + 0.02, m.y + L + 0.02],
        cov(u, v, U) {
          return clamp01(0.5 - (segDist(u, v, m.x, m.y, m.x + lean, m.y + L) - w) * U)
        },
      }
    }
    case 'stab': {
      const a = m.a ?? 0.5
      const semis = m.semis ?? [0, 3, 7, 10]
      const bars = semis.map((s) => ({
        cx: m.x + (r() - 0.5) * 0.008,
        cy: m.y - s * 0.0036,
        hw: (0.02 + a * 0.042) * (0.85 + r() * 0.3),
        hh: 0.0024 * (1 + Math.max(0, m.dens - 1) * 0.9),
      }))
      const top = m.y - Math.max(...semis) * 0.0036 - 0.01
      return {
        box: [m.x - 0.08, top, m.x + 0.08, m.y + 0.012 + smear],
        cov(u, v, U) {
          let c = 0
          for (const b of bars) {
            let dy = v - b.cy
            if (smear > 0 && dy > 0) dy = Math.max(0, dy - smear)
            c = Math.max(c, clamp01(0.5 - (boxSD(u - b.cx, dy, b.hw, b.hh) - 0.0008) * U))
          }
          return c
        },
      }
    }
    case 'wash': {
      // a halftone cloud: low register prints a coarse screen, high a fine one
      const a = m.a ?? 0.5
      const rx = 0.15, ry = BAR_H * 0.52
      const p = 0.018 - a * 0.007
      const ang = 0.26 + (r() - 0.5) * 0.06
      const ca = Math.cos(ang), sa = Math.sin(ang)
      const gain = 0.95 * (0.55 + 0.45 * Math.min(1, m.dens))
      return {
        box: [m.x - rx * 1.06, m.y - ry * 1.06, m.x + rx * 1.06, m.y + ry * 1.06],
        cov(u, v, U) {
          const ex = (u - m.x) / rx, ey = (v - m.y) / ry
          if (ex * ex + ey * ey > 1.15) return 0
          const ru = u * ca + v * sa, rv = -u * sa + v * ca
          const ci = Math.floor(ru / p), cj = Math.floor(rv / p)
          let c = 0
          for (let di = -1; di <= 1; di++) {
            for (let dj = -1; dj <= 1; dj++) {
              const ccu = (ci + di + 0.5) * p, ccv = (cj + dj + 0.5) * p
              const cu = ccu * ca - ccv * sa, cv = ccu * sa + ccv * ca
              const te = Math.hypot((cu - m.x) / rx, (cv - m.y) / ry)
              const tone = Math.pow(clamp01(1 - te), 0.6) * gain
              if (tone <= 0) continue
              const dotR = p * 0.72 * Math.sqrt(tone)
              const d = Math.hypot(ru - ccu, rv - ccv)
              c = Math.max(c, clamp01(0.5 - (d - dotR) * U))
            }
          }
          return c
        },
      }
    }
    case 'finger': {
      const rot = m.rot ?? 0
      const cr = Math.cos(rot), sr = Math.sin(rot)
      const rx = 0.034, ry = 0.045
      const ph = r() * 6.28
      const period = 0.0056
      return {
        box: [m.x - ry, m.y - ry, m.x + ry, m.y + ry],
        cov(u, v) {
          const dx = u - m.x, dy = v - m.y
          const lx = dx * cr + dy * sr, ly = -dx * sr + dy * cr
          const e = Math.hypot(lx / rx, ly / ry)
          if (e > 1) return 0
          // a loop whorl: rings pushed off-center, with a lazy wobble
          const rr = Math.hypot(lx + 0.004, (ly - 0.006) * 0.82) + 0.0018 * Math.sin(Math.atan2(ly, lx) * 3 + ph) + 0.004 * (ly / ry) * (ly / ry)
          const s = Math.sin((rr / period) * 6.2832)
          const press = 1 - smooth(0.55, 1, e)
          return smooth(-0.15, 0.45, s) * press * 0.95
        },
      }
    }
    case 'reg': {
      const R = 0.015, t = 0.0015, arm = 0.025
      return {
        box: [m.x - arm - 0.004, m.y - arm - 0.004, m.x + arm + 0.004, m.y + arm + 0.004],
        cov(u, v, U) {
          const dx = u - m.x, dy = v - m.y
          const ring = Math.abs(Math.hypot(dx, dy) - R) - t
          const cross = Math.min(boxSD(dx, dy, arm, t * 0.8), boxSD(dx, dy, t * 0.8, arm))
          return clamp01(0.5 - Math.min(ring, cross) * U)
        },
      }
    }
    case 'crop': {
      const arm = 0.02, t = 0.0011
      return {
        box: [m.x - arm - 0.003, m.y - arm - 0.003, m.x + arm + 0.003, m.y + arm + 0.003],
        cov(u, v, U) {
          const dx = u - m.x, dy = v - m.y
          return clamp01(0.5 - Math.min(boxSD(dx, dy, arm, t), boxSD(dx, dy, t, arm)) * U)
        },
      }
    }
    case 'swatch': {
      const hw = 0.018, hh = 0.011
      return {
        box: [m.x - hw - 0.003, m.y - hh - 0.003, m.x + hw + 0.003, m.y + hh + 0.003],
        cov(u, v, U) {
          return clamp01(0.5 - boxSD(u - m.x, v - m.y, hw, hh) * U)
        },
      }
    }
  }
}

export class Plate {
  readonly w: number
  readonly h: number
  readonly unit: number
  readonly data: Uint8ClampedArray<ArrayBuffer>

  constructor(width: number) {
    this.w = Math.max(8, Math.round(width))
    this.unit = this.w
    this.h = Math.round(this.w * SHEET_H)
    this.data = new Uint8ClampedArray(this.w * this.h * 4)
  }

  paper() {
    const { w, h, data, unit } = this
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const u = px / unit, v = py / unit
        const n = (h3(px, py, 1) - 0.5) * 7 + (vnoise(u * 9, v * 9, 5) - 0.5) * 7 + (vnoise(u * 60, v * 3, 9) - 0.5) * 3
        const i = (py * w + px) * 4
        data[i] = PAPER[0] + n
        data[i + 1] = PAPER[1] + n
        data[i + 2] = PAPER[2] + n * 1.1
        data[i + 3] = 255
      }
    }
  }

  mark(m: Mark): Rect | null {
    const { w, h, data, unit: U } = this
    const s = shapeOf(m)
    const x0 = Math.max(0, Math.floor(s.box[0] * U)), y0 = Math.max(0, Math.floor(s.box[1] * U))
    const x1 = Math.min(w, Math.ceil(s.box[2] * U)), y1 = Math.min(h, Math.ceil(s.box[3] * U))
    if (x1 <= x0 || y1 <= y0) return null
    const mul = INKS[m.ink].mul
    const mr = mul[0] / 255, mg = mul[1] / 255, mb = mul[2] / 255
    const k = clamp01(m.dens / 0.45)
    const opacity = 0.9 * (0.42 + 0.58 * k)
    const starve = 1 - k
    const salt = m.ink * 977 + 13
    for (let py = y0; py < y1; py++) {
      const v = (py + 0.5) / U
      const gy = Math.floor(v * GRAIN)
      for (let px = x0; px < x1; px++) {
        const u = (px + 0.5) / U
        const c = s.cov(u, v, U)
        if (c <= 0.003) continue
        // ink skips in clumps, not as salt: a coarse mottle decides where the
        // drum ran thin, fine grain only nibbles at those places
        const mottle = vnoise(u * 38, v * 38, m.ink + 3)
        const clump = vnoise(u * 190, v * 190, m.ink + 11)
        const keepP = 1.0 - 0.32 * (1 - mottle) * (1 - mottle) - starve * 0.9
        const keep = 0.55 * h3(Math.floor(u * GRAIN), gy, salt) + 0.45 * clump < keepP
        const a = c * (keep ? opacity * (0.84 + 0.16 * mottle) : opacity * 0.16)
        const i = (py * w + px) * 4
        data[i] *= 1 - a + a * mr
        data[i + 1] *= 1 - a + a * mg
        data[i + 2] *= 1 - a + a * mb
      }
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }
}
