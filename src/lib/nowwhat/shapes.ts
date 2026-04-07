export const COLS = 26
export const ROWS = 10

export type Grid = number[][]

export function mk(fn: (c: number, r: number) => boolean): Grid {
  const g: Grid = []
  for (let r = 0; r < ROWS; r++) {
    const row: number[] = []
    for (let c = 0; c < COLS; c++) row.push(fn(c, r) ? 1 : 0)
    g.push(row)
  }
  return g
}

export function emb(s: number[][]): Grid {
  const sR = s.length, sC = s[0].length
  const oR = Math.floor((ROWS - sR) / 2), oC = Math.floor((COLS - sC) / 2)
  return mk((c, r) => {
    const lr = r - oR, lc = c - oC
    return lr >= 0 && lr < sR && lc >= 0 && lc < sC && s[lr][lc] === 1
  })
}

export function personAt(g: Grid, cx: number, f: number) {
  const p = [[0,1,0],[0,1,0],[1,1,1],[0,1,0],[1,0,1]]
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 3; c++)
      if (p[r][c]) {
        const gr = f - 4 + r, gc = cx - 1 + c
        if (gr >= 0 && gr < ROWS && gc >= 0 && gc < COLS) g[gr][gc] = 1
      }
}

export function petAt(g: Grid, cx: number, f: number) {
  const br = f - 1
  for (let dc = -1; dc <= 1; dc++) {
    const gc = cx + dc
    if (br >= 0 && br < ROWS && gc >= 0 && gc < COLS) g[br][gc] = 1
  }
  if (br - 1 >= 0 && cx + 1 < COLS) g[br - 1][cx + 1] = 1
  if (br - 2 >= 0 && cx + 1 < COLS) g[br - 2][cx + 1] = 1
  if (f < ROWS && cx - 1 >= 0) g[f][cx - 1] = 1
  if (f < ROWS && cx + 1 < COLS) g[f][cx + 1] = 1
  if (br >= 0 && cx - 1 >= 0) g[br - 1][cx - 1] = 1
}

export interface Shape { name: string; canWin: boolean; grid: Grid }

export const ALL_SHAPES: Shape[] = [
  {name:'person',canWin:true,grid:emb([[0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,1,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,1,1,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,1,1,0,0,1,1,0,0],[0,1,1,0,0,0,0,1,1,0]])},
  {name:'house',canWin:true,grid:emb([[0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,1,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,1,1,0],[1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1],[1,1,0,0,1,1,0,0,1,1],[1,1,0,0,1,1,0,0,1,1],[1,1,1,1,0,0,1,1,1,1],[1,1,1,1,0,0,1,1,1,1]])},
  {name:'heart',canWin:true,grid:emb([[0,0,0,0,0,0,0,0,0,0],[0,1,1,1,0,0,1,1,1,0],[1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1],[0,1,1,1,1,1,1,1,1,0],[0,0,1,1,1,1,1,1,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,0,0,0,0,0,0]])},
  {name:'star',canWin:false,grid:emb([[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[1,1,1,1,1,1,1,1,1,1],[0,1,1,1,1,1,1,1,1,0],[0,0,1,1,1,1,1,1,0,0],[0,0,1,1,0,0,1,1,0,0],[0,1,1,0,0,0,0,1,1,0],[1,1,0,0,0,0,0,0,1,1],[0,0,0,0,0,0,0,0,0,0]])},
  {name:'tree',canWin:false,grid:emb([[0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,1,1,1,1,1,1,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,1,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,1,1,0],[0,0,1,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,1,1,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0]])},
  {name:'arrow',canWin:false,grid:emb([[0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,1,1,1,1,1,1,0,0],[0,1,1,0,1,1,0,1,1,0],[1,1,0,0,1,1,0,0,1,1],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0]])},
  {name:'question',canWin:true,grid:emb([[0,0,1,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,1,1,0],[1,1,0,0,0,0,1,1,1,0],[0,0,0,0,0,0,1,1,1,0],[0,0,0,0,1,1,1,0,0,0],[0,0,0,1,1,1,0,0,0,0],[0,0,0,1,1,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0],[0,0,0,1,1,0,0,0,0,0],[0,0,0,1,1,0,0,0,0,0]])},
  {name:'exclamation',canWin:true,grid:emb([[0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,0,0,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0]])},
  {name:'lightbulb',canWin:true,grid:emb([[0,0,0,1,1,1,1,0,0,0],[0,0,1,1,1,1,1,1,0,0],[0,1,1,1,0,0,1,1,1,0],[0,1,1,0,0,0,0,1,1,0],[0,1,1,0,0,0,0,1,1,0],[0,0,1,1,0,0,1,1,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,1,0,0,1,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,0,1,1,0,0,0,0]])},
  {name:'key',canWin:false,grid:emb([[0,0,0,1,1,1,1,0,0,0],[0,0,1,1,0,0,1,1,0,0],[0,0,1,1,0,0,1,1,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,1,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,1,0,0,0],[0,0,0,0,1,1,0,0,0,0]])},
  {name:'note',canWin:true,grid:emb([[0,0,0,0,0,1,1,1,1,0],[0,0,0,0,0,1,1,1,1,0],[0,0,0,0,0,1,1,0,0,0],[0,0,0,0,0,1,1,0,0,0],[0,0,0,0,0,1,1,0,0,0],[0,0,0,0,0,1,1,0,0,0],[0,1,1,1,1,1,1,0,0,0],[1,1,1,1,1,1,0,0,0,0],[1,1,1,1,1,0,0,0,0,0],[0,1,1,1,0,0,0,0,0,0]])},
  {name:'bridge',canWin:false,grid:mk((c,r) => {
    if ((c>=2&&c<=3) && r>=1) return true
    if ((c>=22&&c<=23) && r>=1) return true
    if (r>=4&&r<=5&&c>=2&&c<=23) return true
    if (r===3&&c>=4&&c<=21) return true
    if (r===2&&c>=7&&c<=18) return true
    if (r===1&&c>=10&&c<=15) return true
    return false
  })},
  {name:'equals',canWin:false,grid:mk((c,r) => {
    if (c<2||c>23) return false
    return r===2||r===3||r===6||r===7
  })},
  {name:'waves',canWin:true,grid:mk((c,r) => {
    const w1 = 3+Math.sin(c*0.55)*1.8, w2 = 6.5+Math.sin(c*0.55+0.5)*1.8
    return Math.abs(r-w1)<1 || Math.abs(r-w2)<1
  })},
  {name:'sunrise',canWin:true,grid:mk((c,r) => {
    if ((r===6||r===7) && c>=1&&c<=24) return true
    const dx = c-12.5, dy = r-6.5
    return r<=6 && Math.sqrt(dx*dx+dy*dy)<=5.5
  })},
  {name:'plus',canWin:false,grid:mk((c,r) => ((r===4||r===5)&&c>=1&&c<=24) || ((c===12||c===13)&&r>=0&&r<=9))},
  {name:'hourglass',canWin:false,grid:mk((c,r) => {
    const hw = r<=4 ? 12-r*2.2 : 12-(9-r)*2.2
    return Math.abs(c-13)<=hw && hw>0
  })},
  {name:'barbell',canWin:false,grid:mk((c,r) => {
    const dl = Math.sqrt((c-4)**2+(r-4.5)**2), dr = Math.sqrt((c-21)**2+(r-4.5)**2)
    return dl<=3.5 || dr<=3.5 || ((r===4||r===5)&&c>=4&&c<=21)
  })},
  {name:'spectrum',canWin:false,grid:mk((c,r) => {
    if (c<1||c>24) return false
    const h = 2+Math.floor((c-1)*7/24)
    return r>=9-h
  })},
  {name:'ring',canWin:true,grid:mk((c,r) => {
    const dx = (c-12.5)/2.2, dy = r-4.5
    const d = Math.sqrt(dx*dx+dy*dy)
    return d<=4.8 && d>=3.0
  })},
  {name:'frame',canWin:false,grid:mk((c,r) => {
    if (c<1||c>24) return false
    return r<=1 || r>=8 || c<=2 || c>=23
  })},
  {name:'diamond',canWin:true,grid:mk((c,r) => {
    const dx = Math.abs(c-12.5)/2.4, dy = Math.abs(r-4.5)
    const d = dx+dy
    return d<=4.8 && d>=3.2
  })},
  {name:'shield',canWin:false,grid:mk((c,r) => {
    if (c<3||c>22) return false
    if (r===0&&c>=3&&c<=22) return true
    if (r>=0&&r<=5&&(c===3||c===4||c===21||c===22)) return true
    if (r>5) {
      const dx = (c-12.5)/10, dy = (r-5)/4.5
      const d = Math.sqrt(dx*dx+dy*dy)
      return d<=1.05 && d>=0.75
    }
    return false
  })},
  {name:'brackets',canWin:true,grid:mk((c,r) => (c>=2&&c<=4)||(c>=2&&c<=7&&(r<=1||r>=8))||(c>=21&&c<=23)||(c>=18&&c<=23&&(r<=1||r>=8)))},
  {name:'three people',canWin:true,grid:(() => { const g = mk(() => false); personAt(g,10,9); personAt(g,13,9); personAt(g,16,9); return g })()},
  {name:'crowd',canWin:true,grid:(() => { const g = mk(() => false); personAt(g,5,9); personAt(g,9,9); personAt(g,13,9); personAt(g,17,9); personAt(g,21,9); return g })()},
  {name:'gathering',canWin:true,grid:mk((c,r) => {
    const cx=12.5,cy=4.5,dx=(c-cx)/2,dy=r-cy
    const d = Math.sqrt(dx*dx+dy*dy)
    if (d>=3.5&&d<=4.8) {
      const a = Math.atan2(dy,dx), s = Math.round(a/(Math.PI/5))*(Math.PI/5)
      const sx = Math.cos(s)*4.1*2+cx, sy = Math.sin(s)*4.1+cy
      if (Math.abs(c-sx)<1.3&&Math.abs(r-sy)<1.3) return true
    }
    return false
  })},
  {name:'people+pet',canWin:true,grid:(() => { const g = mk(() => false); personAt(g,10,9); personAt(g,14,9); petAt(g,18,9); return g })()},
  {name:'family',canWin:true,grid:(() => {
    const g = mk(() => false)
    personAt(g,9,9); personAt(g,13,9)
    const kid = [[0,1,0],[1,1,1],[0,1,0],[1,0,1]]
    for (let r=0;r<4;r++) for (let c=0;c<3;c++) if (kid[r][c]) {
      const gr=6+r, gc=16+c
      if (gr<ROWS&&gc<COLS) g[gr][gc]=1
    }
    petAt(g,20,9)
    return g
  })()},
  {name:'holding hands',canWin:true,grid:(() => { const g = mk(() => false); personAt(g,10,9); personAt(g,16,9); g[6][12]=1; g[6][13]=1; g[6][14]=1; return g })()},
  {name:'skyline',canWin:true,grid:mk((c,r) => {
    const h = [0,0,3,3,6,6,4,4,8,8,5,5,3,3,7,7,9,9,5,5,4,4,6,6,0,0]
    return r>=(ROWS-h[c])
  })},
  {name:'village',canWin:true,grid:(() => {
    const g = mk(() => false)
    function h(cx: number, f: number, ht: number) {
      for (let r=f-ht+1;r<=f;r++) for (let dc=-2;dc<=2;dc++) {
        const gc=cx+dc; if (r>=0&&r<ROWS&&gc>=0&&gc<COLS) g[r][gc]=1
      }
      const rb=f-ht
      if (rb>=0) for (let dc=-2;dc<=2;dc++) { const gc=cx+dc; if (gc>=0&&gc<COLS) g[rb][gc]=1 }
      if (rb-1>=0) for (let dc=-1;dc<=1;dc++) { const gc=cx+dc; if (gc>=0&&gc<COLS) g[rb-1][gc]=1 }
      if (rb-2>=0) g[rb-2][cx]=1
      if (f<ROWS) g[f][cx]=0
      if (f-1>=0) g[f-1][cx]=0
    }
    h(4,9,4); h(10,9,5); h(16,9,4); h(22,9,6)
    return g
  })()},
  {name:'park',canWin:true,grid:(() => {
    const g = mk(() => false)
    function t(cx: number) {
      g[2][cx]=1
      for (let dc=-1;dc<=1;dc++) if (cx+dc>=0&&cx+dc<COLS) g[3][cx+dc]=1
      for (let dc=-2;dc<=2;dc++) if (cx+dc>=0&&cx+dc<COLS) g[4][cx+dc]=1
      for (let dc=-1;dc<=1;dc++) if (cx+dc>=0&&cx+dc<COLS) g[5][cx+dc]=1
      g[6][cx]=1; g[7][cx]=1; g[8][cx]=1
    }
    t(3); t(9); t(22)
    for (let c=13;c<=18;c++) g[8][c]=1
    g[9][13]=1; g[9][18]=1; g[7][15]=1; g[7][16]=1; g[6][15]=1; g[6][16]=1; g[5][15]=1
    return g
  })()},
  {name:'city',canWin:true,grid:mk((c,r) => {
    if (r===9) return c>=1&&c<=24
    const b = [{x:2,w:3,h:5},{x:6,w:2,h:7},{x:9,w:4,h:4},{x:14,w:2,h:8},{x:17,w:3,h:5},{x:21,w:3,h:6}]
    for (const bl of b) if (c>=bl.x&&c<bl.x+bl.w&&r>=9-bl.h&&r<9) { if (r<8&&(c+r)%2===0) return false; return true }
    return false
  })},
  {name:'mountains',canWin:true,grid:mk((c,r) => {
    const p1=9-Math.max(0,7-Math.abs(c-6)*1.2), p2=9-Math.max(0,9-Math.abs(c-14)*1.1), p3=9-Math.max(0,6-Math.abs(c-21)*1)
    return r>=Math.min(p1,p2,p3)
  })},
  {name:'two trees',canWin:true,grid:(() => {
    const g = mk(() => false)
    for (let c=3;c<=22;c++) g[9][c]=1
    function bt(cx: number) {
      g[2][cx]=1
      for (let dc=-1;dc<=1;dc++) if (cx+dc>=0&&cx+dc<COLS) g[3][cx+dc]=1
      for (let dc=-2;dc<=2;dc++) if (cx+dc>=0&&cx+dc<COLS) g[4][cx+dc]=1
      for (let dc=-3;dc<=3;dc++) if (cx+dc>=0&&cx+dc<COLS) g[5][cx+dc]=1
      for (let dc=-2;dc<=2;dc++) if (cx+dc>=0&&cx+dc<COLS) g[6][cx+dc]=1
      g[7][cx]=1; g[8][cx]=1
    }
    bt(8); bt(18)
    return g
  })()},
  {name:'flowers',canWin:true,grid:mk((c,r) => {
    if (r>=8&&c>=1&&c<=24) return true
    const fl = [3,6,8,11,14,16,19,22]
    for (const fx of fl) {
      if (c===fx&&(r===7||r===6)) return true
      if (r===5&&Math.abs(c-fx)<=1) return true
      if (r===4&&c===fx) return true
    }
    return false
  })},
  {name:'landscape',canWin:false,grid:mk((c,r) => {
    const sd = Math.sqrt((c-21)**2+(r-2)**2)
    if (sd<=2.2) return true
    if (r===2&&c>=4&&c<=9) return true
    if (r===1&&c>=5&&c<=8) return true
    if (r>=8) return true
    const hh = 2.5+Math.sin(c*0.3)*1.5
    return r>=10-hh && r<8
  })},
  {name:'constellation',canWin:true,grid:(() => {
    const g = mk(() => false)
    const s: [number,number][] = [[3,2],[7,1],[10,4],[13,2],[16,6],[19,3],[22,1],[24,5],[8,7],[15,8],[20,7]]
    for (const [sc,sr] of s) if (sr<ROWS&&sc<COLS) g[sr][sc]=1
    const lk: [number,number][] = [[0,1],[1,2],[2,3],[3,5],[5,6],[4,7],[2,4],[8,4],[9,4],[10,7]]
    function ln(x0: number,y0: number,x1: number,y1: number) {
      const st = Math.max(Math.abs(x1-x0),Math.abs(y1-y0))
      for (let i=0;i<=st;i++) {
        const t = st===0?0:i/st
        const x = Math.round(x0+(x1-x0)*t), y = Math.round(y0+(y1-y0)*t)
        if (y>=0&&y<ROWS&&x>=0&&x<COLS) g[y][x]=1
      }
    }
    for (const [a,b] of lk) ln(s[a][0],s[a][1],s[b][0],s[b][1])
    return g
  })()},
  {name:'planet',canWin:true,grid:mk((c,r) => {
    const cx=13,cy=4.5
    if (Math.sqrt((c-cx)**2+(r-cy)**2)<=3.2) return true
    const rx=(c-cx)/3.5, ry=(r-cy-0.5)/0.8
    const rd = Math.sqrt(rx*rx+ry*ry)
    return rd>=1.8 && rd<=2.2 && Math.abs(r-cy)<=3
  })},
  {name:'crescent',canWin:true,grid:mk((c,r) => {
    const cx=13,cy=4.5
    return Math.sqrt((c-cx)**2+(r-cy)**2)<=4.5 && Math.sqrt((c-cx-2)**2+(r-cy+1)**2)>=3.8
  })},
  {name:'rocket',canWin:true,grid:(() => {
    const g = mk(() => false)
    const cx=13
    g[0][cx]=1; g[1][cx-1]=1; g[1][cx]=1; g[1][cx+1]=1
    for (let r=2;r<=6;r++) { g[r][cx-1]=1; g[r][cx]=1; g[r][cx+1]=1 }
    g[5][cx-2]=1; g[6][cx-2]=1; g[7][cx-3]=1
    g[5][cx+2]=1; g[6][cx+2]=1; g[7][cx+3]=1
    g[7][cx]=1; g[8][cx-1]=1; g[8][cx+1]=1; g[9][cx]=1
    return g
  })()},
  {name:'galaxy',canWin:true,grid:mk((c,r) => {
    const cx=12.5,cy=4.5,dx=c-cx,dy=(r-cy)*2
    const d = Math.sqrt(dx*dx+dy*dy)
    const a = Math.atan2(dy,dx)
    const a1 = (a+d*0.35+Math.PI*2)%(Math.PI*2), a2 = (a1+Math.PI)%(Math.PI*2)
    const aw = 0.6+(1-d/14)*0.5
    const on = Math.min(Math.abs(a1-Math.PI),Math.abs(a1-Math.PI*3),Math.abs(a2-Math.PI),Math.abs(a2-Math.PI*3))<aw
    return d<3 || (d<12&&on)
  })},
]

export const ACHIEVABLE = ALL_SHAPES.filter(s => s.canWin)
export const IMPOSSIBLE = ALL_SHAPES.filter(s => !s.canWin)
