// Room screenshots for the social features (notes, Claude, the ticker): jumps straight into
// each room without the knock and saves the canvas at 4x.
//   node scripts/semibart/social-shots.mjs <dir> [url] [rooms, comma separated]
import { chromium } from 'playwright';
const out = process.argv[2], url = process.argv[3] || 'http://localhost:3277/semibart';
const rooms = (process.argv[4] || 'bart,daniel,frances,joseph,kevin').split(',');
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(url); await p.waitForTimeout(800); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
for (const r of rooms) {
  await p.evaluate(k => { const S = window.quest.S; S.scene = 'room'; S.room = k; S.x = 120; S.y = 134; S.path = []; S.line = null; S.busy = false; }, r);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/room-${r}.png` });
}
console.log('errors', errs); await b.close();
