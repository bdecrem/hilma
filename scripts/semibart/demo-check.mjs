// The demo page (ola.cx/semibart/demo.html) in a real browser, signed in as the demo account:
// the prompt over the living dark, the 3D words (steel, the hot line crossing CHANGES., copper, gold), the
// crumble, the reveal into the game with no title card, demobart walking with spiky hair in pink, and the
// theme playing. Screenshots at each beat into <out-dir>.
// Usage: SEMIBART_DEMO_PASS=… node scripts/semibart/demo-check.mjs <out-dir> [base]   (base: http://localhost:3277)
// Without the demo passcode it runs as the check-only account (SEMIBART_CHECK_NAME / SEMIBART_CHECK_PASS in
// .env.local) and leaves out the two things only demobart has: the admin role and the look.
import { chromium } from 'playwright';
const [out, base = 'http://localhost:3277'] = process.argv.slice(2);
const demo = !!process.env.SEMIBART_DEMO_PASS, name = demo ? 'demobart' : process.env.SEMIBART_CHECK_NAME, pass = demo ? process.env.SEMIBART_DEMO_PASS : process.env.SEMIBART_CHECK_PASS;
if (!out || !name || !pass) { console.error('usage: SEMIBART_DEMO_PASS=… node scripts/semibart/demo-check.mjs <out-dir> [base]   (or SEMIBART_CHECK_NAME / SEMIBART_CHECK_PASS)'); process.exit(1); }
let failed = 0;
const expect = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`); };
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
const login = await p.request.post(base + '/api/semibart/login', { data: { name, passcode: pass } });
expect(`${demo ? 'the demo' : 'the check'} account signs in`, login.ok(), String(login.status()));
await p.goto(base + '/semibart/demo.html');
await p.waitForFunction(() => window.quest && window.quest.me !== undefined, null, { timeout: 30000 });
if (demo) expect('signed in as demobart, an admin', await p.evaluate(() => window.quest.me && window.quest.me.character === 'demobart' && window.quest.me.role === 'admin'));
else expect('signed in', await p.evaluate(() => !!window.quest.me));
await p.waitForFunction(() => !!document.querySelector('#qIntro canvas'), null, { timeout: 30000 });
await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/demo-0-prompt.png` });
expect('the dark under the prompt is drawn (the 3D canvas is up before the click)', await p.evaluate(() => { const c = document.querySelector('#qIntro canvas'); return !!c && c.width > 0 && getComputedStyle(c).visibility === 'visible'; }));
expect('the prompt covers the page', await p.evaluate(() => !!document.querySelector('#qIntro .qi-go') && getComputedStyle(document.getElementById('qIntro')).zIndex === '9999'));
await p.mouse.click(640, 360);
const at = async (s, name) => { await p.waitForFunction(s => { const a = window.quest.sound().ac; return window.__t0 !== undefined ? a.currentTime - window.__t0 >= s : false; }, s, { timeout: 30000 }); await p.screenshot({ path: `${out}/demo-${name}.png` }); };
await p.evaluate(() => { window.__t0 = window.quest.sound().ac.currentTime + 0.2; });
await at(1.21, '1a-hit'); await at(2.2, '1-this'); await at(3.62, '2a-steel'); await at(4.3, '2b-line'); await at(5.2, '2-changes'); await at(6.3, '3a-gold'); await at(7.4, '3-everything'); await at(8.36, '3b-peak'); await at(8.5, '4a-crumble'); await at(8.7, '4-crumble'); await at(8.9, '4b-crumble'); await at(9.6, '5-reveal');
await p.waitForFunction(() => !document.getElementById('qIntro'), null, { timeout: 15000 });
await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/demo-6-game.png` });
const st = await p.evaluate(() => ({ started: window.quest.S.started, title: document.getElementById('title').hidden, music: window.questMusic && window.questMusic.playing(), look: window.quest.lookOf('demobart') }));
expect('in the game, no title card', st.started && st.title, JSON.stringify(st));
expect('the theme is playing', st.music);
if (demo) expect('demobart is Bart with spiky hair and a pink shirt', st.look && st.look.spiky && st.look.shirt === '#ff6fae');
// walk somewhere
await p.mouse.click(700, 420); await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/demo-7-walking.png` });
// close in on the player
const pos = await p.evaluate(() => { const S = window.quest.S, c = document.getElementById('cv').getBoundingClientRect(); return { x: c.left + S.x / 320 * c.width, y: c.top + (S.y - S.cam) / 180 * c.height }; });
await p.screenshot({ path: `${out}/demo-8-demobart.png`, clip: { x: Math.max(0, pos.x - 90), y: Math.max(0, pos.y - 130), width: 180, height: 160 } });
expect('no page errors', errs.length === 0, errs.join(' | '));
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
