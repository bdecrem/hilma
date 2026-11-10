// Clicks the turkeys and screenshots mid-hop.
import { chromium } from 'playwright';
const out = process.argv[2], base = process.env.BASE || 'http://localhost:3471/semibart/index.html';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(base); await p.waitForTimeout(800); await p.click('#startBtn'); await p.waitForTimeout(300); await p.evaluate(() => { const S = window.quest.S; S.busy = false; S.line = null; });
const box = await p.locator('#cv').boundingBox(), k = box.width / 320;
await p.mouse.click(box.x + 262 * k, box.y + (104 + 18) * k);
await p.waitForTimeout(160); await p.screenshot({ path: out + '/hop.png' });
console.log('turkeyT', await p.evaluate(() => window.quest.S.turkeyT), 'busy', await p.evaluate(() => window.quest.S.busy), 'errors', errs);
await b.close();
