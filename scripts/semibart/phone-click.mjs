// The phone on Bart's desk, clicked with a real mouse click, as a visitor and as Bart himself.
//   node scripts/semibart/phone-click.mjs <dir> [url]      (environment as social-check.mjs)
import { chromium } from 'playwright';
import { createHmac } from 'node:crypto';
const out = process.argv[2], url = process.argv[3] || 'http://localhost:3277/semibart';
const { SUPABASE_URL: SU, SUPABASE_SERVICE_KEY: SK, SEMIBART_SESSION_SECRET: SECRET } = process.env;
const r0 = await fetch(`${SU}/rest/v1/semibart_users?select=id,session_version&character=eq.check`, { headers: { apikey: SK, authorization: `Bearer ${SK}` } });
const me = (await r0.json())[0];
const payload = `${me.id}.${me.session_version}.${Date.now() + 3600e3}`;
const token = `${payload}.${createHmac('sha256', SECRET).update(`semibart.${payload}`).digest('hex')}`;
const b = await chromium.launch();
for (const as of ['visitor', 'bart']) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addCookies([{ name: 'semibart_session', value: token, url: new URL(url).origin }]);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url); await p.waitForFunction(() => window.quest && window.quest.me, null, { timeout: 60000 });
  if (as === 'bart') console.log('me before', await p.evaluate(() => { const q = window.quest, m = q.me; q.me = Object.assign({}, m, { character: 'bart', study: 16, role: 'user' }); return JSON.stringify(m); }));
  const said = []; await p.exposeFunction('heard', t => said.push(t));
  await p.evaluate(() => { const S = window.quest.S; let last = null; setInterval(() => { if (S.line && S.line !== last) { last = S.line; window.heard((S.line.who || '') + ': ' + (S.line.text || S.line.s || JSON.stringify(Object.keys(S.line)))); } if (S.line && S.line.t > 0.2) S.line.t = S.line.dur; }, 30); });
  await p.click('#startBtn'); await p.waitForFunction(() => window.quest.S.started, null, { timeout: 20000 });
  const idle = () => p.waitForFunction(() => !window.quest.S.busy && !window.quest.S.line, null, { timeout: 60000 });
  await idle();
  await p.evaluate(() => { const q = window.quest, hh = q.hot().find(x => x.name.startsWith('Study 16')); q.run(() => q.doAction(hh.def, hh)); });
  await p.waitForFunction(() => window.quest.S.scene === 'room', null, { timeout: 30000 }); await idle(); await p.waitForTimeout(500);
  const at = await p.evaluate(() => { const h = window.quest.hot().find(x => x.name === 'phone'), c = document.getElementById('cv').getBoundingClientRect(), k = c.width / 320; return h ? { x: c.left + (h.r[0] + h.r[2] / 2) * k, y: c.top + (h.r[1] + 18 + h.r[3] / 2) * k, r: h.r } : null; });
  console.log(as, 'room', await p.evaluate(() => [window.quest.S.room, window.quest.S.seated, window.quest.S.bart.mode]), 'phone spot', JSON.stringify(at));
  if (at) {
    await p.mouse.move(at.x, at.y); await p.waitForTimeout(200);
    console.log(as, 'hover', await p.evaluate(() => window.quest.S.hover && window.quest.S.hover.name), 'label', await p.evaluate(() => { const l = document.getElementById('label'); return l.hidden ? '(hidden)' : l.textContent; }));
    said.length = 0; await p.mouse.click(at.x, at.y); await p.waitForTimeout(4000);
    console.log(as, 'after click said', JSON.stringify(said), 'screen open', await p.evaluate(() => !document.getElementById('screen').hidden), 'busy', await p.evaluate(() => window.quest.S.busy));
    await p.screenshot({ path: `${out}/phone-${as}.png` });
    await p.keyboard.press('Escape'); await p.waitForTimeout(3000); console.log(as, 'after Esc said', JSON.stringify(said), 'screen open', await p.evaluate(() => !document.getElementById('screen').hidden));
  }
  console.log(as, 'errors', errs); await ctx.close();
}
await b.close();
