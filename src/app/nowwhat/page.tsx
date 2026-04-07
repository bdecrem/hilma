'use client'

import { useEffect, useRef } from 'react'

const COLS = 26
const ROWS = 10

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

function emb(s: number[][]): Grid {
  const sR = s.length, sC = s[0].length
  const oR = Math.floor((ROWS - sR) / 2), oC = Math.floor((COLS - sC) / 2)
  return mk((c, r) => {
    const lr = r - oR, lc = c - oC
    return lr >= 0 && lr < sR && lc >= 0 && lc < sC && s[lr][lc] === 1
  })
}

function personAt(g: Grid, cx: number, f: number) {
  const p = [[0,1,0],[0,1,0],[1,1,1],[0,1,0],[1,0,1]]
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 3; c++)
      if (p[r][c]) {
        const gr = f - 4 + r, gc = cx - 1 + c
        if (gr >= 0 && gr < ROWS && gc >= 0 && gc < COLS) g[gr][gc] = 1
      }
}

function petAt(g: Grid, cx: number, f: number) {
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

interface Shape { name: string; canWin: boolean; grid: Grid }

const ALL_SHAPES: Shape[] = [
  // 1 person
  {name:'person',canWin:true,grid:emb([[0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,1,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,1,1,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,1,1,0,0,1,1,0,0],[0,1,1,0,0,0,0,1,1,0]])},
  // 2 house
  {name:'house',canWin:true,grid:emb([[0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,1,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,1,1,0],[1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1],[1,1,0,0,1,1,0,0,1,1],[1,1,0,0,1,1,0,0,1,1],[1,1,1,1,0,0,1,1,1,1],[1,1,1,1,0,0,1,1,1,1]])},
  // 3 heart
  {name:'heart',canWin:true,grid:emb([[0,0,0,0,0,0,0,0,0,0],[0,1,1,1,0,0,1,1,1,0],[1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1,1,1,1,1,1],[0,1,1,1,1,1,1,1,1,0],[0,0,1,1,1,1,1,1,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,0,0,0,0,0,0]])},
  // 4 star — ALWAYS FAILS
  {name:'star',canWin:false,grid:emb([[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[1,1,1,1,1,1,1,1,1,1],[0,1,1,1,1,1,1,1,1,0],[0,0,1,1,1,1,1,1,0,0],[0,0,1,1,0,0,1,1,0,0],[0,1,1,0,0,0,0,1,1,0],[1,1,0,0,0,0,0,0,1,1],[0,0,0,0,0,0,0,0,0,0]])},
  // 5 tree — ALWAYS FAILS
  {name:'tree',canWin:false,grid:emb([[0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,1,1,1,1,1,1,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,1,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,1,1,0],[0,0,1,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,1,1,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0]])},
  // 6 arrow — ALWAYS FAILS
  {name:'arrow',canWin:false,grid:emb([[0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,1,1,1,1,1,1,0,0],[0,1,1,0,1,1,0,1,1,0],[1,1,0,0,1,1,0,0,1,1],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0]])},
  // 7 question
  {name:'question',canWin:true,grid:emb([[0,0,1,1,1,1,1,1,0,0],[0,1,1,1,1,1,1,1,1,0],[1,1,0,0,0,0,1,1,1,0],[0,0,0,0,0,0,1,1,1,0],[0,0,0,0,1,1,1,0,0,0],[0,0,0,1,1,1,0,0,0,0],[0,0,0,1,1,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0],[0,0,0,1,1,0,0,0,0,0],[0,0,0,1,1,0,0,0,0,0]])},
  // 8 exclamation
  {name:'exclamation',canWin:true,grid:emb([[0,0,0,0,1,1,0,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,0,0,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0]])},
  // 9 lightbulb
  {name:'lightbulb',canWin:true,grid:emb([[0,0,0,1,1,1,1,0,0,0],[0,0,1,1,1,1,1,1,0,0],[0,1,1,1,0,0,1,1,1,0],[0,1,1,0,0,0,0,1,1,0],[0,1,1,0,0,0,0,1,1,0],[0,0,1,1,0,0,1,1,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,1,0,0,1,0,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,0,1,1,0,0,0,0]])},
  // 10 key — ALWAYS FAILS
  {name:'key',canWin:false,grid:emb([[0,0,0,1,1,1,1,0,0,0],[0,0,1,1,0,0,1,1,0,0],[0,0,1,1,0,0,1,1,0,0],[0,0,0,1,1,1,1,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,1,0,0,0],[0,0,0,0,1,1,0,0,0,0],[0,0,0,0,1,1,1,0,0,0],[0,0,0,0,1,1,0,0,0,0]])},
  // 11 music note
  {name:'note',canWin:true,grid:emb([[0,0,0,0,0,1,1,1,1,0],[0,0,0,0,0,1,1,1,1,0],[0,0,0,0,0,1,1,0,0,0],[0,0,0,0,0,1,1,0,0,0],[0,0,0,0,0,1,1,0,0,0],[0,0,0,0,0,1,1,0,0,0],[0,1,1,1,1,1,1,0,0,0],[1,1,1,1,1,1,0,0,0,0],[1,1,1,1,1,0,0,0,0,0],[0,1,1,1,0,0,0,0,0,0]])},
  // 12 bridge — ALWAYS FAILS
  {name:'bridge',canWin:false,grid:mk((c,r) => {
    if ((c>=2&&c<=3) && r>=1) return true
    if ((c>=22&&c<=23) && r>=1) return true
    if (r>=4&&r<=5&&c>=2&&c<=23) return true
    if (r===3&&c>=4&&c<=21) return true
    if (r===2&&c>=7&&c<=18) return true
    if (r===1&&c>=10&&c<=15) return true
    return false
  })},
  // 13 equals — ALWAYS FAILS
  {name:'equals',canWin:false,grid:mk((c,r) => {
    if (c<2||c>23) return false
    return r===2||r===3||r===6||r===7
  })},
  // 14 waves
  {name:'waves',canWin:true,grid:mk((c,r) => {
    const w1 = 3+Math.sin(c*0.55)*1.8, w2 = 6.5+Math.sin(c*0.55+0.5)*1.8
    return Math.abs(r-w1)<1 || Math.abs(r-w2)<1
  })},
  // 15 sunrise
  {name:'sunrise',canWin:true,grid:mk((c,r) => {
    if ((r===6||r===7) && c>=1&&c<=24) return true
    const dx = c-12.5, dy = r-6.5
    return r<=6 && Math.sqrt(dx*dx+dy*dy)<=5.5
  })},
  // 16 plus — ALWAYS FAILS
  {name:'plus',canWin:false,grid:mk((c,r) => ((r===4||r===5)&&c>=1&&c<=24) || ((c===12||c===13)&&r>=0&&r<=9))},
  // 17 hourglass — ALWAYS FAILS
  {name:'hourglass',canWin:false,grid:mk((c,r) => {
    const hw = r<=4 ? 12-r*2.2 : 12-(9-r)*2.2
    return Math.abs(c-13)<=hw && hw>0
  })},
  // 18 barbell — ALWAYS FAILS
  {name:'barbell',canWin:false,grid:mk((c,r) => {
    const dl = Math.sqrt((c-4)**2+(r-4.5)**2), dr = Math.sqrt((c-21)**2+(r-4.5)**2)
    return dl<=3.5 || dr<=3.5 || ((r===4||r===5)&&c>=4&&c<=21)
  })},
  // 19 spectrum — ALWAYS FAILS
  {name:'spectrum',canWin:false,grid:mk((c,r) => {
    if (c<1||c>24) return false
    const h = 2+Math.floor((c-1)*7/24)
    return r>=9-h
  })},
  // 20 ring
  {name:'ring',canWin:true,grid:mk((c,r) => {
    const dx = (c-12.5)/2.2, dy = r-4.5
    const d = Math.sqrt(dx*dx+dy*dy)
    return d<=4.8 && d>=3.0
  })},
  // 21 frame — ALWAYS FAILS
  {name:'frame',canWin:false,grid:mk((c,r) => {
    if (c<1||c>24) return false
    return r<=1 || r>=8 || c<=2 || c>=23
  })},
  // 22 diamond
  {name:'diamond',canWin:true,grid:mk((c,r) => {
    const dx = Math.abs(c-12.5)/2.4, dy = Math.abs(r-4.5)
    const d = dx+dy
    return d<=4.8 && d>=3.2
  })},
  // 23 shield — ALWAYS FAILS
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
  // 24 brackets
  {name:'brackets',canWin:true,grid:mk((c,r) => (c>=2&&c<=4)||(c>=2&&c<=7&&(r<=1||r>=8))||(c>=21&&c<=23)||(c>=18&&c<=23&&(r<=1||r>=8)))},
  // 25 three people
  {name:'three people',canWin:true,grid:(() => { const g = mk(() => false); personAt(g,10,9); personAt(g,13,9); personAt(g,16,9); return g })()},
  // 26 crowd
  {name:'crowd',canWin:true,grid:(() => { const g = mk(() => false); personAt(g,5,9); personAt(g,9,9); personAt(g,13,9); personAt(g,17,9); personAt(g,21,9); return g })()},
  // 27 gathering
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
  // 28 people+pet
  {name:'people+pet',canWin:true,grid:(() => { const g = mk(() => false); personAt(g,10,9); personAt(g,14,9); petAt(g,18,9); return g })()},
  // 29 family
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
  // 30 holding hands
  {name:'holding hands',canWin:true,grid:(() => { const g = mk(() => false); personAt(g,10,9); personAt(g,16,9); g[6][12]=1; g[6][13]=1; g[6][14]=1; return g })()},
  // 31 skyline
  {name:'skyline',canWin:true,grid:mk((c,r) => {
    const h = [0,0,3,3,6,6,4,4,8,8,5,5,3,3,7,7,9,9,5,5,4,4,6,6,0,0]
    return r>=(ROWS-h[c])
  })},
  // 32 village
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
  // 33 park
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
  // 34 city block
  {name:'city',canWin:true,grid:mk((c,r) => {
    if (r===9) return c>=1&&c<=24
    const b = [{x:2,w:3,h:5},{x:6,w:2,h:7},{x:9,w:4,h:4},{x:14,w:2,h:8},{x:17,w:3,h:5},{x:21,w:3,h:6}]
    for (const bl of b) if (c>=bl.x&&c<bl.x+bl.w&&r>=9-bl.h&&r<9) { if (r<8&&(c+r)%2===0) return false; return true }
    return false
  })},
  // 35 mountains
  {name:'mountains',canWin:true,grid:mk((c,r) => {
    const p1=9-Math.max(0,7-Math.abs(c-6)*1.2), p2=9-Math.max(0,9-Math.abs(c-14)*1.1), p3=9-Math.max(0,6-Math.abs(c-21)*1)
    return r>=Math.min(p1,p2,p3)
  })},
  // 36 two trees
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
  // 37 flower field
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
  // 38 landscape — ALWAYS FAILS
  {name:'landscape',canWin:false,grid:mk((c,r) => {
    const sd = Math.sqrt((c-21)**2+(r-2)**2)
    if (sd<=2.2) return true
    if (r===2&&c>=4&&c<=9) return true
    if (r===1&&c>=5&&c<=8) return true
    if (r>=8) return true
    const hh = 2.5+Math.sin(c*0.3)*1.5
    return r>=10-hh && r<8
  })},
  // 39 constellation
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
  // 40 planet
  {name:'planet',canWin:true,grid:mk((c,r) => {
    const cx=13,cy=4.5
    if (Math.sqrt((c-cx)**2+(r-cy)**2)<=3.2) return true
    const rx=(c-cx)/3.5, ry=(r-cy-0.5)/0.8
    const rd = Math.sqrt(rx*rx+ry*ry)
    return rd>=1.8 && rd<=2.2 && Math.abs(r-cy)<=3
  })},
  // 41 crescent
  {name:'crescent',canWin:true,grid:mk((c,r) => {
    const cx=13,cy=4.5
    return Math.sqrt((c-cx)**2+(r-cy)**2)<=4.5 && Math.sqrt((c-cx-2)**2+(r-cy+1)**2)>=3.8
  })},
  // 42 rocket
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
  // 43 galaxy
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

const ACHIEVABLE = ALL_SHAPES.filter(s => s.canWin)
const IMPOSSIBLE = ALL_SHAPES.filter(s => !s.canWin)

type Fill = 'solid' | 'checker' | 'stripe_h' | 'stripe_v' | 'dots'
const FILLS: Fill[] = ['solid', 'checker', 'stripe_h', 'stripe_v', 'dots']
function randomFill(): Fill { return FILLS[Math.floor(Math.random() * FILLS.length)] }

interface Cell {
  fill: Fill; brightness: number
  flipping: boolean; flipPhase: number; flipSpeed: number; flipTimer: number
  nextFill: Fill; nextBrightness: number
  locked: boolean; lockedAt: number; isTarget: boolean
  energy: number; agitation: number; stability: number; probing: boolean
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number }

type Phase = 'cycling' | 'searching' | 'cascade' | 'entropy' | 'frozen_fail' | 'failing' | 'dark' | 'blink' | 'won'

interface Box {
  cells: Cell[][]; phase: Phase; phaseStart: number
  willSucceed: boolean; failPoint: number; totalTarget: number
  tCells: [number, number][]; isImpossible: boolean
  attX: number; attY: number; attTX: number; attTY: number; attSpeed: number
  searchStart: number; seeded: boolean; wonPulse: number
  entropyStart?: number
}

function n4(cells: Cell[][], r: number, c: number): number {
  let n = 0
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nr = r+dr, nc = c+dc
    if (nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&cells[nr][nc].isTarget&&cells[nr][nc].locked&&!cells[nr][nc].probing) n++
  }
  return n
}

function n8(cells: Cell[][], r: number, c: number): number {
  let n = 0
  for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
    if (!dr&&!dc) continue
    const nr = r+dr, nc = c+dc
    if (nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&cells[nr][nc].isTarget&&cells[nr][nc].locked&&!cells[nr][nc].probing) n++
  }
  return n
}

function lockedCount(cells: Cell[][]): number {
  let n = 0
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) if (cells[r][c].isTarget&&cells[r][c].locked&&!cells[r][c].probing) n++
  return n
}

function getFrontier(cells: Cell[][]): { r: number; c: number; n: number }[] {
  const f: { r: number; c: number; n: number }[] = []
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
    if (cells[r][c].isTarget&&!cells[r][c].locked) {
      const nn = n4(cells,r,c)
      if (nn>0) f.push({r,c,n:nn})
    }
  }
  return f
}

export default function NowWhatHome() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const subtitleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const SCALE = Math.max(2, Math.min(3, Math.floor(Math.min(window.innerWidth, window.innerHeight) / 200)))
    let W = 0, H = 0

    const resize = () => {
      W = Math.floor(window.innerWidth / SCALE)
      H = Math.floor(window.innerHeight / SCALE)
      canvas.width = W
      canvas.height = H
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
    }
    resize()
    window.addEventListener('resize', resize)

    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false

    const particles: Particle[] = []

    function emitParticles(cx: number, cy: number, count: number, speed: number, life: number) {
      for (let i = 0; i < count; i++) {
        const a = (Math.PI * 2 * i) / count + Math.random() * 0.4
        const sp = speed * (0.4 + Math.random())
        particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.15, life: 0, maxLife: life + Math.random() * life * 0.5, size: 1 })
      }
    }

    function updateParticles() {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.life++
        if (p.life > p.maxLife) { particles.splice(i, 1); continue }
        p.x += p.vx; p.y += p.vy; p.vy += 0.008
        const a = (1 - p.life / p.maxLife) * 0.55
        ctx.fillStyle = `rgba(255,255,255,${a})`
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size)
      }
    }

    function drawPixelBlock(x: number, y: number, size: number, fill: Fill, brightness: number, alpha: number) {
      const v = Math.floor(brightness * 255)
      ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`
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

    function drawFlap(x: number, y: number, size: number, fill: Fill, brightness: number, alpha: number, half: 'top'|'bottom', squeeze: number) {
      ctx.save()
      const mid = Math.floor(size/2)
      if (half==='top') { ctx.beginPath();ctx.rect(x,y,size,mid);ctx.clip() }
      else { ctx.beginPath();ctx.rect(x,y+mid,size,size-mid);ctx.clip() }
      drawPixelBlock(x,y,size,fill,brightness,alpha*(1-squeeze*0.3))
      ctx.restore()
    }

    function makeCell(): Cell {
      const active = Math.random() < 0.45
      return {
        fill: randomFill(), brightness: 0.15 + Math.random() * 0.45,
        flipping: active, flipPhase: active ? Math.random() : 0,
        flipSpeed: 0.013 + Math.random() * 0.025,
        flipTimer: active ? 0 : 10 + Math.floor(Math.random() * 50),
        nextFill: randomFill(), nextBrightness: 0.15 + Math.random() * 0.45,
        locked: false, lockedAt: 0, isTarget: false,
        energy: 0, agitation: 0, stability: 0, probing: false,
      }
    }

    // Sequencer for achievable shapes: 1 win per 3
    let lastIdx = -1
    const seq: boolean[] = []
    function refillSeq() {
      for (let i = 0; i < 6; i++) {
        const b = [true, false, false]
        for (let j = 2; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1));
          [b[j], b[k]] = [b[k], b[j]]
        }
        seq.push(...b)
      }
    }
    refillSeq()
    function nextWillSucceed() { if (!seq.length) refillSeq(); return seq.shift()! }

    function randomFailPoint() {
      const r = Math.random()
      if (r < 0.25) return 0.2 + Math.random() * 0.1
      if (r < 0.55) return 0.4 + Math.random() * 0.15
      if (r < 0.8) return 0.6 + Math.random() * 0.15
      return 0.8 + Math.random() * 0.1
    }

    function planBox(now: number, delay: number): Box {
      // Pick shape: ~30% chance of impossible shape
      let shape: Shape, willSucceed: boolean, isImpossible = false
      if (Math.random() < 0.3 && IMPOSSIBLE.length > 0) {
        shape = IMPOSSIBLE[Math.floor(Math.random() * IMPOSSIBLE.length)]
        willSucceed = false; isImpossible = true
      } else {
        let idx: number
        do { idx = Math.floor(Math.random() * ACHIEVABLE.length) } while (ACHIEVABLE.length > 1 && idx === lastIdx)
        lastIdx = idx; shape = ACHIEVABLE[idx]
        willSucceed = nextWillSucceed()
      }

      const cells: Cell[][] = Array.from({ length: ROWS }, () =>
        Array.from({ length: COLS }, () => makeCell())
      )
      let totalTarget = 0
      const tCells: [number, number][] = []
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          cells[r][c].isTarget = shape.grid[r][c] === 1
          if (shape.grid[r][c]) { totalTarget++; tCells.push([r, c]) }
        }

      // Impossible shapes fail at varied points, sometimes very late
      const failPt = willSucceed ? 1 : isImpossible ? (0.5 + Math.random() * 0.4) : randomFailPoint()

      return {
        cells, phase: 'cycling', phaseStart: now + (delay || 0),
        willSucceed, failPoint: failPt, totalTarget, tCells, isImpossible,
        attX: COLS/2, attY: ROWS/2, attTX: COLS/2, attTY: ROWS/2, attSpeed: 0.02,
        searchStart: 0, seeded: false, wonPulse: Math.random() * Math.PI * 2,
      }
    }

    const now0 = performance.now()
    let box = planBox(now0, 0)

    let textFadedIn = false, textStart = 0

    function updateText(now: number) {
      if (!textFadedIn && now - now0 > 1500) { textFadedIn = true; textStart = now }
      if (textFadedIn) {
        const age = (now - textStart) / 1000
        const fadeIn = Math.min(1, age / 2.5)
        const breath = 0.76 + 0.24 * Math.sin(now * 0.0006)
        if (titleRef.current) titleRef.current.style.opacity = String(fadeIn * breath * 0.9)
        if (subtitleRef.current) subtitleRef.current.style.opacity = String(fadeIn * breath * 0.35)
      }
    }

    function drawScanlines() {
      ctx.fillStyle = 'rgba(0,0,0,0.05)'
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1)
    }

    let frame = 0
    const tick = () => {
      const now = performance.now()
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)

      const maxCellW = Math.floor(W * 0.94 / COLS)
      const maxCellH = Math.floor(H * 0.32 / ROWS)
      const CELL = Math.max(4, Math.min(9, Math.min(maxCellW, maxCellH)))
      const stripW = COLS * CELL
      const stripH = ROWS * CELL
      const bx = Math.floor((W - stripW) / 2)
      const by = H - stripH - Math.floor(H * 0.05)

      const elapsed = now - box.phaseStart

      // Waiting
      if (elapsed < 0) {
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++) {
            ctx.fillStyle = 'rgba(255,255,255,0.012)'
            ctx.fillRect(bx + c * CELL, by + r * CELL, CELL - 1, CELL - 1)
          }
        updateParticles(); drawScanlines(); updateText(now)
        frame = requestAnimationFrame(tick); return
      }

      // Attention
      const adx = box.attTX - box.attX, ady = box.attTY - box.attY
      box.attX += adx * box.attSpeed; box.attY += ady * box.attSpeed
      if (Math.abs(adx) < 0.8 && Math.abs(ady) < 0.8) {
        const frontier = getFrontier(box.cells)
        if (frontier.length > 0) {
          const w = frontier.flatMap(f => Array(f.n * 2 + 1).fill(f))
          const p = w[Math.floor(Math.random() * w.length)]
          box.attTX = p.c + (Math.random() - 0.5) * 3
          box.attTY = p.r + (Math.random() - 0.5) * 2
        } else {
          const p = box.tCells[Math.floor(Math.random() * box.tCells.length)]
          box.attTX = p[1] + (Math.random() - 0.5) * 4
          box.attTY = p[0] + (Math.random() - 0.5) * 3
        }
        box.attSpeed = 0.012 + Math.random() * 0.025
      }

      // Update cells
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = box.cells[r][c]
          const dA = Math.sqrt((c - box.attX) ** 2 + (r - box.attY) ** 2)
          const aI = Math.max(0, 1 - dA / 7)

          if (cell.isTarget && !cell.locked) {
            const nn = n4(box.cells, r, c)
            cell.agitation += (0.08 + aI * 0.5 + nn * 0.3 - cell.agitation) * 0.1
          } else if (!cell.isTarget && !cell.locked) {
            cell.agitation += (aI * 0.12 - cell.agitation) * 0.06
          }

          if (!cell.locked) {
            if (cell.flipping) {
              cell.flipPhase += cell.flipSpeed * (1 + cell.agitation * 2.5)
              if (cell.flipPhase >= 1) {
                cell.fill = cell.nextFill
                cell.brightness = cell.nextBrightness
                cell.flipPhase = 0
                if (Math.random() < 0.4 - cell.agitation * 0.2) {
                  cell.flipping = false
                  cell.flipTimer = Math.floor((8 + Math.random() * 35) * (1 - cell.agitation * 0.5))
                } else {
                  cell.nextFill = randomFill()
                  cell.nextBrightness = 0.15 + Math.random() * 0.45 + cell.agitation * 0.2
                }
              }
            } else {
              cell.flipTimer--
              if (cell.flipTimer <= 0) {
                cell.flipping = true
                cell.nextFill = randomFill()
                cell.nextBrightness = 0.15 + Math.random() * 0.45 + cell.agitation * 0.2
                cell.flipSpeed = 0.016 + Math.random() * 0.035
              }
            }
          }

          if (cell.locked && cell.probing) {
            cell.stability++
            const nn = n4(box.cells, r, c)
            if (nn >= 2) {
              cell.probing = false
            } else if (cell.stability > 30 + Math.random() * 20) {
              cell.locked = false; cell.probing = false
              cell.flipping = true; cell.flipPhase = 0
              cell.flipSpeed = 0.03 + Math.random() * 0.03
              cell.brightness *= 0.5; cell.energy *= 0.3; cell.stability = 0
            }
          }
        }
      }

      // Phase machine
      if (box.phase === 'cycling' && elapsed > 1600) {
        box.phase = 'searching'; box.phaseStart = now; box.searchStart = now
      }

      if (box.phase === 'searching') {
        const sE = (now - box.searchStart) / 1000
        const progress = lockedCount(box.cells) / box.totalTarget

        if (!box.seeded && sE > 0.6) {
          box.seeded = true
          const seed = box.tCells[Math.floor(Math.random() * box.tCells.length)]
          const cell = box.cells[seed[0]][seed[1]]
          cell.locked = true; cell.lockedAt = now
          cell.fill = FILLS[Math.floor(Math.random() * 3)] as Fill
          cell.brightness = 0.55 + Math.random() * 0.4
          cell.flipping = false; cell.flipPhase = 0; cell.energy = 0
          if (Math.random() < 0.5) {
            for (const [dr, dc] of [[0,1],[1,0],[0,-1],[-1,0]]) {
              const nr = seed[0]+dr, nc = seed[1]+dc
              if (nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&box.cells[nr][nc].isTarget&&!box.cells[nr][nc].locked) {
                const c2 = box.cells[nr][nc]
                c2.locked = true; c2.lockedAt = now
                c2.fill = FILLS[Math.floor(Math.random() * 3)] as Fill
                c2.brightness = 0.55 + Math.random() * 0.4
                c2.flipping = false; c2.flipPhase = 0; c2.energy = 0
                break
              }
            }
          }
        }

        const drive = Math.min(3, 0.3 + sE * 0.35)
        const frontier = getFrontier(box.cells)
        for (const f of frontier) {
          const cell = box.cells[f.r][f.c]
          const dA = Math.sqrt((f.c - box.attX) ** 2 + (f.r - box.attY) ** 2)
          const aB = Math.max(0, 1 - dA / 5) * 0.006
          cell.energy += 0.001 * drive + f.n * 0.006 * drive + aB * drive
          const th = 0.04 / (drive * 0.5 + 0.5)
          if (cell.energy > th || Math.random() < cell.energy * 0.8) {
            cell.locked = true; cell.lockedAt = now
            cell.fill = FILLS[Math.floor(Math.random() * 3)] as Fill
            cell.brightness = 0.55 + Math.random() * 0.45
            cell.flipping = false; cell.flipPhase = 0
            cell.energy = 0; cell.stability = 0; cell.probing = false
          }
        }

        // Probe: occasionally seed isolated target cells near attention
        if (sE < 4 && Math.random() < 0.015 * drive) {
          const cands: [number,number][] = []
          for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++)
            if (box.cells[r][c].isTarget&&!box.cells[r][c].locked&&n4(box.cells,r,c)===0) cands.push([r,c])
          if (cands.length > 0) {
            cands.sort((a,b) => Math.sqrt((a[1]-box.attX)**2+(a[0]-box.attY)**2) - Math.sqrt((b[1]-box.attX)**2+(b[0]-box.attY)**2))
            const pick = cands[Math.floor(Math.random() * Math.min(5, cands.length))]
            const cell = box.cells[pick[0]][pick[1]]
            cell.locked = true; cell.lockedAt = now
            cell.fill = FILLS[Math.floor(Math.random() * 3)] as Fill
            cell.brightness = 0.45 + Math.random() * 0.35
            cell.flipping = false; cell.flipPhase = 0
            cell.energy = 0; cell.stability = 0; cell.probing = true
          }
        }

        const nP = lockedCount(box.cells) / box.totalTarget
        if (box.willSucceed && nP >= 0.7) { box.phase = 'cascade'; box.phaseStart = now }
        if (!box.willSucceed && nP >= box.failPoint) { box.phase = 'entropy'; box.phaseStart = now; box.entropyStart = now }
        if (box.willSucceed && sE > 12) { box.phase = 'cascade'; box.phaseStart = now }
        if (!box.willSucceed && sE > 10) { box.phase = 'entropy'; box.phaseStart = now; box.entropyStart = now }
      }

      if (box.phase === 'cascade') {
        const cE = now - box.phaseStart
        let rem: [number,number][] = []
        for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++)
          if (box.cells[r][c].isTarget&&!box.cells[r][c].locked) rem.push([r,c])
        const rate = Math.max(1, Math.floor(1 + cE / 60))
        for (let i = 0; i < Math.min(rate, rem.length); i++) {
          let best = rem[0], bestN = -1
          for (const [r,c] of rem) {
            const nn = n8(box.cells, r, c)
            if (nn > bestN || (nn === bestN && Math.random() < 0.4)) { bestN = nn; best = [r,c] }
          }
          const [br, bc] = best
          const cell = box.cells[br][bc]
          cell.locked = true; cell.lockedAt = now
          cell.fill = FILLS[Math.floor(Math.random() * 3)] as Fill
          cell.brightness = 0.65 + Math.random() * 0.35
          cell.flipping = false; cell.flipPhase = 0; cell.probing = false
          rem = rem.filter(([r,c]) => r !== br || c !== bc)
        }
        if (rem.length === 0) {
          for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
            if (!box.cells[r][c].isTarget) {
              box.cells[r][c].locked = false; box.cells[r][c].flipping = false
              box.cells[r][c].flipTimer = 99999; box.cells[r][c].brightness = 0.02
            }
          }
          emitParticles(bx + stripW / 2, by + stripH / 2, 18, 0.6, 32)
          box.phase = 'blink'; box.phaseStart = now
        }
      }

      if (box.phase === 'entropy') {
        const eE = (now - (box.entropyStart ?? box.phaseStart)) / 1000
        const rate = 0.004 + eE * 0.012
        for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
          const cell = box.cells[r][c]
          if (!cell.locked || !cell.isTarget) continue
          const nn = n4(box.cells, r, c)
          const v = Math.max(0.15, 1 - nn * 0.25)
          if (Math.random() < rate * v) {
            cell.locked = false; cell.probing = false
            cell.flipping = true; cell.flipPhase = 0
            cell.flipSpeed = 0.04 + Math.random() * 0.04
            cell.brightness = 0.25 + Math.random() * 0.2; cell.energy = 0
          }
        }
        for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
          const cell = box.cells[r][c]
          if (cell.locked && cell.isTarget)
            cell.brightness = Math.max(0.15, cell.brightness - 0.002 + Math.sin(now * 0.018 + r * 2 + c * 3) * 0.012)
        }
        if (lockedCount(box.cells) < box.totalTarget * 0.12 || eE > 3.5) {
          box.phase = 'frozen_fail'; box.phaseStart = now
        }
      }

      if (box.phase === 'blink' && now - box.phaseStart > 700) {
        box.phase = 'won'; box.phaseStart = now
      }

      if (box.phase === 'frozen_fail' && now - box.phaseStart > 1200) {
        emitParticles(bx + stripW / 2, by + stripH / 2, 8, 0.3, 16)
        box.phase = 'failing'; box.phaseStart = now
      }

      if (box.phase === 'failing' && now - box.phaseStart > 900) {
        box.phase = 'dark'; box.phaseStart = now
      }

      if (box.phase === 'dark' && now - box.phaseStart > 600) {
        box = planBox(now, 200)
      }

      if (box.phase === 'won' && now - box.phaseStart > 4500 + Math.random() * 2000) {
        box = planBox(now, 400)
      }

      // Draw cells
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
            drawPixelBlock(px, py, CELL, cell.fill, br * blinkMod, 0.9 * fA)

          } else if (cell.flipping && cell.flipPhase > 0) {
            if (box.phase === 'blink') continue
            const ag = cell.agitation * 0.15
            const ba = 0.25 + cell.agitation * 0.28
            const ph = cell.flipPhase
            if (ph < 0.5) {
              drawFlap(px, py, CELL, cell.fill, cell.brightness + ag, ba, 'bottom', 0)
              drawFlap(px, py, CELL, cell.fill, cell.brightness + ag, ba, 'top', ph * 2)
            } else {
              drawFlap(px, py, CELL, cell.nextFill, cell.nextBrightness + ag, ba, 'top', 0)
              drawFlap(px, py, CELL, cell.nextFill, cell.nextBrightness + ag, ba, 'bottom', 1 - (ph - 0.5) * 2)
            }
          } else if (cell.flipTimer < 99999) {
            if (box.phase === 'blink') continue
            drawPixelBlock(px, py, CELL, cell.fill, cell.brightness + cell.agitation * 0.12, 0.16 + cell.agitation * 0.22)
          }

          ctx.fillStyle = 'rgba(255,255,255,0.01)'
          ctx.fillRect(px + CELL - 1, py, 1, CELL)
          ctx.fillRect(px, py + CELL - 1, CELL, 1)
        }
      }

      updateParticles()
      drawScanlines()
      updateText(now)

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div className="min-h-dvh bg-black overflow-hidden relative">
      <canvas
        ref={canvasRef}
        className="fixed inset-0"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="fixed inset-0 z-10 flex items-center justify-center pointer-events-none">
        <div className="text-center" style={{ marginTop: '-14vh' }}>
          <div
            ref={titleRef}
            className="font-light tracking-[0.14em] text-white"
            style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: 'clamp(30px, 7.5vw, 62px)',
              opacity: 0,
            }}
          >
            Now what?
          </div>
          <div
            ref={subtitleRef}
            className="font-light tracking-[0.08em]"
            style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: 'clamp(9px, 2vw, 13px)',
              color: 'rgba(255,255,255,0.3)',
              marginTop: '1.4vh',
              opacity: 0,
            }}
          >
            a research project
          </div>
        </div>
      </div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400&display=swap');
      `}</style>
    </div>
  )
}
