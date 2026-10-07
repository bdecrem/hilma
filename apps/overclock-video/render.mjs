// Renders an act to MP4, or a few stills for checking.
//   node render.mjs --act act-i                          → out/overclock-act-i.mp4 (25 fps, 1920×1080, the track's audio)
//   node render.mjs --act act-i --from 160 --to 180      → a section, for checking
//   node render.mjs --act act-i --stills 3,40,95 --sheet out/sheet.jpg
// The page is served over a local http server (the stills must be same-origin to read pixels).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const act = arg('--act', 'act-i');
const AUDIO = { 'act-i': 'overclock-i', 'act-ii': 'overclock-ii', 'act-iii': 'overclock' };
if (!AUDIO[act]) throw new Error(`--act must be one of ${Object.keys(AUDIO).join(', ')}`);
const audio = path.resolve(dir, '../../scripts/jam/songs/out', AUDIO[act], 'song.wav');
const outDir = path.join(dir, 'out');
mkdirSync(outDir, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.wav': 'audio/wav' };
const server = createServer((req, res) => {
  const file = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(dir) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/index.html?act=${act}&render=1`);
await page.waitForFunction(() => window.READY === true, null, { timeout: 60000 });
const meta = await page.evaluate(() => ({ duration: window.DURATION, fps: window.FPS, onsets: window.ONSETS, gains: window.GAINS }));
const frame = (t) => page.evaluate((t) => { renderAt(t); return document.getElementById('c').toDataURL('image/jpeg', 0.92).split(',')[1]; }, t);

const stills = arg('--stills');
if (stills) {
  const files = [];
  for (const s of stills.split(',').map(Number)) {
    const f = path.join(outDir, `${act}-${s.toFixed(2)}.jpg`);
    writeFileSync(f, Buffer.from(await frame(s), 'base64'));
    files.push(f);
  }
  const sheet = arg('--sheet');
  if (sheet) {
    const cols = Math.min(4, files.length), rows = Math.ceil(files.length / cols), cw = 480, ch = 270;
    const args = ['-v', 'error', '-y'];
    files.forEach((f) => args.push('-i', f));
    const chains = files.map((_, i) => `[${i}:v]scale=${cw}:${ch}[v${i}]`);
    const pad = cols * rows - files.length;
    for (let i = 0; i < pad; i++) chains.push(`color=black:s=${cw}x${ch}:d=1[p${i}]`);
    const inputs = files.map((_, i) => `[v${i}]`).join('') + Array.from({ length: pad }, (_, i) => `[p${i}]`).join('');
    args.push('-filter_complex', `${chains.join(';')};${inputs}xstack=inputs=${cols * rows}:layout=${Array.from({ length: cols * rows }, (_, i) => `${(i % cols) * cw}_${Math.floor(i / cols) * ch}`).join('|')}`, '-frames:v', '1', sheet);
    await new Promise((res) => spawn('ffmpeg', args, { stdio: 'inherit' }).on('close', res));
  }
  console.log(files.length, 'stills', JSON.stringify(meta.onsets), 'gains', JSON.stringify(Object.fromEntries(Object.entries(meta.gains).map(([k, v]) => [k, +v.toFixed(2)]))));
} else {
  const { fps } = meta;
  const from = Number(arg('--from', 0)), to = Number(arg('--to', meta.duration));
  const out = arg('--out', path.join(outDir, `overclock-${act}${from || to < meta.duration ? `-${from}-${to}` : ''}.mp4`));
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-',
    '-ss', String(from), '-t', String(to - from), '-i', audio,
    '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', arg('--crf', '20'), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', out],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  const n = Math.round((to - from) * fps);
  for (let i = 0; i < n; i++) {
    const buf = Buffer.from(await frame(from + i / fps), 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 250 === 0) console.log(`${act} frame ${i}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log(`wrote ${out} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await browser.close();
server.close();
