// Shows a piece of room code in the real game without saving it anywhere: the page is the real
// one, the rooms API is answered from the file you pass, and you are signed in as the room's
// host. Six frames 1.2 s apart go to <out>/<name>-N.png and a sheet of them to <out>/<name>.png.
// Usage: [AS=<character>] node scripts/semibart/room-shots.mjs <out-dir> <room> <code.js> [name] [base]
//        AT_X: where the visitor stands (default 100)
//        AS: who you are signed in as (default the host, who then walks the room instead of sitting at the desk)
//        (base defaults to http://localhost:3277, a `next dev` of this repo)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const [out, room, file, name = room, base = 'http://localhost:3277'] = process.argv.slice(2);
const code = readFileSync(file, 'utf8');
const json = body => ({ contentType: 'application/json', body: JSON.stringify(body) });

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'warning' && m.text().includes('[rooms]')) errs.push(m.text()); });
await p.route('**/api/semibart/me', r => r.fulfill(json({ user: { character: process.env.AS || room, name: process.env.AS || room, study: '0', role: 'user', passcodeIsDefault: false } })));
await p.route('**/api/semibart/notes**', r => r.fulfill(json({ notes: [] })));
await p.route('**/api/semibart/rooms', r => r.fulfill(json({ rooms: { [room]: 1 } })));
await p.route('**/api/semibart/rooms/*', r => r.fulfill(json({ room, version: 1, code })));
await p.goto(base + '/semibart'); await p.waitForTimeout(1500);
await p.evaluate(() => window.quest.start());
await p.evaluate(() => { const S = window.quest.S; setInterval(() => { if (S.line && S.line.t > 0.15) S.line.t = S.line.dur; }, 30); });
await p.waitForTimeout(1500);
await p.evaluate(([k, x]) => { const S = window.quest.S; S.scene = 'room'; S.room = k; S.x = x; S.y = 134; S.face = 1; S.path = []; }, [room, Number(process.env.AT_X || 100)]);
await p.waitForTimeout(1200);
const state = await p.evaluate(k => { const r = window.questRooms && window.questRooms.rooms[k]; return r ? { version: r.version, loaded: !!r.mod, dead: !!(r.mod && r.mod.dead) } : null; }, room);
const files = [];
for (let i = 1; i <= 6; i++) { const f = `${out}/${name}-${i}.png`; await p.screenshot({ path: f }); files.push(f); await p.waitForTimeout(1200); }
const after = await p.evaluate(k => { const r = window.questRooms && window.questRooms.rooms[k]; return r && r.mod ? { dead: r.mod.dead, errors: r.mod.errors, msPerFrame: r.mod.frames ? +(r.mod.ms / r.mod.frames).toFixed(2) : 0 } : null; }, room);
const spots = await p.evaluate(() => window.quest.hot().slice(0, 4).map(h => h.name));
await b.close();
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...files.flatMap(f => ['-i', f]), '-filter_complex', `${files.map((_, i) => `[${i}:v]scale=640:-1:flags=neighbor[v${i}]`).join(';')};${files.map((_, i) => `[v${i}]`).join('')}xstack=inputs=6:layout=0_0|w0_0|0_h0|w0_h0|0_h0+h1|w0_h0+h1`, `${out}/${name}.png`]);
console.log(JSON.stringify({ state, after, firstSpots: spots, errors: errs }));
