// Clicks each neighbour's link object and checks a new tab opens to the right place.
import { chromium } from 'playwright';
const out = process.argv[2], url = process.argv[3] || 'http://localhost:3471/semibart/index.html';
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(url); await p.waitForTimeout(800); await p.keyboard.press('Enter');
await p.evaluate(() => { const S = window.quest.S; setInterval(() => { if (S.line && S.line.t > 0.2) S.line.t = S.line.dur; }, 30); });
const idle = () => p.waitForFunction(() => !window.quest.S.busy && !window.quest.S.line, null, { timeout: 60000 });
const act = (name, verb) => p.evaluate(([n, v]) => new Promise(res => { const q = window.quest, hh = q.hot().find(x => x.name === n); q.run(() => q.doAction(v || hh.def, hh)); const iv = setInterval(() => { if (!q.S.busy) { clearInterval(iv); res(); } }, 50); }), [name, verb]);
await idle();
for (const [study, obj, who] of [['Study 1', 'Socrates', 'Daniel'], ['Study 10', 'the Almanac', 'Frances'], ['Study 29', 'world map', 'Ian'], ['Study 28', 'easel', 'Jacqueline']]) {
  await act(study); await idle();
  const box = await p.evaluate(n => { const h = window.quest.hot().find(x => x.name === n), c = document.getElementById('cv').getBoundingClientRect(); return { x: c.left + (h.r[0] + h.r[2] / 2) / 320 * c.width, y: c.top + (h.r[1] + h.r[3] / 2 + 18) / 180 * c.height }; }, obj);
  const hov = await (async () => { await p.mouse.move(box.x, box.y); return p.evaluate(() => window.quest.S.hover && window.quest.S.hover.name); })();
  const [tab] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }), p.mouse.click(box.x, box.y)]);
  console.log(who, 'hover=' + hov, '->', tab.url()); await tab.close();
  await idle(); await p.screenshot({ path: `${out}/link-${who}.png` });
  await act('door', 'open'); await idle();
}
console.log('errors', errs); await b.close();
