import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'L43: wave function collapse — a circuit emerges from uncertainty'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  // Draw a coarse circuit pattern that suggests WFC output
  const CITRUS = ['#FF4E50', '#FC913A', '#F9D423', '#B4E33D', '#FF6B81']
  const cellSize = 50
  const cols = 12
  const rows = 8

  // Hand-crafted tile indices forming a readable circuit
  // Tile format: [N, E, S, W], 1 = wire
  const grid: number[][] = [
    [0,3,1,1,4,0,0,3,1,4,0,0],
    [0,2,0,0,2,0,0,2,0,2,0,0],
    [0,5,1,9,10,1,1,6,0,8,1,1],
    [0,0,0,2,0,0,0,0,0,2,0,0],
    [0,0,0,2,0,3,1,4,0,5,1,1],
    [0,3,1,10,1,6,0,5,1,1,0,0],
    [0,2,0,0,0,0,0,0,0,0,0,0],
    [0,5,1,1,1,1,1,1,1,1,6,0],
  ]
  const TILES: number[][] = [
    [0,0,0,0],[0,1,0,1],[1,0,1,0],[1,1,0,0],[1,0,0,1],
    [0,1,1,0],[0,0,1,1],[0,1,1,1],[1,0,1,1],[1,1,0,1],[1,1,1,0],[1,1,1,1],
  ]
  // Compute components via simple flood-fill
  const comp: number[][] = Array.from({ length: rows }, () => Array(cols).fill(-1))
  const DIRS = [[-1,0],[0,1],[1,0],[0,-1]]
  const OPP = [2,3,0,1]
  let nextId = 0
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (comp[y][x] !== -1) continue
    const e = TILES[grid[y][x]]
    if (e[0]+e[1]+e[2]+e[3] === 0) continue
    const stack: [number, number][] = [[y, x]]
    comp[y][x] = nextId
    while (stack.length > 0) {
      const [cy, cx] = stack.pop()!
      const ce = TILES[grid[cy][cx]]
      for (let d = 0; d < 4; d++) {
        if (ce[d] === 0) continue
        const ny = cy + DIRS[d][0], nx = cx + DIRS[d][1]
        if (ny<0||ny>=rows||nx<0||nx>=cols) continue
        if (comp[ny][nx] !== -1) continue
        const ne = TILES[grid[ny][nx]]
        if (ne[OPP[d]] === 1) { comp[ny][nx] = nextId; stack.push([ny, nx]) }
      }
    }
    nextId++
  }

  // Build wire SVG paths
  const strokeW = 6
  const offX = (1200 - cols * cellSize) / 2
  const offY = (630 - rows * cellSize) / 2 - 20

  const wireSegs: React.ReactElement[] = []
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const e = TILES[grid[y][x]]
    if (e[0]+e[1]+e[2]+e[3] === 0) continue
    const cx = offX + x * cellSize
    const cy = offY + y * cellSize
    const mx = cx + cellSize / 2
    const my = cy + cellSize / 2
    const color = CITRUS[(comp[y][x] % CITRUS.length + CITRUS.length) % CITRUS.length]
    if (e[0]) wireSegs.push(<div key={`${y}-${x}-n`} style={{ position: 'absolute', left: mx - strokeW/2, top: cy, width: strokeW, height: cellSize/2, background: color }} />)
    if (e[1]) wireSegs.push(<div key={`${y}-${x}-e`} style={{ position: 'absolute', left: mx, top: my - strokeW/2, width: cellSize/2, height: strokeW, background: color }} />)
    if (e[2]) wireSegs.push(<div key={`${y}-${x}-s`} style={{ position: 'absolute', left: mx - strokeW/2, top: my, width: strokeW, height: cellSize/2, background: color }} />)
    if (e[3]) wireSegs.push(<div key={`${y}-${x}-w`} style={{ position: 'absolute', left: cx, top: my - strokeW/2, width: cellSize/2, height: strokeW, background: color }} />)
    const edgeCount = e[0]+e[1]+e[2]+e[3]
    const isStraight = (edgeCount === 2 && ((e[0] && e[2]) || (e[1] && e[3])))
    if (!isStraight) {
      wireSegs.push(
        <div key={`${y}-${x}-dot`} style={{
          position: 'absolute', left: mx - strokeW, top: my - strokeW,
          width: strokeW * 2, height: strokeW * 2, borderRadius: strokeW * 2, background: color,
        }} />
      )
    }
  }

  return new ImageResponse(
    <div style={{
      width: 1200, height: 630,
      background: 'linear-gradient(135deg, #FFECD2, #FFF0F0)',
      display: 'flex', position: 'relative', fontFamily: 'monospace',
    }}>
      {wireSegs}
      <div style={{
        position: 'absolute', bottom: 40, left: 50,
        display: 'flex', flexDirection: 'column',
      }}>
        <span style={{ fontSize: 56, color: '#2A2218' }}>L43</span>
        <span style={{ fontSize: 20, color: '#2A2218', opacity: 0.55, marginTop: 4 }}>
          wave function collapse — a circuit emerges from uncertainty
        </span>
      </div>
    </div>,
    { ...size },
  )
}
