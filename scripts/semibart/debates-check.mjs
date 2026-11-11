// Sits through all eight seminar debates (the cast rotates on each visit) and screenshots each.
// node scripts/semibart/debates-check.mjs <outdir> [url]
import { chromium } from 'playwright';
const out = process.argv[2], url = process.argv[3] || 'http://localhost:3471/semibart/index.html';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(url); await p.waitForTimeout(800); await p.keyboard.press('Enter');
let n = 0; await p.exposeFunction('logLine', () => n++);
await p.evaluate(() => { const S = window.quest.S; let last = null; setInterval(() => { if (S.line && S.line !== last) { last = S.line; window.logLine(); } if (S.line && S.line.t > 0.15) S.line.t = S.line.dur; }, 25); });
const idle = () => p.waitForFunction(() => !window.quest.S.busy && !window.quest.S.line, null, { timeout: 90000 });
const act = (name, verb) => p.evaluate(([nm, v]) => new Promise(res => { const q = window.quest, hh = q.hot().find(x => x.name === nm); q.run(() => q.doAction(v || hh.def, hh)); const iv = setInterval(() => { if (!q.S.busy) { clearInterval(iv); res(); } }, 50); }), [name, verb]);
await idle();
for (let i = 0; i < 8; i++) {
  await act('meeting room'); await idle();
  await p.screenshot({ path: `${out}/debate-${i + 1}.png` });
  const names = await p.evaluate(() => window.quest.hot().slice(0, 6).map(h => h.name));
  await act(names[0], 'look'); await idle(); await act(names[5], 'talk'); await idle();
  await act('door', 'open'); await idle();
  console.log(i + 1, names.join(', '));
}
console.log('lines', n, 'errors', errs); await b.close();
