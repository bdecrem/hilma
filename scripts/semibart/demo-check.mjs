// The demo page (ola.cx/semibart/demo.html) in a real browser, signed in as the demo account:
// the prompt, the 3D words, the crumble, the reveal into the game with no title card, demobart walking
// with spiky hair in pink, and the theme playing. Screenshots at each beat into <out-dir>.
// Usage: SEMIBART_DEMO_PASS=… node scripts/semibart/demo-check.mjs <out-dir> [base]   (base: http://localhost:3277)
import { chromium } from 'playwright';
const [out, base = 'http://localhost:3277'] = process.argv.slice(2);
const pass = process.env.SEMIBART_DEMO_PASS;
if (!out || !pass) { console.error('usage: SEMIBART_DEMO_PASS=… node scripts/semibart/demo-check.mjs <out-dir> [base]'); process.exit(1); }
let failed = 0;
const expect = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`); };
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
const login = await p.request.post(base + '/api/semibart/login', { data: { name: 'demobart', passcode: pass } });
expect('the demo account signs in', login.ok(), String(login.status()));
await p.goto(base + '/semibart/demo.html');
await p.waitForFunction(() => window.quest && window.quest.me !== undefined, null, { timeout: 30000 });
expect('signed in as demobart, an admin', await p.evaluate(() => window.quest.me && window.quest.me.character === 'demobart' && window.quest.me.role === 'admin'));
await p.waitForTimeout(800); await p.screenshot({ path: `${out}/demo-0-prompt.png` });
expect('the prompt covers the page', await p.evaluate(() => !!document.querySelector('#qIntro .qi-go') && getComputedStyle(document.getElementById('qIntro')).zIndex === '9999'));
await p.mouse.click(640, 360);
const at = async (s, name) => { await p.waitForFunction(s => { const a = window.quest.sound().ac; return window.__t0 !== undefined ? a.currentTime - window.__t0 >= s : false; }, s, { timeout: 30000 }); await p.screenshot({ path: `${out}/demo-${name}.png` }); };
await p.evaluate(() => { window.__t0 = window.quest.sound().ac.currentTime + 0.2; });
await at(1.6, '1-this'); await at(4.2, '2-changes'); await at(7.4, '3-everything'); await at(8.7, '4-crumble'); await at(9.6, '5-reveal');
await p.waitForFunction(() => !document.getElementById('qIntro'), null, { timeout: 15000 });
await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/demo-6-game.png` });
const st = await p.evaluate(() => ({ started: window.quest.S.started, title: document.getElementById('title').hidden, music: window.questMusic && window.questMusic.playing(), look: window.quest.lookOf('demobart') }));
expect('in the game, no title card', st.started && st.title, JSON.stringify(st));
expect('the theme is playing', st.music);
expect('demobart is Bart with spiky hair and a pink shirt', st.look && st.look.spiky && st.look.shirt === '#ff6fae');
// walk somewhere
await p.mouse.click(700, 420); await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/demo-7-walking.png` });
// close in on the player
const pos = await p.evaluate(() => { const S = window.quest.S, c = document.getElementById('cv').getBoundingClientRect(); return { x: c.left + S.x / 320 * c.width, y: c.top + (S.y - S.cam) / 180 * c.height }; });
await p.screenshot({ path: `${out}/demo-8-demobart.png`, clip: { x: Math.max(0, pos.x - 90), y: Math.max(0, pos.y - 130), width: 180, height: 160 } });
expect('no page errors', errs.length === 0, errs.join(' | '));
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
