// A jelly wallpaper: the critters of misc/dodo-redesign/jelly-critters.html
// dropped into a heap by the page's own soft-body physics and frozen
// mid-squish, on a bright gradient. The page draws every body; this script
// only stages the scene (who stands where, who is still falling), swaps the
// backdrop, and screenshots.
//
//   node scripts/dodo-jelly/wallpaper.mjs [variant|all] [out-dir] [--size 1280x832] [--scale 3]
//
// Variants: ultra (ultramarine → violet), sunflower, sunset. Default size is
// the MacBook Air 13" ratio (1280×832 points at 3× = 3840×2496 px).
import { chromium } from 'playwright'
import fs from 'fs'
import os from 'os'
import path from 'path'

const ROOT = '/Users/bart/Documents/code/hilma'
const argv = process.argv.slice(2)
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv.splice(i, 2)[1] : d }
const [VW, VH] = flag('size', '1280x832').split('x').map(Number)
const SCALE = Number(flag('scale', 3))
const which = argv[0] || 'all'
const OUT = argv[1] || path.join(os.homedir(), 'Desktop/dodo')

// Backdrops: a CSS gradient behind the page's transparent canvas, a few soft
// jelly bubbles for depth, and the page's own floor/shadow colours.
const VARIANTS = {
  ultra: {
    bg: 'radial-gradient(130% 95% at 50% 108%, #ffb3ec 0%, #c77dff 22%, #7a4dff 48%, #3d3bff 74%, #2a22c9 100%)',
    bubbles: ['rgba(255,255,255,.16)', 'rgba(255,170,240,.20)', 'rgba(120,200,255,.18)'],
    theme: { floor: 'rgba(255,255,255,.16)', floorEdge: 'rgba(255,255,255,.55)', shadow: 'rgba(20,8,90,.45)' },
  },
  sunflower: {
    bg: 'radial-gradient(130% 95% at 50% 108%, #fff3a8 0%, #ffd93a 26%, #ffc31f 52%, #ff9f2e 80%, #ff7a3d 100%)',
    bubbles: ['rgba(255,255,255,.26)', 'rgba(255,255,255,.18)', 'rgba(255,120,60,.16)'],
    theme: { floor: 'rgba(255,255,255,.30)', floorEdge: 'rgba(255,255,255,.7)', shadow: 'rgba(150,70,0,.38)' },
  },
  sunset: {
    bg: 'linear-gradient(180deg, #5b3dff 0%, #a34dff 28%, #ff4fa3 60%, #ff8a4c 84%, #ffc94a 100%)',
    bubbles: ['rgba(255,255,255,.16)', 'rgba(255,220,120,.18)', 'rgba(255,150,220,.18)'],
    theme: { floor: 'rgba(255,255,255,.22)', floorEdge: 'rgba(255,255,255,.6)', shadow: 'rgba(110,20,60,.4)' },
  },
}

// The staging, in points of a 1280×832 stage (scaled to other sizes). `s` is
// the body scale (the page's S). Phase 1 stands on the floor; phase 2 drops
// onto them and settles; phase 3 is still in the air when the shutter goes.
const CAST = {
  base: 2.0,
  floor: 92,                       // floor height from the bottom (the Dock sits over it)
  look: [640, 150],                // everyone watches the ones coming down
  phases: [
    { steps: 40, items: [
      { k: 'dodo', x: 640, s: 3.3, stand: true },
      { k: 'penguin', x: 118, s: 2.2, stand: true },
      { k: 'cat', x: 318, s: 2.3, stand: true },
      { k: 'mushroom', x: 478, s: 1.9, stand: true },
      { k: 'hamster', x: 820, s: 2.1, stand: true },
      { k: 'panda', x: 990, s: 2.3, stand: true },
      { k: 'octo', x: 1170, s: 2.2, stand: true },
    ] },
    { steps: 150, items: [
      { k: 'bunny', x: 215, y: 330, s: 2.0, a: -0.25 },
      { k: 'gummy', x: 400, y: 250, s: 1.9, a: 0.3 },
      { k: 'dodo_lime', x: 900, y: 300, s: 2.0, a: 0.2 },
      { k: 'blob', x: 1085, y: 360, s: 2.0, a: -0.15 },
      { k: 'peach', x: 60, y: 120, s: 1.8, a: 0.4 },
      { k: 'dragon', x: 1215, y: 60, s: 1.9, a: -0.3 },
    ] },
    { steps: 15, items: [
      { k: 'bat', x: 300, y: 150, s: 2.1, a: -0.35 },
      { k: 'dodo_pink', x: 505, y: 235, s: 1.9, a: 0.5 },
      { k: 'sprite', x: 745, y: 120, s: 1.9, a: -0.2 },
      { k: 'bee', x: 960, y: 95, s: 2.0, a: 0.3 },
      { k: 'cloud', x: 1120, y: 200, s: 2.1, a: 0.12 },
      { k: 'dodo_lemon', x: 130, y: 60, s: 1.7, a: -0.6 },
    ] },
  ],
  squeeze: ['mushroom', 'hamster'], // the > < faces: someone just landed on them
  sprinkles: 110,
}

const HOOK = `
// Stop the page's own loop first and let its already-queued frame run out —
// otherwise that frame steps the staged scene once more and drops the
// confetti to the floor.
window.__wpStop = function () { window.requestAnimationFrame = function () { return 0 } }
window.__wp = function (cfg) {
  window.requestAnimationFrame = function () { return 0 }
  introTimers.forEach(clearTimeout); introTimers = []
  let seed = cfg.seed || 11
  Math.random = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  document.querySelectorAll('body > *').forEach(function (e) { if (e !== cv && e.id !== 'wpbg') e.style.display = 'none' })
  cv.style.background = 'transparent'; cv.style.zIndex = 2
  const r = cv.getBoundingClientRect(); W = r.width; H = r.height; DPR = window.devicePixelRatio || 1
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR)
  const k = W / 1280
  S = cfg.base * k; floorY = H - cfg.floor * k; goo.n = 0; initGoo()
  theme = cfg.theme
  bodies = []; drops = []; sprinkles = []; bubbles = []; rings = []
  const DC = {
    pink: { c: ['#ffe0ef', '#ff9fc8', '#e9649d'], rim: 'rgba(185,30,100,.55)' },
    lime: { c: ['#efffd0', '#a3e45c', '#4c9f2a'], rim: 'rgba(30,95,10,.5)' },
    lemon: { c: ['#fff8c8', '#ffd43a', '#e0a100'], rim: 'rgba(140,85,0,.5)' },
    grape: { c: ['#efe2ff', '#a77bf2', '#6a3fc4'], rim: 'rgba(50,10,120,.55)' },
    mint: { c: ['#e2fff4', '#91e9cc', '#4dc5a2'], rim: 'rgba(25,135,105,.5)' },
  }
  for (const n in DC) K['dodo_' + n] = Object.assign({}, K.dodo, DC[n])
  function add(kind, x, y, s, ang) {
    const save = S; S = s * k
    const b = new Body(kind, x * k, y * k, ang || 0); S = save
    b.bounds(); b.hopT = 1e9; b.blinkT = 1e9; bodies.push(b); return b
  }
  function stand(kind, x, s) {
    const save = S; S = s * k
    const tmp = new Body(kind, 0, 0, 0); let my = -1e9
    for (let i = 0; i < tmp.N; i++) my = Math.max(my, tmp.q[2 * i + 1])
    const b = new Body(kind, x * k, floorY - my + 2, 0); S = save
    b.bounds(); b.hopT = 1e9; b.blinkT = 1e9; bodies.push(b); return b
  }
  pointer.active = true; pointer.x = cfg.look[0] * k; pointer.y = cfg.look[1] * k
  for (const phase of cfg.phases) {
    for (const it of phase.items) it.stand ? stand(it.k, it.x, it.s) : add(it.k, it.x, it.y, it.s, it.a)
    for (let i = 0; i < phase.steps; i++) step()
  }
  for (const b of bodies) { b.blinking = false; b.squeeze = 0 }
  for (const kind of cfg.squeeze || []) { const b = bodies.find(function (o) { return o.kind === kind }); if (b) b.squeeze = 1 }
  const cols = ['#ff7ab0', '#ffd43a', '#7fd3ff', '#a3e45c', '#ffffff', '#ff9a5c', '#b994ff']
  // Confetti in the air only — none across a face.
  let made = 0, tries = 0
  while (made < (cfg.sprinkles || 0) && tries++ < 4000) {
    const x = rnd(10, W - 10), y = rnd(50 * k, floorY - 30 * k)
    if (bodies.some(function (b) { return b.contains(x, y, 10 * k) })) continue
    sprinkles.push({ x: x, y: y, rot: rnd(0, TAU), col: cols[(Math.random() * cols.length) | 0], float: true, off: 0, vx: 0, vy: 0, vr: 0 })
    made++
  }
  render()
  return bodies.map(function (b) { return { k: b.kind, x: Math.round(b.cx / k), y: Math.round(b.cy / k) } })
}
`

function stagePage(variant) {
  let html = fs.readFileSync(path.join(ROOT, 'misc/dodo-redesign/jelly-critters.html'), 'utf8')
  html = html.replace('})();\n</script>', HOOK + '})();\n</script>')
  // The backdrop sits behind the canvas: gradient + a few big soft bubbles.
  const b = variant.bubbles
  const bubble = (x, y, r, c) => `<i style="position:absolute;left:${x}%;top:${y}%;width:${r}vw;height:${r}vw;margin:-${r / 2}vw 0 0 -${r / 2}vw;border-radius:50%;background:radial-gradient(circle at 34% 30%, rgba(255,255,255,.55) 0, ${c} 26%, rgba(255,255,255,0) 72%)"></i>`
  const decor = `<div id="wpbg" style="position:absolute;inset:0;z-index:1;overflow:hidden;background:${variant.bg}">
    ${bubble(12, 22, 26, b[0])}${bubble(86, 16, 20, b[1])}${bubble(66, 44, 34, b[2])}${bubble(30, 58, 16, b[1])}${bubble(48, 10, 12, b[0])}${bubble(95, 62, 14, b[0])}${bubble(3, 70, 12, b[2])}
  </div>`
  html = html.replace('<body>', '<body>' + decor)
  const dir = path.join(ROOT, 'scripts/dodo-jelly/out'); fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'wallpaper-stage.html'); fs.writeFileSync(file, html)
  return 'file://' + file
}

fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
for (const name of which === 'all' ? Object.keys(VARIANTS) : [which]) {
  const variant = VARIANTS[name]
  if (!variant) throw new Error('unknown variant ' + name)
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: SCALE })
  await page.goto(stagePage(variant), { waitUntil: 'load' })
  await page.waitForTimeout(300)
  await page.evaluate(() => window.__wpStop())
  await page.waitForTimeout(200)
  const cast = await page.evaluate((cfg) => window.__wp(cfg), { ...CAST, theme: variant.theme })
  const file = path.join(OUT, `jelly-wallpaper-${name}.png`)
  await page.screenshot({ path: file })
  console.log(name, '→', file, cast.length, 'critters')
  await page.close()
}
await browser.close()
