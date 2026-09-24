// Render still frames of a piece via its ?t= hook, then tile them into one sheet.
// usage: node scripts/opus55/stills.mjs <page.html> <outdir> <t1> <t2> ... [--port 5178] [--width 1000]
// Needs the static server: python3 -m http.server 5178 -d public
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import fs from 'fs';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const port = opt('--port', '5178'), width = +opt('--width', '1000');
const [page, out, ...times] = argv;
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width, height: Math.round(width * .95) }, deviceScaleFactor: 1 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const files = [];
for (const t of times.map(Number)) {
  await p.goto(`http://localhost:${port}/${page}?t=${t}`);
  await p.waitForFunction(() => window.__ready); await p.waitForTimeout(120);
  const f = `${out}/t${t.toFixed(2).padStart(5, '0')}.png`;
  await p.locator('canvas').screenshot({ path: f }); files.push(f);
}
await b.close();
execFileSync('python3', [new URL('./grid.py', import.meta.url).pathname, `${out}/sheet.png`, ...files], { stdio: 'inherit' });
console.log('errors:', errs.length ? [...new Set(errs)] : 'none');
