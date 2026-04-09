'use client'

import { useEffect, useRef } from 'react'

// Double resolution: 52x20 instead of 26x10
const COLS = 52
const ROWS = 20

type Grid = number[][]

function mk(fn: (c: number, r: number) => boolean): Grid {
  const g: Grid = []
  for (let r = 0; r < ROWS; r++) {
    const row: number[] = []
    for (let c = 0; c < COLS; c++) row.push(fn(c, r) ? 1 : 0)
    g.push(row)
  }
  return g
}

// 1. ORIGINAL WINGED BIKE (upscaled from 26x10)
const WINGED_BIKE: Grid = (() => {
  const g: Grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0))

  // Rear wheel — center (16, 14), r=4.5
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const d = Math.sqrt((c - 16) ** 2 + (r - 14) ** 2)
      if (d >= 3 && d <= 5) g[r][c] = 1
    }

  // Front wheel — center (36, 14), r=4.5
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const d = Math.sqrt((c - 36) ** 2 + (r - 14) ** 2)
      if (d >= 3 && d <= 5) g[r][c] = 1
    }

  // Frame
  // Seat tube
  g[12][18] = 1; g[12][19] = 1; g[11][20] = 1; g[11][21] = 1; g[10][22] = 1; g[10][23] = 1; g[9][22] = 1; g[9][23] = 1
  // Top tube
  for (let c = 24; c <= 33; c++) { g[8][c] = 1; g[9][c] = 1 }
  // Down tube
  g[10][32] = 1; g[10][33] = 1; g[11][33] = 1; g[11][34] = 1; g[12][34] = 1; g[12][35] = 1
  // Chain stay
  for (let c = 17; c <= 26; c++) { g[14][c] = 1; g[15][c] = 1 }
  // Front stay
  for (let c = 27; c <= 35; c++) { g[14][c] = 1; g[15][c] = 1 }
  // Seat
  g[7][20] = 1; g[7][21] = 1; g[7][22] = 1; g[7][23] = 1; g[7][24] = 1
  // Handlebars
  g[7][34] = 1; g[7][35] = 1; g[7][36] = 1; g[8][34] = 1; g[8][35] = 1

  // Left wing
  g[7][19] = 1; g[6][18] = 1; g[6][17] = 1; g[5][16] = 1; g[5][15] = 1; g[4][14] = 1; g[4][13] = 1
  g[3][12] = 1; g[3][11] = 1; g[2][10] = 1; g[2][9] = 1; g[1][8] = 1; g[1][7] = 1; g[0][6] = 1; g[0][5] = 1; g[0][4] = 1
  g[6][19] = 1; g[5][18] = 1; g[5][17] = 1; g[4][16] = 1; g[4][15] = 1; g[3][14] = 1; g[3][13] = 1
  g[2][12] = 1; g[2][11] = 1; g[1][10] = 1; g[1][9] = 1; g[0][8] = 1; g[0][7] = 1
  g[3][16] = 1; g[3][15] = 1; g[2][14] = 1; g[2][13] = 1; g[1][12] = 1; g[1][11] = 1; g[0][10] = 1; g[0][9] = 1

  // Right wing
  g[7][37] = 1; g[6][38] = 1; g[6][37] = 1; g[5][38] = 1; g[5][39] = 1; g[4][39] = 1; g[4][40] = 1
  g[3][40] = 1; g[3][41] = 1; g[2][41] = 1; g[2][42] = 1; g[1][42] = 1; g[1][43] = 1; g[0][43] = 1; g[0][44] = 1; g[0][45] = 1
  g[6][38] = 1; g[5][37] = 1; g[5][38] = 1; g[4][37] = 1; g[4][38] = 1; g[3][38] = 1; g[3][39] = 1
  g[2][39] = 1; g[2][40] = 1; g[1][40] = 1; g[1][41] = 1; g[0][41] = 1; g[0][42] = 1
  g[3][36] = 1; g[3][37] = 1; g[2][37] = 1; g[2][38] = 1; g[1][38] = 1; g[1][39] = 1; g[0][39] = 1; g[0][40] = 1

  return g
})()

// 2. JUST WINGS
const WINGS: Grid = (() => {
  const g: Grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0))

  // Center body
  for (let r = 8; r <= 11; r++) for (let c = 24; c <= 27; c++) g[r][c] = 1

  // Left wing — thick sweeping arc upward
  // Inner edge
  g[8][23] = 1; g[8][22] = 1; g[7][21] = 1; g[7][22] = 1; g[6][20] = 1; g[6][21] = 1
  g[5][18] = 1; g[5][19] = 1; g[5][20] = 1; g[4][16] = 1; g[4][17] = 1; g[4][18] = 1
  g[3][14] = 1; g[3][15] = 1; g[3][16] = 1; g[2][12] = 1; g[2][13] = 1; g[2][14] = 1
  g[1][9] = 1; g[1][10] = 1; g[1][11] = 1; g[1][12] = 1
  g[0][5] = 1; g[0][6] = 1; g[0][7] = 1; g[0][8] = 1; g[0][9] = 1; g[0][10] = 1
  // Lower edge (mirror below center for wing thickness)
  g[11][23] = 1; g[11][22] = 1; g[12][21] = 1; g[12][22] = 1; g[13][20] = 1; g[13][21] = 1
  g[14][18] = 1; g[14][19] = 1; g[14][20] = 1; g[15][16] = 1; g[15][17] = 1; g[15][18] = 1
  g[16][14] = 1; g[16][15] = 1; g[16][16] = 1; g[17][12] = 1; g[17][13] = 1; g[17][14] = 1
  g[18][9] = 1; g[18][10] = 1; g[18][11] = 1; g[18][12] = 1

  // Right wing — mirror
  g[8][28] = 1; g[8][29] = 1; g[7][29] = 1; g[7][30] = 1; g[6][30] = 1; g[6][31] = 1
  g[5][31] = 1; g[5][32] = 1; g[5][33] = 1; g[4][33] = 1; g[4][34] = 1; g[4][35] = 1
  g[3][35] = 1; g[3][36] = 1; g[3][37] = 1; g[2][37] = 1; g[2][38] = 1; g[2][39] = 1
  g[1][39] = 1; g[1][40] = 1; g[1][41] = 1; g[1][42] = 1
  g[0][41] = 1; g[0][42] = 1; g[0][43] = 1; g[0][44] = 1; g[0][45] = 1; g[0][46] = 1
  g[11][28] = 1; g[11][29] = 1; g[12][29] = 1; g[12][30] = 1; g[13][30] = 1; g[13][31] = 1
  g[14][31] = 1; g[14][32] = 1; g[14][33] = 1; g[15][33] = 1; g[15][34] = 1; g[15][35] = 1
  g[16][35] = 1; g[16][36] = 1; g[16][37] = 1; g[17][37] = 1; g[17][38] = 1; g[17][39] = 1
  g[18][39] = 1; g[18][40] = 1; g[18][41] = 1; g[18][42] = 1

  return g
})()

// 3. BIRD — soaring silhouette
const BIRD: Grid = (() => {
  const g: Grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0))

  // Body
  for (let c = 20; c <= 30; c++) { g[10][c] = 1; g[11][c] = 1 }
  // Head
  g[10][31] = 1; g[10][32] = 1; g[9][31] = 1; g[9][32] = 1; g[9][33] = 1; g[8][32] = 1; g[8][33] = 1
  // Beak
  g[9][34] = 1; g[9][35] = 1
  // Tail
  g[10][19] = 1; g[11][19] = 1; g[10][18] = 1; g[11][18] = 1
  g[12][17] = 1; g[12][18] = 1; g[9][17] = 1; g[9][18] = 1
  g[13][16] = 1; g[8][16] = 1

  // Left wing
  g[9][22] = 1; g[9][23] = 1; g[8][21] = 1; g[8][22] = 1
  g[7][19] = 1; g[7][20] = 1; g[7][21] = 1
  g[6][17] = 1; g[6][18] = 1; g[6][19] = 1
  g[5][15] = 1; g[5][16] = 1; g[5][17] = 1
  g[4][13] = 1; g[4][14] = 1; g[4][15] = 1
  g[3][10] = 1; g[3][11] = 1; g[3][12] = 1; g[3][13] = 1
  g[2][7] = 1; g[2][8] = 1; g[2][9] = 1; g[2][10] = 1
  g[1][4] = 1; g[1][5] = 1; g[1][6] = 1; g[1][7] = 1

  // Right wing
  g[9][28] = 1; g[9][29] = 1; g[8][29] = 1; g[8][30] = 1
  g[7][30] = 1; g[7][31] = 1; g[7][32] = 1
  g[6][32] = 1; g[6][33] = 1; g[6][34] = 1
  g[5][34] = 1; g[5][35] = 1; g[5][36] = 1
  g[4][36] = 1; g[4][37] = 1; g[4][38] = 1
  g[3][38] = 1; g[3][39] = 1; g[3][40] = 1; g[3][41] = 1
  g[2][41] = 1; g[2][42] = 1; g[2][43] = 1; g[2][44] = 1
  g[1][44] = 1; g[1][45] = 1; g[1][46] = 1; g[1][47] = 1

  return g
})()

// 4. PERSON ON BIKE — ultra-simplified
const PERSON_BIKE: Grid = (() => {
  const g: Grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0))

  // Rear wheel — center (14, 14), r=4.5
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const d = Math.sqrt((c - 14) ** 2 + (r - 14) ** 2)
      if (d >= 3 && d <= 5) g[r][c] = 1
    }

  // Front wheel — center (38, 14), r=4.5
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const d = Math.sqrt((c - 38) ** 2 + (r - 14) ** 2)
      if (d >= 3 && d <= 5) g[r][c] = 1
    }

  // Frame — simple diagonals
  // Seat tube
  g[13][18] = 1; g[12][19] = 1; g[11][20] = 1; g[10][21] = 1
  // Top tube
  for (let c = 22; c <= 32; c++) g[9][c] = 1
  // Down tube
  g[10][32] = 1; g[11][33] = 1; g[12][34] = 1; g[13][35] = 1
  // Chain stay
  for (let c = 15; c <= 26; c++) g[14][c] = 1
  for (let c = 27; c <= 37; c++) g[14][c] = 1

  // Person — stick figure
  // Head
  g[2][24] = 1; g[2][25] = 1; g[3][24] = 1; g[3][25] = 1
  // Neck
  g[4][24] = 1; g[4][25] = 1
  // Torso (leaning forward slightly)
  g[5][24] = 1; g[5][25] = 1; g[6][25] = 1; g[6][26] = 1; g[7][26] = 1; g[7][27] = 1; g[8][27] = 1; g[8][28] = 1
  // Arms reaching to handlebars
  g[6][27] = 1; g[6][28] = 1; g[6][29] = 1; g[6][30] = 1; g[6][31] = 1
  // Seat
  g[9][21] = 1; g[9][22] = 1; g[9][23] = 1
  // Handlebars
  g[8][33] = 1; g[7][33] = 1; g[7][34] = 1; g[6][34] = 1

  return g
})()

const shapes = [
  { name: '1. Winged Bike (original)', grid: WINGED_BIKE },
  { name: '2. Just Wings', grid: WINGS },
  { name: '3. Bird', grid: BIRD },
  { name: '4. Person on Bike', grid: PERSON_BIKE },
]

function ShapeCanvas({ grid, label }: { grid: Grid; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const CELL = 5
    const W = COLS * CELL
    const H = ROWS * CELL
    canvas.width = W
    canvas.height = H

    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, W, H)

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c]) {
          ctx.fillStyle = 'rgba(0,0,0,0.75)'
          ctx.fillRect(c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2)
          ctx.fillStyle = 'rgba(0,0,0,0.08)'
          ctx.fillRect(c * CELL, r * CELL + CELL - 1, CELL, 1)
          ctx.fillRect(c * CELL + CELL - 1, r * CELL, 1, CELL)
          ctx.fillStyle = 'rgba(255,255,255,0.4)'
          ctx.fillRect(c * CELL, r * CELL, CELL, 1)
          ctx.fillRect(c * CELL, r * CELL, 1, CELL)
        }
      }
    }
  }, [grid])

  return (
    <div style={{ textAlign: 'center' }}>
      <canvas
        ref={canvasRef}
        style={{
          imageRendering: 'pixelated',
          width: `${COLS * 5 * 2}px`,
          height: `${ROWS * 5 * 2}px`,
          border: '1px solid #eee',
          borderRadius: '8px',
        }}
      />
      <div style={{ marginTop: '12px', fontSize: '14px', color: '#999', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  )
}

function BikeWithWingsCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const W = 520
    const H = 240
    canvas.width = W
    canvas.height = H

    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, W, H)

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const cx = W / 2
    const cy = H * 0.58

    // Art nouveau palette — warm sepia pencil
    const ink = 'rgba(60,45,30,0.7)'
    const inkLight = 'rgba(60,45,30,0.3)'
    const inkFaint = 'rgba(60,45,30,0.1)'
    const inkGhost = 'rgba(60,45,30,0.05)'

    // === WHEELS — art nouveau: organic double-rings with vine spokes ===
    const wheelR = 44
    const wheelbase = 175
    const rearX = cx - wheelbase / 2
    const frontX = cx + wheelbase / 2
    const axleY = cy + 22

    function drawArtNouveauWheel(wx: number, wy: number) {
      // Outer ring
      ctx.strokeStyle = ink; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(wx, wy, wheelR, 0, Math.PI * 2); ctx.stroke()
      // Inner decorative ring
      ctx.strokeStyle = inkLight; ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(wx, wy, wheelR - 6, 0, Math.PI * 2); ctx.stroke()
      // Hub — ornate double circle
      ctx.strokeStyle = ink; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(wx, wy, 7, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.arc(wx, wy, 3, 0, Math.PI * 2); ctx.fill()
      // Vine spokes — curved, not straight
      ctx.strokeStyle = inkLight; ctx.lineWidth = 1
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        const bend = (i % 2 === 0 ? 1 : -1) * 8
        const mx = wx + Math.cos(a) * wheelR * 0.5 + Math.cos(a + Math.PI/2) * bend
        const my = wy + Math.sin(a) * wheelR * 0.5 + Math.sin(a + Math.PI/2) * bend
        ctx.beginPath()
        ctx.moveTo(wx + Math.cos(a) * 9, wy + Math.sin(a) * 9)
        ctx.quadraticCurveTo(mx, my, wx + Math.cos(a) * (wheelR - 7), wy + Math.sin(a) * (wheelR - 7))
        ctx.stroke()
      }
      // Tiny decorative dots at spoke ends
      ctx.fillStyle = ink
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        ctx.beginPath()
        ctx.arc(wx + Math.cos(a) * (wheelR - 6), wy + Math.sin(a) * (wheelR - 6), 1.2, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    drawArtNouveauWheel(rearX, axleY)
    drawArtNouveauWheel(frontX, axleY)

    // === FRAME — flowing curves, not straight tubes ===
    const bbX = cx - 8
    const bbY = axleY - 3
    const seatX = cx - 28
    const seatY = cy - 38
    const headX = cx + 52
    const headY = cy - 32

    ctx.strokeStyle = ink; ctx.lineWidth = 2.5

    // Seat tube — gentle S-curve
    ctx.beginPath()
    ctx.moveTo(rearX, axleY)
    ctx.bezierCurveTo(rearX + 15, axleY - 25, seatX - 10, seatY + 30, seatX, seatY)
    ctx.stroke()

    // Top tube — gentle arc
    ctx.beginPath()
    ctx.moveTo(seatX, seatY)
    ctx.quadraticCurveTo(cx + 10, seatY - 12, headX, headY)
    ctx.stroke()

    // Down tube — flowing curve
    ctx.beginPath()
    ctx.moveTo(headX, headY)
    ctx.bezierCurveTo(headX - 15, headY + 25, bbX + 15, bbY - 15, bbX, bbY)
    ctx.stroke()

    // Chain stay — slight bow
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(rearX, axleY)
    ctx.quadraticCurveTo(cx - 45, axleY + 5, bbX, bbY)
    ctx.stroke()

    // Fork — elegant curve
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(headX, headY)
    ctx.bezierCurveTo(headX + 5, headY + 20, frontX - 5, axleY - 20, frontX, axleY)
    ctx.stroke()

    // Seat — art nouveau organic shape
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(seatX - 14, seatY - 2)
    ctx.quadraticCurveTo(seatX, seatY - 8, seatX + 14, seatY - 2)
    ctx.stroke()
    // Seat decorative curl
    ctx.strokeStyle = inkLight; ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(seatX - 14, seatY - 2)
    ctx.quadraticCurveTo(seatX - 18, seatY + 2, seatX - 15, seatY + 6)
    ctx.stroke()

    // Handlebars — flowing organic curves
    ctx.strokeStyle = ink; ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(headX, headY)
    ctx.quadraticCurveTo(headX - 2, headY - 18, headX - 10, headY - 22)
    ctx.stroke()
    // Handlebar curl
    ctx.beginPath()
    ctx.moveTo(headX - 10, headY - 22)
    ctx.quadraticCurveTo(headX - 16, headY - 24, headX - 14, headY - 18)
    ctx.stroke()
    // Forward grip
    ctx.beginPath()
    ctx.moveTo(headX, headY)
    ctx.quadraticCurveTo(headX + 6, headY - 14, headX + 10, headY - 18)
    ctx.stroke()

    // Bottom bracket — ornate ring
    ctx.strokeStyle = ink; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(bbX, bbY, 9, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = inkLight; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(bbX, bbY, 5, 0, Math.PI * 2); ctx.stroke()

    // === WINGS — art nouveau: organic, flowing, with decorative feather curves ===

    // Left wing — main shape
    ctx.strokeStyle = ink; ctx.lineWidth = 2

    // Upper edge — long sweeping curve
    ctx.beginPath()
    ctx.moveTo(seatX + 5, seatY + 2)
    ctx.bezierCurveTo(
      seatX - 30, seatY - 40,
      seatX - 80, seatY - 70,
      seatX - 145, seatY - 78
    )
    ctx.stroke()

    // Lower edge
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(seatX - 2, seatY + 12)
    ctx.bezierCurveTo(
      seatX - 35, seatY - 10,
      seatX - 90, seatY - 38,
      seatX - 145, seatY - 52
    )
    ctx.stroke()

    // Wing tip — tapered point (not blunt)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(seatX - 145, seatY - 78)
    ctx.quadraticCurveTo(seatX - 152, seatY - 65, seatX - 145, seatY - 52)
    ctx.stroke()

    // Wing fill
    ctx.fillStyle = inkGhost
    ctx.beginPath()
    ctx.moveTo(seatX + 5, seatY + 2)
    ctx.bezierCurveTo(seatX - 30, seatY - 40, seatX - 80, seatY - 70, seatX - 145, seatY - 78)
    ctx.quadraticCurveTo(seatX - 152, seatY - 65, seatX - 145, seatY - 52)
    ctx.bezierCurveTo(seatX - 90, seatY - 38, seatX - 35, seatY - 10, seatX - 2, seatY + 12)
    ctx.closePath()
    ctx.fill()

    // Feather lines — flowing curves, not straight
    ctx.strokeStyle = inkFaint; ctx.lineWidth = 1
    for (let i = 1; i <= 7; i++) {
      const t = i / 8
      ctx.beginPath()
      const startX = seatX + 5 + (seatX - 2 - seatX - 5) * t * 0.3
      const startY = seatY + 2 + (seatY + 12 - seatY - 2) * t
      const endX = seatX - 145
      const endY = seatY - 78 + (seatY - 52 - seatY + 78) * t
      const cpX = (startX + endX) / 2 + (1 - t) * 20
      const cpY = (startY + endY) / 2 - 15
      ctx.moveTo(startX, startY)
      ctx.quadraticCurveTo(cpX, cpY, endX, endY)
      ctx.stroke()
    }

    // Decorative curl at wing root
    ctx.strokeStyle = inkLight; ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(seatX - 2, seatY + 12)
    ctx.quadraticCurveTo(seatX + 5, seatY + 20, seatX + 12, seatY + 15)
    ctx.stroke()

    // Right wing — mirror
    ctx.strokeStyle = ink; ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(headX - 5, headY + 2)
    ctx.bezierCurveTo(
      headX + 30, headY - 40,
      headX + 80, headY - 70,
      headX + 145, headY - 78
    )
    ctx.stroke()

    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(headX + 2, headY + 12)
    ctx.bezierCurveTo(
      headX + 35, headY - 10,
      headX + 90, headY - 38,
      headX + 145, headY - 52
    )
    ctx.stroke()

    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(headX + 145, headY - 78)
    ctx.quadraticCurveTo(headX + 152, headY - 65, headX + 145, headY - 52)
    ctx.stroke()

    ctx.fillStyle = inkGhost
    ctx.beginPath()
    ctx.moveTo(headX - 5, headY + 2)
    ctx.bezierCurveTo(headX + 30, headY - 40, headX + 80, headY - 70, headX + 145, headY - 78)
    ctx.quadraticCurveTo(headX + 152, headY - 65, headX + 145, headY - 52)
    ctx.bezierCurveTo(headX + 90, headY - 38, headX + 35, headY - 10, headX + 2, headY + 12)
    ctx.closePath()
    ctx.fill()

    // Right feather lines
    ctx.strokeStyle = inkFaint; ctx.lineWidth = 1
    for (let i = 1; i <= 7; i++) {
      const t = i / 8
      ctx.beginPath()
      const startX = headX - 5 + (headX + 2 - headX + 5) * t * 0.3
      const startY = headY + 2 + (headY + 12 - headY - 2) * t
      const endX = headX + 145
      const endY = headY - 78 + (headY - 52 - headY + 78) * t
      const cpX = (startX + endX) / 2 - (1 - t) * 20
      const cpY = (startY + endY) / 2 - 15
      ctx.moveTo(startX, startY)
      ctx.quadraticCurveTo(cpX, cpY, endX, endY)
      ctx.stroke()
    }

    // Decorative curl at right wing root
    ctx.strokeStyle = inkLight; ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(headX + 2, headY + 12)
    ctx.quadraticCurveTo(headX - 5, headY + 20, headX - 12, headY + 15)
    ctx.stroke()

    // === Small decorative flourish under bottom bracket ===
    ctx.strokeStyle = inkLight; ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(bbX - 12, bbY + 12)
    ctx.quadraticCurveTo(bbX, bbY + 20, bbX + 12, bbY + 12)
    ctx.stroke()

  }, [])

  return (
    <div style={{ textAlign: 'center' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '520px', height: '240px', border: '1px solid #eee', borderRadius: '8px' }}
      />
      <div style={{ marginTop: '12px', fontSize: '14px', color: '#999', letterSpacing: '0.05em' }}>5. Bitmap drawing — bike with wings</div>
    </div>
  )
}

export default function ShapesTest() {
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400&display=swap" rel="stylesheet" />
      <div style={{
        fontFamily: "'DM Sans', system-ui, sans-serif",
        background: '#fff',
        minHeight: '100vh',
        padding: '48px 32px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '48px',
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: 300, color: '#1a1a1a', letterSpacing: '0.08em' }}>
          Shape options — 52x20
        </h1>
        {shapes.map(s => (
          <ShapeCanvas key={s.name} grid={s.grid} label={s.name} />
        ))}
        <BikeWithWingsCanvas />
      </div>
    </>
  )
}
