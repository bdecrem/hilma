// Shoots the sticky notes, the pad and pen and Bart's pinboard in one room of each kind, with the
// APIs answered from here (nothing is read from or written to the database). Each room gets a
// full frame and a 4x close-up of every pad, taken on the twinkle and off it, and the names of
// the hotspots over a note and over the pad are printed.
// Usage: node scripts/semibart/notes-shots.mjs <out-dir> [base] [bart-room-code.js]
//        base defaults to http://localhost:3277 (next dev); a static server over public/ works too.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [out, base = 'http://localhost:3277', bartCode] = process.argv.slice(2);
const json = body => ({ contentType: 'application/json', body: JSON.stringify(body) });
const ROOMS = ['bart', 'daniel', 'kevin', process.env.READ_ROOM || 'frances', process.env.STAND_ROOM || 'joseph'];
const note = (i, to, from, color) => ({ id: `n${i}-${to}`, body: `Note ${i}. Lunch on the terrace?`, color, created_at: new Date(Date.now() - i * 3600e3).toISOString(), to: { character: to, name: to }, from: { character: from, name: from[0].toUpperCase() + from.slice(1) }, canRemove: false });

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.route('**/api/semibart/**', r => r.fulfill(json({})));
await p.route('**/api/semibart/me', r => r.fulfill(json({ user: { character: 'check', name: 'Check', study: '0', role: 'user', passcodeIsDefault: false } })));
await p.route('**/api/semibart/rooms', r => r.fulfill(json({ rooms: bartCode ? { bart: 1 } : {} })));
await p.route('**/api/semibart/rooms/*', r => r.fulfill(json({ room: 'bart', version: 1, code: bartCode ? readFileSync(bartCode, 'utf8') : '' })));
await p.route('**/api/semibart/desk**', async r => {
  const room = new URL(r.request().url()).searchParams.get('room');
  const people = await p.evaluate(k => window.quest.occupants(k), room);
  const colors = ['yellow', 'pink', 'blue', 'green'], n = room === 'bart' ? 11 : 5;
  r.fulfill(json({ notes: Array.from({ length: n }, (_, i) => note(n - i, people[i % people.length], ['daniel', 'mary', 'inbal'][i % 3], colors[i % 4])) }));
});
await p.goto(base + '/semibart'); await p.waitForTimeout(1500);
await p.evaluate(() => window.quest.start());
await p.evaluate(() => { const S = window.quest.S; setInterval(() => { if (S.line && S.line.t > 0.15) S.line.t = S.line.dur; }, 30); });
await p.waitForTimeout(1500);
for (const room of ROOMS) {
  await p.evaluate(k => { const S = window.quest.S; S.scene = 'room'; S.room = k; S.x = 60; S.y = 136; S.face = 1; S.path = []; }, room);
  await p.waitForTimeout(1800);
  await p.screenshot({ path: `${out}/notes-${room}.png` });
  const spots = await p.evaluate(() => window.quest.hot().filter(h => /note|pen|pinboard/.test(h.name)).map(h => h.name + ' @' + h.r.join(',')));
  console.log(room, JSON.stringify(spots));
}
await b.close();
if (errs.length) { console.log('page errors:', errs); process.exit(1); }
