// Thumbnails + OG cards for the Opus 5.5 gallery (public/opus55.html).
// Serve public/ first: python3 -m http.server 8765 --directory public
// Then: node scripts/opus55/gallery-shots.mjs
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
const base = process.argv[2] || 'http://localhost:8765';
const tmp = mkdtempSync(tmpdir() + '/opus55-');
const b = await chromium.launch();
const errs = [];
// Video triptychs: three frames side by side (thumb 1062×630; OG 1200×630, the last three on black).
const frame = async (v, t, h) => {
  const p = await b.newPage({ viewport: { width: Math.round(h * 9 / 16), height: h } });
  p.on('pageerror', e => errs.push(v + ': ' + e));
  await p.goto(`${base}/${v}/index.html?t=${t}`); await p.waitForFunction(() => window.READY, null, { timeout: 20000 });
  const f = `${tmp}/${v}-${t}-${h}.png`; await p.screenshot({ path: f }); await p.close(); return f;
};
const tile = (files, out, w, h) => {
  const args = files.flatMap(f => ['-i', f]);
  const n = files.length, fc = files.map((_, i) => `[${i}]scale=-2:${h}[v${i}]`).join(';') + ';' + files.map((_, i) => `[v${i}]`).join('') + `hstack=inputs=${n},pad=${w}:${h}:(ow-iw)/2:0:black`;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args, '-filter_complex', fc, '-q:v', '3', out]);
};
for (const [v, ts] of [['strangers', [8, 20, 26, 29]], ['peck-trailer', [5, 23, 26, 29]]]) {
  const fs = []; for (const t of ts) fs.push(await frame(v, t, 630));
  tile(fs.slice(0, 3), `public/opus55/${v}.jpg`, 1062, 630);
  tile(fs.slice(1), `public/${v}/og.png`, 1200, 630);
}
// The doodles page OG (after the drawing animation finishes).
{
  const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  p.on('pageerror', e => errs.push('doodles: ' + e));
  await p.goto(`${base}/onething-doodles.html`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3600);
  await p.screenshot({ path: 'public/onething-doodles-og.png' }); await p.close();
}
// The gallery's own OG card: its first rows.
{
  const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  p.on('pageerror', e => errs.push('gallery: ' + e));
  await p.goto(`${base}/opus55.html`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  await p.screenshot({ path: 'public/opus55/og.png' }); await p.close();
}
await b.close();
console.log('errors:', errs.length ? errs : 'none');
