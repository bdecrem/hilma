// The render hook the jelly art pages get patched with: one still body per
// call, drawn by the page's own code (misc/dodo-redesign is the source of
// truth for the look). Shared by sprites.mjs (app assets) and web.mjs (site).
import fs from 'fs'
import path from 'path'

export const ROOT = '/Users/bart/Documents/code/hilma'

export const HOOK = `
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

export function patched(file) {
  const html = fs.readFileSync(path.join(ROOT, 'misc/dodo-redesign', file), 'utf8')
  const out = path.join(ROOT, 'apps/tokensurfers/.shots', 'jelly-' + file)
  fs.writeFileSync(out, html.replace('})();\n</script>', HOOK + '})();\n</script>'))
  return 'file://' + out
}

export const JOBS = [
  { file: 'jelly-critters.html', kinds: ['bunny','peach','cat','dragon','gummy','penguin','octo','panda','blob','hamster','bat','bee','cloud','mushroom','sprite'] },
  { file: 'jelly-dodos.html', kinds: ['dodo','dodo_pink','dodo_peach','dodo_mint','dodo_lemon','dodo_grape','dodo_cherry','dodo_lime'] },
]
