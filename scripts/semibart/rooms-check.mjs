// Rooms as data, end to end through the real page, API and database: sign in as the check
// account (an admin that owns no study; SEMIBART_CHECK_NAME / SEMIBART_CHECK_PASS in .env.local),
// walk into a study, ask the Decorate box for something (one real Claude call), see the room
// change here and in a second tab that never reloads, look at the new thing, undo, and check who
// is turned away. The room ends as it began, two versions later (one decorate, one undo). Every
// environment shares one database, so pick a room nobody is changing: SEMIBART_CHECK_ROOM,
// 'alison' unless set. The Decorate box is retired in the game by the in-room chat; this check
// switches it back on for itself, since both end in the same changeRoom().
// Usage: set -a; source ./.env.local; set +a
//        node scripts/semibart/rooms-check.mjs <out-dir> ["request"] [base]
//        (base defaults to http://localhost:3277; https://ola.cx checks production)
import { chromium } from 'playwright';
const [out, ask = 'put a cute pink rat in my room', base = 'http://localhost:3277'] = process.argv.slice(2);
const ROOM = process.env.SEMIBART_CHECK_ROOM || 'alison', NAME = process.env.SEMIBART_CHECK_NAME, PASS = process.env.SEMIBART_CHECK_PASS;
if (!NAME || !PASS) { console.error('SEMIBART_CHECK_NAME / SEMIBART_CHECK_PASS are not set (source .env.local)'); process.exit(1); }
let failed = 0;
const expect = (name, got, detail = '') => { if (!got) failed++; console.log(`${got ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const errs = [];
const open = async () => {
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.text().includes('[rooms]')) errs.push(m.text()); });
  await p.goto(base + '/semibart'); await p.waitForFunction(() => window.quest && window.quest.me !== undefined);
  return p;
};
const enter = async p => {
  await p.waitForFunction(() => window.quest.me);
  await p.evaluate(() => { const q = window.quest, S = q.S; q.start(); setInterval(() => { if (S.line && S.line.t > 0.15) S.line.t = S.line.dur; }, 30); });
  await p.waitForTimeout(1500);
  await p.evaluate(k => { const S = window.quest.S; S.scene = 'room'; S.room = k; S.x = 100; S.y = 134; S.face = 1; S.path = []; S.busy = false; window.questRooms.ui(true); }, ROOM);
};
const room = p => p.evaluate(k => { const r = window.questRooms.rooms[k]; return r ? { version: r.version, loaded: !!r.mod, dead: !!(r.mod && r.mod.dead), errors: r.mod ? r.mod.errors : 0 } : { version: 0, loaded: false, dead: false, errors: 0 }; }, ROOM);
const names = p => p.evaluate(() => window.quest.hot().map(h => h.name));

const a = await open();
const login = await a.evaluate(async ({ name, passcode }) => { const r = await fetch('/api/semibart/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, passcode }) }); return r.status; }, { name: NAME, passcode: PASS });
expect('the check account signs in', login === 200, 'status ' + login);
if (login !== 200) { console.log('Stopping: the sign-in was refused, so nothing else can run (node scripts/semibart/make-check-account.mjs recreates the account).'); await b.close(); process.exit(1); }
await a.reload(); await a.waitForFunction(() => window.quest && window.quest.me);
await enter(a);
const tabB = await open(); await enter(tabB);
await a.waitForTimeout(1500);
const before = await room(a), baseNames = await names(a);
console.log('     room before:', JSON.stringify(before));

await a.waitForSelector('#bDeco:not([hidden])', { timeout: 5000 }).then(() => expect('the Decorate button shows in a room you may change', true), () => expect('the Decorate button shows in a room you may change', false));
await a.click('#bDeco'); await a.fill('#decoQ', ask);
const t0 = Date.now();
await a.click('#decoGo');
await a.waitForTimeout(600); await a.screenshot({ path: out + '/check-1-waiting.png' });
await a.waitForFunction(() => { const m = document.getElementById('decoMsg'); return !document.getElementById('decoQ').disabled && m.textContent; }, null, { timeout: 280000 });
const secs = ((Date.now() - t0) / 1000).toFixed(1), line = await a.textContent('#decoMsg'), good = await a.evaluate(() => document.getElementById('decoMsg').className === 'good');
expect(`the decorator answers (${secs} s)`, good, JSON.stringify(line));
const after = await room(a);
expect('the room has a new version, loaded and running', after.version === before.version + 1 && after.loaded && !after.dead, JSON.stringify(after));
await a.waitForTimeout(1500); await a.screenshot({ path: out + '/check-2-decorated.png' });
const newNames = (await names(a)).filter(n => !baseNames.includes(n));
expect('the new thing can be looked at', newNames.length > 0, newNames.join(', '));
await tabB.waitForFunction(([k, v]) => (window.questRooms.rooms[k] || {}).version === v, [ROOM, after.version], { timeout: 15000 }).then(() => expect('a second tab gets it without reloading', true), () => expect('a second tab gets it without reloading', false));
await tabB.waitForTimeout(800); await tabB.screenshot({ path: out + '/check-3-second-tab.png' });
await a.waitForTimeout(2500);
const ran = await room(a);
expect('it ran for a few seconds without an error', !ran.dead && ran.errors === 0, JSON.stringify(ran));

await a.click('#decoUndo');
await a.waitForFunction(() => !document.getElementById('decoQ').disabled, null, { timeout: 30000 });
const undone = await room(a);
expect('undo steps the room back', undone.version === after.version + 1 && undone.loaded === before.loaded, JSON.stringify(undone) + ' ' + JSON.stringify(await a.textContent('#decoMsg')));
await tabB.waitForFunction(([k, v]) => (window.questRooms.rooms[k] || {}).version === v, [ROOM, undone.version], { timeout: 15000 }).then(() => expect('the second tab follows the undo', true), () => expect('the second tab follows the undo', false));
await a.screenshot({ path: out + '/check-4-undone.png' });

const post = (p, path, body) => p.evaluate(async ([path, body]) => { const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return r.status; }, [path, body]);
expect('an empty request is turned away', await post(a, '/api/semibart/rooms/' + ROOM, { prompt: '  ' }) === 400);
expect('a room that does not exist is turned away', await post(a, '/api/semibart/rooms/nosuchroom', { prompt: 'a rat' }) === 404);
const anon = await (await b.newContext()).newPage(); await anon.goto(base + '/semibart/talk.md');
expect('nobody signed in may decorate', await post(anon, '/api/semibart/rooms/' + ROOM, { prompt: 'a rat' }) === 401);
expect('nobody signed in may undo', await post(anon, '/api/semibart/rooms/' + ROOM + '/undo', {}) === 401);
const idx = await anon.evaluate(async () => { const r = await fetch('/api/semibart/rooms'); return { status: r.status, cache: r.headers.get('cache-control'), body: await r.json() }; });
expect('anyone may read the index', idx.status === 200 && idx.body.rooms[ROOM] === undone.version, JSON.stringify(idx));
const pinned = await anon.evaluate(async ([k, v]) => { const r = await fetch('/api/semibart/rooms/' + k + '?v=' + v); return { status: r.status, cache: r.headers.get('cache-control'), v: (await r.json()).version }; }, [ROOM, undone.version]);
expect('a versioned read is cacheable for good', pinned.status === 200 && /immutable/.test(pinned.cache || ''), JSON.stringify(pinned));
expect('no page or room errors', errs.length === 0, errs.join(' | '));
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
