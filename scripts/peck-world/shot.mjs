// Screenshot the Living Island world preview.
// node scripts/peck-world/shot.mjs <out.png> "<query>"   e.g. "mode=full&from=1&to=14&scale=1"
import { chromium } from 'playwright';
import path from 'node:path';
const [out, query = 'mode=full&from=1&to=14'] = process.argv.slice(2);
const page = path.resolve('misc/dodo-redesign/living-island/world/index.html');
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND|Failed to load resource/.test(m.text())) errs.push(m.text()); });
await p.goto('file://' + page + '?' + query);
await p.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
await p.waitForTimeout(300);
if (query.includes('mode=phone')) await p.screenshot({ path: out });
else { const el = await p.$('canvas'); await el.screenshot({ path: out }); }
if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
await browser.close();
console.log('wrote', out);
