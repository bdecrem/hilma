// Renders the jelly critters and dodo colours out of misc/dodo-redesign's own
// drawing code (the pages are the source of truth for the look) into the
// app's asset catalog: Feynd/Assets.xcassets/Jelly/<kind>.imageset (@2x/@3x)
// and a -squish variant (eyes shut, mouth open) for taps.
// usage: node scripts/dodo-jelly/sprites.mjs [out-xcassets-dir]
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { ROOT, patched, JOBS as jobs } from './hook.mjs'

const OUT = process.argv[2] || path.join(ROOT, 'apps/feynd/Feynd/Assets.xcassets/Jelly')
const PT = 128                                   // sprite box in points; @2x = 256 px, @3x = 384 px

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
