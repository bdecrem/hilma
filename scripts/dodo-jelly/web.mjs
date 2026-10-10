// Renders the avatar sheet for the web — the "Dodo, for reference" section of
// the Polly design package (ola.cx/design/daily-call-v2): every dodo colourway
// and critter out of misc/dodo-redesign's drawing code,
// a 1024 px still and a -squish tap frame each, as transparent WebP at 1024
// and 512 px into public/dodo/jelly/. Re-run after the art pages change.
// usage: node scripts/dodo-jelly/web.mjs
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { ROOT, patched, JOBS } from './hook.mjs'

const PX = 1024
const OUT = path.join(ROOT, 'public/dodo/jelly')
const TMP = path.join(ROOT, 'apps/tokensurfers/.shots/jelly-web')
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true })

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: PX + 40, height: PX + 40 }, deviceScaleFactor: 1 })
let n = 0, bytes = 0
for (const job of JOBS) {
  await page.goto(patched(job.file), { waitUntil: 'load' })
  await page.waitForTimeout(400)
  for (const kind of job.kinds) {
    for (const squish of [false, true]) {
      const bounds = await page.evaluate(([k, p, sq]) => window.renderSprite(k, p, sq), [kind, PX, squish])
      if (!bounds) throw new Error('no body for ' + kind)
      const name = kind.replace('dodo_', 'dodo-') + (squish ? '-squish' : '')
      const png = path.join(TMP, name + '.png')
      await page.screenshot({ path: png, omitBackground: true, clip: { x: 0, y: 0, width: PX, height: PX } })
      for (const [suffix, size] of [['@2x', PX], ['', PX / 2]]) {
        const out = path.join(OUT, name + suffix + '.webp')
        await sharp(png).resize(size, size).webp({ quality: 88, alphaQuality: 90, effort: 6 }).toFile(out)
        bytes += fs.statSync(out).size; n++
      }
    }
  }
}
await b.close()
console.log('wrote', n, 'webp files to', OUT, (bytes / 1024 / 1024).toFixed(1) + ' MB')
