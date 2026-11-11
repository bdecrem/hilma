// Enters the seminar, talks to everyone, looks at the basket, leaves (the phone goes off), screenshots.
// node scripts/semibart/seminar-check.mjs <outdir> [url]
import { chromium } from 'playwright';
const out = process.argv[2], url = process.argv[3] || 'http://localhost:3471/semibart/index.html';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(url); await p.waitForTimeout(800); await p.keyboard.press('Enter');
const lines = []; let fast = true;
await p.exposeFunction('logLine', (w, t) => lines.push(w + ': ' + t));
await p.evaluate(() => { const S = window.quest.S; let last = null; window.fast = true; setInterval(() => { if (S.line && S.line !== last) { last = S.line; window.logLine(S.line.who, S.line.text); } if (window.fast && S.line && S.line.t > 0.25) S.line.t = S.line.dur; }, 30); });
const act = (name, verb) => p.evaluate(([n, v]) => new Promise(res => { const q = window.quest, hh = q.hot().find(x => x.name === n); q.run(() => q.doAction(v || hh.def, hh)); const iv = setInterval(() => { if (!q.S.busy) { clearInterval(iv); res(); } }, 50); }), [name, verb]);
const idle = () => p.waitForFunction(() => !window.quest.S.busy && !window.quest.S.line, null, { timeout: 60000 });
await idle();
await act('meeting room'); await idle();
await p.screenshot({ path: `${out}/seminar.png` });
for (const n of ['Daniel', 'Kah-Wee', 'Frances', 'Forrest', 'Jacqueline', 'Ian', 'a fellow', 'Joseph']) { await act(n, 'look'); await idle(); await act(n, 'talk'); await idle(); }
await act('basket of phones'); await idle(); await act('sign'); await idle();
await p.evaluate(() => { window.fast = false; });
const leaving = act('door', 'open');
await p.waitForFunction(() => window.quest.S.sem.ringT > 0.5, null, { timeout: 30000 });
await p.screenshot({ path: `${out}/seminar-ring.png` });
await p.evaluate(() => { window.fast = true; });
await leaving; await idle();
console.log(lines.join('\n')); console.log('scene', await p.evaluate(() => window.quest.S.scene), 'errors', errs);
await b.close();
