// The jokes and the one collectible, in the real game with every API answered locally: the
// restrooms and the library have more to say each time; an oak drops a loose leaf, picking it up
// adds a page to your manuscript, the stacks show on desks, and your own lines pick up habits.
// Usage: node scripts/semibart/leaves-check.mjs <out-dir> [base]     (base: http://localhost:3277)
import { chromium } from 'playwright';
const [out, base = 'http://localhost:3277'] = process.argv.slice(2);
const json = body => ({ contentType: 'application/json', body: JSON.stringify(body) });
let failed = 0;
const expect = (name, got, detail = '') => { if (!got) failed++; console.log(`${got ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`); };
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
let minePages = 0;
await p.route('**/api/semibart/me', r => r.fulfill(json({ user: { character: 'alison', name: 'Alison', study: '36', role: 'user', passcodeIsDefault: false } })));
await p.route('**/api/semibart/rooms', r => r.fulfill(json({ rooms: {} })));
await p.route('**/api/semibart/desk**', r => r.fulfill(json({ notes: [] })));
await p.route('**/api/semibart/events**', r => r.fulfill(json({ events: [] })));
await p.route('**/api/semibart/personas', r => r.fulfill(json({ personas: {} })));
await p.route('**/api/semibart/pages', r => r.request().method() === 'POST' ? r.fulfill(json({ pages: ++minePages, picked: true })) : r.fulfill(json({ pages: { daniel: 3, kevin: 10, mikael: 6, ...(minePages ? { alison: minePages } : {}) } })));
await p.goto(base + '/semibart'); await p.waitForFunction(() => window.quest && window.quest.me && window.questLeaves && window.questTicker);
await p.evaluate(() => { const q = window.quest, S = q.S; window.said = []; let last = null; setInterval(() => { if (S.line && S.line !== last) { last = S.line; window.said.push(S.line.text); } if (S.line && S.line.t > 0.15) S.line.t = S.line.dur; }, 20); q.start(); window.questTicker.setOpen(false); });
const idle = () => p.waitForFunction(() => !window.quest.S.busy && !window.quest.S.line && !window.quest.S.path.length, null, { timeout: 60000 });
const act = async (name, verb) => { await idle(); const r = await p.evaluate(([n, v]) => { const q = window.quest, h = q.hot().find(x => x.name === n) || q.hot().find(x => x.name.startsWith(n)); if (!h) return null; q.run(() => q.doAction(v || h.def, h)); return h.name; }, [name, verb]); await p.waitForTimeout(300); await idle(); return r; };
const since = async fn => { await idle(); const n = await p.evaluate(() => window.said.length); await fn(); return p.evaluate(n => window.said.slice(n), n); };
await idle();

// places that say more each time
const r1 = await since(() => act('Restrooms', 'open')), r2 = await since(() => act('Restrooms', 'open')), r3 = await since(() => act('Restrooms', 'open'));
expect('the restrooms: occupied, then a flush, then still occupied', /Occupied/.test(r1.join(' ')) && /flush/i.test(r2.join(' ')) && /fall term/.test(r3.join(' ')), JSON.stringify([r1, r2, r3]));
const l1 = await since(() => act('Library', 'open')), l2 = await since(() => act('Library', 'open'));
expect('the library shushes you the second time', /book is long/.test(l1.join(' ')) && /shushed/i.test(l2.join(' ')), JSON.stringify([l1, l2]));

// a loose leaf
expect('quiet things have no hover name, a leaf does', await p.evaluate(() => { const q = window.quest; return q.MAP.find(h => h.name === 'turkey').quiet === true && q.MAP.find(h => h.name === 'parking lot').def === 'look'; }));
await p.evaluate(() => window.questLeaves.dropNow()); await p.waitForTimeout(400);
const leaf = await p.evaluate(() => window.questLeaves.state().leaf);
expect('an oak drops a leaf', !!leaf, JSON.stringify(leaf));
await p.evaluate(l => { const S = window.quest.S; S.cam = Math.max(0, Math.min(window.quest.world.height - 180, l.y - 90)); S.camFree = true; }, leaf);
await p.waitForTimeout(500); await p.screenshot({ path: out + '/leaves-1-on-the-map.png' });
const picked = await since(() => act('loose leaf', 'pick'));
expect('picking it up adds a page and says so', await p.evaluate(() => window.questLeaves.state().mine) === 1 && /loose page/i.test(picked.join(' ')) && /my desk/.test(picked.join(' ')), JSON.stringify(picked));

// how you talk, by how far the book has got
const talk = await p.evaluate(() => { const L = window.questLeaves, lines = ['Knock, knock.', 'The library. Quiet.', 'Coffee. Still hot.', 'No secret passage. I checked.', 'Looking for someone?', 'It is thriving. Someone waters it.', 'Nothing special about it.', 'The way out.', 'Booked. It is always booked.', 'Good office, nobody in it.', 'Hello, space.', 'Lunch!', 'A big oak in a brick circle.', 'So this is Study 36.', 'I knocked.', 'What are you working on?', 'The hills, the Dish, Stanford down below.', 'Restrooms.', 'Occupied. Of course.', 'Mine now.']; const at = n => { L.pages.alison = n; return lines.map(l => L.reword(l)).filter((l, i) => l !== lines[i]); }; const r = { 0: at(0), 2: at(2), 5: at(5), 8: at(8), 10: at(10) }; L.pages.alison = 1; return r; });
console.log('     2 pages:', talk[2].join(' | ')); console.log('     5 pages:', talk[5].join(' | ')); console.log('     8 pages:', talk[8].join(' | ')); console.log('     the book:', talk[10].join(' | '));
expect('no pages, no habits; then footnotes, hedges, self-citation, the book', talk[0].length === 0 && talk[2].every(l => /\[\d\]$/.test(l)) && talk[2].length > 0 && talk[5].length <= 12 && talk[5].some(l => /Arguably\.$/.test(l)) && talk[8].some(l => /forthcoming/.test(l)) && talk[10].some(l => /the book|chapter/.test(l)), JSON.stringify(talk));

// the stacks on the desks
const room = async k => { await idle(); await p.evaluate(k => { const S = window.quest.S; S.scene = 'room'; S.room = k; S.x = 70; S.y = 134; S.path = []; S.busy = false; S.seated = false; }, k); await p.waitForTimeout(700); return p.evaluate(() => window.quest.hot().map(h => h.name)); };
const d = await room('daniel'); await p.screenshot({ path: out + '/leaves-2-daniel-manuscript.png' });
expect("Daniel's manuscript is on his desk", d.includes("Daniel's manuscript"), d.slice(0, 5).join(', '));
const k = await room('kevin'); await p.screenshot({ path: out + '/leaves-3-study-27.png' });
expect("in Study 27, Kevin's book and Mikael's manuscript, nothing for Raul", k.includes("Kevin's book") && k.includes("Mikael's manuscript") && !k.some(n => /Raul's (book|manuscript)/.test(n)), k.slice(0, 8).join(', '));
const a = await room('alison');
expect('my own page is on my own desk', a.includes('my manuscript'), a.slice(0, 5).join(', '));
expect('no page errors', errs.length === 0, errs.join(' | '));
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
