// Shoots takt.pizza/road for a look: the opening screen, the trailer as it plays, and stops
// down the road, in both vibes, at a desktop and a phone size.
//   node scripts/takt/road-shots.mjs <out dir> [base url]     (default http://localhost:3266)
// Prints the page's errors and what the sound did (the track at each stop).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'road-shots';
const base = process.argv[3] ?? 'http://localhost:3266';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const sizes = { desk: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const errors = [];

for (const [size, viewport] of Object.entries(sizes)) {
  for (const vibe of ['blues', 'electronic']) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: size === 'phone' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${size} ${vibe}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${size} ${vibe}: ${m.text()}`));
    page.on('requestfailed', (r) => errors.push(`${size} ${vibe}: failed ${r.url()}`));
    const shot = (name) => page.screenshot({ path: `${out}/${size}-${vibe}-${name}.png` });
    const now = () => page.locator('.now').innerText().then((t) => t.replace(/\s+/g, ' '));

    await page.goto(`${base}/takt/road?vibe=${vibe}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await shot('0-opening');

    // the trailer
    await page.locator('.play').click();
    const t0 = Date.now();
    for (const at of [1.0, 3.0, 5.0, 6.6, 7.6, 8.6, 9.6, 10.6, 12.5]) {
      await page.waitForTimeout(Math.max(0, at * 1000 - (Date.now() - t0)));
      await shot(`1-trailer-${at.toFixed(1)}`);
    }
    console.log(size, vibe, 'after the trailer:', await now(), '| scrollY', await page.evaluate(() => Math.round(scrollY)));

    // down the road
    for (const level of [3, 8, 11, 19, 26]) {
      await page.locator('.stop').nth(level - 1).click();
      await page.waitForTimeout(1900);
      await shot(`2-stop-${String(level).padStart(2, '0')}`);
      console.log(size, vibe, 'stop', level, await now());
    }
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(900);
    await shot('3-end');

    // the other vibe from the middle of the road, then the sound off
    await page.locator('.stop').nth(11).click();
    await page.waitForTimeout(1200);
    const before = await page.locator('.stop[data-state=here]').boundingBox();
    await page.locator('.switch').click();
    await page.waitForTimeout(900);
    const after = await page.locator('.stop[data-state=here]').boundingBox();
    await shot('4-switched');
    console.log(size, vibe, 'switched at 12: here', await page.locator('.stop[data-state=here]').innerText(), 'moved', Math.round(after.y - before.y), 'px |', await now());
    await page.locator('.now').click();
    await page.waitForTimeout(400);
    console.log(size, vibe, 'sound off:', await now());
    await ctx.close();
  }
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no page errors');
