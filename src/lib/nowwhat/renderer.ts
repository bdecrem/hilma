import { COLS, ROWS } from './shapes'
import { type Fill, n4 } from './cells'
import { type Box } from './simulation'

// Optional tile tint. When unset (default), tiles render as grayscale based on
// brightness — preserving original behavior for all existing callers. When set,
// tiles use this RGB triple, still modulated by brightness so shading works.
let TILE_TINT: [number, number, number] | null = null
export function setTileTint(rgb: [number, number, number] | null) {
  TILE_TINT = rgb
}

export function drawPixelBlock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, fill: Fill, brightness: number, alpha: number) {
  if (TILE_TINT) {
    const [tr, tg, tb] = TILE_TINT
    const b = Math.max(0.25, brightness)
    ctx.fillStyle = `rgba(${Math.floor(tr*b)},${Math.floor(tg*b)},${Math.floor(tb*b)},${alpha})`
  } else {
    const v = Math.floor(brightness * 255)
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`
  }
  switch (fill) {
    case 'solid': ctx.fillRect(x+1,y+1,size-2,size-2); break
    case 'checker':
      for (let px=0;px<size-2;px++) for (let py=0;py<size-2;py++)
        if ((px+py)%2===0) ctx.fillRect(x+1+px,y+1+py,1,1)
      break
    case 'stripe_h':
      for (let py=0;py<size-2;py++) if (py%2===0) ctx.fillRect(x+1,y+1+py,size-2,1)
      break
    case 'stripe_v':
      for (let px=0;px<size-2;px++) if (px%2===0) ctx.fillRect(x+1+px,y+1,1,size-2)
      break
    case 'dots':
      ctx.fillRect(x+2,y+2,1,1)
      if(size>5){ctx.fillRect(x+size-3,y+2,1,1);ctx.fillRect(x+2,y+size-3,1,1);ctx.fillRect(x+size-3,y+size-3,1,1)}
      break
  }
  ctx.fillStyle = `rgba(255,255,255,${alpha*0.16})`
  ctx.fillRect(x,y,size,1); ctx.fillRect(x,y,1,size)
  ctx.fillStyle = `rgba(0,0,0,${alpha*0.28})`
  ctx.fillRect(x,y+size-1,size,1); ctx.fillRect(x+size-1,y,1,size)
}

export function drawFlap(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, fill: Fill, brightness: number, alpha: number, half: 'top'|'bottom', squeeze: number) {
  ctx.save()
  const mid = Math.floor(size/2)
  if (half==='top') { ctx.beginPath();ctx.rect(x,y,size,mid);ctx.clip() }
  else { ctx.beginPath();ctx.rect(x,y+mid,size,size-mid);ctx.clip() }
  drawPixelBlock(ctx,x,y,size,fill,brightness,alpha*(1-squeeze*0.3))
  ctx.restore()
}

export interface LayoutMetrics {
  CELL: number; stripW: number; stripH: number; bx: number; by: number
}

export function computeLayout(W: number, H: number): LayoutMetrics {
  const maxCellW = Math.floor(W * 0.94 / COLS)
  const maxCellH = Math.floor(H * 0.32 / ROWS)
  const CELL = Math.max(4, Math.min(9, Math.min(maxCellW, maxCellH)))
  const stripW = COLS * CELL
  const stripH = ROWS * CELL
  const bx = Math.floor((W - stripW) / 2)
  const by = H - stripH - Math.floor(H * 0.05)
  return { CELL, stripW, stripH, bx, by }
}

export function drawScanlines(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.05)'
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1)
}

export function drawBox(ctx: CanvasRenderingContext2D, box: Box, now: number, layout: LayoutMetrics) {
  const { CELL, bx, by } = layout

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = box.cells[r][c]
      const px = bx + c * CELL
      const py = by + r * CELL

      if ((box.phase === 'won' || box.phase === 'blink') && !cell.isTarget) continue
      if (box.phase === 'dark') continue

      if (cell.locked) {
        const age = (now - cell.lockedAt) / 1000
        const flash = age < 0.08 ? 0.4 : 0
        let pulse = 0, blinkMod = 1

        if (box.phase === 'blink')
          blinkMod = (Math.floor((now - box.phaseStart) / 130) % 2 === 0) ? 1 : 0.06

        if (box.phase === 'won')
          pulse = 0.12 * Math.sin(now * 0.0015 + c * 0.35 + r * 0.5 + box.wonPulse)

        let fA = 1
        if (box.phase === 'failing')
          fA = Math.max(0, 1 - (now - box.phaseStart) / 800)

        let eF = 0
        if (box.phase === 'entropy') {
          const nn = n4(box.cells, r, c)
          eF = Math.max(0.15, 1 - nn * 0.25) * 0.15 * Math.sin(now * 0.015 + c * 1.1 + r * 0.8)
        }

        let fF = 0
        if (box.phase === 'frozen_fail')
          fF = 0.1 * Math.sin((now - box.phaseStart) * 0.012 + c * 0.7 + r)

        const br = Math.min(1, Math.max(0.03, cell.brightness + flash + pulse - eF - fF))
        drawPixelBlock(ctx, px, py, CELL, cell.fill, br * blinkMod, 0.9 * fA)

      } else if (cell.flipping && cell.flipPhase > 0) {
        if (box.phase === 'blink') continue
        const ag = cell.agitation * 0.15
        const ba = 0.25 + cell.agitation * 0.28
        const ph = cell.flipPhase
        if (ph < 0.5) {
          drawFlap(ctx, px, py, CELL, cell.fill, cell.brightness + ag, ba, 'bottom', 0)
          drawFlap(ctx, px, py, CELL, cell.fill, cell.brightness + ag, ba, 'top', ph * 2)
        } else {
          drawFlap(ctx, px, py, CELL, cell.nextFill, cell.nextBrightness + ag, ba, 'top', 0)
          drawFlap(ctx, px, py, CELL, cell.nextFill, cell.nextBrightness + ag, ba, 'bottom', 1 - (ph - 0.5) * 2)
        }
      } else if (cell.flipTimer < 99999) {
        if (box.phase === 'blink') continue
        drawPixelBlock(ctx, px, py, CELL, cell.fill, cell.brightness + cell.agitation * 0.12, 0.16 + cell.agitation * 0.22)
      }

      ctx.fillStyle = 'rgba(255,255,255,0.01)'
      ctx.fillRect(px + CELL - 1, py, 1, CELL)
      ctx.fillRect(px, py + CELL - 1, CELL, 1)
    }
  }
}
