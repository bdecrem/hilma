/*
 * Mac Plus screen mock — pixel-exact geometry for the Macinclaude Code window.
 *
 * Screen 512x342. Menu bar 20. Window content rect = (0,40)-(512,340) (winfull.inc:
 * top+40, bottom-2). Transcript TE viewRect = content + (4,4)-(-4, H-32-2).
 * Monaco 9: 6px advance, 11px line height  ->  504/6 = 84 cols, 262/11 = 23 lines.
 *
* Usage (from the hilma root, playwright is a repo dep):
 *   node apps/macplus/tools/plus-screen-mock.mjs [--sheet sheet.png] a.json a.png [b.json b.png ...]
 * Each JSON is { lines: [...] } - the transcript, top-down, as the Plus will show it.
 *   banner.json = { lines: ["...", ...] }
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const sheet = args[0] === '--sheet' ? args.splice(0, 2)[1] : null;
const jobs = [];
for (let i = 0; i + 1 < args.length; i += 2) jobs.push([args[i], args[i + 1]]);
function pageHtml(lines) {

const html = `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:#888} canvas{display:block}</style>
<canvas id=c width=512 height=342></canvas>
<script>
const L = ${JSON.stringify(lines)};
const c = document.getElementById('c'), x = c.getContext('2d');
x.imageSmoothingEnabled = false;
x.fillStyle = '#fff'; x.fillRect(0,0,512,342);
x.fillStyle = '#000';

// ---- menu bar (20px) with hairline ----
x.font = '12px Chicago, "Charcoal CY", Geneva, sans-serif';
x.fillText('File   Edit   Connection   Claude', 30, 14);
x.fillRect(0,19,512,1);
// apple
x.beginPath(); x.arc(14,10,5,0,7); x.fill();

// ---- window frame: title bar 40-19=21px tall above content ----
// content starts y=40; title bar occupies ~y=19..40
x.strokeStyle='#000'; x.lineWidth=1;
x.strokeRect(0.5, 19.5, 511, 320);
for (let y = 23; y < 38; y += 2) { x.fillRect(1, y, 510, 1); }   // classic stripes
// title plate
x.fillStyle='#fff'; x.fillRect(180, 20, 152, 18);
x.fillStyle='#000';
x.font='12px Chicago, Geneva, sans-serif';
const t='Macinclaude Code'; const tw=x.measureText(t).width;
x.fillText(t, 256-tw/2, 34);
// close box
x.fillStyle='#fff'; x.fillRect(8,24,11,11); x.fillStyle='#000'; x.strokeRect(8.5,24.5,10,10);
// zoom box
x.fillStyle='#fff'; x.fillRect(493,24,11,11); x.fillStyle='#000'; x.strokeRect(493.5,24.5,10,10);
x.strokeRect(495.5,26.5,6,6);

// ---- transcript ----
const CX = 4, CY = 40 + 4, CELL = 6, LH = 11;
x.font = '9px Monaco, monospace';
x.textBaseline = 'alphabetic';
for (let r = 0; r < L.length && r < 23; r++) {
  const s = L[r];
  for (let i = 0; i < s.length && i < 84; i++) {
    const ch = s[i];
    if (ch === ' ') continue;
    x.fillText(ch, CX + i * CELL, CY + r * LH + 8);
  }
}

// ---- input strip ----
const WH = 300, sepY = 40 + WH - 32;
x.fillRect(4, sepY, 504, 1);
x.fillText('>', 4, sepY + 16);
x.fillRect(20, sepY + 8, 1, 10);   // caret

// ---- binarize to 1-bit ----
const img = x.getImageData(0,0,512,342), d = img.data;
for (let i = 0; i < d.length; i += 4) {
  const v = (d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114) < 150 ? 0 : 255;
  d[i]=d[i+1]=d[i+2]=v; d[i+3]=255;
}
x.putImageData(img,0,0);
window.__done = true;
</script>`;
return html;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 512, height: 342 }, deviceScaleFactor: 1 });
{ const warm = await ctx.newPage();
  await warm.setContent('<div style="font:9px Monaco">warm</div>');
  await warm.evaluate(() => document.fonts.load('9px Monaco'));
  await warm.waitForTimeout(500); await warm.close(); }
const outs = [];
for (const [src, out] of jobs) {
  const { lines } = JSON.parse(readFileSync(src, 'utf8'));
  const p = await ctx.newPage();
  await p.evaluate(() => document.fonts.load('9px Monaco'));
  await p.setContent(pageHtml(lines));
  await p.waitForFunction(() => window.__done === true);
  await p.waitForTimeout(150);
  await p.locator('#c').screenshot({ path: out });
  await p.close();
  outs.push(out);
  console.log('wrote', out);
}
const page = await ctx.newPage();
if (sheet) {
  // tile the rendered PNGs 2-up into one contact sheet, 8px gutters, 1:1 pixels
  const b64 = outs.map((o) => 'data:image/png;base64,' + readFileSync(o).toString('base64'));
  const cols = 2, rows = Math.ceil(outs.length / cols), G = 8;
  const W = cols * 512 + (cols + 1) * G, H = rows * 342 + (rows + 1) * G;
  await page.setViewportSize({ width: W, height: H });
  await page.setContent(`<style>body{margin:0;background:#444}</style><canvas id=s width=${W} height=${H}></canvas>`);
  await page.evaluate(async ({ b64, cols, G }) => {
    const c = document.getElementById('s'), x = c.getContext('2d');
    x.fillStyle = '#444'; x.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < b64.length; i++) {
      const im = new Image(); im.src = b64[i]; await im.decode();
      x.drawImage(im, G + (i % cols) * (512 + G), G + Math.floor(i / cols) * (342 + G));
    }
  }, { b64, cols, G });
  await page.locator('#s').screenshot({ path: sheet });
  console.log('sheet', sheet);
}
await browser.close();
