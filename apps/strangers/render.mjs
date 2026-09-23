// Renders the edit to MP4, or a few stills for checking.
//   node render.mjs                         → out/strangers.mp4 (30 fps, 1080×1920, with the song)
//   node render.mjs --stills 4,9.6,22 [--sheet out/sheet.jpg]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const outDir = path.join(dir, 'out');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
await page.goto('file://' + path.join(dir, 'index.html') + '?render=1');
await page.waitForFunction(() => window.READY === true, null, { timeout: 30000 });
const frame = (t, type = 'image/jpeg') => page.evaluate(([t, type]) => {
  renderAt(t);
  return document.getElementById('c').toDataURL(type, 0.96).split(',')[1];
}, [t, type]);

const stills = arg('--stills');
if (stills) {
  const files = [];
  for (const s of stills.split(',').map(Number)) {
    const f = path.join(outDir, `still-${s.toFixed(2)}.jpg`);
    writeFileSync(f, Buffer.from(await frame(s), 'base64'));
    files.push(f);
  }
  const sheet = arg('--sheet');
  if (sheet) {
    const cols = Math.min(6, files.length), rows = Math.ceil(files.length / cols);
    const args = ['-v', 'error', '-y'];
    files.forEach((f) => args.push('-i', f));
    const chains = files.map((_, i) => `[${i}:v]scale=270:480[v${i}]`);
    const pad = cols * rows - files.length;
    for (let i = 0; i < pad; i++) chains.push(`color=black:s=270x480:d=1[p${i}]`);
    const inputs = files.map((_, i) => `[v${i}]`).join('') + Array.from({ length: pad }, (_, i) => `[p${i}]`).join('');
    args.push('-filter_complex', `${chains.join(';')};${inputs}xstack=inputs=${cols * rows}:layout=${Array.from({ length: cols * rows }, (_, i) => `${(i % cols) * 270}_${Math.floor(i / cols) * 480}`).join('|')}`, '-frames:v', '1', sheet);
    await new Promise((res) => spawn('ffmpeg', args, { stdio: 'inherit' }).on('close', res));
  }
  console.log(files.length, 'stills');
} else {
  const fps = 30, dur = 30, from = Number(arg('--from', 0)), to = Number(arg('--to', dur));
  const out = arg('--out', path.join(outDir, 'strangers.mp4'));
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-',
    '-ss', String(from), '-t', String(to - from), '-i', path.join(dir, 'audio/clip.wav'),
    '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '256k', '-af', `afade=t=out:st=${to - from - 0.35}:d=0.35`, '-shortest', '-movflags', '+faststart', out],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  const n = Math.round((to - from) * fps);
  for (let i = 0; i < n; i++) {
    const buf = Buffer.from(await frame(from + i / fps), 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 60 === 0) console.log(`frame ${i}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('wrote', out);
}
await browser.close();
