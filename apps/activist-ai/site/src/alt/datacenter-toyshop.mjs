// "The toy shop": the Ola datacenter gets its own power and water, at desk scale.
// A wooden toy windmill stands at the computer's front corner, its sails turning slowly;
// a little tabletop fountain from a fancy shop trickles into a glazed basin where the mug stood.
// The papers and the mug go, to pay for the two; the wall socket and the computer's cable go too
// (this datacenter runs on its windmill), and with them the lamp's cord.

const WATER = '#d3dbe8' // a pale tint between T.text2 and the creams

// the windmill: hub at (HX, HY), tower standing on the desk at y 428, at the computer's front right corner
const HX = 414, HY = 352, SAIL = 38

function windmill(k) {
  const { T, pen, box, wl, R, chain } = k
  let s = ''
  // the little plinth it came on
  s += box(R(392, 418, 44, 10), T.woodMid, { seed: 71, base: 2.4 })
  // the tower, tapering, sunflower painted, with two planks
  s += box([[397, 418], [431, 418], [423, 360], [405, 360]], T.b3, { seed: 72, base: 2.6 })
  for (const y of [376, 394]) { const w = 7 + (y - 360) * 0.14; s += pen(wl([414 - w + 1, y], [414 + w - 1, y], { j: 0.15 }), { base: 1.2, min: 0.8, dirMix: 0 }) }
  // a door and a round window
  s += box(chain([409, 418], [[[409, 404], [419, 404], [419, 418]]], 10), T.woodDark, { smooth: true, off: false, base: 1.8 })
  s += `<circle cx="414" cy="385" r="3" fill="${T.line}"/>`
  // the cap
  s += box(chain([401, 362], [[[402, 342], [426, 342], [427, 362]]], 16), T.comma, { smooth: true, seed: 73, base: 2.6 })
  // the sails, drawn around the hub, caught mid-turn
  let sails = ''
  for (let i = 0; i < 4; i++) {
    const a = ((i * 90 + 28) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a)
    const at = (u, v) => [u * c - v * sn, u * sn + v * c]
    sails += pen(wl(at(3, 0), at(SAIL + 1, 0), { j: 0.2, seed: 80 + i }), { base: 2.4, dirMix: 0 })
    const sail = [at(10, 0.8), at(SAIL, 0.8), at(SAIL, 10), at(10, 10)]
    sails += box(sail, T.paper, { seed: 84 + i, base: 1.9, j: 0.2, bow: 0.2 })
    for (const u of [19, 28]) sails += pen(wl(at(u, 1.4), at(u, 9.6), { j: 0.1 }), { base: 1.2, min: 0.8, dirMix: 0 })
    sails += pen(wl(at(11, 5.4), at(SAIL - 1, 5.4), { j: 0.1 }), { base: 1.2, min: 0.8, dirMix: 0 })
  }
  sails += `<circle cx="0" cy="0" r="4.2" fill="${T.comma}" stroke="${T.line}" stroke-width="1.8"/>`
  s += `<g transform="translate(${HX} ${HY})"><g class="ola-sails">${sails}</g></g>`
  return s
}

// the fountain, where the mug stood, centered in the free desk between the lamp's foot (x 512) and the
// desk's end (x 586): a glazed basin x 521 to 579 like the flowerpot (cream, a blue band), a bamboo
// spout standing in it at the back right and pouring left, so its thread of water falls against
// plain wall well right of the lamp's arm (at y 360 the arm is at x 503), and a cairn of three
// pebbles in the water at the left
const CX = 550
function fountain(k) {
  const { T, pen, box, wl, R, ell, chain, brush, D } = k
  let s = ''
  // the bamboo stalk, standing in the basin (the basin and the water cover its foot)
  s += box(R(564, 348, 10, 54), T.plant, { seed: 90, base: 2.2 })
  for (const y of [365, 382]) s += pen(wl([564, y], [574, y], { j: 0.1 }), { base: 1.6, dirMix: 0 })
  // the spout: a cut length of bamboo bending over the water
  s += box([[566, 356], [571, 349], [548, 355], [545, 361]], T.plantDark, { seed: 91, base: 2.1, j: 0.1, bow: 0.1 })
  // the thread of water, pale against the wall
  s += `<path fill="${WATER}" d="${brush(chain([547, 360], [[[548.5, 372], [547.5, 386], [547, 398]]], 16), { base: 3.6, min: 2.2, dirMix: 0, wob: 0, tin: 0.05, tout: 0.05, w0: 0.7, w1: 0.9 })}"/>`
  // the foot, the basin, its blue band, the water
  s += box(R(CX - 15, 423, 30, 6), T.woodMid, { seed: 96, base: 2.2 })
  s += box(chain([CX - 29, 398], [[[CX - 28, 417], [CX - 14, 425], [CX, 425]], [[CX + 14, 425], [CX + 28, 417], [CX + 29, 398]]], 18).concat([[CX - 29, 398]]), T.frame, { smooth: true, seed: 92, base: 2.8 })
  s += `<path fill="${T.potBand}" d="${D(chain([CX - 27.4, 406], [[[CX - 10, 408], [CX + 10, 408], [CX + 27.4, 406]]], 12).concat(chain([CX + 25.6, 413], [[[CX + 10, 415.6], [CX - 10, 415.6], [CX - 25.6, 413]]], 12)))}"/>`
  s += box(ell(CX, 398, 28, 5.2, 36), WATER, { smooth: true, off: false, base: 2.4 })
  // two ripples where the thread lands
  s += pen(chain([542, 398.8], [[[543.5, 401.2], [550.5, 401.2], [552, 398.8]]], 10), { base: 1.6, min: 1.1, dirMix: 0, wob: 0 })
  s += pen(chain([539, 399.8], [[[541.5, 403.4], [554.5, 403.4], [557, 399.8]]], 12), { base: 1.4, min: 1, dirMix: 0, wob: 0 })
  // a cairn of three pebbles in the water, at the left
  s += box(ell(531, 395, 9.5, 4.8, 18), T.woodDark, { smooth: true, base: 2.2, seed: 93 })
  s += box(ell(532, 386.6, 7.4, 4, 18), T.pcSide, { smooth: true, base: 2.1, seed: 94 })
  s += box(ell(531.2, 379.4, 5.2, 3.3, 16), T.woodMid, { smooth: true, base: 2, seed: 95 })
  return s
}

const STYLE = `<style>.ola-sails{animation:ola-turn 8s linear infinite}@keyframes ola-turn{to{transform:rotate(360deg)}}@media (prefers-reduced-motion: reduce){.ola-sails{animation:none}}</style>`

export default {
  title: 'The toy shop',
  name: 'datacenter: the toy shop',
  label: 'Drawing: a small computer on a desk in a study at night, with a paper tag reading Ola tied to it, under a bending desk lamp. At its front corner stands a tiny toy windmill, its sails turning, and at the end of the desk a little tabletop fountain trickles from a bamboo spout into a basin with a cairn of pebbles. Around it: books on a shelf and on the desk, a trailing plant, a wastepaper basket, and a window with the moon over the rooftops.',
  omit: ['papers', 'mug', 'socket', 'lampCord'],
  layers: {
    front: (k) => STYLE + windmill(k),
    top: (k) => fountain(k),
  },
}
