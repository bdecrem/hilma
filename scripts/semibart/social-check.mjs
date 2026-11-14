// The social features end to end, in a real browser against a dev server: sticky notes (write
// one, see it on the desk, read the desk close up, peel it off), the ticker, and the chat with
// the room's Claude (it answers; nothing is changed). Signs in as the check-only admin `check`
// (scripts/semibart/make-check-account.mjs) by minting its session cookie from
// SEMIBART_SESSION_SECRET, never as a real fellow; the chat half runs in Bart's study. It writes to the real
// tables and cleans up after itself: the notes it left and the announcements it caused.
//   source ./.env.local && node scripts/semibart/social-check.mjs <dir> [url] [notes|chat|all]
import { chromium } from 'playwright';
import { createHmac } from 'node:crypto';
const out = process.argv[2], url = process.argv[3] || 'http://localhost:3277/semibart', part = process.argv[4] || 'all';
const { SUPABASE_URL: SU, SUPABASE_SERVICE_KEY: SK, SEMIBART_SESSION_SECRET: SECRET } = process.env;
if (!out || !SU || !SK || !SECRET) { console.error('need <dir> and SUPABASE_URL, SUPABASE_SERVICE_KEY, SEMIBART_SESSION_SECRET in the environment'); process.exit(1); }
const rest = async (path, opts = {}) => { const r = await fetch(`${SU}/rest/v1/${path}`, { ...opts, headers: { apikey: SK, authorization: `Bearer ${SK}`, 'content-type': 'application/json', prefer: 'return=representation', ...(opts.headers || {}) } }); const t = await r.text(); if (!r.ok) throw new Error(`${path}: ${r.status} ${t}`); return t ? JSON.parse(t) : null; };
const users = await rest('semibart_users?select=id,character,session_version&character=in.(bart,daniel,check)');
const bart = users.find(u => u.character === 'bart'), daniel = users.find(u => u.character === 'daniel'), me = users.find(u => u.character === 'check');
if (!me) { console.error('no check account: run node scripts/semibart/make-check-account.mjs'); process.exit(1); }
const payload = `${me.id}.${me.session_version}.${Date.now() + 3600e3}`;
const token = `${payload}.${createHmac('sha256', SECRET).update(`semibart.${payload}`).digest('hex')}`;
const startEvent = ((await rest('semibart_events?select=id&order=id.desc&limit=1'))[0] || { id: 0 }).id;
const started = new Date().toISOString();
let failed = 0; const ok = (name, cond, extra) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); if (!cond) failed++; };

const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addCookies([{ name: 'semibart_session', value: token, url: new URL(url).origin }]);
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(url); await p.waitForFunction(() => window.quest && window.quest.me && window.questNotes && window.questTicker && window.questClaude, null, { timeout: 60000 });
await p.evaluate(() => { const S = window.quest.S; setInterval(() => { if (S.line && S.line.t > 0.6) S.line.t = S.line.dur; }, 30); });
await p.click('#startBtn'); await p.waitForFunction(() => window.quest.S.started, null, { timeout: 20000 }); await p.waitForTimeout(600);
await p.waitForFunction(() => !window.quest.S.busy && !window.quest.S.line, null, { timeout: 60000 });
console.log('    state', await p.evaluate(() => ({ scene: window.quest.S.scene, busy: window.quest.S.busy })));
const idle = (ms = 60000) => p.waitForFunction(() => !window.quest.S.busy && !window.quest.S.line, null, { timeout: ms });
const enter = async k => { await p.evaluate(k => { const S = window.quest.S; S.scene = 'room'; S.room = k; S.x = 120; S.y = 134; S.path = []; S.line = null; }, k); await p.waitForTimeout(1500); };
const spotXY = name => p.evaluate(n => { const h = window.quest.hot().find(x => x.name.startsWith(n)), c = document.getElementById('cv').getBoundingClientRect(); return h ? { x: c.left + (h.r[0] + h.r[2] / 2) / 320 * c.width, y: c.top + (h.r[1] + h.r[3] / 2 + 18) / 180 * c.height, name: h.name } : null; }, name);
const shot = n => p.screenshot({ path: `${out}/social-${n}.png` });
ok('signed in as', await p.evaluate(() => window.quest.me.character) === 'check');

try {
if (part !== 'chat') {
  // a note from Daniel is waiting on Bart's desk (put there directly, as if he had written it)
  const [seed] = await rest('semibart_notes', { method: 'POST', body: JSON.stringify({ to_user: bart.id, from_user: daniel.id, body: 'Seminar ran long. Lunch? I will be under the oak.', color: 'pink' }) });
  await enter('daniel'); await shot('1-daniel-room');
  const pad = await spotXY('sticky notes and a pen'); ok('pad hotspot', !!pad, pad);
  await p.mouse.move(pad.x, pad.y); await p.waitForTimeout(150);
  ok('hover label', await p.evaluate(() => document.getElementById('label').textContent) === 'sticky notes and a pen');
  await p.mouse.click(pad.x, pad.y); await p.waitForSelector('.nb-pad textarea', { timeout: 20000 }); await p.waitForTimeout(200);
  await p.keyboard.type('Your Socrates is judging me. I can feel it.'); await shot('2-writing');
  await p.click('.nb-pad [type=submit]'); await p.waitForSelector('.nb-veil', { state: 'detached', timeout: 20000 });
  await p.waitForTimeout(500); await shot('3-thanks'); await idle();
  const onDesk = await p.evaluate(() => window.questNotes.shown('daniel').notes.map(n => n.body)); ok('note on the desk', onDesk.includes('Your Socrates is judging me. I can feel it.'), onDesk);
  await shot('4-on-desk');
  const note = await spotXY('note from Check'); ok('note hotspot', !!note, note);
  await p.mouse.click(note.x, note.y); await p.waitForSelector('.nb-board', { timeout: 20000 }); await p.waitForTimeout(300); await shot('5-desk-close-up');
  ok('close-up shows the text', (await p.textContent('.nb-notes')).includes('Socrates is judging me'));
  // the wire picks it up
  await p.keyboard.press('Escape'); await idle();
  await p.evaluate(() => window.questTicker.poll());
  await p.waitForSelector('#tk.on', { timeout: 20000 }); await p.waitForTimeout(2600); await shot('6-ticker');
  const wire = await p.evaluate(() => document.querySelector('#tk .tk-run').textContent + ' | ' + window.questTicker.queue.map(i => i.text).join(' | '));
  ok('on the wire', wire.includes("Check pinned a note to Daniel's board"), wire);
  // peel it off
  await p.mouse.click(note.x, note.y); await p.waitForSelector('.nb-off'); await p.click('.nb-off');
  ok('peeled off', await p.waitForFunction(() => window.questNotes.shown('daniel').notes.length === 0, null, { timeout: 15000 }).then(() => true, () => false));
  await p.keyboard.press('Escape'); await idle();
  // Bart's desk: Daniel's note is there for a visitor to read
  await enter('bart'); await p.waitForTimeout(600); await shot('7-bart-room');
  const mine = await spotXY('note from Daniel'); ok('note from Daniel on Bart\'s desk', !!mine, mine);
  await p.mouse.click(mine.x, mine.y); await p.waitForSelector('.nb-board'); await p.waitForTimeout(300); await shot('8-my-desk');
  ok('a visitor reads it', (await p.textContent('.nb-notes')).includes('under the oak'));
  await p.keyboard.press('Escape'); await idle();
  // other rooms, for the eye
  for (const k of ['frances', 'joseph', 'kevin']) { await enter(k); await shot('9-' + k); }
  await rest(`semibart_notes?id=eq.${seed.id}`, { method: 'DELETE' });
}
if (part !== 'notes') {
  // The spark is in your own study only, except for an admin, who has one everywhere.
  await enter('bart'); ok('an admin has Claude in any study', !!(await spotXY('Claude')));
  await p.evaluate(() => { window.quest.me = Object.assign({}, window.quest.me, { role: 'user' }); });
  ok('a fellow has none in someone else\'s study', !(await spotXY('Claude')));
  // The agent itself, asked something that changes nothing (the check account is an admin, so
  // the server answers for Bart's study; no tool runs, no room or lines are touched).
  const r = await p.evaluate(async () => { const r = await fetch('/api/semibart/agent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ room: 'bart', messages: [{ role: 'user', text: 'Change nothing. In one line: what can you do for this study?' }] }) }); return { status: r.status, body: await r.json() }; });
  console.log('    claude:', r.body.reply);
  ok('agent answers', r.status === 200 && !!r.body.reply && !r.body.room && !r.body.personas, r.status);
}
} finally {
  // leave the tables as they were
  await rest(`semibart_notes?from_user=eq.${me.id}&created_at=gte.${encodeURIComponent(started)}`, { method: 'DELETE' });
  await rest(`semibart_notes?from_user=eq.${daniel.id}&to_user=eq.${bart.id}&created_at=gte.${encodeURIComponent(started)}`, { method: 'DELETE' });
  await rest(`semibart_events?id=gt.${startEvent}&actor=eq.check`, { method: 'DELETE' });
  console.log('page errors', errs); await b.close();
}
console.log(failed ? `${failed} FAILED` : 'all ok'); process.exit(failed ? 1 : 0);
