// Render a piece's score offline (window.renderOffline) to a WAV.
// usage: node scripts/opus55/render-audio.mjs <page.html> <seconds> <out.wav> [--port 5178]
import { chromium } from 'playwright';
import fs from 'fs';
const argv = process.argv.slice(2);
const pi = argv.indexOf('--port'); const port = pi >= 0 ? argv.splice(pi, 2)[1] : '5178';
const [page, secs, out] = argv;
const b = await chromium.launch(); const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://localhost:${port}/${page}?t=1`); await p.waitForFunction(() => window.__ready);
const b64 = await p.evaluate(s => window.renderOffline(s), +secs);
fs.writeFileSync(out, Buffer.from(b64, 'base64'));
console.log('wrote', out, 'errors:', errs.length ? errs : 'none'); await b.close();
