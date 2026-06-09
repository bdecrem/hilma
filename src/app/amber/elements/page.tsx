'use client'

import { useEffect, useRef, useState } from 'react'

// element ids
const EMPTY = 0, SAND = 1, WATER = 2, WALL = 3, PLANT = 4, FIRE = 5, SMOKE = 6

const ELEMENTS = [
  { id: SAND, name: 'sand', swatch: '#D4A574' },
  { id: WATER, name: 'water', swatch: '#3E6B9E' },
  { id: PLANT, name: 'plant', swatch: '#A8E22E' },
  { id: FIRE, name: 'fire', swatch: '#FF7A1A' },
  { id: WALL, name: 'wall', swatch: '#5A5A5A' },
  { id: EMPTY, name: 'erase', swatch: '#2A2A2A' },
]

const CELL = 4 // css px per sim cell

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function pack(r: number, g: number, b: number): number {
  return (255 << 24) | (b << 16) | (g << 8) | r
}

function ramp(from: string, to: string, steps: number): number[] {
  const [r1, g1, b1] = hexToRgb(from)
  const [r2, g2, b2] = hexToRgb(to)
  const out: number[] = []
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    out.push(pack(
      Math.round(r1 + (r2 - r1) * t),
      Math.round(g1 + (g2 - g1) * t),
      Math.round(b1 + (b2 - b1) * t),
    ))
  }
  return out
}

const BG = pack(10, 10, 10) // #0A0A0A NIGHT

// 8 shade variants per element, indexed by per-grain tint
const PAL: Record<number, number[]> = {
  [SAND]: ramp('#B98A52', '#E4C290', 8),
  [WATER]: ramp('#26415F', '#3E6B9E', 8),
  [WALL]: ramp('#383838', '#4E4E4E', 8),
  [PLANT]: ramp('#5E8A14', '#A8E22E', 8),
  [SMOKE]: ramp('#222222', '#3C3C3C', 8),
}
PAL[PLANT][7] = pack(198, 255, 60) // rare lime tip #C6FF3C

// fire shades by remaining life band (dying -> fresh)
const FIRE_PAL = [
  pack(128, 34, 8),   // ember
  pack(226, 72, 15),  // deep
  pack(255, 122, 26), // sodium
  pack(255, 174, 66), // hot
]

export default function ElementsPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [element, setElement] = useState(SAND)
  const elementRef = useRef(SAND)
  const clearRef = useRef<() => void>(() => {})
  elementRef.current = element

  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!

    let W = 0, H = 0
    let cells = new Uint8Array(0)
    let life = new Uint8Array(0)
    let tint = new Uint8Array(0)
    let updated = new Uint8Array(0)
    let buf32 = new Uint32Array(0)
    let img: ImageData | null = null
    const off = document.createElement('canvas')
    const offCtx = off.getContext('2d')!
    let clock = 0
    let frame = 0
    let hasPainted = false
    let raf = 0

    const idxOf = (x: number, y: number) => y * W + x

    function setup() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const cw = window.innerWidth
      const ch = window.innerHeight
      canvas.width = Math.floor(cw * dpr)
      canvas.height = Math.floor(ch * dpr)
      canvas.style.width = cw + 'px'
      canvas.style.height = ch + 'px'
      W = Math.ceil(cw / CELL)
      H = Math.ceil(ch / CELL)
      off.width = W
      off.height = H
      cells = new Uint8Array(W * H)
      life = new Uint8Array(W * H)
      tint = new Uint8Array(W * H)
      updated = new Uint8Array(W * H)
      img = offCtx.createImageData(W, H)
      buf32 = new Uint32Array(img.data.buffer)
      ctx.imageSmoothingEnabled = false
      seed()
    }

    function spawn(x: number, y: number, t: number) {
      if (x < 0 || x >= W || y < 0 || y >= H) return
      const i = idxOf(x, y)
      cells[i] = t
      tint[i] = (Math.random() * 256) | 0
      if (t === FIRE) life[i] = 40 + ((Math.random() * 50) | 0)
      if (t === SMOKE) life[i] = 60 + ((Math.random() * 80) | 0)
    }

    function seed() {
      // a few plant sprigs rooted at the floor
      for (const fx of [0.18, 0.52, 0.8]) {
        const px = Math.floor(W * fx)
        const sprigH = 4 + ((Math.random() * 5) | 0)
        for (let dy = 0; dy < sprigH; dy++) {
          spawn(px + ((Math.random() * 3) | 0) - 1, H - 1 - dy, PLANT)
        }
      }
    }

    function trySwap(from: number, to: number) {
      const t = cells[to]
      cells[to] = cells[from]
      cells[from] = t
      const l = life[to]; life[to] = life[from]; life[from] = l
      const v = tint[to]; tint[to] = tint[from]; tint[from] = v
      updated[to] = clock
      updated[from] = clock
    }

    function step() {
      clock = (clock + 1) & 0xff
      const ltr = (clock & 1) === 0
      for (let y = H - 1; y >= 0; y--) {
        for (let i = 0; i < W; i++) {
          const x = ltr ? i : W - 1 - i
          const idx = y * W + x
          if (updated[idx] === clock) continue
          const t = cells[idx]
          if (t === EMPTY || t === WALL) continue

          if (t === SAND) {
            if (y + 1 < H) {
              const b = idx + W
              const bt = cells[b]
              if (bt === EMPTY || bt === WATER || bt === SMOKE) { trySwap(idx, b); continue }
              const dir = Math.random() < 0.5 ? 1 : -1
              for (const d of [dir, -dir]) {
                const nx = x + d
                if (nx < 0 || nx >= W) continue
                const n = b + d
                const nt = cells[n]
                if (nt === EMPTY || nt === WATER || nt === SMOKE) { trySwap(idx, n); break }
              }
            }
          } else if (t === WATER) {
            let moved = false
            if (y + 1 < H) {
              const b = idx + W
              const bt = cells[b]
              if (bt === EMPTY || bt === SMOKE) { trySwap(idx, b); moved = true }
              if (!moved) {
                const dir = Math.random() < 0.5 ? 1 : -1
                for (const d of [dir, -dir]) {
                  const nx = x + d
                  if (nx < 0 || nx >= W) continue
                  const n = b + d
                  const nt = cells[n]
                  if (nt === EMPTY || nt === SMOKE) { trySwap(idx, n); moved = true; break }
                }
              }
            }
            if (!moved) {
              // sideways flow, up to 3 cells, levels pools
              const dir = Math.random() < 0.5 ? 1 : -1
              let cur = idx
              let cx = x
              for (let s = 0; s < 3; s++) {
                const nx = cx + dir
                if (nx < 0 || nx >= W) break
                const n = cur + dir
                if (cells[n] !== EMPTY) break
                trySwap(cur, n)
                cur = n
                cx = nx
                // fall through openings while flowing
                if (cur + W < W * H && cells[cur + W] === EMPTY) break
              }
            }
          } else if (t === FIRE) {
            // touch neighbors: ignite plants, die against water
            let dead = false
            for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
              const nx = x + dx, ny = y + dy
              if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
              const n = ny * W + nx
              const nt = cells[n]
              if (nt === PLANT && Math.random() < 0.25) {
                cells[n] = FIRE
                life[n] = 40 + ((Math.random() * 50) | 0)
                tint[n] = (Math.random() * 256) | 0
              } else if (nt === WATER) {
                dead = true
              }
            }
            if (dead || life[idx] <= 1) {
              cells[idx] = Math.random() < 0.45 ? SMOKE : EMPTY
              life[idx] = 50 + ((Math.random() * 70) | 0)
              updated[idx] = clock
              continue
            }
            life[idx]--
            // shed smoke and lick upward
            if (y - 1 >= 0) {
              const up = idx - W
              if (cells[up] === EMPTY) {
                const r = Math.random()
                if (r < 0.06) { spawn(x, y - 1, SMOKE); updated[up] = clock }
                else if (r < 0.16) { trySwap(idx, up) }
              }
            }
          } else if (t === SMOKE) {
            if (life[idx] <= 1) { cells[idx] = EMPTY; continue }
            life[idx]--
            const r = Math.random()
            if (y - 1 >= 0 && r < 0.75) {
              const drift = r < 0.5 ? 0 : (Math.random() < 0.5 ? 1 : -1)
              const nx = x + drift
              if (nx >= 0 && nx < W) {
                const n = idx - W + drift
                if (cells[n] === EMPTY) { trySwap(idx, n); continue }
              }
              if (cells[idx - W] === EMPTY) trySwap(idx, idx - W)
            } else if (r < 0.85) {
              const d = Math.random() < 0.5 ? 1 : -1
              const nx = x + d
              if (nx >= 0 && nx < W && cells[idx + d] === EMPTY) trySwap(idx, idx + d)
            }
          } else if (t === PLANT) {
            // drink adjacent water, slowly, and grow into it
            if (Math.random() < 0.015) {
              for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
                const nx = x + dx, ny = y + dy
                if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
                const n = ny * W + nx
                if (cells[n] === WATER && Math.random() < 0.35) {
                  cells[n] = PLANT
                  tint[n] = (Math.random() * 256) | 0
                  updated[n] = clock
                  break
                }
              }
            }
          }
        }
      }
    }

    function render() {
      if (!img) return
      for (let i = 0; i < cells.length; i++) {
        const t = cells[i]
        if (t === EMPTY) { buf32[i] = BG; continue }
        if (t === FIRE) {
          buf32[i] = FIRE_PAL[Math.min(3, (life[i] >> 5) + (tint[i] & 1))]
          continue
        }
        buf32[i] = PAL[t][tint[i] >> 5]
      }
      offCtx.putImageData(img, 0, 0)
      ctx.drawImage(off, 0, 0, W, H, 0, 0, canvas.width, canvas.height)
    }

    // pointer painting
    let painting = false
    let lastX = 0, lastY = 0

    function paintAt(cx: number, cy: number) {
      const el = elementRef.current
      const rad = el === EMPTY ? 5 : el === WALL || el === FIRE ? 2 : 3
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          if (dx * dx + dy * dy > rad * rad) continue
          const x = cx + dx, y = cy + dy
          if (x < 0 || x >= W || y < 0 || y >= H) continue
          const i = idxOf(x, y)
          if (el === EMPTY) { cells[i] = EMPTY; continue }
          if (cells[i] !== EMPTY && el !== WALL) continue
          // granular pour for loose materials
          if ((el === SAND || el === WATER) && Math.random() > 0.65) continue
          spawn(x, y, el)
        }
      }
    }

    function paintLine(x0: number, y0: number, x1: number, y1: number) {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
      for (let s = 0; s <= steps; s++) {
        paintAt(Math.round(x0 + ((x1 - x0) * s) / steps), Math.round(y0 + ((y1 - y0) * s) / steps))
      }
    }

    function toCell(e: PointerEvent): [number, number] {
      const rect = canvas.getBoundingClientRect()
      return [
        Math.floor((e.clientX - rect.left) / CELL),
        Math.floor((e.clientY - rect.top) / CELL),
      ]
    }

    function onDown(e: PointerEvent) {
      painting = true
      hasPainted = true
      canvas.setPointerCapture(e.pointerId)
      const [x, y] = toCell(e)
      lastX = x; lastY = y
      paintAt(x, y)
    }
    function onMove(e: PointerEvent) {
      if (!painting) return
      const [x, y] = toCell(e)
      paintLine(lastX, lastY, x, y)
      lastX = x; lastY = y
    }
    function onUp() { painting = false }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)

    clearRef.current = () => {
      cells.fill(EMPTY)
      hasPainted = true // stop the intro pour
    }

    function loop() {
      frame++
      // intro pour until the visitor takes over
      if (!hasPainted && frame < 420) {
        if (frame % 2 === 0) {
          const sx = Math.floor(W * 0.32) + ((Math.random() * 5) | 0) - 2
          spawn(sx, 2, SAND)
        }
        if (frame > 90 && frame % 2 === 1) {
          const wx = Math.floor(W * 0.68) + ((Math.random() * 5) | 0) - 2
          spawn(wx, 2, WATER)
        }
      }
      if (painting) paintAt(lastX, lastY)
      step()
      step()
      render()
      raf = requestAnimationFrame(loop)
    }

    setup()
    raf = requestAnimationFrame(loop)

    const onResize = () => setup()
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
    }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0A0A0A', overflow: 'hidden' }}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700&family=Fraunces:ital,wght@1,300&display=swap"
      />
      <canvas ref={canvasRef} style={{ display: 'block', touchAction: 'none', cursor: 'crosshair' }} />

      {/* museum label */}
      <div
        style={{
          position: 'absolute',
          top: 'calc(16px + env(safe-area-inset-top))',
          left: 'calc(18px + env(safe-area-inset-left))',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <div style={{ fontFamily: '"Courier Prime", monospace', fontWeight: 700, fontSize: 15, color: '#E8E8E8', letterSpacing: 2 }}>
          elements<span style={{ color: '#C6FF3C' }}>.</span>
        </div>
        <div style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontWeight: 300, fontSize: 13, color: '#888', marginTop: 3 }}>
          everything falls, eventually.
        </div>
      </div>

      {/* element picker */}
      <div
        style={{
          position: 'absolute',
          bottom: 'calc(10px + env(safe-area-inset-bottom))',
          left: 0,
          right: 0,
          margin: '0 auto',
          width: 'fit-content',
          maxWidth: 'calc(100vw - 16px)',
          display: 'flex',
          justifyContent: 'center',
          gap: 4,
          flexWrap: 'wrap',
          padding: '4px 6px',
          background: 'rgba(10, 10, 10, 0.82)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          borderRadius: 3,
        }}
      >
        {ELEMENTS.map((el) => {
          const active = element === el.id
          return (
            <button
              key={el.name}
              onClick={() => setElement(el.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: active ? '#161616' : 'transparent',
                border: '1px solid ' + (active ? '#333' : 'transparent'),
                borderRadius: 2,
                padding: '7px 10px',
                cursor: 'pointer',
                fontFamily: '"Courier Prime", monospace',
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: active ? '#E8E8E8' : '#666',
              }}
            >
              <span style={{ width: 9, height: 9, background: el.swatch, display: 'inline-block' }} />
              {el.name}
            </button>
          )
        })}
        <button
          onClick={() => clearRef.current()}
          style={{
            background: 'transparent',
            border: '1px solid transparent',
            padding: '7px 10px',
            cursor: 'pointer',
            fontFamily: '"Courier Prime", monospace',
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: '#444',
          }}
        >
          clear
        </button>
      </div>
    </div>
  )
}
