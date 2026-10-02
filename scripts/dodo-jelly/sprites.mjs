// Renders the jelly critters and dodo colours out of misc/dodo-redesign's own
// drawing code (the pages are the source of truth for the look) into the
// app's asset catalog: Feynd/Assets.xcassets/Jelly/<kind>.imageset (@2x/@3x)
// and a -squish variant (eyes shut, mouth open) for taps.
// usage: node scripts/dodo-jelly/sprites.mjs [out-xcassets-dir]
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const ROOT = '/Users/bart/Documents/code/hilma'
const OUT = process.argv[2] || path.join(ROOT, 'apps/feynd/Feynd/Assets.xcassets/Jelly')
const PT = 128                                   // sprite box in points; @2x = 256 px, @3x = 384 px

const HOOK = `
window.renderSprite = function(kind, px, squeeze) {
  // stop the page's own loop + physics; we draw one still per call
  window.requestAnimationFrame = function(){ return 0 }
  document.querySelectorAll('body *').forEach(e => { if (e !== cv) e.style.display = 'none' })
  document.documentElement.style.background = 'transparent'; document.body.style.background = 'transparent'
  cv.style.background = 'transparent'; cv.style.position = 'fixed'; cv.style.left = '0'; cv.style.top = '0'
  cv.style.width = px + 'px'; cv.style.height = px + 'px'
  W = px; H = px; DPR = 1; cv.width = px; cv.height = px; floorY = px * 2; TNOW = 1.3
  // size the body to fill the box: rest outline at S=1, then scale to 84% of the box
  S = 1
  const probe = new Body(kind, 0, 0, 0); probe.bounds()
  const w = probe.maxX - probe.minX, h = probe.maxY - probe.minY
  // wings and ears drawn outside the outline (bat, bee) need more margin
  const fill = { bat: 0.6, bee: 0.66, dragon: 0.78, cloud: 0.8 }[kind] || 0.84
  S = (px * fill) / Math.max(w, h)
  const b = new Body(kind, 0, 0, 0); b.bounds(); const sp = b.sp
  const dx = px / 2 - (b.minX + b.maxX) / 2, dy = px / 2 - (b.minY + b.maxY) / 2
  for (let i = 0; i < b.N; i++) { b.x[2*i] += dx; b.x[2*i+1] += dy; b.p[2*i] = b.x[2*i]; b.p[2*i+1] = b.x[2*i+1] }
  b.cx += dx; b.cy += dy; b.bounds()
  b.squeeze = squeeze ? 1 : 0; b.blinking = false; b.lookX = 0; b.lookY = 0; b.swell = 1
  bodies.length = 0; bodies.push(b)
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, px, px)
  drawBody(b)
  return { c: sp.c, w: (b.maxX - b.minX) / px, h: (b.maxY - b.minY) / px, cx: b.cx / px, cy: b.cy / px, bottom: b.maxY / px, top: b.minY / px }
}
`

function patched(file) {
  const html = fs.readFileSync(path.join(ROOT, 'misc/dodo-redesign', file), 'utf8')
  const out = path.join(ROOT, 'apps/tokensurfers/.shots', 'jelly-' + file)
  fs.writeFileSync(out, html.replace('})();\n</script>', HOOK + '})();\n</script>'))
  return 'file://' + out
}

const jobs = [
  { file: 'jelly-critters.html', kinds: ['bunny','peach','cat','dragon','gummy','penguin','octo','panda','blob','hamster','bat','bee','cloud','mushroom','sprite'] },
  { file: 'jelly-dodos.html', kinds: ['dodo','dodo_pink','dodo_peach','dodo_mint','dodo_lemon','dodo_grape','dodo_cherry','dodo_lime'] },
]
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1100, height: 1100 }, deviceScaleFactor: 1 })
let n = 0
const meta = {}
for (const job of jobs) {
  await page.goto(patched(job.file), { waitUntil: 'load' })
  await page.waitForTimeout(400)
  for (const kind of job.kinds) {
    for (const squish of [false, true]) {
      for (const [suffix, scaleX] of [['@2x', 2], ['@3x', 3]]) {
        const px = PT * scaleX
        const bounds = await page.evaluate(([k, p, sq]) => window.renderSprite(k, p, sq), [kind, px, squish])
        if (scaleX === 2 && !squish) meta[kind.replace('dodo_', 'dodo-')] = bounds
        if (!bounds) throw new Error('no body for ' + kind)
        const name = kind.replace('dodo_', 'dodo-') + (squish ? '-squish' : '')
        const dir = path.join(OUT, name + '.imageset'); fs.mkdirSync(dir, { recursive: true })
        await page.screenshot({ path: path.join(dir, name + suffix + '.png'), omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } })
        if (scaleX === 3) fs.writeFileSync(path.join(dir, 'Contents.json'), JSON.stringify({
          images: [{ idiom: 'universal', filename: name + '@2x.png', scale: '2x' }, { idiom: 'universal', filename: name + '@3x.png', scale: '3x' }],
          info: { author: 'xcode', version: 1 }, properties: { 'template-rendering-intent': 'original' },
        }, null, 2))
        n++
      }
    }
  }
}
await page.goto(patched('jelly-dodos.html'), { waitUntil: 'load' }); await page.waitForTimeout(300)
fs.mkdirSync(path.join(ROOT, 'scripts/dodo-jelly/out'), { recursive: true })
for (const [name, sq] of [['dodo-1024', false], ['dodo-1024-squish', true]]) {
  await page.evaluate(([p, q]) => window.renderSprite('dodo', p, q), [1024, sq])
  await page.screenshot({ path: path.join(ROOT, 'scripts/dodo-jelly/out', name + '.png'), omitBackground: true, clip: { x: 0, y: 0, width: 1024, height: 1024 } })
}
fs.writeFileSync(path.join(OUT, 'Contents.json'), JSON.stringify({ info: { author: 'xcode', version: 1 }, properties: { 'provides-namespace': true } }))
fs.writeFileSync(path.join(ROOT, 'scripts/dodo-jelly/sprites.json'), JSON.stringify(meta, null, 1))
// a contact sheet to eyeball
await b.close()
console.log('wrote', n, 'pngs to', OUT)
