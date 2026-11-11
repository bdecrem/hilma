// Visits every neighbour's study, talks twice, knocks on Forrest's door; screenshots each room.
// node scripts/semibart/people-check.mjs <outdir> [url]
import { chromium } from 'playwright';
const out = process.argv[2], url = process.argv[3] || 'http://localhost:3471/semibart/index.html';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(url); await p.waitForTimeout(800); await p.keyboard.press('Enter');
const lines = [];
await p.exposeFunction('logLine', (w, t) => lines.push(w + ': ' + t));
await p.evaluate(() => { const S = window.quest.S; let last = null; setInterval(() => { if (S.line && S.line !== last) { last = S.line; window.logLine(S.line.who, S.line.text); } if (S.line && S.line.t > 0.25) { S.line.t = S.line.dur; } }, 30); });
const act = (name, verb) => p.evaluate(([n, v]) => new Promise(res => { const q = window.quest, h = (q.S.scene === 'map' ? q.MAP : null) || null;
  const spots = q.S.scene === 'map' ? q.MAP : (window.quest.hot ? window.quest.hot() : []);
  const hh = spots.find(x => x.name === n); q.run(() => q.doAction(v || hh.def, hh)).then(res); const iv = setInterval(() => { if (!q.S.busy) { clearInterval(iv); res(); } }, 50); }), [name, verb]);
const idle = () => p.waitForFunction(() => !window.quest.S.busy && !window.quest.S.line, null, { timeout: 60000 });
await idle();
for (const [study, who] of [['Study 1', 'Daniel'], ['Study 2', 'Kah-Wee'], ['Study 10', 'Frances'], ['Study 29', 'Ian'], ['Study 28', 'Jacqueline'], ['Study 43', 'Joseph']]) {
  await act(study); await idle();
  await p.screenshot({ path: `${out}/room-${who}.png` });
  await act(who, 'talk'); await idle(); await act(who, 'talk'); await idle();
  await act('door', 'open'); await idle();
}
for (let i = 0; i < 2; i++) { await act('Study 44', 'open'); await idle(); }
await act('Study 16'); await idle(); await p.screenshot({ path: `${out}/room-Bart.png` });
console.log(lines.join('\n')); console.log('errors', errs);
await b.close();
