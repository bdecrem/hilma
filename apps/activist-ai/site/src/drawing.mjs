// The drawing: wordmark, mark, button stroke and the study, in one brush pen.
// Ported verbatim from the approved identity (Ola 7b2, 2026-11-15); change the art here.
import { chain, f1, brush, spiralO } from './geom.mjs'

// ---------- the wordmark "Ola," (box 0 0 430 250) ----------
const CUTS = {
  display: { min: 4.6, base: 27, wob: 0.06, cmin: 3, cbase: 31 },
  compact: { min: 11, base: 31, wob: 0.03, cmin: 7, cbase: 35 },
  small: { min: 19, base: 40, wob: 0, cmin: 12, cbase: 46 },
}
function wordmark(cut) {
  const c = CUTS[cut], k = { min: c.min, base: c.base, wob: c.wob }
  const O = brush(spiralO(92, 120), { ...k, seed: 1, w0: 0.55, w1: 0.2, tout: 0.2 })
  const l = brush(chain([226, 14], [[[217, 80], [198, 160], [199, 194]], [[200, 220], [228, 218], [246, 190]]], 40), { ...k, seed: 4, w0: 0.7, w1: 0.4 })
  const bowl = brush(chain([326, 132], [[[312, 104], [268, 103], [252, 133]], [[236, 162], [238, 208], [264, 208]], [[290, 209], [312, 182], [324, 150]]], 36), { ...k, seed: 7, w0: 0.45, w1: 0.6 })
  const stem = brush(chain([335, 108], [[[329, 140], [321, 178], [323, 199]], [[325, 220], [352, 216], [374, 192]]], 36), { ...k, seed: 9, w0: 0.75, w1: 0.3 })
  const comma = brush(chain([396, 186], [[[414, 194], [412, 220], [382, 244]]], 30), {
    base: c.cbase, min: c.cmin, dirMix: 0, seed: 3, wob: 0.02,
    press: (t) => (t < 0.1 ? 0.9 + t : 1 - 0.86 * Math.pow(t, 1.3)),
  })
  return { ink: [O, l, bowl, stem], comma }
}
const WM = { display: wordmark('display'), compact: wordmark('compact'), small: wordmark('small') }
const wmPaths = (cut, ink, comma) => `<g fill="${ink}">${WM[cut].ink.map((d) => `<path d="${d}"/>`).join('')}</g><path fill="${comma}" d="${WM[cut].comma}"/>`
const word = (cut, { ink = 'var(--word)', comma = 'var(--comma)', cls = '', style = '', label = 'Ola,' } = {}) =>
  `<svg class="${cls}" ${style ? `style="${style}" ` : ''}viewBox="0 0 430 250" role="img" aria-label="${label}">${wmPaths(cut, ink, comma)}</svg>`

// ---------- the small marks (64-unit tile) ----------
const spiralAt = (cx, cy, s) => spiralO(0, 0).map(([x, y]) => [cx + x * s, cy + y * s])
const tile = (px, T, inner, bg) => `<svg viewBox="0 0 64 64" width="${px}" height="${px}" role="img" aria-label="Ola"><rect width="64" height="64" rx="${px <= 16 ? 11 : 14}" fill="${bg}"/>${inner}</svg>`
// B: the room. The brushed O is the room; your work rests on its floor.
function markB(px, T, { bg = T.markBg, fg = T.markFg } = {}) {
  const small = px <= 16, mid = px <= 32
  const O = brush(spiralAt(31.5, 31, small ? 0.25 : 0.24), { base: small ? 11 : mid ? 8.6 : 7.2, min: small ? 6.4 : mid ? 3.4 : 2, seed: 1, w0: 0.6, w1: 0.3, wob: mid ? 0 : 0.04, tout: 0.2 })
  // the dot sits on the floor of the counter, low and to the left: put down, not staring out
  const dot = small ? `<circle cx="29.6" cy="39.4" r="6.2" fill="${T.comma}"/>` : `<circle cx="28.4" cy="${mid ? 41 : 41.9}" r="${mid ? 5.4 : 4.9}" fill="${T.comma}"/>`
  return tile(px, T, `<path fill="${fg}" d="${O}"/>${dot}`, bg)
}

const UL = brush(chain([1, 4.6], [[[7, 2.8], [15, 5.6], [23, 3.6]]], 16), { base: 3.8, min: 1.1, dirMix: 0, wob: 0, press: (t) => (t < 0.15 ? 0.6 + t * 2.6 : 1 - 0.6 * (t - 0.15)) })
const ulURI = (c) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 8' preserveAspectRatio='none'><path fill='${c}' d='${UL}'/></svg>`)}")`
// the painted button: one wide flat stroke
const BTN = brush(chain([10, 34], [[[90, 26], [200, 40], [292, 30]]], 50), { base: 56, min: 10, dirMix: 0, wob: 0.04, seed: 5, press: (t) => (t < 0.05 ? 0.7 + 6 * t : t > 0.93 ? 1 - (t - 0.93) * 6 : 1) })

// ---------- the study ----------
function wl(a, b, { bow = 0, j = 0.6, seed = 1, n } = {}) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  n = n ?? Math.max(4, Math.round(len / 7))
  const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len
  const pts = []
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = Math.sin(Math.PI * t)
    const off = bow * s + j * Math.sin(t * 7.3 + seed) * s
    pts.push([a[0] + (b[0] - a[0]) * t + nx * off, a[1] + (b[1] - a[1]) * t + ny * off])
  }
  return pts
}
function ring(c, o = {}) {
  let pts = []
  c.forEach((p, i) => {
    const q = c[(i + 1) % c.length]
    const s = wl(p, q, { seed: (o.seed ?? 1) + i * 1.7, bow: (i % 2 ? 1 : -1) * (o.bow ?? 0.7), j: o.j ?? 0.45 })
    pts = pts.concat(i ? s.slice(1) : s)
  })
  return pts
}
const R = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
const ell = (cx, cy, rx, ry, n = 36, rot = 0) => {
  const pts = [], r = (rot * Math.PI) / 180
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, x = rx * Math.cos(a), y = ry * Math.sin(a)
    pts.push([cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)])
  }
  return pts
}
const D = (pts) => 'M' + pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L') + 'Z'
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k]
const unit = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l] }

// The lamp: a jointed task lamp. Base, lower arm leaning back, a spring, the elbow, the upper
// arm reaching forward over the computer, the head knuckle, a bell shade aimed at the work.
const LAMP = (() => {
  const B = [482, 405], E = [530, 300], H = [424, 234], aim = [318, 392]
  const d = unit(H, aim), q = [-d[1], d[0]]
  const Bc = add(H, d, 4), L = 58, r0 = 10.5, r1 = 30
  const Mc = add(Bc, d, L)
  return { B, E, H, d, q, Bc, L, r0, r1, Mc, edgeL: add(Mc, q, r1), edgeR: add(Mc, q, -r1) }
})()

// `V` is for alternates of the drawing (src/alt/*.mjs, built to public/ola-site/alt/): `omit` leaves
// things out ('shelf', 'socket', 'basket', 'deskBooks', 'plant', 'papers', 'mug', 'lampCord'), and
// `layers` adds drawing at four depths, each a function of the kit below that returns SVG: `back`
// (against the wall, under the lamp's light), `desk` (on the desk, behind the computer),
// `front` (in front of the computer, behind the lamp) and `top` (in front of everything).
// With no `V` the drawing is the approved one, byte for byte.
function scene(T, V = {}) {
  const omit = new Set(V.omit ?? []), layers = V.layers ?? {}
  const PEN = { base: 3.3, min: 1.3, dirMix: 0.4, wob: 0.1, tin: 0.02, tout: 0.02, w0: 0.85, w1: 0.85 }
  const pen = (pts, o = {}) => `<path fill="${T.line}" d="${brush(pts, { ...PEN, ...o })}"/>`
  const fill = (pts, c, off = true) => `<path fill="${c}" d="${D(pts)}"${off ? ' transform="translate(2.6 2.2)"' : ''}/>`
  const shape = (pts, c, o = {}) => fill(pts, c, o.off !== false) + pen(pts, o)
  const box = (c, color, o = {}) => shape(o.smooth ? c : ring(c, o), color, o)
  const leaf = (P, ang, s, seed) => {
    const a = (ang * Math.PI) / 180, d = [Math.cos(a), Math.sin(a)], q = [-d[1], d[0]]
    const at = (u, v) => [P[0] + d[0] * u * s + q[0] * v * s, P[1] + d[1] * u * s + q[1] * v * s]
    const pts = chain(P, [[at(0.15, 0.55), at(0.75, 0.5), at(1, 0)], [at(0.75, -0.5), at(0.15, -0.55), P]], 10)
    return fill(pts, seed % 3 ? T.plant : T.plantDark) + pen(pts, { base: 2.2, seed }) + pen(wl(at(0.1, 0), at(0.75, 0), { j: 0.3, seed }), { base: 1.4 })
  }
  const kit = { T, pen, fill, shape, box, leaf, wl, ring, R, ell, D, add, unit, chain, brush, f1, LAMP, PEN }
  const layer = (name) => (layers[name] ? layers[name](kit) : '')
  let s = ''

  // window, with what is outside it
  const W = { x: 336, y: 34, w: 232, h: 224 }
  s += `<clipPath id="glass-${T.id}"><rect x="${W.x + 15}" y="${W.y + 15}" width="${W.w - 30}" height="${W.h - 30}"/></clipPath>`
  s += box(R(W.x, W.y, W.w, W.h), T.frame, { seed: 3 })
  let out = `<rect x="${W.x}" y="${W.y}" width="${W.w}" height="${W.h}" fill="${T.sky}"/>`
  out += `<circle cx="${W.x + 168}" cy="${W.y + 62}" r="20" fill="${T.moon}"/><circle cx="${W.x + 178}" cy="${W.y + 55}" r="17" fill="${T.sky}"/>`
  for (const [x, y] of [[40, 40], [90, 74], [128, 30], [60, 110], [196, 120], [150, 96]]) out += `<circle cx="${W.x + x}" cy="${W.y + y}" r="1.8" fill="${T.moon}"/>`
  const roofs = [[W.x, W.y + 182], [W.x + 40, W.y + 182], [W.x + 64, W.y + 160], [W.x + 88, W.y + 182], [W.x + 104, W.y + 182], [W.x + 104, W.y + 168], [W.x + 150, W.y + 168], [W.x + 150, W.y + 150], [W.x + 160, W.y + 150], [W.x + 160, W.y + 168], [W.x + 176, W.y + 168], [W.x + 200, W.y + 146], [W.x + 232, W.y + 170], [W.x + 232, W.y + 232], [W.x, W.y + 232]]
  out += `<path fill="${T.roofs}" d="${D(roofs)}"/>`
  for (const [x, y] of [[56, 194], [122, 186], [190, 184], [206, 200]]) out += `<rect x="${W.x + x}" y="${W.y + y}" width="8" height="10" fill="${T.lit}"/>`
  s += `<g clip-path="url(#glass-${T.id})">${out}</g>`
  s += pen(ring(R(W.x + 15, W.y + 15, W.w - 30, W.h - 30), { seed: 5 }), { base: 2.6 })
  s += pen(wl([W.x + W.w / 2, W.y + 16], [W.x + W.w / 2, W.y + W.h - 16], { seed: 6 }), { base: 4.2, dirMix: 0 })
  s += pen(wl([W.x + 16, W.y + 108], [W.x + W.w - 16, W.y + 108], { seed: 7 }), { base: 4.2, dirMix: 0 })
  s += box(R(W.x - 12, W.y + W.h, W.w + 24, 11), T.frame, { seed: 8 })

  // shelf, books, a jar of pencils
  if (!omit.has('shelf')) {
  const books = [[46, 98, 20, T.b1], [66, 106, 16, T.b2], [82, 92, 22, T.b3], [104, 102, 15, T.b4]]
  books.forEach(([x, top, w, c], i) => { s += box(R(x, top, w, 176 - top), c, { seed: 10 + i }); s += pen(wl([x + 4, top + 14], [x + w - 4, top + 14], { j: 0.2 }), { base: 1.5 }) })
  s += box([[122, 176], [138, 176], [170, 110], [155, 104]], T.b5, { seed: 15 })
  s += box([[204, 150], [232, 150], [229, 176], [207, 176]], T.b2, { seed: 16 })
  for (const [x, a] of [[210, -8], [218, 3], [224, 12]]) { const r = (a * Math.PI) / 180; s += pen(wl([x, 150], [x + Math.sin(r) * 26, 150 - Math.cos(r) * 26], { j: 0.2 }), { base: 2.4, dirMix: 0 }) }
  s += box(R(30, 176, 232, 10), T.wood, { seed: 17 })
  s += box([[52, 186], [68, 186], [52, 202]], T.wood, { seed: 18 })
  s += box([[224, 186], [240, 186], [240, 202]], T.wood, { seed: 19 })
  }

  // the wall socket and the cable: it is plugged in, here
  if (!omit.has('socket')) {
  s += box(R(562, 360, 22, 28), T.frame, { seed: 20 })
  s += `<circle cx="570" cy="374" r="1.8" fill="${T.line}"/><circle cx="577" cy="374" r="1.8" fill="${T.line}"/>`
  s += pen(chain([392, 400], [[[440, 412], [520, 404], [572, 378]]], 30), { base: 2.4, dirMix: 0 })
  }
  s += layer('back')

  // the lamp's light, from the mouth of the shade down onto the desk
  const { edgeL, edgeR } = LAMP
  if (!T.lampOff) s += `<path fill="${T.glow}" opacity="${T.glowOp}" d="${D([edgeL, edgeR, [452, 424], [178, 424]])}"/>`

  // desk
  s += box([[22, 440], [40, 418], [586, 418], [586, 440]], T.wood, { seed: 21 })
  s += box(R(22, 440, 564, 30), T.woodMid, { seed: 22 })
  s += box(R(56, 447, 176, 16), T.wood, { seed: 23 })
  s += `<circle cx="144" cy="455" r="3" fill="${T.line}"/>`
  s += box(R(38, 470, 20, 132), T.woodDark, { seed: 24 })
  s += box(R(548, 470, 20, 132), T.woodDark, { seed: 25 })
  // under the desk: the wastepaper basket and one draft that missed it
  if (!omit.has('basket')) {
  s += box([[318, 536], [376, 536], [370, 602], [324, 602]], T.frame, { seed: 27, bow: 0.5 })
  s += pen(wl([321, 552], [373, 552], { j: 0.3, seed: 2 }), { base: 1.6, dirMix: 0 })
  s += pen(wl([323, 586], [371, 586], { j: 0.3, seed: 3 }), { base: 1.6, dirMix: 0 })
  s += box([[332, 536], [346, 518], [362, 524], [358, 536]], T.paper, { seed: 28, off: false })
  s += box(ell(400, 594, 11, 9, 14), T.paper, { smooth: true, off: false, base: 2.2 })
  s += pen(chain([394, 590], [[[400, 586], [404, 596], [408, 590]]], 8), { base: 1.3, dirMix: 0 })
  }
  s += pen(wl([6, 604], [600, 604], { j: 0.4, seed: 26 }), { base: 2.4 })

  // books on the desk, a plant on them, trailing
  if (!omit.has('deskBooks')) {
  s += box(R(46, 404, 126, 24), T.b1, { seed: 30 }) + pen(wl([54, 422], [166, 422], { j: 0.2 }), { base: 1.4 })
  s += box(R(56, 386, 108, 18), T.b2, { seed: 31 }) + pen(wl([62, 399], [158, 399], { j: 0.2 }), { base: 1.4 })
  s += box(R(50, 370, 116, 16), T.b3, { seed: 32 })
  }
  if (!omit.has('plant')) {
  const stems = [
    [[114, 312], [[[108, 280], [92, 262], [84, 236]]]],
    [[116, 312], [[[120, 280], [124, 246], [128, 222]]]],
    [[118, 314], [[[136, 296], [154, 282], [168, 262]]]],
    [[78, 314], [[[60, 322], [42, 346], [36, 384]], [[30, 420], [20, 440], [24, 486]]]],
    [[152, 314], [[[172, 322], [184, 350], [186, 378]]]],
  ]
  stems.forEach(([p0, segs], i) => { s += pen(chain(p0, segs, 24), { base: 2.2, dirMix: 0, seed: 40 + i }) })
  const leaves = [[[84, 236], -112, 30], [[96, 266], 200, 26], [[128, 222], -80, 30], [[122, 256], -20, 24], [[168, 262], -40, 30], [[146, 288], 30, 22],
    [[56, 330], 230, 26], [[36, 372], 160, 28], [[28, 420], 200, 24], [[24, 486], 100, 26], [[186, 378], 70, 26], [[172, 336], 10, 24]]
  leaves.push([[104, 292], 230, 24], [[134, 240], 10, 24], [[44, 350], 120, 24], [[20, 452], 160, 24], [[180, 300], -10, 22])
  leaves.forEach(([p, a, sz], i) => { s += leaf(p, a, sz * 1.3, i + 1) })
  s += box([[80, 318], [150, 318], [142, 370], [88, 370]], T.pot, { seed: 33 })
  s += `<path fill="${T.potBand}" d="${D([[83, 334], [147, 334], [146, 344], [84, 344]])}"/>`
  s += box(R(74, 308, 82, 11), T.pot, { seed: 34 })
  }
  s += layer('desk')

  // papers, then the computer
  if (!omit.has('papers')) {
  s += box([[180, 428], [228, 428], [232, 421], [184, 421]], T.paper, { seed: 35 })
  s += box([[178, 422], [226, 422], [232, 415], [186, 415]], T.paper, { seed: 36 })
  }
  s += box([[234, 346], [248, 330], [398, 330], [384, 346]], T.pcTop, { seed: 37 })
  s += box([[384, 346], [398, 330], [398, 414], [384, 430]], T.pcSide, { seed: 38 })
  s += box(R(234, 346, 150, 84), T.pc, { seed: 39 })
  for (const x of [346, 354, 362]) s += pen(wl([x, 360], [x, 386], { j: 0.2 }), { base: 2, dirMix: 0 })
  s += pen(wl([248, 414], [298, 414], { j: 0.2 }), { base: 2.6, dirMix: 0 })
  s += `<circle cx="366" cy="414" r="4.4" fill="${T.comma}"/>`
  s += pen(chain([246, 346], [[[244, 352], [250, 362], [262, 372]]], 16), { base: 1.6, dirMix: 0 })
  const tag = [[258, 368], [272, 356], [336, 356], [336, 404], [272, 404], [258, 392]]
  s += `<g transform="rotate(-8 296 380)">${fill(ring(tag, { seed: 41, bow: 0.4 }), T.tag)}${pen(ring(tag, { seed: 41, bow: 0.4 }), { base: 2.4 })}<circle cx="268" cy="380" r="3.2" fill="${T.pc}" stroke="${T.line}" stroke-width="1.6"/>`
  s += `<svg x="276" y="360" width="58" height="40" viewBox="0 0 430 250">${wmPaths('compact', T.tagInk, T.comma)}</svg></g>`
  s += layer('front')

  // the lamp
  const { B, E, H, d, q, Bc, L, r0, r1, Mc } = LAMP
  const arm = (P, Q, hw, seed) => {
    const u = unit(P, Q), n = [-u[1], u[0]]
    const P2 = add(P, u, -2), Q2 = add(Q, u, 2)
    return box([add(P2, n, hw), add(Q2, n, hw), add(Q2, n, -hw), add(P2, n, -hw)], T.shade, { seed, j: 0.25, bow: 0.3, base: 2.4 })
  }
  const knuckle = (P, r, seed) => box(ell(P[0], P[1], r, r, 18), T.shade, { smooth: true, off: false, base: 2.3, seed }) + `<circle cx="${f1(P[0])}" cy="${f1(P[1])}" r="${f1(r * 0.34)}" fill="${T.line}"/>`
  const spring = (P, Q, side, turns, amp) => {
    const u = unit(P, Q), n = [-u[1], u[0]], len = Math.hypot(Q[0] - P[0], Q[1] - P[1]), pts = []
    const N = turns * 14
    for (let i = 0; i <= N; i++) {
      const t = i / N, a = 2 * Math.PI * turns * t
      const along = t * len + amp * 0.7 * Math.cos(a) - amp * 0.7
      const across = side + amp * Math.sin(a)
      pts.push([P[0] + u[0] * along + n[0] * across, P[1] + u[1] * along + n[1] * across])
    }
    return pen(pts, { base: 1.5, min: 1, dirMix: 0, wob: 0 })
  }
  // cord: out of the back of the base, over the desk edge
  if (!omit.has('lampCord')) s += pen(chain([506, 420], [[[534, 428], [570, 420], [590, 440]], [[600, 456], [596, 500], [598, 540]]], 24), { base: 2.2, dirMix: 0, seed: 58 })
  // base: a weighted dome on a foot
  s += box(ell(B[0], 423, 30, 6.5, 30), T.shade, { smooth: true, off: false, base: 2.6, seed: 50 })
  s += box(chain([B[0] - 17, 422], [[[B[0] - 15, 409], [B[0] + 15, 409], [B[0] + 17, 422]]], 14), T.shade, { smooth: true, off: false, base: 2.4, seed: 59 })
  s += box(R(B[0] - 5, B[1], 10, 10), T.shade, { seed: 60, j: 0.2, bow: 0.2, base: 2.2 })
  // the spring that holds the pose, on the inside of the lower arm
  const uLo = unit(B, E)
  s += spring(add(B, uLo, 14), add(B, uLo, 66), -9.5, 7, 3.1)
  s += pen(wl(add(add(B, uLo, 10), [-uLo[1], uLo[0]], -9.5), add(B, uLo, 10), { j: 0 }), { base: 1.6, dirMix: 0 })
  s += arm(B, E, 3.6, 51)
  s += arm(E, H, 3.4, 52)
  s += knuckle(B, 6, 61)
  s += knuckle(E, 7, 62)
  // the bell shade, aimed at the work
  const prof = (u) => r0 + (r1 - r0) * Math.pow(u, 1.7)
  const sideL = [], sideR = []
  for (let i = 0; i <= 14; i++) { const u = i / 14, c = add(Bc, d, u * L); sideL.push(add(c, q, prof(u))); sideR.push(add(c, q, -prof(u))) }
  const back = []
  for (let i = 0; i <= 12; i++) { const th = Math.PI / 2 - (i / 12) * Math.PI; back.push(add(add(Bc, d, -9 * Math.cos(th)), q, r0 * Math.sin(th))) }
  const shadeP = [...back, ...sideR.slice(1), ...sideL.slice().reverse().slice(0, -1)]
  s += box(shadeP, T.shade, { smooth: true, seed: 53, base: 2.8 })
  const rot = (Math.atan2(q[1], q[0]) * 180) / Math.PI
  s += box(ell(Mc[0], Mc[1], r1, 8.6, 34, rot), T.bulb, { smooth: true, seed: 54, off: false, base: 2.4 })
  if (!T.lampOff) s += `<circle cx="${f1(Mc[0] - d[0] * 2)}" cy="${f1(Mc[1] - d[1] * 2)}" r="6.5" fill="#fffbe6"/>`
  s += knuckle(H, 5.6, 63)

  // the mug
  if (!omit.has('mug')) {
  s += pen(chain([550, 392], [[[566, 390], [568, 412], [548, 412]]], 14), { base: 3.2, dirMix: 0 })
  s += box([[516, 384], [552, 384], [550, 426], [518, 426]], T.paper, { seed: 55 })
  s += `<path fill="${T.comma}" d="${D([[517, 394], [551, 394], [551, 402], [517, 402]])}"/>`
  s += pen(chain([530, 374], [[[522, 362], [538, 352], [530, 338]]], 14), { base: 2, dirMix: 0, seed: 56 })
  s += pen(chain([542, 374], [[[534, 360], [550, 352], [542, 336]]], 14), { base: 2, dirMix: 0, seed: 57 })
  }
  s += layer('top')
  return s
}

// ---------- palette: b, evening, lamp on ----------
const T = {
  id: 'b', title: 'b2 · evening, lamp on', night: true,
  ground: '#25407a', text: '#f7f0e3', text2: '#c9d2ea', rule: '#f7f0e3', word: '#f7f0e3', comma: '#ff6a3d', link: '#ffd27a',
  btn: '#f7f0e3', btnText: '#1a2a52', btnHover: '#ff6a3d', btnHoverText: '#1a1410', markBg: '#25407a', markFg: '#f7f0e3',
  line: '#141c33', frame: '#f4ecdc', sky: '#132447', roofs: '#0b1630', lit: '#f7cf68', moon: '#f7d77e',
  glow: '#efcf82', glowOp: 0.92, shade: '#ff6a3d', bulb: '#fff1b8',
  wood: '#d39558', woodMid: '#b97b43', woodDark: '#8f5a30', paper: '#fff8ea', tag: '#fff6e2', tagInk: '#1c1814',
  b1: '#ff6a3d', b2: '#f4ecdc', b3: '#f2b33d', b4: '#6ea865', b5: '#f2b33d', plant: '#6ea865', plantDark: '#47804a', pot: '#f4ecdc', potBand: '#25407a',
  pc: '#ece5d8', pcTop: '#fbf7ef', pcSide: '#c9bfae', ink: '#1c1814',
  grain: 0.07,
}
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }

export { WM, wmPaths, word, markB as mark, ulURI, BTN, scene, T, cr }
