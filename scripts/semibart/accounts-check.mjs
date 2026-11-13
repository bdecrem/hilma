// End-to-end check of CASBS Quest accounts in a browser, against a dev server:
//   pnpm exec next dev --turbopack -p 3277   (needs SUPABASE_URL, SUPABASE_SERVICE_KEY, SEMIBART_SESSION_SECRET)
// Usage: node scripts/semibart/accounts-check.mjs <out-dir>
// Signs in as Bart (admin), fails once, starts at his door, changes his passcode in his study,
// proves the old one stops working, then resets it to the study number again.
import { chromium } from 'playwright';
const out = process.argv[2], base = process.env.BASE || 'http://localhost:3277';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const shot = n => p.screenshot({ path: `${out}/${n}.png` });
const ok = [], bad = [];
const expect = (cond, what) => (cond ? ok : bad).push(what);
await p.goto(base + '/semibart'); await p.waitForTimeout(1500);
await shot('a1-signin');
expect(await p.isVisible('#sbName') && !(await p.isVisible('#startBtn')), 'sign-in form shown, Start hidden');
await p.fill('#sbName', 'Bart'); await p.fill('#sbCode', '99'); await p.click('.sb-form button'); await p.waitForTimeout(900);
expect((await p.textContent('.sb-err')).includes('study number'), 'wrong passcode explained');
await shot('a2-wrong');
await p.fill('#sbCode', '16'); await p.click('.sb-form button'); await p.waitForTimeout(1200);
expect(await p.isVisible('#startBtn'), 'Start shown after sign-in');
await shot('a3-signed-in');
await p.click('#startBtn'); await p.waitForTimeout(1500);
const at = await p.evaluate(() => ({ x: window.quest.S.x, y: window.quest.S.y, me: window.quest.me }));
expect(at.me && at.me.character === 'bart' && at.y === 134, 'starts at his own door (16)');
expect(await p.isVisible('#sbChip'), 'chip shown');
await shot('a4-start');
// into his study; the padlock is there; change the passcode
await p.evaluate(() => { const q = window.quest; q.S.line = null; q.S.busy = false; q.run(() => q.doAction('open', q.MAP.find(h => h.n === '16'))); });
for (let i = 0; i < 40; i++) { await p.waitForTimeout(300); if (await p.evaluate(() => window.quest.S.scene === 'room' && !window.quest.S.busy)) break; }
await p.evaluate(() => { window.quest.S.line = null; });
expect(await p.evaluate(() => window.quest.hot().some(h => h.name === 'Your passcode')), 'padlock hotspot in his study');
await shot('a5-study');
await p.evaluate(() => { const q = window.quest; q.S.busy = false; q.run(() => q.doAction('open', q.hot().find(h => h.name === 'Your passcode'))); });
for (let i = 0; i < 30; i++) { await p.waitForTimeout(300); if (await p.isVisible('#sbCur')) break; }
await p.fill('#sbCur', '16'); await p.fill('#sbNew', '4321'); await p.fill('#sbNew2', '4321');
await shot('a6-passcode');
await p.click('.sb-pane .sb-btn'); await p.waitForTimeout(1200);
expect(await p.evaluate(() => window.quest.me && window.quest.me.passcodeIsDefault === false), 'passcode changed');
await shot('a7-changed');
const tries = await p.evaluate(async () => {
  const t = async code => (await fetch('/api/semibart/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'bart', passcode: code }) })).status;
  return { old: await t('16'), fresh: await t('4321') };
});
expect(tries.old === 401 && tries.fresh === 200, 'old passcode refused, new one works');
// the chip menu, then put it back to the study number
await p.click('#sbChip'); await p.waitForTimeout(200); await shot('a8-menu');
const reset = await p.evaluate(async () => (await fetch('/api/semibart/admin/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ character: 'bart' }) })).status);
expect(reset === 200, 'admin reset back to the study number');
console.log(JSON.stringify({ ok, bad, errs }, null, 1));
await b.close();
