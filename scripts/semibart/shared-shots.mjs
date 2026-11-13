// The shared studies' floor plans, shot in the real game with every API answered locally (nothing
// read or written): each shared room as a visitor sees it, then Study 27 as one of its own
// occupants, standing and seated. Prints each room's hover targets and desks.
// Usage: node scripts/semibart/shared-shots.mjs <out-dir> [base]     (base: http://localhost:3277)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
const [out, base = 'http://localhost:3277'] = process.argv.slice(2);
const json = body => ({ contentType: 'application/json', body: JSON.stringify(body) });
const b = await chromium.launch();
const errs = [];
async function open(me) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.route('**/api/semibart/me', r => r.fulfill(json({ user: me })));
  await p.route('**/api/semibart/rooms', r => r.fulfill(json({ rooms: {} })));
  await p.route('**/api/semibart/desk**', r => r.fulfill(json({ notes: [] })));
  await p.route('**/api/semibart/events**', r => r.fulfill(json({ events: [] })));
  await p.route('**/api/semibart/personas', r => r.fulfill(json({ personas: {} })));
  await p.goto(base + '/semibart'); await p.waitForFunction(() => window.quest && window.quest.me);
  await p.evaluate(() => { const q = window.quest, S = q.S; q.start(); setInterval(() => { if (S.line && S.line.t > 0.15) S.line.t = S.line.dur; }, 30); });
  await p.waitForTimeout(1500);
  return p;
}
const enter = (p, room, x = 60) => p.evaluate(([k, x]) => { const S = window.quest.S; S.scene = 'room'; S.room = k; S.x = x; S.y = 134; S.face = 1; S.path = []; S.busy = false; S.seated = false; }, [room, x]);
const files = [];
const shot = async (p, name) => { await p.waitForTimeout(900); const f = `${out}/shared-${name}.png`; await p.screenshot({ path: f }); files.push(f); };

const visitor = await open({ character: 'bart', name: 'Bart Decrem', study: '16', role: 'admin', passcodeIsDefault: false });
for (const room of ['toussaint', 'jacqueline', 'ian', 'kevin']) {
  await enter(visitor, room); await shot(visitor, room);
  console.log(room, JSON.stringify(await visitor.evaluate(k => ({ plan: window.quest.plan(k), desks: window.quest.desks(k).map(d => `${d.slug} x${d.x} w${d.w}`), hot: window.quest.hot().map(h => h.name) }), room)));
}
const mikael = await open({ character: 'mikael', name: 'Mikael', study: '27', role: 'user', passcodeIsDefault: false });
await enter(mikael, 'kevin', 100); await shot(mikael, 'kevin-as-mikael-standing');
console.log('mikael standing', JSON.stringify(await mikael.evaluate(() => window.quest.hot().slice(0, 6).map(h => h.name))));
await mikael.evaluate(() => { const q = window.quest, h = q.hot().find(x => x.name === 'my chair'); return q.run(() => q.doAction('use', h)); });
await mikael.waitForTimeout(1500); await shot(mikael, 'kevin-as-mikael-seated');
console.log('mikael seated', JSON.stringify(await mikael.evaluate(() => ({ seated: window.quest.S.seated, hot: window.quest.hot().slice(0, 6).map(h => h.name) }))));
await b.close();
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...files.flatMap(f => ['-i', f]), '-filter_complex', `${files.map((_, i) => `[${i}:v]scale=640:-1:flags=neighbor[v${i}]`).join(';')};${files.map((_, i) => `[v${i}]`).join('')}xstack=inputs=6:layout=0_0|w0_0|0_h0|w0_h0|0_h0+h1|w0_h0+h1`, `${out}/shared-sheet.png`]);
console.log('errors', JSON.stringify(errs));
