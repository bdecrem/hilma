// Every piece of interface in CASBS Quest on one sheet, for looking at the design as a whole:
// the title card (signed out, signed in), the map with its controls, a hover, Who's where, the
// account menu, a study, the chat with Claude (asking, waiting, answered), a desk's notes and
// the pad. Every API is answered locally; nothing is read or written.
// Usage: node scripts/semibart/design-shots.mjs <out-dir> [base]     (base: http://localhost:3277)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
const [out, base = 'http://localhost:3277'] = process.argv.slice(2);
const json = body => ({ contentType: 'application/json', body: JSON.stringify(body) });
const b = await chromium.launch();
const errs = [], files = [];
const ME = { character: 'bart', name: 'Bart Decrem', study: '16', role: 'admin', passcodeIsDefault: false };
const NOTES = [{ id: 'n1', to: { character: 'bart', name: 'Bart' }, from: { character: 'daniel', name: 'Daniel' }, body: 'Your Socrates is judging me. I can feel it.', color: 'yellow', created_at: new Date(Date.now() - 3600e3).toISOString(), canRemove: true },
  { id: 'n2', to: { character: 'bart', name: 'Bart' }, from: { character: 'frances', name: 'Frances' }, body: 'Lunch at noon? The good table.', color: 'pink', created_at: new Date(Date.now() - 600e3).toISOString(), canRemove: true }];
const EVENTS = [{ id: 1, kind: 'room', actor: 'kevin', room: 'kevin', text: 'Kevin just let three rats loose in Study 27.' }, { id: 2, kind: 'note', actor: 'raul', room: 'kevin', text: "Raul left a note on Kevin's desk." }];
async function open(me, slowAgent) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', e => errs.push(e.message));
  await p.route('**/api/semibart/me', r => r.fulfill(json({ user: me })));
  await p.route('**/api/semibart/rooms', r => r.fulfill(json({ rooms: {} })));
  await p.route('**/api/semibart/desk**', r => r.fulfill(json({ notes: NOTES })));
  await p.route('**/api/semibart/events**', r => r.fulfill(json({ events: new URL(r.request().url()).searchParams.get('after') === '0' ? EVENTS : [] })));
  await p.route('**/api/semibart/personas', r => r.fulfill(json({ personas: {} })));
  await p.route('**/api/semibart/admin/users', r => r.fulfill(json({ users: [] })));
  await p.route('**/api/semibart/agent', async r => { await new Promise(res => setTimeout(res, slowAgent)); r.fulfill(json({ reply: 'Ten rats. One is already in your bookshelf.' })); });
  await p.goto(base + '/semibart'); await p.waitForFunction(() => window.quest && window.quest.me !== undefined);
  await p.waitForTimeout(900);
  return p;
}
const shot = async (p, name, wait = 700) => { await p.waitForTimeout(wait); const f = `${out}/design-${name}.png`; await p.screenshot({ path: f }); files.push(f); };
const start = p => p.evaluate(() => { const q = window.quest, S = q.S; q.start(); setInterval(() => { if (S.line && S.line.t > 0.15) S.line.t = S.line.dur; }, 30); });
const act = (p, name, verb) => p.evaluate(([n, v]) => { const q = window.quest, h = q.hot().find(x => x.name === n || x.name.startsWith(n)); if (!h) return 'no ' + n; q.run(() => q.doAction(v || h.def, h)); return h.name; }, [name, verb]);

const anon = await open(null, 0); await shot(anon, '01-title-signed-out');
const p = await open(ME, 2500); await shot(p, '02-title-signed-in');
await start(p); await p.waitForTimeout(3000); await shot(p, '03-map');
const spot = await p.evaluate(() => { const q = window.quest, h = q.MAP.find(x => /parking|lot/i.test(x.name)) || q.MAP.find(x => !x.study); const c = document.getElementById('cv').getBoundingClientRect(); return { name: h.name, x: c.left + (h.r[0] + h.r[2] / 2) / 320 * c.width, y: c.top + (h.r[1] + h.r[3] / 2 - q.S.cam) / 180 * c.height }; });
await p.mouse.move(spot.x, Math.max(40, Math.min(680, spot.y))); await shot(p, '04-map-hover', 400);
await p.click('#tk .tk-who'); await shot(p, '05-whos-where'); await p.keyboard.press('Escape');
const chip = await p.$('#tk .tk-me'); if (chip) { await chip.click(); await shot(p, '06-account-menu', 400); await p.keyboard.press('Escape'); }
await p.evaluate(() => { const S = window.quest.S; S.scene = 'room'; S.room = 'bart'; S.x = 120; S.y = 134; S.face = 1; S.path = []; S.busy = false; S.seated = false; });
await shot(p, '07-study', 1200);
await act(p, 'Claude', 'talk'); await shot(p, '08-chat-open', 1500);
const inp = await p.$('.cl-panel input'); if (inp) { await inp.fill('add ten cute rats'); await inp.press('Enter'); await shot(p, '09-chat-waiting', 900); await shot(p, '10-chat-answered', 2600); }
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
console.log('notes', await act(p, 'note from', 'read')); await shot(p, '11-desk-notes', 1500); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
console.log('pad', await act(p, 'sticky notes and a pen')); await shot(p, '12-note-pad', 1500);
await b.close();
const n = files.length, cols = 3, cell = 426;
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...files.flatMap(f => ['-i', f]), '-filter_complex', `${files.map((_, i) => `[${i}:v]scale=${cell}:-1[v${i}]`).join(';')};${files.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${n}:layout=${files.map((_, i) => `${(i % cols) * cell}_${Math.floor(i / cols) * 240}`).join('|')}`, `${out}/design-sheet.png`]);
console.log(n, 'frames; errors', JSON.stringify(errs));
