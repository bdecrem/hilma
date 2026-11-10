import { webkit } from 'playwright';
const out = process.argv[2];
const b = await webkit.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('https://ola.cx/semibart?v=' + Date.now()); await p.waitForTimeout(1500);
await p.keyboard.press('Enter'); await p.waitForTimeout(6000);
await p.screenshot({ path: out + '/a.png' }); await p.waitForTimeout(1200); await p.screenshot({ path: out + '/b.png' });
console.log('calm', await p.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'errors', errs);
await b.close();
