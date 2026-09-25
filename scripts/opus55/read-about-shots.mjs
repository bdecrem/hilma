// Checks public/read-about.html: every spread, a mid-turn frame, a phone view, and the OG card.
// Serve public/ first: python3 -m http.server 8765 --directory public
// Then: node scripts/opus55/read-about-shots.mjs <out-dir> [--og]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || '/tmp/read-about';
const base = process.env.BASE || 'http://localhost:8765';
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const errs = [];
const open = async (vp, page, dpr = 1) => {
  const p = await b.newPage({ viewport: vp, deviceScaleFactor: dpr });
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(`${base}/read-about.html?page=${page}`); await p.waitForFunction(() => window.READY, null, { timeout: 30000 });
  return p;
};
// every spread on a desktop
for (let i = 0; i < 12; i++) { const p = await open({ width: 1400, height: 900 }, i); await p.screenshot({ path: `${out}/spread-${String(i).padStart(2, '0')}.png` }); await p.close(); }
// a page mid-turn (tap, then shoot during the animation) and a board mid-swing
{
  const p = await open({ width: 1400, height: 900 }, 3);
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(380); await p.screenshot({ path: `${out}/turning.png` });
  await p.waitForTimeout(900);
  const idx = await p.evaluate(() => document.getElementById('caption').textContent); console.log('after turn caption:', idx);
  await p.close();
  const q = await open({ width: 1400, height: 900 }, 0);
  await q.keyboard.press('ArrowRight'); await q.waitForTimeout(450); await q.screenshot({ path: `${out}/cover-swing.png` }); await q.close();
  // drag a corner halfway
  const d = await open({ width: 1400, height: 900 }, 5);
  const box = await d.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  await d.mouse.move(box.w / 2 + 500, 760); await d.mouse.down(); await d.mouse.move(box.w / 2 + 150, 640, { steps: 12 });
  await d.screenshot({ path: `${out}/drag.png` }); await d.mouse.up(); await d.close();
}
// phone
for (const i of [0, 2, 9]) { const p = await open({ width: 390, height: 844 }, i, 2); await p.screenshot({ path: `${out}/phone-${i}.png` }); await p.close(); }
if (process.argv.includes('--og')) { const p = await open({ width: 1200, height: 630 }, 2); await p.screenshot({ path: 'public/read-about-og.png' }); await p.close(); }
await b.close();
console.log('errors:', errs.length ? errs : 'none');
