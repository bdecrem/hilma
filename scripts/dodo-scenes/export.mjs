#!/usr/bin/env node
// Export the static showcase frames by screenshotting the site's own
// /dodo/scene/<id> route with Playwright — the same React frame the hero
// uses, so every export matches the page pixel for pixel.
//
//   node scripts/dodo-scenes/export.mjs                    # every format, light
//   node scripts/dodo-scenes/export.mjs --formats card,strip
//   node scripts/dodo-scenes/export.mjs --dark             # light + dark
//   node scripts/dodo-scenes/export.mjs --server http://localhost:3000
//
// Needs a production build (`pnpm build`); without --server it starts
// `next start` on port 3077 itself and stops it when done. Frames land in
// out/<format>/<theme>/NN-<id>.png (gitignored); the README strip is also
// written to public/dodo/hero-strip.png.

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const OUT = path.join(HERE, 'out')
const args = process.argv.slice(2)
const flag = (f) => args.includes(f)
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null }
const log = (...a) => console.log('[export]', ...a)

// Mirrors FORMATS in src/app/dodo/DodoFrame.tsx (sizes only; the layout lives there).
const FORMATS = {
  'appstore-6.9': { w: 1320, h: 2868, set: 'appstore' },
  'appstore-6.5': { w: 1284, h: 2778, set: 'appstore' },
  story: { w: 1080, h: 1920, set: 'video', layers: true },
  'story-title': { w: 1080, h: 1920, set: null },
  'story-outro': { w: 1080, h: 1920, set: null },
  card: { w: 1600, h: 900, set: 'hero' },
  wide: { w: 1920, h: 1080, set: 'video', layers: true },
  'wide-title': { w: 1920, h: 1080, set: null },
  'wide-outro': { w: 1920, h: 1080, set: null },
  strip: { w: 1600, h: 640, set: null },
}
const isClip = (s) => Boolean(s.clip) || s.capture === 'record'
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'scenes.json'), 'utf8'))
const formats = (opt('--formats')?.split(',') ?? Object.keys(FORMATS)).filter((f) => {
  if (!FORMATS[f]) log(`unknown format ${f}`)
  return FORMATS[f]
})
const themes = flag('--dark') ? ['light', 'dark'] : manifest.themes

// ---- server ------------------------------------------------------------------
let server = opt('--server')
let child = null
async function up(url) { try { return (await fetch(url + '/dodo', { redirect: 'manual' })).status < 500 } catch { return false } }
async function ensureServer() {
  if (server) { if (!(await up(server))) throw new Error(`nothing answering at ${server}`); return }
  server = 'http://localhost:3077'
  if (await up(server)) { log('using the server already on 3077'); return }
  if (!fs.existsSync(path.join(ROOT, '.next/BUILD_ID'))) throw new Error('no production build — run `pnpm build` first')
  child = spawn('pnpm', ['start', '-p', '3077'], { cwd: ROOT, stdio: 'ignore', detached: true })
  const t0 = Date.now()
  while (!(await up(server))) {
    if (Date.now() - t0 > 60_000) throw new Error('next start did not come up in 60s')
    await new Promise((r) => setTimeout(r, 500))
  }
  log('started next start on 3077')
}
function stopServer() { if (child) try { process.kill(-child.pid, 'SIGTERM') } catch { /* gone */ } }

// ---- frames ------------------------------------------------------------------
await ensureServer()
const browser = await chromium.launch()
try {
  for (const f of formats) {
    const spec = FORMATS[f]
    const list = spec.set ? manifest.scenes.filter((s) => s.sets.includes(spec.set)) : [{ id: f }]
    const ordered = spec.set === 'hero' ? manifest.hero.map((id) => list.find((s) => s.id === id)).filter(Boolean) : list
    for (const theme of themes) {
      const dir = path.join(OUT, f, theme)
      fs.mkdirSync(dir, { recursive: true })
      const page = await browser.newPage({ viewport: { width: spec.w, height: spec.h }, deviceScaleFactor: 1 })
      for (let i = 0; i < ordered.length; i++) {
        const s = ordered[i]
        await page.goto(`${server}/dodo/scene/${s.id}?format=${f}&theme=${theme}`, { waitUntil: 'networkidle' })
        await page.evaluate(() => document.fonts.ready)
        await page.waitForFunction(() => Array.from(document.images).every((im) => im.complete && im.naturalWidth > 0))
        await page.waitForTimeout(250)
        const stem = path.join(dir, `${String(i + 1).padStart(2, '0')}-${s.id}`)
        await page.locator('#frame').screenshot({ path: stem + '.png' })
        // Sidecar: where the screen sits, so video.mjs can drop a clip into it.
        const rect = await page.locator('.df').getAttribute('data-screen')
        fs.writeFileSync(stem + '.json', JSON.stringify({ scene: s.id, format: f, theme, ...JSON.parse(rect ?? '{}') }) + '\n')
        log(`${f}/${theme}/${path.basename(stem)}.png`)
        if (f === 'strip' && theme === 'light') fs.copyFileSync(stem + '.png', path.join(ROOT, 'public/dodo/hero-strip.png'))
        if (spec.layers && isClip(s)) {
          // Clip scenes also export the ground and the bird as separate
          // layers; the assembler plays the clip between them.
          for (const layer of ['bg', 'bird']) {
            await page.goto(`${server}/dodo/scene/${s.id}?format=${f}&theme=${theme}&layer=${layer}`, { waitUntil: 'networkidle' })
            await page.evaluate(() => document.fonts.ready)
            await page.waitForTimeout(250)
            await page.locator('#frame').screenshot({ path: `${stem}.${layer}.png`, omitBackground: layer === 'bird' })
          }
        }
      }
      await page.close()
    }
  }
} finally {
  await browser.close()
  stopServer()
}
log('done →', path.relative(ROOT, OUT))
