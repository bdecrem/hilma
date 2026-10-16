// onething's tab and home-screen icons, from the tear-off calendar (2026-10-16):
// a cream sheet under a black binding, a heavy "1" in Inter Tight and the
// wordmark's red dot. Rendered in Chromium with the bundled font, so the glyph
// is the real one.
//   node scripts/onething/icons.mjs        → src/app/onething/icon.png (512) + apple-icon.png (180)
import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const root = path.resolve(import.meta.dirname, '../..')
// inlined: a page set with setContent cannot load file:// fonts
const font = `data:font/woff2;base64,${fs.readFileSync(path.join(root, 'src/fonts/inter-tight/InterTight.woff2')).toString('base64')}`
const out = path.join(root, 'src/app/onething')

// One drawing on a 512 grid. `round` gives the favicon its own rounded wall;
// the apple icon is full bleed (iOS rounds it).
const page = (round) => `<!doctype html><html><head><style>
@font-face { font-family: T; src: url(${font}) format('woff2'); font-weight: 100 900; }
html, body { margin: 0; background: transparent; }
.wall { position: relative; width: 512px; height: 512px; background: #e9e3d8; border-radius: ${round ? 112 : 0}px; overflow: hidden; }
.bind { position: absolute; left: 76px; right: 76px; top: 70px; height: 62px; background: #222; border-radius: 12px 12px 4px 4px; }
.bind i { position: absolute; top: 20px; width: 22px; height: 22px; border-radius: 50%; background: #e9e3d8; }
.sheet { position: absolute; left: 76px; right: 76px; top: 128px; bottom: 64px; background: #fffdf7; }
.one { position: absolute; left: 0; right: 0; top: 24px; text-align: center; font: 900 290px/1 T; letter-spacing: -.04em; color: #151515; }
.dot { display: inline-block; width: 50px; height: 50px; margin-left: 14px; border-radius: 50%; background: #d63a20; }
</style></head><body><div class="wall"><div class="bind"><i style="left:82px"></i><i style="right:82px"></i></div><div class="sheet"><div class="one">1<span class="dot"></span></div></div></div></body></html>`

const b = await chromium.launch()
for (const [file, size, round] of [['icon.png', 512, true], ['apple-icon.png', 180, false]]) {
  const p = await b.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: size / 512 })
  await p.setContent(page(round))
  await p.evaluate(() => document.fonts.ready)
  await p.screenshot({ path: path.join(out, file), omitBackground: round, clip: { x: 0, y: 0, width: 512, height: 512 } })
  await p.close()
  console.log(file, size)
}
await b.close()
