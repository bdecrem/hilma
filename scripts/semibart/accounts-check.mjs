// End-to-end check of CASBS Quest accounts and the point of view, in a browser, against a dev server:
//   pnpm exec next dev --turbopack -p 3277   (needs SUPABASE_URL, SUPABASE_SERVICE_KEY, SEMIBART_SESSION_SECRET)
// Usage: set -a; source .env.local; set +a; node scripts/semibart/accounts-check.mjs <out-dir>
// Signs in with the check-only account (SEMIBART_CHECK_NAME / SEMIBART_CHECK_PASS, made by
// make-check-account.mjs), never a real fellow, and changes no passcode. The point-of-view part
// pretends, in the page only, to be Inbal (31), then Mikael (27, shared), then a seminar speaker.
import { chromium } from 'playwright';
const out = process.argv[2], base = process.env.BASE || 'http://localhost:3277';
const NAME = process.env.SEMIBART_CHECK_NAME, PASS = process.env.SEMIBART_CHECK_PASS;
if (!NAME || !PASS) { console.error('SEMIBART_CHECK_NAME / SEMIBART_CHECK_PASS not set (source .env.local)'); process.exit(1); }
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push((e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
const shot = n => p.screenshot({ path: `${out}/${n}.png` });
const ok = [], bad = [];
const expect = (cond, what) => (cond ? ok : bad).push(what);
const settle = async (until, tries = 40) => { for (let i = 0; i < tries; i++) { await p.waitForTimeout(250); if (await p.evaluate(until)) return true; } return false; };
const quiet = () => p.evaluate(() => { const S = window.quest.S; S.line = null; S.busy = false; });

// signing in
await p.goto(base + '/semibart'); await p.waitForTimeout(1500);
expect(await p.isVisible('#sbName') && !(await p.isVisible('#startBtn')), 'sign-in form shown, Start hidden');
expect((await p.textContent('.sb-hint')).includes('bottom left'), 'hint points at your square in the dock');
await shot('c1-signin');
await p.fill('#sbName', NAME); await p.fill('#sbCode', 'nope'); await p.click('.sb-form button'); await p.waitForTimeout(900);
expect((await p.textContent('.sb-err')).length > 0, 'wrong passcode refused');
await p.fill('#sbCode', PASS); await p.click('.sb-form button'); await p.waitForTimeout(1200);
expect(await p.isVisible('#startBtn'), 'Start shown after sign-in');
await p.click('#startBtn'); await p.waitForTimeout(1200); await quiet();
expect(await p.isVisible('#tk .tk-me') && !(await p.isVisible('#tk .tk-dot')), 'your square is in the dock, no dot (own passcode set)');
expect(!(await p.isVisible('#bWho')) && !(await p.isVisible('#tools')), 'no controls in the other corners');
expect(!(await p.evaluate(() => window.quest.hot && window.quest.MAP.some(h => /padlock/i.test(h.name)))), 'no padlock anywhere');
// the passcode pane validates without changing anything
await p.click('#tk .tk-me'); await p.waitForTimeout(200); await shot('c2-menu');
expect((await p.textContent('#sbMenu')).includes('Sound: on') && (await p.textContent('#sbMenu')).includes('Full screen'), 'sound and full screen live in your menu');
await p.click('#sbMenu button:has-text("passcode")'); await p.waitForTimeout(300);
await p.fill('#sbCur', 'nope'); await p.fill('#sbNew', '1234'); await p.fill('#sbNew2', '9999'); await p.click('.sb-pane .sb-btn'); await p.waitForTimeout(300);
expect((await p.textContent('.sb-pane .sb-err')).includes("don't match"), 'mismatched new codes caught');
await p.fill('#sbNew2', '1234'); await p.click('.sb-pane .sb-btn'); await p.waitForTimeout(900);
expect((await p.textContent('.sb-pane .sb-err')).includes('current'), 'wrong current passcode refused by the server');
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
expect(!(await p.$('.sb-veil')), 'Escape closes the pane');
const admin = await p.evaluate(async () => { const r = await fetch('/api/semibart/admin/users'); const j = await r.json(); return { status: r.status, n: (j.users || []).length }; });
expect(admin.status === 200 && admin.n >= 50, 'admin roster (49 fellows + check)');

// point of view, as Inbal (in the page only)
const pretend = (character, study, name) => p.evaluate(([character, study, name]) => { window.quest.me = { character, study, name, role: 'user', passcodeIsDefault: false }; }, [character, study, name]);
const open = n => p.evaluate(n => { const q = window.quest, S = q.S; S.line = null; S.busy = false; S.scene = 'map'; S.path = []; const h = q.MAP.find(h => h.n === n); S.x = h.walk.x; S.y = h.walk.y; q.run(() => q.doAction('open', h)); }, n);
await pretend('inbal', '31', 'Inbal Ben Ami Bartal');
await p.evaluate(() => { const q = window.quest, S = q.S, h = q.MAP.find(h => h.n === '31'); S.x = h.walk.x; S.y = h.walk.y; S.cam = Math.max(0, S.y - 90); });
await p.waitForTimeout(400); await shot('c3-inbal-walker');
await open('31');
await settle(() => window.quest.S.scene === 'room' && !window.quest.S.busy);
const own = await p.evaluate(() => ({ room: window.quest.S.room, seated: !!window.quest.S.seated, names: window.quest.hot().map(h => h.name) }));
expect(own.room === 'inbal' && !own.seated, 'her own study opens without a knock');
expect(own.names.includes('my chair') && !own.names.some(n => /^Inbal/.test(n)), 'chair empty until she sits');
await quiet(); await shot('c4-inbal-empty');
await p.evaluate(() => { const q = window.quest; q.run(() => q.doAction('use', q.hot().find(h => h.name === 'my chair'))); });
await settle(() => window.quest.S.seated === true);
expect(await p.evaluate(() => window.quest.S.seated && window.quest.hot().some(h => h.name === 'me')), 'sitting puts her at the desk');
await quiet(); await shot('c5-inbal-seated');
await p.evaluate(() => { const q = window.quest; q.run(() => q.doAction('use', q.hot().find(h => h.name === 'me'))); });
await settle(() => window.quest.S.seated === false);
expect(await p.evaluate(() => !window.quest.S.seated), 'clicking herself stands her up');
// as Mikael, three to a study: only his seat is empty
await p.evaluate(() => { const q = window.quest; q.S.scene = 'map'; q.S.room = null; });
await pretend('mikael', '27', 'Mikael Jakobsson');
await open('27');
await settle(() => window.quest.S.scene === 'room' && !window.quest.S.busy);
const trio = await p.evaluate(() => ({ room: window.quest.S.room, names: window.quest.hot().map(h => h.name) }));
expect(trio.room === 'kevin' && trio.names.includes('my chair') && trio.names.includes('Kevin') && trio.names.includes('Raul') && !trio.names.includes('Mikael'), 'shared study: his seat empty, Kevin and Raul in');
await quiet(); await shot('c6-mikael');
// what room code hides can't be hovered: Daniel's room with his occupant and desk hidden
await p.evaluate(() => { const q = window.quest; q.S.scene = 'map'; q.S.room = null; q.me = { character: 'check', study: '0', name: 'Check', role: 'admin', passcodeIsDefault: false }; q.hooks.roomHide.push(r => r === 'daniel' ? ['occupant', 'desk'] : []); });
await open('1');
await settle(() => window.quest.S.scene === 'room' && !window.quest.S.busy);
const dan = await p.evaluate(() => window.quest.hot().map(h => h.name));
expect(!dan.includes('Socrates') && !dan.includes('Daniel') && !dan.includes('monitor') && dan.includes('window'), 'hidden occupant and desk drop their hotspots');
await p.evaluate(() => { const q = window.quest; q.hooks.roomHide.pop(); q.S.line = null; });
// in the seminar you are never at the table twice
const cast = await p.evaluate(() => { const q = window.quest; q.S.scene = 'room'; q.S.room = 'seminar'; return true; });
const sem = await p.evaluate(() => {
  const q = window.quest, names = q.hot().map(h => h.name);
  const someone = Object.keys(q.FELLOWS).find(k => names.includes(q.FELLOWS[k].name));
  if (!someone) return { someone: null };
  q.me = { character: someone, study: '0', name: q.FELLOWS[someone].name, role: 'user', passcodeIsDefault: false };
  return { someone, gone: !q.hot().some(h => h.name === q.FELLOWS[someone].name) };
});
expect(!!cast && sem.someone && sem.gone, `seminar drops you from the table (${sem.someone})`);
await p.waitForTimeout(300); await shot('c7-seminar');
console.log(JSON.stringify({ ok: ok.length, bad, errs }, null, 1));
await b.close();
