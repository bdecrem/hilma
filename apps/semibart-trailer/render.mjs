// Builds the trailer: the score (score.js, offline WebAudio) and the picture (scene.js), both read
// edit.mjs; the footage and the game's own sound events come from capture.mjs (out/shots).
//   node apps/semibart-trailer/render.mjs                       → out/casbs-quest-trailer.mp4 (1920x1080, 30 fps)
//   node apps/semibart-trailer/render.mjs --stills 1.3,6.2,8.6  [--sheet out/s.jpg]
//   node apps/semibart-trailer/render.mjs --score               → out/score.wav only
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from './edit.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(dir, '../..'), out = path.join(dir, 'out');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(root) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); createReadStream(f).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}/apps/semibart-trailer/`;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

// the game's sounds under the footage: every logged event inside a segment, at its time in the edit
function events() {
  const evs = [];
  for (const [a, b, shot, f0] of E.SEGMENTS) {
    const { log } = JSON.parse(readFileSync(path.join(out, 'shots', shot, 'log.json'), 'utf8')), f1 = f0 + Math.round((b - a) * E.FPS);
    for (const e of log) if (e.f >= f0 && e.f < f1) evs.push({ ...e, t: a + (e.f - f0) / E.FPS, until: b });
  }
  return evs;
}

async function score() {
  const p = await browser.newPage(); p.on('pageerror', e => { console.error('score error:', e.message); process.exitCode = 1; });
  await p.goto(base + 'score.html'); await p.waitForFunction(() => window.READY);
  const cfg = { ...Object.fromEntries(Object.entries(E)), events: events() };
  const t0 = Date.now(), r = await p.evaluate(c => renderScore(c), cfg);
  const f = path.join(out, 'score.wav'); writeFileSync(f, Buffer.from(r.wav, 'base64'));
  console.log(`score: ${cfg.events.length} game sounds, peak ${r.peak.toFixed(2)}, ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${f}`);
  await p.close(); return f;
}

const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => { console.error('page error:', e.message); process.exitCode = 1; });
const frame = t => page.evaluate(async t => { await window.renderAt(t); return document.getElementById('c').toDataURL('image/jpeg', 0.95).split(',')[1]; }, t);

if (process.argv.includes('--score')) await score();
else if (arg('--stills')) {
  await page.goto(base + 'index.html'); await page.waitForFunction(() => window.READY);
  const files = [];
  for (const s of arg('--stills').split(',').map(Number)) { const f = path.join(out, `still-${s.toFixed(2)}.jpg`); writeFileSync(f, Buffer.from(await frame(s), 'base64')); files.push(f); }
  const sheet = arg('--sheet');
  if (sheet) {
    const cols = Math.min(4, files.length), rows = Math.ceil(files.length / cols), args = ['-v', 'error', '-y'];
    files.forEach(f => args.push('-i', f));
    const pad = cols * rows - files.length, chains = files.map((_, i) => `[${i}:v]scale=480:270[v${i}]`);
    for (let i = 0; i < pad; i++) chains.push(`color=black:s=480x270:d=1[p${i}]`);
    const ins = files.map((_, i) => `[v${i}]`).join('') + Array.from({ length: pad }, (_, i) => `[p${i}]`).join('');
    args.push('-filter_complex', `${chains.join(';')};${ins}xstack=inputs=${cols * rows}:layout=${Array.from({ length: cols * rows }, (_, i) => `${(i % cols) * 480}_${Math.floor(i / cols) * 270}`).join('|')}`, '-frames:v', '1', sheet);
    await new Promise(r => spawn('ffmpeg', args, { stdio: 'inherit' }).on('close', r));
  }
  console.log(files.length, 'stills');
} else {
  const wav = await score();
  await page.goto(base + 'index.html'); await page.waitForFunction(() => window.READY);
  const f = arg('--out') || path.join(out, 'casbs-quest-trailer.mp4'), n = Math.round(E.DUR * E.FPS);
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(E.FPS), '-i', '-', '-i', wav,
    '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', f], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const buf = Buffer.from(await frame(i / E.FPS), 'base64');
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`frame ${i}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  console.log('wrote', f);
}
await browser.close(); server.close();
