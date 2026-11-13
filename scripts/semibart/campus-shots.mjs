// Shots of the campus map, the main CASBS Quest page (public/semibart/index.html). Serve public/ first:
//   (cd public && python3 -m http.server 3471)
// Usage: node scripts/semibart/campus-shots.mjs <out-dir>
import { chromium } from 'playwright';
import fs from 'fs';
const out = process.argv[2], base = process.env.BASE || 'http://localhost:3471/semibart/index.html';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(base); await p.waitForTimeout(900);
// the whole map, 4x
const url = await p.evaluate(() => { const w = window.quest.world, c = document.createElement('canvas'); c.width = w.width * 4; c.height = w.height * 4; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(w, 0, 0, c.width, c.height); return c.toDataURL(); });
fs.writeFileSync(out + '/map.png', Buffer.from(url.split(',')[1], 'base64'));
await p.screenshot({ path: out + '/0-title.png' });
await p.click('#startBtn'); await p.waitForTimeout(1200);
await p.screenshot({ path: out + '/1-start.png' });
const cam = async (y, name) => { await p.evaluate(y => { const S = window.quest.S; S.line = null; S.cam = y; S.camFree = true; }, y); await p.waitForTimeout(200); await p.screenshot({ path: `${out}/${name}.png` }); };
await cam(0, '2-top'); await cam(150, '3-middle'); await cam(300, '4-bottom');
// the directory, then run to someone
await p.evaluate(() => { window.quest.S.line = null; window.quest.S.busy = false; }); await p.waitForTimeout(100);
await p.keyboard.press('w'); await p.waitForTimeout(300);
await p.screenshot({ path: out + '/5-who.png' });
await p.keyboard.type('inbal'); await p.waitForTimeout(150);
await p.screenshot({ path: out + '/6-who-typed.png' });
await p.keyboard.press('Enter');
for (let i = 0; i < 40; i++) { await p.waitForTimeout(250); if (await p.evaluate(() => !!window.quest.S.line)) break; }
await p.waitForTimeout(300);
await p.screenshot({ path: out + '/7-found-inbal.png' });
// Bart's study still works, and you come back out at his door
await p.evaluate(() => { const q = window.quest; q.S.line = null; q.S.busy = false; const h = q.MAP.find(h => h.n === '16'); q.run(() => q.doAction('open', h)); });
for (let i = 0; i < 60; i++) { await p.waitForTimeout(300); if (await p.evaluate(() => window.quest.S.scene === 'room')) break; }
await p.waitForTimeout(800);
await p.screenshot({ path: out + '/8-bart-room.png' });
// rooms: a fellow alone (Inbal, 31), three to a study (27), an old room (Daniel, 1), and Eli's shut door (34)
const visit = async (n, name) => {
  await p.evaluate(n => { const q = window.quest, S = q.S; S.line = null; S.busy = false; S.choices = null; S.scene = 'map'; S.path = []; const h = q.MAP.find(h => h.n === n); S.x = h.walk.x; S.y = h.walk.y; q.run(() => q.doAction('open', h)); }, n);
  for (let i = 0; i < 40; i++) { await p.waitForTimeout(250); if (await p.evaluate(() => window.quest.S.scene === 'room' && !window.quest.S.path.length)) break; }
  await p.waitForTimeout(1600);
  await p.screenshot({ path: `${out}/${name}.png` });
  return p.evaluate(() => ({ scene: window.quest.S.scene, room: window.quest.S.room, line: window.quest.S.line && window.quest.S.line.text }));
};
const rooms = { inbal: await visit('31', '9-room-31'), trio: await visit('27', '10-room-27'), daniel: await visit('1', '11-room-1') };
await p.evaluate(() => { const q = window.quest, S = q.S; S.line = null; S.busy = false; S.scene = 'map'; S.room = null; S.path = []; const h = q.MAP.find(h => h.n === '34'); S.x = h.walk.x; S.y = h.walk.y; S.cam = Math.max(0, h.walk.y - 90); q.run(() => q.doAction('open', h)); });
await p.waitForTimeout(2600);
await p.screenshot({ path: `${out}/12-eli.png` });
rooms.eli = await p.evaluate(() => ({ scene: window.quest.S.scene, line: window.quest.S.line && window.quest.S.line.text }));
console.log(JSON.stringify(rooms));
const state = await p.evaluate(() => ({ scene: window.quest.S.scene, room: window.quest.S.room, studies: window.quest.STUDIES.length, people: window.quest.DIRECTORY.length }));
console.log(JSON.stringify(state), 'errors', errs);
await b.close();
