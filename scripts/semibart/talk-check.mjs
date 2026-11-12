// Bart's talk on his monitor (Study 16): click the monitor, watch it turn and zoom, page the
// three slides and the end card, leave, and check the room is back as it was.
//   node scripts/semibart/talk-check.mjs <dir> [url] [width] [height]
import { chromium } from 'playwright';
const out = process.argv[2], url = process.argv[3] || 'http://localhost:3266/semibart';
const vw = +(process.argv[4] || 1280), vh = +(process.argv[5] || 720);
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: vw, height: vh } }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(url); await p.waitForTimeout(800); await p.keyboard.press('Enter');
await p.evaluate(() => { const S = window.quest.S; setInterval(() => { if (S.line && S.line.t > 0.2) S.line.t = S.line.dur; }, 30); });
const idle = () => p.waitForFunction(() => !window.quest.S.busy && !window.quest.S.line, null, { timeout: 60000 });
const act = (name, verb) => p.evaluate(([n, v]) => { const q = window.quest, hh = q.hot().find(x => x.name === n); q.run(() => q.doAction(v || hh.def, hh)); }, [name, verb]);
const shot = n => p.screenshot({ path: `${out}/talk-${vw}-${n}.png` });
await idle();
await act('Study 16'); await idle();
const box = await p.evaluate(() => { const h = window.quest.hot().find(x => x.name === 'monitor'), c = document.getElementById('cv').getBoundingClientRect(); return { x: c.left + (h.r[0] + h.r[2] / 2) / 320 * c.width, y: c.top + (h.r[1] + h.r[3] / 2 + 18) / 180 * c.height }; });
await p.mouse.move(box.x, box.y);
console.log('hover', await p.evaluate(() => window.quest.S.hover && window.quest.S.hover.name));
await p.mouse.click(box.x, box.y);
await p.waitForFunction(() => window.quest.S.mon.f > 0.6, null, { timeout: 20000 }); await shot('1-turned');
await p.waitForTimeout(600); await shot('2-zooming');
await p.waitForSelector('#deck.on'); await p.waitForTimeout(100); await shot('3-resolving');
await p.waitForTimeout(500); await shot('4-slide1');
const text = () => p.evaluate(() => [document.getElementById('sTitle').textContent, document.getElementById('sNum').textContent, !document.getElementById('dEnd').hidden]);
console.log('slide', await text());
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(400); console.log('slide', await text()); await shot('5-slide2');
await p.click('#slide', { position: { x: 400, y: 200 } }); await p.waitForTimeout(400); console.log('slide', await text()); await shot('6-slide3');
await p.click('#dPrev'); await p.waitForTimeout(400); console.log('back to', await text());
await p.keyboard.press(' '); await p.waitForTimeout(400);
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300); console.log('end', await text()); await shot('7-end');
await p.mouse.click(vw / 2, vh / 2);
await p.waitForTimeout(700); await shot('8-zoomout');
await idle(); await shot('9-room');
console.log('after', await p.evaluate(() => ({ deck: document.getElementById('deck').hidden, tf: document.getElementById('cv').style.transform, mon: window.quest.S.mon.f, room: window.quest.S.room })));
// second time, through Bart's dialog, leave with Esc
await p.evaluate(() => { const q = window.quest; q.run(() => q.doAction('use', q.hot().find(x => x.name === 'monitor'))); });
await p.waitForSelector('#deck.on'); await p.waitForTimeout(500); await p.keyboard.press('Escape'); await idle();
console.log('esc', await p.evaluate(() => ({ deck: document.getElementById('deck').hidden, tf: document.getElementById('cv').style.transform })));
console.log('errors', errs); await b.close();
