// Plays the map: shots of each corner of campus, a walk up the hill, Bart's room and back.
// Serve public/ first: (cd public && python3 -m http.server 3471). Usage: node scripts/semibart/walk.mjs <out-dir>
import { chromium } from 'playwright';
const out = process.argv[2], base = process.env.BASE || 'http://localhost:3471/semibart/index.html';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(base); await p.waitForTimeout(800);
await p.click('#startBtn'); await p.waitForTimeout(400);
await p.screenshot({ path: out + '/m0-start.png' });
const cam = async (x, y, name) => { await p.evaluate(([x, y]) => { const S = window.quest.S; S.cam.x = x; S.cam.y = y; S.cam.free = true; }, [x, y]); await p.waitForTimeout(150); await p.screenshot({ path: out + '/' + name + '.png' }); };
await cam(0, 0, 'm1-hill-west'); await cam(320, 0, 'm2-hill-east'); await cam(0, 150, 'm3-west'); await cam(0, 180, 'm4-south-west'); await cam(320, 180, 'm5-south-east');
// walk to study 40 and knock
const q = await p.evaluate(async () => { const { S, MAP, run, doAction } = window.quest; S.line = null; S.busy = false; const h = MAP.find(m => m.name === 'Study 40'); run(() => doAction('open', h)); return true; });
for (let i = 0; i < 40; i++) { await p.waitForTimeout(500); const st = await p.evaluate(() => { const S = window.quest.S; return { x: S.x, y: S.y, line: S.line && S.line.text }; }); if (st.line && st.line.startsWith('Locked')) { console.log('at 40:', st); break; } }
await p.screenshot({ path: out + '/m6-study40.png' });
// Bart's study
await p.evaluate(() => { const { S, MAP, run, doAction } = window.quest; S.line = null; S.busy = false; run(() => doAction('open', MAP.find(m => m.name === 'Study 16'))); });
for (let i = 0; i < 60; i++) { await p.waitForTimeout(500); if (await p.evaluate(() => window.quest.S.scene === 'room')) break; }
await p.waitForTimeout(1500);
await p.screenshot({ path: out + '/m7-room.png' });
console.log('scene', await p.evaluate(() => window.quest.S.scene), 'errors', errs);
await b.close();
