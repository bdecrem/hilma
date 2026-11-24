// Bart's study (Study 16): the Ola poster and the phone with Rocky Road on it.
// Shoots the room, the poster and the phone close up, the phone ringing, and the three screenshots;
// clicks the poster and checks the tab it opens.
// Signs in as the check-only account, like social-check.mjs (same environment).
//   node scripts/semibart/desk-shots.mjs <dir> [url]
import { chromium } from 'playwright';
import { createHmac } from 'node:crypto';
const out = process.argv[2], url = process.argv[3] || 'http://localhost:3277/semibart';
const { SUPABASE_URL: SU, SUPABASE_SERVICE_KEY: SK, SEMIBART_SESSION_SECRET: SECRET } = process.env;
if (!out || !SU || !SK || !SECRET) { console.error('need <dir> and SUPABASE_URL, SUPABASE_SERVICE_KEY, SEMIBART_SESSION_SECRET in the environment'); process.exit(1); }
const r0 = await fetch(`${SU}/rest/v1/semibart_users?select=id,session_version&character=eq.check`, { headers: { apikey: SK, authorization: `Bearer ${SK}` } });
const me = (await r0.json())[0];
if (!me) { console.error('no check account: run node scripts/semibart/make-check-account.mjs'); process.exit(1); }
const payload = `${me.id}.${me.session_version}.${Date.now() + 3600e3}`;
const token = `${payload}.${createHmac('sha256', SECRET).update(`semibart.${payload}`).digest('hex')}`;
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: 'semibart_session', value: token, url: new URL(url).origin }]);
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(url); await p.waitForFunction(() => window.quest && window.quest.me, null, { timeout: 60000 });
await p.evaluate(() => { const S = window.quest.S; setInterval(() => { if (S.line && S.line.t > 0.2) S.line.t = S.line.dur; }, 30); });
await p.click('#startBtn'); await p.waitForFunction(() => window.quest.S.started, null, { timeout: 20000 });
const idle = () => p.waitForFunction(() => !window.quest.S.busy && !window.quest.S.line, null, { timeout: 60000 });
const act = (name, verb) => p.evaluate(([n, v]) => { const q = window.quest, hh = q.hot().find(x => x.name === n || x.name.startsWith(n + ' ')); q.run(() => q.doAction(v || hh.def, hh)); }, [name, verb]);
const spot = (name, pad = 0) => p.evaluate(([n, pad]) => { const h = window.quest.hot().find(x => x.name === n), c = document.getElementById('cv').getBoundingClientRect(), k = c.width / 320;
  return { x: c.left + (h.r[0] - pad) * k, y: c.top + (h.r[1] + 18 - pad) * k, width: (h.r[2] + 2 * pad) * k, height: (h.r[3] + 2 * pad) * k }; }, [name, pad]);
await idle(); await act('Study 16'); await idle(); await p.waitForTimeout(600);
console.log('in', await p.evaluate(() => [window.quest.S.scene, window.quest.S.room, window.quest.hot().map(h => h.name).join(', ')]));
await p.screenshot({ path: `${out}/desk-1-room.png` });
await p.screenshot({ path: `${out}/desk-2-poster.png`, clip: await spot('Ola poster', 8) });
await p.screenshot({ path: `${out}/desk-3-phone-off.png`, clip: await spot('phone', 6) });
const pr = await spot('Ola poster');
await p.mouse.move(pr.x + pr.width / 2, pr.y + pr.height / 2); await p.waitForTimeout(200);
console.log('label', await p.evaluate(() => { const l = document.getElementById('label'); return l.hidden ? '(hidden)' : l.textContent; }));
const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 15000 }), p.mouse.click(pr.x + pr.width / 2, pr.y + pr.height / 2)]);
console.log('poster opens', pop.url()); await pop.close(); await idle();
await p.evaluate(() => { const S = window.quest.S; S.phoneOn = true; S.phoneT = 0; }); await p.waitForTimeout(2100);
await p.screenshot({ path: `${out}/desk-4-phone-on.png`, clip: await spot('phone', 6) });
await act('phone'); await p.waitForFunction(() => !document.getElementById('screen').hidden, null, { timeout: 20000 }); await p.waitForTimeout(700);
await p.screenshot({ path: `${out}/desk-5-screens.png` });
console.log('images', await p.evaluate(() => [...document.querySelectorAll('#phones img')].map(i => i.naturalWidth + 'x' + i.naturalHeight)));
await p.keyboard.press('Escape'); await idle();
console.log('errors', errs);
await b.close();
