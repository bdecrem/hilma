// Clicks the framed record in Bart's study and checks it opens dk024 in a new tab.
import { chromium } from 'playwright';
const out = process.argv[2], base = process.env.BASE || 'http://localhost:3471/semibart/index.html';
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(base); await p.waitForTimeout(800); await p.click('#startBtn'); await p.waitForTimeout(300);
await p.evaluate(() => { const q = window.quest; q.S.line = null; q.S.busy = false; q.run(() => q.doAction('open', q.MAP.find(h => h.name === 'Study 1'))); });
for (let i = 0; i < 80; i++) { await p.waitForTimeout(300); if (await p.evaluate(() => window.quest.S.scene === 'room' && !window.quest.S.busy)) break; }
await p.evaluate(() => { window.quest.S.line = null; });
await p.screenshot({ path: out + '/office.png' });
const box = await p.locator('#cv').boundingBox(), k = box.width / 320;
const popup = ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null);
await p.mouse.click(box.x + 213 * k, box.y + (28 + 18) * k);
const np = await popup;
if (np) { await np.waitForLoadState('domcontentloaded').catch(() => {}); console.log('new tab:', np.url()); } else console.log('no new tab');
await p.waitForTimeout(1500);
console.log('line:', await p.evaluate(() => window.quest.S.line && window.quest.S.line.text), 'errors', errs);
await b.close();
