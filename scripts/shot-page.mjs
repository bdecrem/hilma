// node scripts/shot-page.mjs <html file> <out dir>: phone + desktop screenshots, prints page errors.
import { chromium } from 'playwright';
const [file, out, json] = process.argv.slice(2);
// optional third argument: a saved Open-Meteo reply, served for every api.open-meteo.com request
import { readFileSync } from 'node:fs';
const b = await chromium.launch();
for (const [n, w, h] of [['phone', 390, 844], ['desktop', 1440, 900]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  if (json) await p.route('https://api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(json, 'utf8') }));
  p.on('pageerror', e => console.log(n, 'PAGE ERROR', e.message));
  p.on('console', m => m.type() === 'error' && console.log(n, 'console', m.text()));
  await p.goto('file://' + file); await p.waitForTimeout(3500);
  await p.screenshot({ path: `${out}/${n}.png` }); await p.close();
}
await b.close();
