// Books in the game, end to end. Part one runs against the real server and database as the
// check-only admin: the unfinished book is the first spine on the top shelf, and an admin can take
// it down and read it whole. Part two answers the APIs locally to play fellows: an unfinished book
// has no name and does nothing for its owner or a visitor; a finished one has left the shelf and
// stands on its owner's desk, where anyone can read it.
// Usage: set -a; source ./.env.local; set +a
//        node scripts/semibart/books-check.mjs <out-dir> [base] [room]   (base: http://localhost:3277, room: kevin)
import { chromium } from 'playwright';
const [out, base = 'http://localhost:3277', ROOM = 'kevin'] = process.argv.slice(2);
const NAME = process.env.SEMIBART_CHECK_NAME, PASS = process.env.SEMIBART_CHECK_PASS;
if (!NAME || !PASS) { console.error('SEMIBART_CHECK_NAME / SEMIBART_CHECK_PASS not set'); process.exit(1); }
let failed = 0;
const expect = (name, got, detail = '') => { if (!got) failed++; console.log(`${got ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`); };
const json = body => ({ contentType: 'application/json', body: JSON.stringify(body) });
const b = await chromium.launch();
const errs = [];
const ready = async p => {
  await p.waitForFunction(() => window.quest && window.quest.me !== undefined && window.questLeaves, null, { timeout: 30000 });
  await p.evaluate(() => { const q = window.quest, S = q.S; q.start(); setInterval(() => { if (S.line && S.line.t > 0.15) S.line.t = S.line.dur; }, 30); });
  await p.waitForTimeout(1200);
};
const enter = (p, k) => p.evaluate(k => { const S = window.quest.S; S.scene = 'room'; S.room = k; S.x = 70; S.y = 134; S.path = []; S.busy = false; S.seated = false; }, k);
const hot = p => p.evaluate(() => window.quest.hot().map(h => h.name));
const act = (p, name) => p.evaluate(n => { const q = window.quest, h = q.hot().find(x => x.name === n); if (!h) return false; q.run(() => q.doAction(h.def, h)); return true; }, name);
const reader = p => p.evaluate(() => { const v = document.querySelector('.bk-veil'); return v ? { at: window.questLeaves.reading(), text: v.innerText.replace(/\s+/g, ' ').slice(0, 140) } : null; });

// ---------- part one: the real server, as an admin
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(base + '/semibart/talk.md');
const login = await p.evaluate(async ([name, passcode]) => (await fetch('/api/semibart/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, passcode }) })).status, [NAME, PASS]);
expect('the check account (an admin) signs in', login === 200, String(login));
const api = await p.evaluate(async k => { const r = await fetch('/api/semibart/books/' + k); return { status: r.status, body: await r.json() }; }, ROOM);
expect(`the server gives an admin ${ROOM}'s whole book`, api.status === 200 && api.body.pages.length === 10 && api.body.pages.every(Boolean), `${api.status} "${api.body.title}" (${api.body.form})`);
const anon = await (await b.newContext()).newPage(); await anon.goto(base + '/semibart/talk.md');
expect('nobody signed in gets no book', await anon.evaluate(async k => (await fetch('/api/semibart/books/' + k)).status, ROOM) === 401);
await p.goto(base + '/semibart'); await ready(p);
await p.evaluate(() => window.questTicker && window.questTicker.setOpen(false));
await enter(p, ROOM); await p.waitForTimeout(900);
const names = await hot(p), spot = names.find(n => /book/.test(n) && !/my /.test(n));
expect(`an admin finds a book on a desk in ${ROOM}'s study`, !!spot, names.slice(0, 8).join(', '));
await act(p, spot); await p.waitForSelector('.bk-veil', { timeout: 15000 }); await p.waitForTimeout(400);
const cover = await reader(p);
expect('it opens at the cover, with the title from the database', !!cover && cover.at.i === 0 && cover.text.includes(api.body.title.slice(0, 20)), JSON.stringify(cover));
await p.screenshot({ path: out + '/books-1-cover.png' });
for (let i = 0; i < 3; i++) await p.keyboard.press('ArrowRight');
await p.waitForTimeout(300); await p.screenshot({ path: out + '/books-2-page-3.png' });
const pg = await reader(p);
expect('the arrow keys turn the pages', !!pg && pg.at.i === 3, JSON.stringify(pg));
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
expect('Esc puts it down', !(await reader(p)));

// ---------- part two: fellows, with the APIs answered locally
const ALISON = { character: 'alison', name: 'Alison', study: '36', role: 'user', passcodeIsDefault: false };
const BOOK = { ...api.body, character: 'alison', admin: false, mine: true, found: 10, unlocked: true };
async function play(me, found) {
  const q = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); q.on('pageerror', e => errs.push(e.message));
  await q.route('**/api/semibart/me', r => r.fulfill(json({ user: me })));
  await q.route('**/api/semibart/rooms', r => r.fulfill(json({ rooms: {} })));
  await q.route('**/api/semibart/desk**', r => r.fulfill(json({ notes: [] })));
  await q.route('**/api/semibart/events**', r => r.fulfill(json({ events: [] })));
  await q.route('**/api/semibart/personas', r => r.fulfill(json({ personas: {} })));
  await q.route('**/api/semibart/pages', r => r.fulfill(json({ pages: { alison: found } })));
  await q.route('**/api/semibart/books/**', r => found >= 10 ? r.fulfill(json(BOOK)) : r.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Not finished yet."}' }));
  await q.goto(base + '/semibart'); await ready(q); await q.evaluate(() => window.questTicker && window.questTicker.setOpen(false));
  await enter(q, 'alison'); await q.waitForTimeout(900);
  return q;
}
const own = await play(ALISON, 7);
expect('unfinished: its owner sees no book to click', !(await hot(own)).some(n => /(my|'s) book/.test(n)), (await hot(own)).slice(0, 6).join(', '));
await own.screenshot({ path: out + '/books-3-on-the-shelf.png' });
const vis = await play({ ...ALISON, character: 'daniel', name: 'Daniel', study: '1' }, 7);
expect('unfinished: a visitor sees none either', !(await hot(vis)).some(n => /(my|'s) book/.test(n)));
const done = await play(ALISON, 10);
const dn = await hot(done);
expect('finished: it stands on the desk as "my book"', dn.includes('my book'), dn.slice(0, 6).join(', '));
await done.screenshot({ path: out + '/books-4-on-the-desk.png' });
await act(done, 'my book'); await done.waitForSelector('.bk-veil', { timeout: 15000 }); await done.waitForTimeout(300);
expect('and opens at its cover', (await reader(done)).at.i === 0);
const dv = await play({ ...ALISON, character: 'daniel', name: 'Daniel', study: '1' }, 10);
expect("finished: a visitor reads Alison's book", (await hot(dv)).includes("Alison's book") && await act(dv, "Alison's book") && !!(await dv.waitForSelector('.bk-veil', { timeout: 15000 })));
expect('no page errors', errs.length === 0, errs.join(' | '));
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
