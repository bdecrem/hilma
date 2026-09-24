// OG card for /dodo/anime: the hero key visual at 1200×630 → public/dodo/anime-og.png
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:8765/dodo/anime.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '.cue,.credit{display:none}' });
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelector('#heroDodo svg').classList.remove('blink'));
await page.screenshot({ path: 'public/dodo/anime-og.png' });
await browser.close();
