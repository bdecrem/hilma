// Shots of the layout mockups (public/semibart/mockups/). Serve public/ first:
//   (cd public && python3 -m http.server 3471)
// Usage: node scripts/semibart/mockup-shots.mjs <out-dir> [pages|glide|both] [--art]
//   --art also shoots each area bare (no overlays) for checking the drawing.
import { chromium } from 'playwright';
const out = process.argv[2], which = process.argv[3] || 'both', art = process.argv.includes('--art');
const base = process.env.BASE || 'http://localhost:3471/semibart/mockups/';
const b = await chromium.launch();
const errs = [];
const page = async (file, w = 1280, h = 720) => {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', e => errs.push(file + ': ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(file + ': ' + m.text()); });
  await p.goto(base + file); await p.waitForTimeout(900);
  return p;
};
const bare = p => p.addStyleTag({ content: '.ui,#stamp,#mock,#line,#label,#trail,#card,#names,.edge,#arrows{display:none!important}' });

if (which !== 'glide') {
  const p = await page('pages.html');
  await p.screenshot({ path: out + '/a0-title.png' });
  await p.click('#startBtn'); await p.waitForTimeout(700);
  await p.screenshot({ path: out + '/a1-heart-stamp.png' });
  await p.waitForTimeout(3600);
  await p.screenshot({ path: out + '/a2-heart.png' });
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(600);
  await p.screenshot({ path: out + '/a3-slide.png' });
  await p.waitForTimeout(900);
  await p.screenshot({ path: out + '/a4-green-stamp.png' });
  for (let i = 2; i < 5; i++) { await p.evaluate(j => window.mock.jump(j), i); await p.waitForTimeout(1400); await p.screenshot({ path: `${out}/a5-page${i}.png` }); }
  await p.hover('#dots button:nth-child(2)'); await p.waitForTimeout(200);
  await p.screenshot({ path: out + '/a6-dot-hover.png' });
  if (art) {
    await bare(p);
    for (let i = 0; i < 5; i++) { await p.evaluate(j => window.mock.jump(j), i); await p.waitForTimeout(1000); await p.screenshot({ path: `${out}/art${i}.png` }); }
  }
  const ph = await page('pages.html', 390, 844);
  await ph.screenshot({ path: out + '/a7-phone.png' });
  await ph.close(); await p.close();
}
if (which !== 'pages') {
  const p = await page('glide.html');
  await p.screenshot({ path: out + '/b0-title.png' });
  await p.click('#startBtn'); await p.waitForTimeout(1200);
  await p.screenshot({ path: out + '/b1-heart.png' });
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(450);
  await p.screenshot({ path: out + '/b2-moving.png' });
  await p.waitForTimeout(1600);
  await p.screenshot({ path: out + '/b3-green.png' });
  await p.mouse.move(640, 360); await p.mouse.wheel(0, 260); await p.waitForTimeout(120);
  await p.screenshot({ path: out + '/b4-scrolling.png' });
  await p.waitForTimeout(1600);
  await p.screenshot({ path: out + '/b5-settled.png' });
  for (let i = 2; i < 5; i++) { await p.evaluate(j => window.mock.travel(j), i); await p.waitForTimeout(2400); await p.screenshot({ path: `${out}/b6-stop${i}.png` }); }
  const ph = await page('glide.html', 390, 844);
  await ph.screenshot({ path: out + '/b7-phone.png' });
  await ph.close(); await p.close();
}
if (process.argv.includes('--og')) { // the share images, 1200x630 out of a 1200x675 stage
  const dir = 'public/semibart/mockups/', clip = { x: 0, y: 22, width: 1200, height: 630 };
  const pa = await page('pages.html', 1200, 675);
  await pa.click('#startBtn'); await pa.evaluate(() => { window.mock.S.line = null; window.mock.jump(1); }); await pa.waitForTimeout(1500);
  await pa.evaluate(() => { window.mock.S.line = null; });
  await pa.screenshot({ path: dir + 'og-pages.png', clip }); await pa.close();
  const gl = await page('glide.html', 1200, 675);
  await gl.click('#startBtn'); await gl.waitForTimeout(1000); // past the opening line's timer
  await gl.evaluate(() => { const S = window.mock.S; S.line = null; S.mode = 'free'; S.idle = 1e9; S.cam = 176; });
  await gl.waitForTimeout(400);
  await gl.evaluate(() => { window.mock.S.line = null; });
  await gl.screenshot({ path: dir + 'og-glide.png', clip }); await gl.close();
}
if (process.argv.includes('--index')) {
  const ix = await page('index.html', 1280, 900);
  await ix.screenshot({ path: out + '/index.png', fullPage: true }); await ix.close();
  const ixp = await page('index.html', 390, 844);
  await ixp.screenshot({ path: out + '/index-phone.png', fullPage: true }); await ixp.close();
}
console.log('errors', errs);
await b.close();
