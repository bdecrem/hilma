import { COLS, ROWS, type Grid, mk } from './shapes'

// --- Primitives ---

function circle(cx: number, cy: number, r: number, hollow = false): Grid {
  return mk((c, row) => {
    const d = Math.sqrt((c - cx) ** 2 + (row - cy) ** 2)
    return hollow ? (d <= r && d >= r - 1.2) : d <= r
  })
}

function rect(x: number, y: number, w: number, h: number, hollow = false): Grid {
  return mk((c, r) => {
    const inside = c >= x && c < x + w && r >= y && r < y + h
    if (!hollow) return inside
    return inside && (c <= x || c >= x + w - 1 || r <= y || r >= y + h - 1)
  })
}

function triangle(cx: number, base: number, h: number, inverted = false): Grid {
  return mk((c, r) => {
    const top = ROWS - h
    if (r < top || r >= ROWS) return false
    const progress = inverted ? (ROWS - 1 - r - top) / h : (r - top) / h
    const halfW = (base / 2) * progress
    return Math.abs(c - cx) <= halfW
  })
}

function line(x0: number, y0: number, x1: number, y1: number, thickness = 1): Grid {
  return mk((c, r) => {
    const dx = x1 - x0, dy = y1 - y0
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len === 0) return Math.abs(c - x0) < thickness && Math.abs(r - y0) < thickness
    const t = Math.max(0, Math.min(1, ((c - x0) * dx + (r - y0) * dy) / (len * len)))
    const px = x0 + t * dx, py = y0 + t * dy
    return Math.sqrt((c - px) ** 2 + (r - py) ** 2) < thickness
  })
}

function blob(seedX: number, seedY: number, size: number, phase: number): Grid {
  return mk((c, r) => {
    const dx = c - seedX, dy = r - seedY
    const d = Math.sqrt(dx * dx + dy * dy)
    const angle = Math.atan2(dy, dx)
    const wobble = size * (0.7 + 0.3 * Math.sin(angle * 3 + phase) * Math.cos(angle * 2 + phase * 1.7))
    return d <= wobble
  })
}

function person(cx: number, floor: number): Grid {
  return mk((c, r) => {
    // head
    if (Math.sqrt((c - cx) ** 2 + (r - (floor - 4)) ** 2) <= 0.9) return true
    // body
    if (c === cx && r >= floor - 3 && r <= floor - 1) return true
    // arms
    if (r === floor - 2 && Math.abs(c - cx) <= 1) return true
    // legs
    if (r === floor && (c === cx - 1 || c === cx + 1)) return true
    return false
  })
}

function arch(cx: number, w: number, h: number): Grid {
  return mk((c, r) => {
    const bottom = ROWS - 1
    const top = bottom - h
    // pillars
    if (r > top && r <= bottom && (Math.abs(c - (cx - w / 2)) < 1.2 || Math.abs(c - (cx + w / 2)) < 1.2)) return true
    // arch top
    const dx = (c - cx) / (w / 2), dy = (r - top) / (h * 0.4)
    if (Math.sqrt(dx * dx + dy * dy) <= 1.1 && Math.sqrt(dx * dx + dy * dy) >= 0.6 && r <= top + h * 0.4) return true
    return false
  })
}

function wave(amplitude: number, freq: number, yOffset: number, phase: number): Grid {
  return mk((c, r) => {
    const y = yOffset + amplitude * Math.sin(c * freq + phase)
    return Math.abs(r - y) < 0.9
  })
}

// --- Combinators ---

function union(a: Grid, b: Grid): Grid {
  return mk((c, r) => a[r][c] === 1 || b[r][c] === 1)
}

function intersect(a: Grid, b: Grid): Grid {
  return mk((c, r) => a[r][c] === 1 && b[r][c] === 1)
}

function subtract(a: Grid, b: Grid): Grid {
  return mk((c, r) => a[r][c] === 1 && b[r][c] === 0)
}

function mirrorX(g: Grid): Grid {
  return mk((c, r) => {
    const mc = COLS - 1 - c
    return g[r][c] === 1 || g[r][mc] === 1
  })
}

function mirrorY(g: Grid): Grid {
  return mk((c, r) => {
    const mr = ROWS - 1 - r
    return g[r][c] === 1 || g[mr][c] === 1
  })
}

function translate(g: Grid, dx: number, dy: number): Grid {
  return mk((c, r) => {
    const sc = c - dx, sr = r - dy
    if (sc < 0 || sc >= COLS || sr < 0 || sr >= ROWS) return false
    return g[sr][sc] === 1
  })
}

// --- Validation ---

function countFilled(g: Grid): number {
  let n = 0
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (g[r][c]) n++
  return n
}

function largestComponent(g: Grid): number {
  const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false))
  let maxSize = 0

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!g[r][c] || visited[r][c]) continue
      let size = 0
      const stack: [number, number][] = [[r, c]]
      visited[r][c] = true
      while (stack.length) {
        const [cr, cc] = stack.pop()!
        size++
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nr = cr + dr, nc = cc + dc
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && g[nr][nc] && !visited[nr][nc]) {
            visited[nr][nc] = true
            stack.push([nr, nc])
          }
        }
      }
      maxSize = Math.max(maxSize, size)
    }
  }
  return maxSize
}

function validateGrid(g: Grid): boolean {
  const filled = countFilled(g)
  if (filled < 30 || filled > 160) return false
  const largest = largestComponent(g)
  return largest >= filled * 0.6
}

// --- Recipes ---

type Recipe = () => Grid

const recipes: Recipe[] = [
  // Two circles (community/connection)
  () => {
    const r1 = 2 + Math.random() * 2
    const r2 = 2 + Math.random() * 2
    const gap = r1 + r2 + Math.random() * 3 - 1
    const cx = COLS / 2
    return union(circle(cx - gap / 2, ROWS / 2, r1), circle(cx + gap / 2, ROWS / 2, r2))
  },
  // Person + object (human agency)
  () => {
    const px = 8 + Math.floor(Math.random() * 6)
    const g = person(px, ROWS - 1)
    const obj = Math.random() < 0.5
      ? circle(px + 5 + Math.random() * 4, 3 + Math.random() * 3, 1.5 + Math.random())
      : rect(px + 4, 2, 3 + Math.floor(Math.random() * 3), 4 + Math.floor(Math.random() * 3))
    return union(g, obj)
  },
  // Arch/bridge (building)
  () => arch(COLS / 2 + (Math.random() - 0.5) * 6, 8 + Math.random() * 8, 5 + Math.random() * 4),
  // Mountain + sun (nature)
  () => {
    const peak = 6 + Math.floor(Math.random() * 10)
    const m = triangle(peak, 10 + Math.random() * 8, 5 + Math.floor(Math.random() * 4))
    const sun = circle(4 + Math.random() * 18, 1 + Math.random() * 2, 1.5 + Math.random())
    return union(m, sun)
  },
  // Two or three people (community)
  () => {
    const n = 2 + Math.floor(Math.random() * 2)
    const spacing = Math.floor(18 / n)
    const start = Math.floor((COLS - spacing * (n - 1)) / 2)
    let g = person(start, ROWS - 1)
    for (let i = 1; i < n; i++) g = union(g, person(start + i * spacing, ROWS - 1))
    // sometimes add a connection line
    if (Math.random() < 0.4) g = union(g, line(start, ROWS - 3, start + (n - 1) * spacing, ROWS - 3, 0.8))
    return g
  },
  // Abstract blob (organic form)
  () => {
    const phase = Math.random() * Math.PI * 2
    const cx = 8 + Math.random() * 10
    const cy = 2 + Math.random() * 6
    const g = blob(cx, cy, 3 + Math.random() * 3, phase)
    return Math.random() < 0.3 ? mirrorX(g) : g
  },
  // Symmetric pattern (art/geometry)
  () => {
    let g = blob(COLS / 2 + (Math.random() - 0.5) * 4, ROWS / 2, 2 + Math.random() * 2, Math.random() * 10)
    g = mirrorX(g)
    if (Math.random() < 0.5) g = mirrorY(g)
    return g
  },
  // Building/tower (construction)
  () => {
    const nBlocks = 2 + Math.floor(Math.random() * 3)
    let g = mk(() => false)
    for (let i = 0; i < nBlocks; i++) {
      const bx = 3 + Math.floor(Math.random() * 16)
      const bw = 2 + Math.floor(Math.random() * 4)
      const bh = 3 + Math.floor(Math.random() * 5)
      g = union(g, rect(bx, ROWS - bh, bw, bh))
    }
    // ground line
    g = union(g, mk((c, r) => r === ROWS - 1 && c >= 1 && c <= COLS - 2))
    return g
  },
  // Star burst (wonder/science)
  () => {
    const cx = COLS / 2 + (Math.random() - 0.5) * 8
    const cy = ROWS / 2
    const nRays = 3 + Math.floor(Math.random() * 5)
    let g = circle(cx, cy, 1.5)
    for (let i = 0; i < nRays; i++) {
      const angle = (Math.PI * 2 * i) / nRays + Math.random() * 0.3
      const len = 4 + Math.random() * 5
      g = union(g, line(cx, cy, cx + Math.cos(angle) * len, cy + Math.sin(angle) * len * 0.5, 0.7))
    }
    return g
  },
  // Waves (flow/nature)
  () => {
    const n = 2 + Math.floor(Math.random() * 2)
    let g = mk(() => false)
    for (let i = 0; i < n; i++) {
      const y = 2 + i * (ROWS / n) + Math.random() * 2
      g = union(g, wave(1 + Math.random(), 0.3 + Math.random() * 0.4, y, Math.random() * 6))
    }
    return g
  },
  // Tree (growth/nature)
  () => {
    const cx = COLS / 2 + (Math.random() - 0.5) * 8
    const trunk = mk((c, r) => Math.abs(c - cx) < 1 && r >= 6 && r <= ROWS - 1)
    const canopy = blob(cx, 4, 3 + Math.random() * 2, Math.random() * 10)
    return union(trunk, canopy)
  },
  // Heart-ish (love/connection)
  () => {
    const cx = COLS / 2
    const cy = ROWS / 2
    const g = mk((c, r) => {
      const dx = (c - cx) / 2.5, dy = (r - cy - 0.5) / 2.5
      // heart equation approximation
      const x2 = dx * dx, y2 = dy * dy
      return (x2 + y2 - 1) ** 3 - x2 * y2 * dy < 0
    })
    return g
  },
  // Constellation (science/wonder)
  () => {
    const nStars = 5 + Math.floor(Math.random() * 6)
    const stars: [number, number][] = []
    for (let i = 0; i < nStars; i++) {
      stars.push([2 + Math.floor(Math.random() * (COLS - 4)), Math.floor(Math.random() * ROWS)])
    }
    let g = mk((c, r) => stars.some(([sx, sy]) => c === sx && r === sy))
    // connect nearby stars
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const d = Math.sqrt((stars[i][0] - stars[j][0]) ** 2 + (stars[i][1] - stars[j][1]) ** 2)
        if (d < 8 && Math.random() < 0.5) {
          g = union(g, line(stars[i][0], stars[i][1], stars[j][0], stars[j][1], 0.6))
        }
      }
    }
    return g
  },
  // Spiral (growth/science)
  () => {
    const cx = COLS / 2 + (Math.random() - 0.5) * 4
    const cy = ROWS / 2
    return mk((c, r) => {
      const dx = c - cx, dy = (r - cy) * 2
      const d = Math.sqrt(dx * dx + dy * dy)
      const a = Math.atan2(dy, dx)
      const spiralR = (a + Math.PI) / (Math.PI * 2) * 4 + d * 0.15
      return d < 10 && Math.abs(spiralR % 3) < 0.9
    })
  },
  // House + person (home/shelter)
  () => {
    const hx = COLS / 2 - 2
    const house = union(
      rect(hx, 5, 6, 5),
      triangle(hx + 3, 8, 4, true)
    )
    // door
    const door = rect(hx + 2, 7, 2, 3)
    const p = person(hx + 9, ROWS - 1)
    return union(union(house, door), p)
  },
]

// --- Public API ---

export function generateGrid(): Grid {
  // Try up to 20 times to produce a valid grid
  for (let attempt = 0; attempt < 20; attempt++) {
    const recipe = recipes[Math.floor(Math.random() * recipes.length)]
    let g = recipe()

    // Random offset to add variety
    if (Math.random() < 0.3) {
      g = translate(g, Math.floor((Math.random() - 0.5) * 6), Math.floor((Math.random() - 0.5) * 2))
    }

    if (validateGrid(g)) return g
  }

  // Fallback: centered blob that's guaranteed valid
  return blob(COLS / 2, ROWS / 2, 4, Math.random() * 10)
}

export function gridToText(g: Grid): string {
  return g.map(row => row.join('')).join('\n')
}
