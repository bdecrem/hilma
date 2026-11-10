// Shoots public/semibart/og.png and two check frames. Serve public/ first: (cd public && python3 -m http.server 3471)
// Usage: node scripts/semibart/shots.mjs <out-dir>
import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 675 } });
const errs=[]; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:3471/semibart/index.html'); await p.waitForTimeout(1500);
await p.evaluate(() => document.querySelector('.start').style.animation='none');
await p.screenshot({ path: 'public/semibart/og.png', clip: { x: 0, y: 22, width: 1200, height: 630 } });
await p.click('#title'); await p.waitForTimeout(3000);
await p.screenshot({ path: out + '/play.png' });
const p2 = await b.newPage({ viewport: { width: 390, height: 844 } });
await p2.goto('http://localhost:3471/semibart/index.html'); await p2.waitForTimeout(1000);
await p2.screenshot({ path: out + '/phone.png' });
console.log('errors', errs);
await b.close();
