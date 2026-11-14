// The demo intro's 3D act (public/semibart/intro3d.js) frame by frame, without the game: any moment
// of THIS. / CHANGES. / EVERYTHING. as a PNG, a contact sheet of many, and what a frame costs to draw.
// The timings are read out of public/semibart/intro.js, so the sheet is what the demo page plays.
// Usage: node scripts/semibart/intro-shots.mjs <out-dir> [--times 1.3,2.0,4.4] [--size 1280x720] [--dpr 1]
//          [--cols 4] [--perf] [--module /semibart/intro3d.js] [--name sheet] [--browser webkit]
//   default times: one frame every 0.4 s from 0.4 to the crumble. --perf times 240 frames in a row.
//   --tune '{"sun":0,"bloom":0}' turns layers down to look at one thing (env, sun, rays, flare, haze, bloom, dust, floor).
import { chromium, webkit } from 'playwright';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.argv[2];
if (!out || out.startsWith('--')) { console.error('usage: node scripts/semibart/intro-shots.mjs <out-dir> [--times …] [--size WxH] [--dpr n] [--cols n] [--perf]'); process.exit(1); }
mkdirSync(out, { recursive: true });
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const [W, H] = arg('--size', '1280x720').split('x').map(Number), DPR = Number(arg('--dpr', '1')), COLS = Number(arg('--cols', '4'));
const MODULE = arg('--module', '/semibart/intro3d.js'), NAME = arg('--name', 'sheet'), TUNE = arg('--tune', '{}');
const src = readFileSync(path.join(root, 'public/semibart/intro.js'), 'utf8');
const E = new Function('return ' + src.match(/const E = (\{.*?\});/)[1])();
const times = arg('--times') ? arg('--times').split(',').map(Number) : Array.from({ length: Math.floor((E.CRUMBLE[0] - 0.4) / 0.4) + 1 }, (_, i) => +(0.4 + i * 0.4).toFixed(2));

const THREE = 'https://cdn.jsdelivr.net/npm/three@0.170.0';
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000}canvas{display:block}</style>
<script type="importmap">${JSON.stringify({ imports: { three: `${THREE}/build/three.module.js`, 'three/addons/': `${THREE}/examples/jsm/` } })}</script></head><body>
<script type="module">
const { createIntro3D } = await import(${JSON.stringify(MODULE)});
try { window.ACT = await createIntro3D({ E: ${JSON.stringify(E)}, fontUrl: '/semibart/intro/Anton.ttf', width: ${W}, height: ${H}, pixelRatio: ${DPR}, tune: ${TUNE} }); document.body.appendChild(window.ACT.canvas); window.READY = true; }
catch (e) { window.FAILED = String(e && e.stack || e); }
</script></body></html>`;
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); return; }
  const f = path.join(root, 'public', p);
  if (!f.startsWith(root) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); createReadStream(f).pipe(res);
}).listen(0);
const browser = arg('--browser') === 'webkit' ? await webkit.launch() : await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
await page.goto(`http://localhost:${server.address().port}/`);
await page.waitForFunction(() => window.READY || window.FAILED, null, { timeout: 60000 });
const failed = await page.evaluate(() => window.FAILED);
if (failed) { console.error('the intro did not start:', failed); await browser.close(); server.close(); process.exit(1); }

if (process.argv.includes('--perf')) {
  // 240 frames across the whole act, each one finished on the GPU before the next (a 1-pixel read)
  const r = await page.evaluate(async E => {
    const gl = window.ACT.canvas.getContext('webgl2'), px = new Uint8Array(4), ms = [];
    for (let i = 0; i < 240; i++) { const t = 0.2 + i / 240 * (E.CRUMBLE[0] - 0.25), a = performance.now(); window.ACT.render(t); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ms.push(performance.now() - a); }
    ms.sort((a, b) => a - b); return { mean: ms.reduce((a, b) => a + b) / ms.length, p50: ms[120], p95: ms[228], max: ms[239] };
  }, E);
  console.log(`perf ${W}x${H} @${DPR}: mean ${r.mean.toFixed(1)} ms, median ${r.p50.toFixed(1)}, p95 ${r.p95.toFixed(1)}, worst ${r.max.toFixed(1)}  (16.7 ms is 60 fps)`);
} else {
  const files = [];
  for (const t of times) {
    const b64 = await page.evaluate(t => { window.ACT.render(t); return window.ACT.canvas.toDataURL('image/png').split(',')[1]; }, t);
    const f = path.join(out, `intro-${t.toFixed(2)}.png`); writeFileSync(f, Buffer.from(b64, 'base64')); files.push([t, f]);
  }
  // the sheet: every frame at a third of the width, its time in the corner
  const cols = Math.min(COLS, files.length), rows = Math.ceil(files.length / cols), tw = Math.round(1920 / cols), th = Math.round(tw * H / W);
  const sheet = await page.evaluate(async ({ files, cols, rows, tw, th }) => {
    const c = document.createElement('canvas'); c.width = cols * tw; c.height = rows * th; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < files.length; i++) {
      const img = new Image(); img.src = 'data:image/png;base64,' + files[i][1]; await img.decode();
      const X = (i % cols) * tw, Y = Math.floor(i / cols) * th; x.drawImage(img, X, Y, tw, th);
      x.font = '16px monospace'; x.fillStyle = '#000'; x.fillRect(X, Y, 62, 22); x.fillStyle = '#fff'; x.fillText(files[i][0].toFixed(2), X + 6, Y + 16);
    }
    return c.toDataURL('image/jpeg', 0.92).split(',')[1];
  }, { files: files.map(([t, f]) => [t, readFileSync(f).toString('base64')]), cols, rows, tw, th });
  const sf = path.join(out, `${NAME}.jpg`); writeFileSync(sf, Buffer.from(sheet, 'base64'));
  console.log(`${files.length} frames -> ${out}, sheet ${sf}`);
}
if (errs.length) console.log('page said:\n  ' + [...new Set(errs)].slice(0, 12).join('\n  '));
await browser.close(); server.close();
