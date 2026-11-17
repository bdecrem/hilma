// "The tidy engineer": the datacenter told straight, fewer things and bigger. The plant, its books
// and the papers go; in their place, alone on the left of the desk, a zen fountain the size the
// flowerpot was (a wide dark stone bowl, a tall bamboo upright and spout, a thread of water). A
// model wind turbine stands in front of the computer's lower left corner, turning, with its own
// power light, wired into a port on the computer's face.

const WATER = '#dce2ee' // between T.text2 #c9d2ea and the creams

// ---------- the fountain: bowl centered on x 112, rim at y 398, foot on the desk at y 428 ----------
function fountain(k) {
  const { T, pen, box, wl, ell, chain, R, fill } = k
  const cx = 112, rimY = 398, rx = 42
  let s = ''
  // a shorter cane behind the upright, then the upright, both cut on the slant
  s += box([[146, 402], [146, 338], [154, 333], [154, 402]], T.plantDark, { seed: 70, j: 0.2, bow: 0.2, base: 2.3 })
  s += pen(wl([145, 368], [155, 367.4], { j: 0 }), { base: 1.7, dirMix: 0 })
  s += box([[132, 404], [132, 306], [144, 298], [144, 404]], T.plant, { seed: 71, j: 0.2, bow: 0.25, base: 2.6 })
  for (const y of [382, 357, 322]) s += pen(wl([130.5, y], [145.5, y - 0.6], { j: 0 }), { base: 1.9, dirMix: 0 })
  // the spout: a thinner cane leaning out of the upright and down, a node halfway, its mouth open
  s += box([[133, 341], [87, 355.5], [90.2, 364.4], [133, 350.4]], T.plant, { seed: 72, j: 0.2, bow: 0.2, base: 2.4 })
  s += pen(wl([110.5, 345.6], [113.2, 355.2], { j: 0 }), { base: 1.7, dirMix: 0 })
  s += box(ell(88.6, 360, 2.6, 4.9, 14, -18), T.plantDark, { smooth: true, off: false, base: 1.6 })
  // twine where the spout meets the upright
  for (const y of [339, 344]) s += pen(wl([130, y], [146, y + 1.2], { j: 0.2 }), { base: 1.3, dirMix: 0 })
  // the thread of water, falling against the wall into the bowl
  s += `<path fill="${WATER}" d="M87.3 363.6 C86.6 376 87.4 389 88.2 399.5 L91.4 399.5 C90.6 389 89.8 376 90.5 363.6Z"/>`
  // the bowl: wide, low, dark stone, on a short foot
  const body = chain([cx - rx, rimY], [[[cx - rx + 1, rimY + 18], [cx - 26, rimY + 25], [cx - 18, rimY + 25]], [[cx, rimY + 26], [cx, rimY + 26], [cx + 18, rimY + 25]], [[cx + 26, rimY + 25], [cx + rx - 1, rimY + 18], [cx + rx, rimY]]], 12)
  s += box(R(cx - 17, rimY + 24, 34, 6), T.sky, { seed: 74, j: 0.2, bow: 0.15, base: 2.4 })
  s += box(body, T.sky, { smooth: true, seed: 73, base: 2.8 })
  s += box(ell(cx, rimY, rx - 0.8, 7, 40), T.potBand, { smooth: true, off: false, base: 2.2 })
  // the water inside the stone rim, two ripples where the thread lands
  s += fill(ell(cx - 1, rimY + 0.6, rx - 8, 4.4, 36), WATER, false)
  s += pen(ell(89.6, rimY + 0.8, 7, 1.7, 18), { base: 1.3, min: 0.8, wob: 0, dirMix: 0 })
  s += pen(chain([77.5, rimY + 1.4], [[[81, rimY + 4.4], [98, rimY + 4.4], [102, rimY + 1.4]]], 12), { base: 1.2, min: 0.7, wob: 0, dirMix: 0 })
  // three pebbles at the foot of the upright
  s += box(ell(145, rimY - 1, 6.4, 4.2, 14), T.pcSide, { smooth: true, off: false, base: 1.7 })
  s += box(ell(133.5, rimY, 7.6, 4.8, 14), T.frame, { smooth: true, off: false, base: 1.7 })
  s += box(ell(123.4, rimY + 2, 4.6, 3, 14), T.pcSide, { smooth: true, off: false, base: 1.6 })
  return s
}

// ---------- the turbine: foot just in front of the computer's lower left corner ----------
const HUB = [216, 353]
function turbine(k) {
  const { T, pen, box, ell, chain, f1 } = k
  const [hx, hy] = HUB, footY = 435
  let s = ''
  // the cable: out of the foot, one sag along the desk, into a port low on the computer's face
  s += pen(chain([hx + 12, footY - 2], [[[250, 442], [288, 441], [306, 426]]], 22), { base: 2, dirMix: 0, seed: 88 })
  s += box([[302, 419], [314, 419], [314, 427], [302, 427]], T.pcSide, { seed: 89, j: 0.15, bow: 0.1, base: 1.7 })
  // foot: a weighted dome on a plate, with its own power light
  s += box(ell(hx, footY - 2, 16, 4, 24), T.frame, { smooth: true, off: false, base: 2.3 })
  s += box(chain([hx - 11, footY - 3], [[[hx - 10, footY - 14], [hx + 10, footY - 14], [hx + 11, footY - 3]]], 14), T.frame, { smooth: true, off: false, base: 2.2 })
  s += `<circle cx="${hx + 5}" cy="${footY - 7.4}" r="2.3" fill="${T.comma}"/>`
  // mast, tapering
  s += box([[hx - 3.6, footY - 11], [hx - 2, hy + 4], [hx + 2, hy + 4], [hx + 3.6, footY - 11]], T.paper, { smooth: true, base: 2.2, seed: 81 })
  // nacelle, peeking out behind the hub
  s += box([[hx - 3, hy - 4.6], [hx + 13, hy - 4], [hx + 15, hy], [hx + 13, hy + 4], [hx - 3, hy + 4.6]], T.paper, { smooth: true, off: false, base: 2, seed: 82 })
  // rotor, drawn about the origin: three blades with real chord, a hub, a nose
  const blade = (deg, seed) => {
    const a = (deg * Math.PI) / 180, u = [Math.cos(a), Math.sin(a)], n = [-u[1], u[0]]
    const at = (r, w) => [u[0] * r + n[0] * w, u[1] * r + n[1] * w]
    const pts = [[4, -2.6], [8.5, -6], [14, -5.4], [19, -3.8], [23, -2], [24.5, 0], [23, 1.3], [15, 2.6], [8, 3], [4, 2.6]].map(([r, w]) => at(r, w))
    return box(pts, T.paper, { smooth: true, off: false, base: 2.1, seed })
  }
  let rotor = [-100, 20, 140].map((d, i) => blade(d, 83 + i)).join('')
  rotor += box(ell(0, 0, 5, 5, 16), T.paper, { smooth: true, off: false, base: 2 }) + `<circle cx="0" cy="0" r="1.6" fill="${T.line}"/>`
  s += `<g transform="translate(${f1(hx)} ${f1(hy)})"><g class="dc-rotor">${rotor}</g></g>`
  return s
}

const STYLE = `<style>.dc-rotor{animation:dc-spin 8s linear infinite}@keyframes dc-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.dc-rotor{animation:none}}</style>`

export default {
  title: 'The tidy engineer',
  name: 'the tidy engineer',
  label: 'Drawing: a small computer on a desk in a study at night, with a paper tag reading Ola tied to it, and beside it its own power and water. A small wind turbine turns in front of it, wired into the computer, and a zen fountain, a dark stone bowl with a bamboo spout pouring a thread of water, stands at the other end of the desk. A desk lamp bends over the computer, its cable runs to the wall socket, and a mug steams beside the lamp. Above: books on a shelf and a window with the moon over the rooftops; under the desk, a wastepaper basket.',
  omit: ['plant', 'deskBooks', 'papers'],
  layers: {
    desk: (k) => fountain(k),
    front: (k) => STYLE + turbine(k),
  },
}
