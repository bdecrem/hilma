// PENTIMENTO — one canvas, painted four times. Drawn in code, cut to score.mjs.
//
// The painting is a stack of layers, each an offscreen canvas at 900×1350:
//   ground (umber imprimatura) · charcoal · 1598 · 1606 · 1662
// plus two that are never seen directly:
//   relief — a gray height map; thick paint leaves ridges, and raking light
//            finds them even after thin paint goes over the top
//   xray   — lead density; the dodo is painted with lead white, so on the
//            X-ray it is the brightest thing on the canvas
//
// Every stroke is data: a path, a width, a color, a start time and duration.
// Brushes are drawn as bristles that run dry; a palette knife lays thick paint
// or scrapes it away. The engine draws strokes incrementally while time moves
// forward and replays from zero when asked for an earlier time, so any frame
// comes out the same however it is reached.

const W = 1080, H = 1920, FPS = 30
const S = window.SCORE
const DURATION = S.duration
const VARIANT = new URLSearchParams(location.search).get('variant') ?? ''
const PX = 90, PY = 280, PW = 900, PH = 1350
const HORIZON = 560

// ─── seeded randomness ───
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const R = rng(1598)
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t) }
const ease = (t) => 1 - Math.pow(1 - clamp(t), 3)
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

// ─── canvases ───
const out = document.getElementById('c')
out.width = W
out.height = H
const octx = out.getContext('2d')
const mk = (w = PW, h = PH) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
const frame = mk(W, H)
const fctx = frame.getContext('2d')
const LAYERS = ['ground', 'charcoal', 'y1598', 'y1606', 'y1662']
const L = {}
for (const k of [...LAYERS, 'relief', 'xray']) L[k] = mk()
const surface = mk()

// canvas weave, gesso, tacks: static
const weave = mk()
{
  const x = weave.getContext('2d')
  x.fillStyle = '#f1ece2'
  x.fillRect(0, 0, PW, PH)
  const r = rng(7)
  for (let y = 0; y < PH; y += 3) { x.fillStyle = `rgba(90,70,40,${0.035 + r() * 0.03})`; x.fillRect(0, y, PW, 1) }
  for (let xx = 0; xx < PW; xx += 3) { x.fillStyle = `rgba(90,70,40,${0.03 + r() * 0.03})`; x.fillRect(xx, 0, 1, PH) }
  for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(60,40,20,${r() * 0.06})`; x.fillRect(r() * PW, r() * PH, 1.5, 1.5) }
}
const grain = [0, 1, 2, 3].map((k) => {
  const c = mk(540, 960), x = c.getContext('2d'), r = rng(100 + k)
  const img = x.createImageData(540, 960)
  for (let i = 0; i < img.data.length; i += 4) { const v = r() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255 }
  x.putImageData(img, 0, 0)
  return c
})

// ─── the strokes ───

const STROKES = []
let seedN = 1

// Catmull-Rom through control points, resampled every 3 px, with normals.
function resample(ctrl) {
  const dense = []
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)]
    for (let k = 0; k < 16; k++) {
      const t = k / 16, t2 = t * t, t3 = t2 * t
      dense.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ])
    }
  }
  dense.push(ctrl[ctrl.length - 1])
  const pts = [dense[0]]
  let acc = 0
  for (let i = 1; i < dense.length; i++) {
    const d = Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1])
    acc += d
    if (acc >= 3) { pts.push(dense[i]); acc = 0 }
  }
  if (pts.length < 2) pts.push(dense[dense.length - 1])
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1
    return { x: p[0], y: p[1], nx: -dy / l, ny: dx / l }
  })
}

// kind: brush | charcoal | knife | scrape
function stroke(o) {
  const s = {
    layer: o.layer, kind: o.kind ?? 'brush', t0: o.t0, dur: o.dur ?? 0.4,
    w: o.w ?? 30, color: hex(o.color ?? '#000000'), color2: o.color2 ? hex(o.color2) : null,
    alpha: o.alpha ?? 0.9, thick: o.thick ?? 0.3, lead: o.lead ?? 0.1, clip: o.clip ?? null,
    seed: seedN++, drawn: 0, dryBase: o.dry ?? 0.55, tool: o.tool ?? (o.kind === 'charcoal' ? 'charcoal' : o.kind === 'knife' || o.kind === 'scrape' ? 'knife' : 'brush'),
  }
  s.pts = resample(o.pts)
  const r = rng(s.seed * 7919)
  const nb = s.kind === 'charcoal' ? 5 : s.kind === 'knife' || s.kind === 'scrape' ? 9 : Math.round(clamp(s.w / 2.4, 6, 40))
  s.bristles = Array.from({ length: nb }, (_, j) => {
    const jit = s.kind === 'charcoal' ? 16 : 40
    const c0 = s.color2 && r() < 0.4 ? s.color2 : s.color
    return {
      off: (nb === 1 ? 0 : (j / (nb - 1) - 0.5)) * s.w * (0.92 + r() * 0.16),
      bw: s.kind === 'charcoal' ? 1.2 + r() * 1.6 : (s.w / nb) * (1.6 + r() * 0.9),
      c: c0.map((v) => clamp(Math.round(v + (r() - 0.5) * jit), 0, 255)),
      a: s.alpha * (0.72 + r() * 0.28),
      dry: s.kind === 'knife' ? 0.9 + r() * 0.1 : s.dryBase + r() * (1 - s.dryBase),
      gap: r() * 1000,
      wob: (r() - 0.5) * 2,
    }
  })
  STROKES.push(s)
  return s
}

// ─── the paintings ───

const ev = S
const clipEllipse = (cx, cy, rx, ry, rot = 0) => { const p = new Path2D(); p.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); return p }
const clipRect = (x, y, w, h) => { const p = new Path2D(); p.rect(x, y, w, h); return p }
const bow = (x0, y0, x1, y1, b = 0) => { const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny) || 1; return [[x0, y0], [mx + (nx / l) * b, my + (ny / l) * b], [x1, y1]] }
const lerpColor = (a, b, t) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('') }

// the dodo, in painting coordinates
const DODO = { bx: 520, by: 1085, brx: 150, bry: 122, hx: 668, hy: 900, hr: 58 }

// I · ground and charcoal (0–10 s): an umber wash on the first two beats, then a line on every beat
{
  const t = ev.charcoal
  for (let i = 0; i < 10; i++) {
    const y = -60 + i * 160
    const d = i % 2 ? 1 : -1
    const pts = d > 0 ? bow(-260, y + 120, PW + 260, y, 20) : bow(PW + 260, y, -260, y + 120, 20)
    stroke({ layer: 'ground', t0: t[i < 5 ? 0 : 1] + (i % 5) * 0.1, dur: 0.55, w: 300, color: '#b08658', color2: '#a07a52', alpha: 0.3, thick: 0.03, lead: 0.06, dry: 0.95, pts })
  }
  const lines = [
    [[0, HORIZON], [300, HORIZON + 4], [620, HORIZON - 2], [PW, HORIZON + 3]], // horizon
    [[560, HORIZON], [650, 430], [735, 345], [770, 318], [800, 360], [850, 450], [PW, 520]], // Pieter Both
    [[0, 800], [220, 790], [480, 815], [720, 795], [PW, 812]], // tide line
    [[140, 830], [150, 700], [170, 560], [200, 430]], // palm
    [[260, 845], [275, 700], [300, 560], [330, 470]], // palm
    [[375, 1060], [420, 975], [520, 955], [640, 990], [668, 1085], [620, 1180], [520, 1210], [420, 1180], [372, 1110]], // body
    [[600, 985], [610, 930], [640, 870], [700, 850], [728, 885], [712, 945], [660, 985]], // neck, head
    [[715, 872], [790, 880], [846, 905], [852, 942], [828, 940], [820, 922], [760, 926], [718, 918]], // beak
    [[495, 1205], [492, 1275], [470, 1290], [520, 1290], [578, 1205], [584, 1278], [566, 1292], [616, 1292]], // legs
    [[390, 1040], [355, 1000], [362, 960], [392, 978], [380, 1005]], // tail tuft
  ]
  lines.forEach((pts, i) => {
    stroke({ layer: 'charcoal', t0: t[i + 2] + 0.05, dur: 0.62, w: 16, color: '#3a332d', alpha: 0.07, thick: 0, lead: 0, dry: 0.95, tool: 'charcoal', pts })
    stroke({ layer: 'charcoal', kind: 'charcoal', t0: t[i + 2], dur: 0.62, w: 6, color: '#221e1a', alpha: 0.8, thick: 0, lead: 0, pts })
  })
}

// II · Mauritius, 1598 (10–20 s): the landscape on the harpsichord, the dodo on the recorder
{
  const harp = ev.harp // 24 eighths
  const land = []
  // sky, top to horizon, cool to warm
  for (let i = 0; i < 7; i++) {
    const y = 40 + i * 78
    land.push({ w: 110, color: lerpColor('#8fa9b8', '#eadfc3', i / 6), color2: lerpColor('#9db4c0', '#f1e6cc', i / 6), pts: bow(-60, y + 14, PW + 60, y - 10, 12), thick: 0.25, lead: 0.16 })
  }
  // Pieter Both, the mountain with the boulder on top
  const mtn = new Path2D('M560 562 L650 430 L735 345 L770 318 L800 360 L850 450 L900 520 L900 562 Z')
  for (let i = 0; i < 3; i++) land.push({ w: 90, color: '#65766f', color2: '#556660', clip: mtn, pts: bow(560, 540 - i * 70, PW + 20, 470 - i * 70, 0), thick: 0.3, lead: 0.22 })
  land.push({ w: 26, color: '#4f5d58', pts: [[762, 300], [778, 296], [786, 312]], thick: 0.4, lead: 0.1 })
  // sea
  for (let i = 0; i < 4; i++) {
    const y = HORIZON + 30 + i * 62
    land.push({ w: 80, color: lerpColor('#4c7b83', '#7fa8a0', i / 3), color2: '#3f6a73', pts: bow(-40, y, PW + 40, y + 6, -4), thick: 0.3, lead: 0.1 })
  }
  // sand
  for (let i = 0; i < 6; i++) {
    const y = 840 + i * 92
    land.push({ w: 120, color: lerpColor('#e2c996', '#c9a86f', i / 5), color2: '#d8bc84', pts: bow(-60, y, PW + 60, y + 10, 8), thick: 0.3, lead: 0.13 })
  }
  // palms: trunks and fronds
  land.push({ w: 24, color: '#5a4630', pts: [[140, 830], [150, 700], [170, 560], [200, 430]], thick: 0.5, lead: 0.05 })
  land.push({ w: 22, color: '#5a4630', pts: [[260, 845], [275, 700], [300, 560], [330, 470]], thick: 0.5, lead: 0.05 })
  for (const [cx, cy] of [[200, 430], [330, 470]]) {
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI * 0.95 + (k / 4) * Math.PI * 0.9
      land.push({ w: 22, color: k % 2 ? '#2f4a2e' : '#486b3a', pts: [[cx, cy], [cx + Math.cos(a) * 80, cy + Math.sin(a) * 60 - 10], [cx + Math.cos(a) * 150, cy + Math.sin(a) * 40 + 40]], thick: 0.45, lead: 0.05 })
    }
  }
  // foam at the tide line
  land.push({ w: 10, color: '#eef0e6', pts: bow(0, 800, PW, 808, -6), thick: 0.7, lead: 0.4 })
  // the landscape goes on the first 12 eighths (bars 4–5), about three strokes an eighth
  land.forEach((l, i) => {
    const e = Math.min(11, Math.floor((i / land.length) * 12))
    const st = { layer: 'y1598', t0: harp[e] + (i % 3) * 0.1, dur: 0.38, alpha: 0.92, dry: l.w >= 80 ? 0.85 : 0.6, ...l }
    if (l.w >= 80 && i % 2) st.pts = [...l.pts].reverse()
    if (l.w >= 80) st.pts = st.pts.map(([x, y], k, a) => [k === 0 ? x - Math.sign(a[a.length - 1][0] - x) * 140 : k === a.length - 1 ? x + Math.sign(x - a[0][0]) * 140 : x, y])
    stroke(st)
  })

  // the dodo: bars 6–7, on the recorder and the harpsichord together
  const times = [...harp.slice(12), ...ev.dodo.filter((d) => d.t >= harp[12] - 0.01).map((d) => d.t)].sort((a, b) => a - b)
  const { bx, by, brx, bry, hx, hy, hr } = DODO
  const body = clipEllipse(bx, by, brx + 8, bry + 8, -0.12)
  const head = clipEllipse(hx - 6, hy + 14, hr + 2, hr + 22, 0.25)
  const arc = (cx, cy, rx, ry, a0, a1) => Array.from({ length: 7 }, (_, k) => { const a = a0 + ((a1 - a0) * k) / 6; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] })
  // body: stacked strokes that bow with the belly, light on the back, dark underneath
  const layerY = (j, n) => by - bry + ((j + 0.5) / n) * bry * 2
  const across = (y, color, w = 46) => {
    const half = brx * Math.sqrt(Math.max(0.05, 1 - ((y - by) / bry) ** 2)) + 30
    return { w, color, clip: body, pts: bow(bx - half, y + 6, bx + half, y - 6, -10) }
  }
  const plan = []
  for (let j = 0; j < 7; j++) plan.push([across(layerY(j, 7), lerpColor('#a2a7ae', '#4f5563', j / 6), 48)])
  plan.push([
    { w: 40, color: '#b4ae9e', color2: '#c2bba9', clip: body, pts: bow(bx - 30, by + 70, bx + 140, by + 20, -20) },
    { w: 34, color: '#bdb6a4', clip: body, pts: bow(bx + 10, by + 100, bx + 150, by + 50, -16) },
  ])
  plan.push([
    { w: 16, color: '#b9bec4', pts: arc(bx, by + 6, brx - 6, bry - 6, 3.6, 5.5) },
    { w: 16, color: '#3a3e48', pts: arc(bx, by, brx - 4, bry - 4, 0.4, 2.8) },
  ])
  plan.splice(plan.length, 0,
    [{ w: 42, color: '#646a78', clip: body, pts: [[440, 1060], [500, 1030], [570, 1050], [600, 1100]] }],
    [{ w: 46, color: '#7c8290', pts: [[610, 1000], [630, 950], [650, 910], [668, 880]] }],
    [0, 1, 2, 3, 4].map((j) => ({ w: 34, color: lerpColor('#a9adb3', '#6f7482', j / 4), clip: head, pts: bow(hx - 70, hy - 44 + j * 26, hx + 50, hy - 40 + j * 26, -6) })),
    [{ w: 22, color: '#cdbf7a', pts: [[716, 880], [780, 884], [830, 900], [848, 925]] }],
    [{ w: 16, color: '#b39c52', pts: [[845, 910], [853, 932], [838, 944]] }],
    [{ w: 16, color: '#d8cb8f', pts: [[720, 916], [770, 922], [820, 930]] }],
    [{ w: 16, color: '#d6b34a', pts: [[495, 1205], [493, 1278]] }, { w: 16, color: '#caa53f', pts: [[580, 1205], [584, 1280]] }],
    [{ w: 14, color: '#c49a36', pts: [[468, 1290], [522, 1290]] }, { w: 14, color: '#c49a36', pts: [[562, 1292], [616, 1292]] }],
    [{ w: 20, color: '#efe6d0', pts: [[392, 1040], [360, 1002], [366, 964], [394, 980], [384, 1006]] }],
    [{ w: 14, color: '#f6efdf', pts: [[405, 1020], [380, 988], [398, 962]] }],
    [{ w: 11, color: '#1c1a19', pts: [[688, 884], [694, 886], [696, 892]] }],
    [{ w: 6, color: '#fbf6ea', pts: [[692, 882], [694, 883]] }],
  )
  plan.forEach((group, i) => {
    const t0 = times[Math.min(times.length - 1, Math.round((i / (plan.length - 1)) * (times.length - 1)))] + (i % 2) * 0.05
    group.forEach((g, j) => stroke({ layer: 'y1598', t0: t0 + j * 0.06, dur: 0.3, alpha: 0.96, thick: 0.9, lead: g.color === '#efe6d0' || g.color === '#f6efdf' || g.color === '#fbf6ea' ? 0.95 : 0.6, ...g }))
  })
}

// III · 1606, the ships (20–30 s): knife on the timpani, brush on the dotted chords
{
  const hits = ev.timp // 20, 22.5, 25, 27.5, 28.33, 29.17
  const ch = ev.chords.filter((t) => t < hits[3] - 0.05)
  const onBeat = (t) => hits.some((h) => Math.abs(h - t) < 0.02)
  const brushTimes = ch.filter((t) => !onBeat(t))
  // three knife loads of dark umber, laid across the island
  const swaths = [
    { pts: [[300, 1250], [450, 1130], [640, 1010], [760, 960]], w: 150 },
    { pts: [[330, 1010], [480, 1100], [640, 1200], [720, 1290]], w: 140 },
    { pts: [[560, 1000], [650, 910], [760, 860], [880, 850]], w: 150 },
  ]
  swaths.forEach((sw, i) => stroke({ layer: 'y1606', kind: 'knife', t0: hits[i], dur: 0.5, w: sw.w, color: '#3b3530', color2: '#5a4a3a', alpha: 0.97, thick: 1, lead: 0.18, pts: sw.pts }))
  const ships = [[160, 150, 0.8], [430, 210, 1], [715, 160, 0.85]]
  const work = []
  // a storm over the sky
  for (let i = 0; i < 5; i++) work.push({ w: 120, color: lerpColor('#454e5b', '#6b7178', i / 4), color2: '#3c434d', pts: bow(-60, 30 + i * 90, PW + 60, 60 + i * 80, 20), thick: 0.35, lead: 0.06, alpha: 0.85 })
  // hulls
  for (const [x, w, s] of ships) {
    work.push({ w: 42 * s, color: '#2d2520', pts: [[x - w / 2, 770], [x, 792 + 8 * s], [x + w / 2, 766]], thick: 0.7, lead: 0.05 })
    work.push({ w: 18 * s, color: '#6a3e26', pts: [[x - w / 2 + 6, 752], [x + w / 2 - 4, 750]], thick: 0.6, lead: 0.05 })
  }
  // masts and sails
  for (const [x, w, s] of ships) {
    for (const dx of [-w * 0.28, 0, w * 0.26]) {
      work.push({ w: 7 * s, color: '#2a221c', pts: [[x + dx, 752], [x + dx, 752 - 300 * s]], thick: 0.5, lead: 0.04 })
    }
    for (const dx of [-w * 0.28, 0, w * 0.26]) {
      for (const k of [0, 1]) {
        const y = 752 - 90 * s - k * 110 * s
        work.push({ w: 64 * s, color: k ? '#e3d7bc' : '#d6c8a8', pts: [[x + dx - 34 * s, y], [x + dx, y + 8 * s], [x + dx + 34 * s, y]], thick: 0.5, lead: 0.3 })
      }
    }
  }
  work.forEach((w, i) => {
    const e = brushTimes[Math.min(brushTimes.length - 1, Math.floor((i / work.length) * brushTimes.length))]
    stroke({ layer: 'y1606', t0: e + (i % 3) * 0.07, dur: 0.26, alpha: 0.94, ...w })
  })
  // the flags, last, small and loud: Dutch red white blue
  const last = brushTimes[brushTimes.length - 1]
  ships.forEach(([x, , s], i) => {
    ;['#a8362f', '#efe9dc', '#2f4f8f'].forEach((c, k) => stroke({ layer: 'y1606', t0: last + 0.1 + i * 0.1, dur: 0.15, w: 6 * s, color: c, thick: 0.4, lead: 0.1, pts: [[x + 2, 752 - 300 * s + 6 + k * 6 * s], [x + 26 * s, 752 - 300 * s + 6 + k * 6 * s]] }))
  })
  // and on the last three hits the knife scrapes the umber off the dodo's head
  const scr = [
    [[640, 960], [700, 900], [760, 870]],
    [[700, 930], [790, 900], [860, 905]],
    [[600, 880], [670, 850], [720, 840]],
  ]
  scr.forEach((pts, i) => stroke({ layer: 'y1606', kind: 'scrape', t0: hits[3 + i], dur: 0.45, w: 92, alpha: 0.92, thick: 0.6, lead: 0, pts }))
}

// IV · 1662, the shore (30–40 s): broad, calm, thin — every note a sweep
{
  const times = [...ev.lament.map((l) => l.t), 30, 32.5, 35, 37.5].sort((a, b) => a - b)
  const sweeps = []
  for (let i = 0; i < 7; i++) sweeps.push({ y: 40 + i * 80, w: 130, color: lerpColor('#c7ccc9', '#e4ded0', i / 6) })
  for (let i = 0; i < 4; i++) sweeps.push({ y: HORIZON + 34 + i * 62, w: 90, color: lerpColor('#95a9a5', '#b6c2b8', i / 3) })
  for (let i = 0; i < 8; i++) sweeps.push({ y: 830 + i * 72, w: 120, color: lerpColor('#e0d3b6', '#cdbd9b', i / 7) })
  sweeps.forEach((s, i) => {
    const e = times[Math.min(times.length - 1, Math.floor((i / sweeps.length) * times.length))]
    const d = i % 2 ? 1 : -1
    stroke({ layer: 'y1662', t0: e + (i % 2) * 0.42, dur: 0.85, w: s.w, color: s.color, alpha: 0.9, thick: 0.02, lead: 0.09, dry: 0.9, pts: d > 0 ? bow(-80, s.y, PW + 80, s.y + 4, 6) : bow(PW + 80, s.y + 4, -80, s.y, 6) })
  })
  // a far ship leaving
  const tl = 38.4
  stroke({ layer: 'y1662', t0: tl, dur: 0.3, w: 8, color: '#4a4540', thick: 0.3, lead: 0.05, pts: [[806, 556], [834, 556]] })
  stroke({ layer: 'y1662', t0: tl + 0.35, dur: 0.25, w: 3, color: '#4a4540', thick: 0.2, lead: 0.05, pts: [[820, 554], [820, 522]] })
  stroke({ layer: 'y1662', t0: tl + 0.65, dur: 0.25, w: 12, color: '#e9e3d4', thick: 0.3, lead: 0.2, pts: [[812, 540], [828, 540]] })
}

STROKES.sort((a, b) => a.t0 - b.t0)

// ─── drawing strokes ───

function drawStroke(s, f0, f1) {
  const ctx = L[s.layer].getContext('2d')
  const rel = L.relief.getContext('2d')
  const xr = L.xray.getContext('2d')
  const n = s.pts.length
  const i0 = Math.max(0, Math.floor(f0 * (n - 1)) - 1), i1 = Math.min(n - 1, Math.ceil(f1 * (n - 1)))
  if (i1 <= i0) return
  for (const c of [ctx, rel, xr]) {
    c.save()
    if (s.clip) c.clip(s.clip)
    c.lineCap = 'round'
    c.lineJoin = 'round'
  }
  if (s.kind === 'scrape') ctx.globalCompositeOperation = 'destination-out'
  // the body of the stroke: solid paint along the center, fading where the brush runs dry
  if (s.kind !== 'charcoal') {
    const path = new Path2D()
    for (let i = i0; i <= i1; i++) (i === i0 ? path.moveTo(s.pts[i].x, s.pts[i].y) : path.lineTo(s.pts[i].x, s.pts[i].y))
    const fm = (i0 + i1) / 2 / (n - 1)
    const bodyDry = Math.min(0.97, s.dryBase + 0.08)
    const load = 1 - smooth(bodyDry, Math.min(1, bodyDry + 0.2), fm)
    const spread = 0.62 + 0.38 * smooth(0, 0.1, fm)
    const a = s.alpha * load * (s.kind === 'scrape' ? 0.95 : 0.88)
    ctx.lineWidth = s.w * (s.kind === 'knife' || s.kind === 'scrape' ? 0.62 : 0.8) * spread
    ctx.lineCap = s.kind === 'knife' || s.kind === 'scrape' ? 'butt' : 'round'
    ctx.strokeStyle = s.kind === 'scrape' ? `rgba(0,0,0,${a})` : `rgba(${s.color[0]},${s.color[1]},${s.color[2]},${a})`
    ctx.stroke(path)
    ctx.lineCap = 'round'
    if (s.lead > 0) {
      // density is the densest paint at a point, not a sum: frames drawn in chunks agree with stills
      xr.globalCompositeOperation = 'lighten'
      xr.lineWidth = s.w * 0.8 * spread
      const v = Math.round(255 * clamp(s.lead * load))
      xr.strokeStyle = `rgb(${v},${v},${v})`
      xr.stroke(path)
    }
  }
  for (const b of s.bristles) {
    // one run of path per stretch where this bristle still has paint
    let run = []
    const flush = () => {
      if (run.length < 2) { run = []; return }
      const fm = run[Math.floor(run.length / 2)][2]
      const load = 1 - smooth(b.dry - 0.18, b.dry, fm)
      const spread = 0.62 + 0.38 * smooth(0, 0.1, fm)
      const path = new Path2D()
      run.forEach(([x, y], k) => (k ? path.lineTo(x, y) : path.moveTo(x, y)))
      const press = 0.78 + 0.22 * Math.sin(b.gap * 3.1 + fm * 23)
      const a = b.a * press * (s.kind === 'charcoal' ? 1 : (0.35 + 0.65 * load) * 0.55)
      if (s.kind === 'scrape') {
        ctx.strokeStyle = `rgba(0,0,0,${a})`
      } else {
        ctx.strokeStyle = `rgba(${b.c[0]},${b.c[1]},${b.c[2]},${a})`
      }
      ctx.lineWidth = b.bw * (s.kind === 'charcoal' ? 1 : spread)
      ctx.stroke(path)
      if (s.kind !== 'charcoal') {
        // relief: thin paint flattens what is underneath a little, thick paint leaves ridges
        rel.globalCompositeOperation = 'source-over'
        rel.lineWidth = b.bw * spread
        rel.strokeStyle = `rgba(128,128,128,${(1 - s.thick) * 0.1 * a})`
        rel.stroke(path)
        if (s.lead > 0.2) {
          xr.globalCompositeOperation = 'lighten'
          xr.lineWidth = b.bw * spread
          const v = Math.round(255 * clamp(s.lead * (0.7 + 0.5 * press) * load))
          xr.strokeStyle = `rgb(${v},${v},${v})`
          xr.stroke(path)
        }
        if (s.thick > 0.2) {
          const k = Math.min(0.9, s.thick * a * (s.kind === 'knife' || s.kind === 'scrape' ? 0.32 : s.thick >= 0.85 ? 0.95 : 0.5))
          rel.lineWidth = Math.max(1, b.bw * 0.35)
          rel.save(); rel.translate(-1.4, -1.4); rel.strokeStyle = `rgba(255,255,255,${k})`; rel.stroke(path); rel.restore()
          rel.save(); rel.translate(1.4, 1.4); rel.strokeStyle = `rgba(0,0,0,${k})`; rel.stroke(path); rel.restore()
        }
      }
      run = []
    }
    for (let i = i0; i <= i1; i++) {
      const p = s.pts[i]
      const fp = i / (n - 1)
      // dry brush: past the bristle's load it skips, more and more
      const gapNoise = Math.sin(b.gap + i * 0.37) * 0.5 + Math.sin(b.gap * 1.7 + i * 0.11) * 0.5
      const skip = s.kind !== 'charcoal' && fp > b.dry - 0.12 && gapNoise > 1 - 2.2 * smooth(b.dry - 0.12, b.dry + 0.05, fp)
      const charSkip = s.kind === 'charcoal' && gapNoise > 0.82
      if (skip || charSkip) { flush(); continue }
      const spread = 0.62 + 0.38 * smooth(0, 0.1, fp)
      const w = s.kind === 'charcoal' ? b.off * 0.4 + Math.sin(i * 0.9 + b.gap) * 0.7 : b.off * spread + b.wob * Math.sin(i * 0.05 + b.gap)
      run.push([p.x + p.nx * w, p.y + p.ny * w, fp])
    }
    flush()
  }
  for (const c of [ctx, rel, xr]) c.restore()
  ctx.globalCompositeOperation = 'source-over'
}

let lastT = -1
function resetPaint() {
  for (const k of [...LAYERS, 'xray']) L[k].getContext('2d').clearRect(0, 0, PW, PH)
  const r = L.relief.getContext('2d')
  r.fillStyle = '#808080'
  r.fillRect(0, 0, PW, PH)
  const x = L.xray.getContext('2d')
  x.fillStyle = '#0a0a0a'
  x.fillRect(0, 0, PW, PH)
  for (const s of STROKES) s.drawn = 0
  lastT = -1
}
resetPaint()

function advance(t) {
  if (t < lastT) resetPaint()
  for (const s of STROKES) {
    if (s.t0 > t) break
    const f = clamp((t - s.t0) / s.dur)
    if (f > s.drawn) {
      drawStroke(s, s.drawn, f)
      s.drawn = f
    }
  }
  lastT = t
}

// ─── the tools ───

function toolAt(t) {
  let cur = null, prev = null, next = null
  for (const s of STROKES) {
    if (s.t0 <= t && t < s.t0 + s.dur) cur = s
    if (s.t0 + s.dur <= t) prev = s
    if (s.t0 > t && !next) next = s
  }
  const head = (s, f) => { const p = s.pts[Math.min(s.pts.length - 1, Math.floor(f * (s.pts.length - 1)))]; return [p.x, p.y] }
  if (cur) {
    const f = (t - cur.t0) / cur.dur
    return { kind: cur.tool, p: head(cur, f), lift: 0, color: cur.color, s: cur }
  }
  if (prev && next && next.t0 - (prev.t0 + prev.dur) < 1.4) {
    const k = (t - prev.t0 - prev.dur) / (next.t0 - prev.t0 - prev.dur)
    const a = head(prev, 1), b = head(next, 0)
    const e = k * k * (3 - 2 * k)
    return { kind: k < 0.5 ? prev.tool : next.tool, p: [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e], lift: Math.sin(Math.PI * k), color: (k < 0.5 ? prev : next).color }
  }
  // resting: slide off the lower right
  const from = prev ? head(prev, 1) : [PW + 300, PH + 300]
  const k = prev ? clamp((t - prev.t0 - prev.dur) / 0.7) : 1
  const toK = next ? clamp(1 - (next.t0 - t) / 0.7) : 0
  const rest = [PW + 260, PH + 200]
  const q = Math.max(0, ease(k) - ease(toK))
  const target = next && toK > 0 ? head(next, 0) : from
  return { kind: (next && toK > 0 ? next : prev ?? next ?? { tool: 'brush' }).tool, p: [target[0] + (rest[0] - target[0]) * q, target[1] + (rest[1] - target[1]) * q], lift: q, color: (next ?? prev ?? { color: [80, 80, 80] }).color }
}

function drawTool(ctx, tool) {
  if (!tool) return
  const [x, y] = tool.p
  const lift = tool.lift
  ctx.save()
  ctx.translate(PX + x, PY + y)
  ctx.scale(1 + lift * 0.12, 1 + lift * 0.12)
  // shadow on the canvas, further away as the tool lifts
  ctx.save()
  ctx.translate(26 + lift * 40, 34 + lift * 50)
  ctx.globalAlpha = 0.28 - lift * 0.12
  ctx.filter = 'blur(6px)'
  toolShape(ctx, tool, true)
  ctx.restore()
  toolShape(ctx, tool, false)
  ctx.restore()
}

function toolShape(ctx, tool, shadow) {
  const c = tool.color
  const paint = shadow ? '#000' : `rgb(${c[0]},${c[1]},${c[2]})`
  ctx.rotate(-0.95)
  if (tool.kind === 'charcoal') {
    ctx.fillStyle = shadow ? '#000' : '#26221f'
    ctx.beginPath()
    ctx.moveTo(0, 0); ctx.lineTo(12, -6); ctx.lineTo(16, -110); ctx.lineTo(-2, -112); ctx.lineTo(-6, -8); ctx.closePath()
    ctx.fill()
    if (!shadow) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(4, -100, 4, 88) }
  } else if (tool.kind === 'knife') {
    ctx.fillStyle = shadow ? '#000' : '#b9bcbf'
    ctx.beginPath()
    ctx.moveTo(-2, 4); ctx.quadraticCurveTo(-30, -40, -8, -120); ctx.lineTo(10, -120); ctx.quadraticCurveTo(30, -40, 2, 4); ctx.closePath()
    ctx.fill()
    if (!shadow) {
      ctx.fillStyle = paint
      ctx.globalAlpha = 0.85
      ctx.beginPath(); ctx.moveTo(-2, 4); ctx.quadraticCurveTo(-20, -20, -12, -46); ctx.lineTo(12, -46); ctx.quadraticCurveTo(16, -20, 2, 4); ctx.fill()
      ctx.globalAlpha = 1
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-2, -110, 3, 60)
    }
    ctx.fillStyle = shadow ? '#000' : '#8d8f91'
    ctx.fillRect(-2, -150, 5, 32)
    ctx.fillStyle = shadow ? '#000' : '#6b4a2f'
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-9, -300, 20, 152, 9) : ctx.rect(-9, -300, 20, 152); ctx.fill()
  } else {
    // brush: loaded tuft, crimped ferrule, long handle
    ctx.fillStyle = paint
    ctx.beginPath(); ctx.moveTo(0, 2); ctx.quadraticCurveTo(-12, -12, -10, -40); ctx.lineTo(10, -40); ctx.quadraticCurveTo(12, -12, 0, 2); ctx.fill()
    ctx.fillStyle = shadow ? '#000' : '#b5b1a8'
    ctx.fillRect(-11, -92, 22, 54)
    if (!shadow) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-11, -80, 22, 3); ctx.fillRect(-11, -70, 22, 3); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-6, -90, 3, 50) }
    ctx.fillStyle = shadow ? '#000' : '#7a2e24'
    ctx.beginPath(); ctx.moveTo(-10, -92); ctx.lineTo(-6, -420); ctx.quadraticCurveTo(0, -432, 6, -420); ctx.lineTo(10, -92); ctx.closePath(); ctx.fill()
    if (!shadow) { ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(-4, -400, 3, 300) }
  }
}

// ─── the picture ───

const CAPTIONS = [
  [0.6, 9.4, 'Ground, then charcoal'],
  [10.5, 19.4, 'Mauritius, 1598'],
  [20.5, 29.4, '1606 · the Dutch ships'],
  [30.5, 39.4, '1662 · the shore, painted over'],
  [41.8, 52.6, 'X-radiograph · lead white shows light'],
]

function surfaceComposite(t) {
  const x = surface.getContext('2d')
  x.globalCompositeOperation = 'source-over'
  x.drawImage(weave, 0, 0)
  x.drawImage(L.ground, 0, 0)
  x.globalCompositeOperation = 'multiply'
  x.drawImage(L.charcoal, 0, 0)
  x.globalCompositeOperation = 'source-over'
  x.drawImage(L.y1598, 0, 0)
  x.drawImage(L.y1606, 0, 0)
  x.drawImage(L.y1662, 0, 0)
  // raking light over the relief; stronger late, so the buried dodo surfaces
  x.globalCompositeOperation = 'overlay'
  x.globalAlpha = 0.85
  x.drawImage(L.relief, 0, 0)
  // late on the shore the light swings low and the buried ridges surface
  const rake = smooth(34, 39.5, t)
  if (rake > 0) { x.globalAlpha = rake * 0.9; x.drawImage(L.relief, 0, 0) }
  x.globalAlpha = 1
  x.globalCompositeOperation = 'multiply'
  x.globalAlpha = 0.18
  x.drawImage(weave, 0, 0)
  x.globalAlpha = 1
  x.globalCompositeOperation = 'source-over'
}

function xrayPulse(t) {
  let p = 0
  for (const n of S.xray) if (!n.lament && t >= n.t) p = Math.max(p, Math.exp(-(t - n.t) * 4))
  if (t >= S.final) p = Math.max(p, 1.2 * Math.exp(-(t - S.final) * 1.2))
  return p
}

function drawXray(ctx, t) {
  ctx.save()
  ctx.fillStyle = '#0b1115'
  ctx.fillRect(PX, PY, PW, PH)
  ctx.globalCompositeOperation = 'screen'
  const p = xrayPulse(t)
  ctx.filter = `contrast(${1.35 + p * 0.25}) brightness(${1.2 + p * 0.3})`
  ctx.drawImage(L.xray, PX, PY)
  ctx.filter = 'none'
  // the stretcher: wooden bars read a little lighter, the tacks read bright
  ctx.fillStyle = 'rgba(200,215,225,0.08)'
  ctx.fillRect(PX, PY, 60, PH); ctx.fillRect(PX + PW - 60, PY, 60, PH); ctx.fillRect(PX, PY, PW, 60); ctx.fillRect(PX, PY + PH - 60, PW, 60)
  ctx.fillRect(PX, PY + PH / 2 - 30, PW, 60)
  ctx.fillStyle = 'rgba(235,245,250,0.9)'
  for (let i = 0; i < 18; i++) { ctx.beginPath(); ctx.arc(PX + 18, PY + 40 + i * 74, 3.2, 0, Math.PI * 2); ctx.arc(PX + PW - 18, PY + 40 + i * 74, 3.2, 0, Math.PI * 2); ctx.fill() }
  for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.arc(PX + 40 + i * 75, PY + 18, 3.2, 0, Math.PI * 2); ctx.arc(PX + 40 + i * 75, PY + PH - 18, 3.2, 0, Math.PI * 2); ctx.fill() }
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = '#d6e3ea'
  ctx.fillRect(PX, PY, PW, PH)
  ctx.globalCompositeOperation = 'source-over'
  // the eye opens on the Picardy third, and blinks once
  if (t > S.final - 0.2) {
    const k = smooth(S.final - 0.2, S.final + 0.4, t)
    const blink = t > S.final + 1.6 && t < S.final + 1.8 ? 0.1 : 1
    ctx.fillStyle = `rgba(245,250,252,${0.9 * k})`
    ctx.beginPath()
    ctx.ellipse(PX + 692, PY + 887, 8, 8 * blink, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowColor = 'rgba(220,240,255,0.9)'
    ctx.shadowBlur = 30 * k
    ctx.fill()
    ctx.shadowBlur = 0
  }
  ctx.restore()
}

function studio(ctx, t) {
  // a dark warm room, the light from the upper left
  const g = ctx.createRadialGradient(300, 500, 100, 540, 900, 1400)
  g.addColorStop(0, '#2c231c')
  g.addColorStop(1, '#0e0b09')
  ctx.fillStyle = g
  ctx.fillRect(-200, -200, W + 400, H + 400)
  // easel: the top clamp, the mast behind, the ledge below
  ctx.fillStyle = '#3a2a1e'
  ctx.fillRect(W / 2 - 22, -200, 44, PY + 60 + 200)
  ctx.fillRect(W / 2 - 22, PY + PH - 20, 44, H)
  ctx.fillStyle = '#4b3726'
  ctx.fillRect(W / 2 - 110, PY - 46, 220, 40)
  ctx.fillRect(PX - 40, PY + PH + 4, PW + 80, 46)
  ctx.fillStyle = 'rgba(255,220,170,0.08)'
  ctx.fillRect(PX - 40, PY + PH + 4, PW + 80, 6)
  // the canvas edge and its shadow on the wall
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(PX + 18, PY + 22, PW, PH)
  ctx.fillStyle = '#d9d2c4'
  ctx.fillRect(PX + PW, PY + 4, 10, PH)
}

function light(ctx) {
  const g = ctx.createLinearGradient(PX, PY, PX + PW, PY + PH)
  g.addColorStop(0, 'rgba(255,236,200,0.10)')
  g.addColorStop(0.55, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.22)')
  ctx.fillStyle = g
  ctx.fillRect(PX, PY, PW, PH)
}

function text(ctx, t) {
  ctx.save()
  ctx.textAlign = 'center'
  // title over the blank canvas
  const ta = smooth(0.2, 1.0, t) * (1 - smooth(2.6, 3.6, t))
  if (ta > 0) {
    ctx.fillStyle = `rgba(236,226,206,${ta})`
    ctx.font = 'italic 64px "IM Fell English"'
    ctx.fillText('Pentimento', W / 2, 170)
  }
  for (const [a, b, s] of CAPTIONS) {
    const k = smooth(a, a + 0.8, t) * (1 - smooth(b - 0.8, b, t))
    if (k <= 0) continue
    ctx.fillStyle = `rgba(236,226,206,${0.72 * k})`
    ctx.font = '46px "IM Fell English SC"'
    ctx.fillText(s, W / 2, 1765)
  }
  ctx.restore()
}

function card(ctx, t) {
  const k = smooth(53, 54.2, t)
  if (k <= 0) return
  ctx.save()
  ctx.fillStyle = `rgba(12,10,9,${k})`
  ctx.fillRect(0, 0, W, H)
  const a = smooth(53.6, 54.6, t)
  ctx.textAlign = 'center'
  ctx.fillStyle = `rgba(236,226,206,${a})`
  ctx.font = '96px "IM Fell English SC"'
  ctx.fillText('Pentimento', W / 2, 880)
  ctx.font = 'italic 40px "IM Fell English"'
  ctx.fillStyle = `rgba(236,226,206,${a * 0.8})`
  ctx.fillText('from the Italian for repentance:', W / 2, 980)
  ctx.fillText('an earlier image showing through the paint', W / 2, 1032)
  ctx.font = '30px "IM Fell English SC"'
  ctx.fillStyle = `rgba(236,226,206,${a * 0.6})`
  if (VARIANT === 'dodo') {
    // the Dodo app's cut: the payoff for clearing Peck level 10
    ctx.font = '44px "IM Fell English SC"'
    ctx.fillStyle = `rgba(236,226,206,${a * 0.85})`
    ctx.fillText('Level 10 cleared', W / 2, 1190)
    ctx.font = 'italic 36px "IM Fell English"'
    ctx.fillStyle = `rgba(236,226,206,${a * 0.6})`
    ctx.fillText('What you learned is still under there too.', W / 2, 1250)
  } else ctx.fillText('painted and scored in code by Claude Opus 5.5', W / 2, 1170)
  ctx.restore()
}

function renderAt(t) {
  advance(t)
  surfaceComposite(t)
  const c = fctx
  c.save()
  c.setTransform(1, 0, 0, 1, 0, 0)
  // camera: a slow push through the underdrawing, a jolt on each knife, a breath out on the shore
  let zoom = 1 + 0.035 * smooth(0, 10, t) - 0.02 * smooth(30, 40, t)
  let sx = 0, sy = 0
  for (const h of S.timp) if (t >= h && t < h + 0.5) { const e = Math.exp(-(t - h) * 9); sx += Math.sin(t * 90) * 10 * e; sy += Math.cos(t * 77) * 8 * e; zoom += 0.012 * e }
  // in the X-ray the camera leans in on the dodo and holds on its eye
  const lean = smooth(41.6, 51.5, t)
  zoom += 0.55 * lean
  const fx = W / 2 + (PX + DODO.hx - 40 - W / 2) * lean, fy = PY + PH / 2 + (PY + DODO.hy + 90 - (PY + PH / 2)) * lean
  c.translate(W / 2 + sx, PY + PH / 2 + sy)
  c.scale(zoom, zoom)
  c.translate(-fx, -fy)
  studio(c, t)
  // the X-ray scans down over the painting from 40 s and stays
  const scan = smooth(40, 41.6, t)
  c.drawImage(surface, PX, PY)
  light(c)
  if (scan > 0) {
    c.save()
    c.beginPath()
    c.rect(PX, PY, PW, PH * scan)
    c.clip()
    drawXray(c, t)
    c.restore()
    if (scan < 1) {
      const y = PY + PH * scan
      const g = c.createLinearGradient(0, y - 40, 0, y + 6)
      g.addColorStop(0, 'rgba(200,230,255,0)')
      g.addColorStop(1, 'rgba(220,240,255,0.85)')
      c.fillStyle = g
      c.fillRect(PX, y - 40, PW, 46)
    }
  }
  if (scan < 1) drawTool(c, toolAt(t))
  c.restore()
  text(c, t)
  card(c, t)
  // film: grain and a soft vignette
  c.save()
  c.globalCompositeOperation = 'overlay'
  c.globalAlpha = 0.09
  c.drawImage(grain[Math.floor(t * FPS) % 4], 0, 0, W, H)
  c.restore()
  const v = c.createRadialGradient(W / 2, H / 2, 500, W / 2, H / 2, 1200)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.5)')
  c.fillStyle = v
  c.fillRect(0, 0, W, H)
  const fadeIn = 1 - smooth(0, 0.6, t)
  if (fadeIn > 0) { c.fillStyle = `rgba(0,0,0,${fadeIn})`; c.fillRect(0, 0, W, H) }
  octx.drawImage(frame, 0, 0)
}

window.renderAt = renderAt
window.DURATION = DURATION
window.FPS = FPS
