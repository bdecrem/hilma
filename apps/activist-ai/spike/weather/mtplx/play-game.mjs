// play-game.mjs <url or html file> <out dir> [seconds]: plays the Paper Boat game the way a person would (OLA-441).
// Run from the repo root (it needs playwright): on a phone-size touch screen it taps to start, drags a finger
// left and right for [seconds] (default 30), taps again after each game over; then on a desktop it starts
// with Space and steers with the arrow keys. It reads window.game {state, score}, which the brief asks for,
// and prints one JSON line per screen: page errors, runs played, best score, frames a second, what was missing.
import { chromium, devices } from 'playwright';
import { resolve } from 'node:path';
const [target, out, secs = '30'] = process.argv.slice(2);
const url = /^https?:/.test(target) ? target : 'file://' + resolve(target);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch();
const game = p => p.evaluate(() => (window.game ? { state: window.game.state, score: Number(window.game.score) } : null));
const fps = p => p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : r(Math.round(n / 2)); }; requestAnimationFrame(f); }));

async function phone() {
  const ctx = await b.newContext({ ...devices['iPhone 14'] });
  const p = await ctx.newPage(); const errs = []; const notes = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push('console: ' + m.text()));
  await p.goto(url); await sleep(1500);
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const tap = async (x, y) => { await touch('touchStart', x, y); await sleep(60); await touch('touchEnd'); };
  const { width: W, height: H } = p.viewportSize();
  let g = await game(p);
  if (!g) notes.push('window.game missing'); else if (g.state !== 'start') notes.push('first state is ' + g.state);
  await p.screenshot({ path: `${out}/phone-start.png` });
  await tap(W / 2, H / 2); await sleep(700);
  g = await game(p); if (g && g.state !== 'playing') notes.push('a tap did not start it (state ' + g.state + ')');
  let runs = 1, best = 0, x = W / 2, shotPlay = false, shotOver = false, longest = 0, runStart = Date.now();
  const end = Date.now() + secs * 1000;
  await touch('touchStart', x, H * 0.7);
  while (Date.now() < end) {
    x = Math.max(30, Math.min(W - 30, x + (Math.random() - 0.5) * 180));
    await touch('touchMove', x, H * 0.7); await sleep(240);
    g = await game(p); if (!g) continue;
    best = Math.max(best, g.score || 0);
    if (g.state === 'playing' && !shotPlay && Date.now() - runStart > 4000) { await p.screenshot({ path: `${out}/phone-play.png` }); shotPlay = true; }
    if (g.state === 'over') {
      longest = Math.max(longest, Date.now() - runStart);
      if (!shotOver) { await p.screenshot({ path: `${out}/phone-over.png` }); shotOver = true; }
      await touch('touchEnd'); await sleep(900); await tap(W / 2, H / 2); await sleep(500);
      const g2 = await game(p); if (g2 && g2.state !== 'playing') notes.push('a tap did not restart it (state ' + g2.state + ')');
      runs++; runStart = Date.now(); await touch('touchStart', x, H * 0.7);
    }
  }
  longest = Math.max(longest, Date.now() - runStart);
  await touch('touchEnd');
  const f = await fps(p);
  const theme = await p.evaluate(() => document.querySelector('meta[name=theme-color]')?.content || null);
  console.log(JSON.stringify({ screen: 'phone 390', errors: errs.slice(0, 4), runs, bestScore: best, longestRunS: Math.round(longest / 1000), fps: f, themeColor: theme, notes }));
  await ctx.close();
}

async function desktop() {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); const errs = []; const notes = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(url); await sleep(1200);
  await p.screenshot({ path: `${out}/desktop-start.png` });
  await p.keyboard.press('Space'); await sleep(600);
  let g = await game(p); if (g && g.state !== 'playing') notes.push('Space did not start it (state ' + g.state + ')');
  let best = 0, shot = false; const end = Date.now() + 12000; let left = true;
  while (Date.now() < end) {
    const k = left ? 'ArrowLeft' : 'ArrowRight'; left = !left;
    await p.keyboard.down(k); await sleep(200 + Math.random() * 350); await p.keyboard.up(k);
    g = await game(p); if (!g) continue; best = Math.max(best, g.score || 0);
    if (g.state === 'playing' && !shot && Date.now() > end - 8000) { await p.screenshot({ path: `${out}/desktop-play.png` }); shot = true; }
    if (g.state === 'over') { await sleep(800); await p.keyboard.press('Space'); await sleep(400); }
  }
  g = await game(p);
  if (g && g.state === 'playing') { await p.keyboard.press('p'); await sleep(300); const g2 = await game(p); if (g2.state !== 'paused') notes.push('P did not pause (state ' + g2.state + ')'); else { await p.keyboard.press('p'); await sleep(300); const g3 = await game(p); if (g3.state !== 'playing') notes.push('P did not resume (state ' + g3.state + ')'); } }
  console.log(JSON.stringify({ screen: 'desktop 1440', errors: errs.slice(0, 4), bestScore: best, fps: await fps(p), notes }));
  await ctx.close();
}
await phone(); await desktop(); await b.close();
