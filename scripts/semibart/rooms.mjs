// Goes into each lit study (1 = Bart, 2-5 empty) and back out, screenshotting each.
// Serve public/ first: (cd public && python3 -m http.server 3471). Usage: node scripts/semibart/rooms.mjs <out-dir>
import { chromium } from 'playwright';
const out = process.argv[2], base = process.env.BASE || 'http://localhost:3471/semibart/index.html';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(base); await p.waitForTimeout(800);
await p.click('#startBtn'); await p.waitForTimeout(300);
await p.screenshot({ path: out + '/r-map.png' });
for (const n of [2, 3, 4, 5, 1]) {
  await p.evaluate(name => { const q = window.quest; q.S.line = null; q.S.busy = false; q.run(() => q.doAction('open', q.MAP.find(h => h.name === name))); }, 'Study ' + n);
  let st;
  for (let i = 0; i < 60; i++) { await p.waitForTimeout(300); st = await p.evaluate(() => ({ scene: window.quest.S.scene, busy: window.quest.S.busy })); if (st.scene === 'room' && !st.busy) break; }
  await p.screenshot({ path: out + `/r-room${n}.png` });
  // leave by the door
  await p.keyboard.press('ArrowLeft');
  for (let i = 0; i < 40; i++) { await p.waitForTimeout(300); st = await p.evaluate(() => ({ scene: window.quest.S.scene, x: Math.round(window.quest.S.x), y: Math.round(window.quest.S.y), busy: window.quest.S.busy })); if (st.scene === 'map' && !st.busy) break; }
  console.log('study', n, 'back at', st);
}
console.log('errors', errs);
await b.close();
