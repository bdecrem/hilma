// Screenshots of public/dodo/anime.html: hero, trail stops, model sheet, next-episode card.
// Usage: node scripts/dodo-anime/shots.mjs <outdir> [url] [width] [height]
import { chromium } from 'playwright';
const [out, url = 'http://localhost:8765/dodo/anime.html', w = '390', h = '844'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/0-hero.png` });
const worldTop = await page.evaluate(() => document.getElementById('world').getBoundingClientRect().top + scrollY);
// Walk the trail slowly so Dodo moves and stamps.
const stops = [300, 700, 1150, 1700, 2100, 2500, 3050, 3500, 3950, 4350, 4800, 5250, 5700, 6150, 6500];
for (const [k, y] of stops.entries()) {
  for (let s = 0; s < 6; s++) { await page.evaluate(v => scrollTo(0, v), worldTop + y - 420 + s * 20); await page.waitForTimeout(90); }
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/w${String(k).padStart(2, '0')}.png` });
}
const sheet = await page.evaluate(() => document.getElementById('settei').getBoundingClientRect().top + scrollY);
for (let k = 0; k < 5; k++) { await page.evaluate(v => scrollTo(0, v), sheet + k * (+h - 60)); await page.waitForTimeout(400); await page.screenshot({ path: `${out}/s${k}.png` }); }
await page.evaluate(() => scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/z-next.png` });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
