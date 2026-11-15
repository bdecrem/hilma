// Lana's door from the walk: the map door, the close-up, a sticker's line, the knock going in.
// Serve public/ first: (cd public && python3 -m http.server 3471)
// Usage: node scripts/semibart/lana-door-shots.mjs <out-dir> [base]
import { chromium } from 'playwright';
const out = process.argv[2], base = process.argv[3] || 'http://localhost:3471';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 675 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(base + '/semibart/index.html'); await p.waitForTimeout(1200);
await p.evaluate(() => { window.quest.start(); const t = document.getElementById('title'); if (t) t.hidden = true; }); await p.waitForTimeout(2500);
const act = (verb, name) => p.evaluate(([verb, name]) => {
  const q = window.quest, h = (q.S.scene === 'map' ? q.MAP : q.hot()).find(h => h.name === name || h.name.startsWith(name));
  if (!h) throw new Error('no hotspot ' + name);
  q.run(() => q.doAction(verb, h));
}, [verb, name]);
await act('open', 'Study 49'); await p.waitForTimeout(14000);
await p.screenshot({ path: out + '/door.png' });
const st = await p.evaluate(() => ({ scene: window.quest.S.scene, room: window.quest.S.room }));
await p.keyboard.press('Space').catch(() => {});
await act('look', 'car'); await p.waitForTimeout(2600);
await p.screenshot({ path: out + '/sticker.png' });
await p.waitForTimeout(3500);
// a click on a sticker on the door (BE YOUR OWN BOSS) is a click on the door
const onSticker = await p.evaluate(() => { const h = window.quest.hit(145, 70); window.quest.run(() => window.quest.doAction(h.def, h)); return h.name; });
await p.waitForTimeout(7000);
const st2 = await p.evaluate(() => ({ scene: window.quest.S.scene, room: window.quest.S.room }));
await p.screenshot({ path: out + '/inside.png' });
await p.keyboard.press('Escape'); await p.waitForTimeout(4000);
const st3 = await p.evaluate(() => ({ scene: window.quest.S.scene, room: window.quest.S.room }));
console.log(JSON.stringify({ st, onSticker, st2, st3, errs }));
await b.close();
