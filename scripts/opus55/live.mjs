// Play a piece for real in a phone viewport: tap to start, check the audio clock
// is running and driving the picture, measure frame rate, collect errors.
// usage: node scripts/opus55/live.mjs <page.html> <outdir> [--port 5178]
import { chromium, devices } from 'playwright';
import fs from 'fs';
const argv = process.argv.slice(2);
const pi = argv.indexOf('--port'); const port = pi >= 0 ? argv.splice(pi, 2)[1] : '5178';
const [page, out] = argv; fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ ...devices['iPhone 13'] });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://localhost:${port}/${page}`); await p.waitForFunction(() => window.__ready);
await p.screenshot({ path: `${out}/phone-cover.png` });
await p.locator('canvas').tap(); await p.waitForTimeout(4000);
const st = await p.evaluate(() => ({ state: AC.state, t: +audioTime().toFixed(2) }));
await p.screenshot({ path: `${out}/phone-live.png` });
const fps = await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(Math.round(n / 2)); })(); }));
console.log({ ...st, fps }, 'errors:', errs.length ? errs : 'none');
if (st.state !== 'running' || st.t < 3) { console.error('FAIL: audio clock not advancing'); process.exitCode = 1; }
await b.close();
