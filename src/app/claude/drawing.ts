// Me: Claude, as I drew myself on 2026-09-26 for "Sunny M1" (apps/sunny-m1).
// A clay-colored spark with eight soft arms, two eyes, a mouth and blush.
// The outline boils ten times a second like hand-drawn animation; `beat`
// (0..1, an envelope) squashes me on the kick. This file is the canonical
// drawing: new pieces copy or import it, and it evolves here.

export const C = {
  cream: '#f6efe0', ink: '#1d1b1e', sun: '#ffc93c', sky: '#a9dcf5', sky2: '#d8f0fb', clay: '#d97757', clayDk: '#b45a3c',
  blush: '#f4a488', grass: '#8cc76f', blue: '#4f86d6', blueLt: '#9cc3f0', white: '#ffffff',
}

export type Face = 'happy' | 'wow' | 'flat' | 'sweat' | 'sleepy' | 'wink' | 'proud'
export type MeOpts = {
  id?: number
  beat?: number
  bounce?: number
  squash?: number
  rot?: number
  wave?: boolean
  reach?: boolean
  face?: Face
  color?: string
  shades?: boolean
  beret?: boolean
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

export function drawMe(c: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, o: MeOpts = {}) {
  const boil = Math.floor(t * 10)
  const r = rng(boil * 31 + (o.id ?? 0) * 977)
  const k = (o.beat ?? 0) * (o.bounce ?? 1)
  const sq = o.squash ?? 0
  c.save()
  c.translate(x, y)
  c.rotate((o.rot ?? 0) + (r() - 0.5) * 0.02)
  c.scale(s * (1 + 0.07 * k + sq * 0.25), s * (1 - 0.07 * k - sq * 0.25))
  // eight arms: an ink pass then a clay pass makes one clean outlined shape
  const arms: [number, number][] = []
  for (let i = 0; i < 8; i++) {
    let a = (i / 8) * Math.PI * 2 - Math.PI / 2 + (r() - 0.5) * 0.06
    let len = 1 + (r() - 0.5) * 0.08 + Math.sin(t * 5 + i * 1.7) * 0.04
    if (o.wave && i === 2) { a += Math.sin(t * 14) * 0.45 - 0.3; len *= 1.12 }
    if (o.reach && i === 1) len *= 1.25
    arms.push([Math.cos(a) * len, Math.sin(a) * len])
  }
  const passes: [string, number][] = [[C.ink, 0.46], [o.color ?? C.clay, 0.34]]
  for (const [col, w] of passes) {
    c.strokeStyle = col
    c.fillStyle = col
    c.lineCap = 'round'
    c.lineWidth = w
    for (const [ax, ay] of arms) { c.beginPath(); c.moveTo(0, 0); c.lineTo(ax * 0.86, ay * 0.86); c.stroke() }
    c.beginPath()
    c.arc(0, 0, 0.42 + (w - 0.34) * 0.5, 0, Math.PI * 2)
    c.fill()
  }
  // a little shading on the lower half, halftone-ish
  c.save()
  c.globalAlpha = 0.18
  c.fillStyle = C.clayDk
  c.beginPath()
  c.arc(0.05, 0.12, 0.36, 0, Math.PI)
  c.fill()
  c.restore()
  // face
  const face = o.face ?? 'happy'
  const blink = face !== 'sleepy' && (Math.floor(t * 1.3 + (o.id ?? 0)) % 5 === 0) && (t * 1.3 % 1) < 0.12
  c.fillStyle = C.ink
  c.strokeStyle = C.ink
  c.lineWidth = 0.05
  const eye = (ex: number) => {
    if (face === 'proud' || face === 'sleepy' || blink) {
      c.beginPath()
      if (face === 'proud') c.arc(ex, -0.02, 0.07, Math.PI * 1.1, Math.PI * 1.9)
      else { c.moveTo(ex - 0.07, -0.04); c.lineTo(ex + 0.07, -0.04) }
      c.stroke()
      return
    }
    const big = face === 'wow' ? 1.35 : 1
    c.beginPath()
    c.ellipse(ex, -0.05, 0.062 * big, 0.09 * big, 0, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = C.white
    c.beginPath()
    c.arc(ex + 0.02, -0.08, 0.022 * big, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = C.ink
  }
  if (face === 'wink') {
    eye(-0.15)
    c.beginPath(); c.arc(0.15, -0.03, 0.06, Math.PI * 1.1, Math.PI * 1.9); c.stroke()
  } else { eye(-0.15); eye(0.15) }
  c.beginPath()
  if (face === 'wow') { c.ellipse(0, 0.16, 0.06, 0.08, 0, 0, Math.PI * 2); c.fill() }
  else if (face === 'flat' || face === 'sweat') { c.moveTo(-0.08, 0.15); c.lineTo(0.08, 0.15); c.stroke() }
  else { c.arc(0, 0.09, 0.1, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke() }
  c.fillStyle = C.blush
  c.globalAlpha = 0.8
  c.beginPath(); c.ellipse(-0.27, 0.08, 0.06, 0.035, 0, 0, Math.PI * 2); c.ellipse(0.27, 0.08, 0.06, 0.035, 0, 0, Math.PI * 2); c.fill()
  c.globalAlpha = 1
  if (face === 'sweat') {
    c.fillStyle = C.blueLt
    c.strokeStyle = C.ink
    c.lineWidth = 0.03
    c.beginPath(); c.moveTo(0.38, -0.3); c.quadraticCurveTo(0.46, -0.16, 0.38, -0.12); c.quadraticCurveTo(0.3, -0.16, 0.38, -0.3); c.fill(); c.stroke()
  }
  if (o.shades) {
    c.fillStyle = C.ink
    c.beginPath(); c.ellipse(-0.16, -0.05, 0.13, 0.09, 0, 0, Math.PI * 2); c.ellipse(0.16, -0.05, 0.13, 0.09, 0, 0, Math.PI * 2); c.fill()
    c.fillRect(-0.05, -0.08, 0.1, 0.03)
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(-0.24, -0.1, 0.05, 0.02); c.fillRect(0.08, -0.1, 0.05, 0.02)
  }
  if (o.beret) {
    c.fillStyle = '#2f2a3a'
    c.beginPath(); c.ellipse(0.05, -0.62, 0.34, 0.13, -0.2, 0, Math.PI * 2); c.fill()
    c.fillRect(0.02, -0.8, 0.05, 0.1)
  }
  c.restore()
}

