// Walks across the map (dust, click mark), forces a flock and a glint, then visits Bart's study for the sunlight.
import { chromium } from 'playwright';
const out = process.argv[2], base = process.env.BASE || 'http://localhost:3471/semibart/index.html';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(base); await p.waitForTimeout(800); await p.click('#startBtn'); await p.waitForTimeout(300);
await p.evaluate(() => { const S = window.quest.S; S.busy = false; S.line = null; });
const box = await p.locator('#cv').boundingBox(), k = box.width / 320;
await p.mouse.click(box.x + 200 * k, box.y + (132 + 18) * k);
await p.waitForTimeout(250);
await p.screenshot({ path: out + '/d1.png' });
await p.waitForTimeout(14000);
await p.screenshot({ path: out + '/d2.png' });
await p.evaluate(() => { const q = window.quest; q.S.line = null; q.S.busy = false; q.run(() => q.doAction('open', q.MAP.find(h => h.name === 'Study 1'))); });
for (let i = 0; i < 80; i++) { await p.waitForTimeout(300); if (await p.evaluate(() => window.quest.S.scene === 'room' && !window.quest.S.busy)) break; }
await p.screenshot({ path: out + '/d3.png' });
console.log('errors', errs); await b.close();
