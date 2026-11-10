// Walks to a few studies (top block, east wing, Bart's) and screenshots each stop.
// Serve public/ first: (cd public && python3 -m http.server 3471). Usage: node scripts/semibart/walk.mjs <out-dir>
import { chromium } from 'playwright';
const out = process.argv[2], base = process.env.BASE || 'http://localhost:3471/semibart/index.html';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(base); await p.waitForTimeout(800);
await p.click('#startBtn'); await p.waitForTimeout(400);
await p.screenshot({ path: out + '/o0-start.png' });
for (const name of ['Study 7', 'Study 10', 'Study 4', 'Study 6', 'Study 9']) {
  await p.evaluate(n => { const { S, MAP, run, doAction } = window.quest; if (S.line) S.line = null; S.busy = false; run(() => doAction('open', MAP.find(m => m.name === n))); }, name);
  let st;
  for (let i = 0; i < 40; i++) { await p.waitForTimeout(400); st = await p.evaluate(() => { const S = window.quest.S; return { x: Math.round(S.x), y: Math.round(S.y), line: S.line && S.line.text }; }); if (st.line && st.line.startsWith('Locked')) break; }
  console.log(name, st);
  await p.screenshot({ path: out + '/o-' + name.replace(' ', '') + '.png' });
}
await p.evaluate(() => { const { S, MAP, run, doAction } = window.quest; S.line = null; S.busy = false; run(() => doAction('open', MAP.find(m => m.name === 'Study 1'))); });
for (let i = 0; i < 60; i++) { await p.waitForTimeout(400); if (await p.evaluate(() => window.quest.S.scene === 'room')) break; }
console.log('scene', await p.evaluate(() => window.quest.S.scene), 'errors', errs);
await b.close();
