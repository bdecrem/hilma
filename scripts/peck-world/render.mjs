// Render the Living Island world into the app's bundle: ground tiles, foreground sprites, manifest.
//   node scripts/peck-world/render.mjs [--scale 3] [--only 0-5] [--out apps/feynd/Feynd/PeckWorld]
// Tiles are cut from the art's bottom edge up in 355-pt rows (four per chapter), so chapters start on
// a tile boundary and the app can loop bands 6–7 by tile. Ground tiles are opaque JPEGs.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const scale = +arg('--scale', 3), q = +arg('--quality', 80);
const out = path.resolve(arg('--out', 'apps/feynd/Feynd/PeckWorld'));
const only = arg('--only', null);
fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync('/private/tmp/claude-501/pw-');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 800 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('file://' + path.resolve('misc/dodo-redesign/living-island/world/index.html') + '?mode=export');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
const man = await page.evaluate(() => window.manifest());
const T = 355, ORIGIN = -188;                 // tile t covers yb in [ORIGIN + T t, ORIGIN + T (t+1))
const top = man.BOT + (man.NB * man.CH - 0.5) * man.P;   // yb of the top of the last rendered band
const nTiles = Math.ceil((top - ORIGIN) / T);
const [t0, t1] = only ? only.split('-').map(Number) : [0, nTiles - 1];
const t0ms = Date.now();
for (let t = t0; t <= t1; t++) {
  const ybTop = ORIGIN + T * (t + 1), yTop = man.H - ybTop;
  const url = await page.evaluate(([y, h, s]) => window.renderLayer('world', y, h, s), [yTop, T, scale]);
  const png = path.join(tmp, `g${t}.png`);
  fs.writeFileSync(png, Buffer.from(url.split(',')[1], 'base64'));
  const jpg = path.join(out, `pw-g-${String(t).padStart(2, '0')}.jpg`);
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(q), png, '--out', jpg], { stdio: 'ignore' });
  process.stdout.write(`tile ${t} `);
}
console.log(`\n${t1 - t0 + 1} tiles in ${((Date.now() - t0ms) / 1000).toFixed(1)}s`);
// foreground sprites
const fg = [];
if (!only) {
  for (const f of fs.readdirSync(out)) if (f.startsWith('pw-fg-')) fs.unlinkSync(path.join(out, f));
  const n = await page.evaluate(() => window.fgCount());
  for (let i = 0; i < n; i++) {
    const s = await page.evaluate(([i, sc]) => window.fgSprite(i, sc), [i, scale]);
    if (!s) continue;
    const name = `pw-fg-${String(fg.length).padStart(3, '0')}.png`;
    fs.writeFileSync(path.join(out, name), Buffer.from(s.png.split(',')[1], 'base64'));
    delete s.png; fg.push({ file: name.replace('.png', ''), ...s });
  }
  man.tiles = { T, origin: ORIGIN, count: nTiles, scale, loopFromTile: (man.BOT + (man.loopFrom * man.CH - 0.5) * man.P - ORIGIN) / T };
  man.fg = fg;
  fs.writeFileSync(path.join(out, 'pw-manifest.json'), JSON.stringify(man));
  console.log(`${fg.length} fg sprites, manifest: ${man.live.length} live, ${man.critters.length} critters, ${Object.keys(man.chests).length} chests, ${man.signs.length} signs, ${man.gates.length} gates`);
}
if (errs.length) console.log('PAGE ERRORS:\n' + errs.join('\n'));
await browser.close();
