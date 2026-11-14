// Every study in one look: walks into each room in turn (Bart's and every fellow's, with the rooms'
// live decorations and notes as the server has them) and puts them on one contact sheet, each labelled
// with its key. For changes that touch every room (the message boards, 2026-11-13).
// Usage: node scripts/semibart/study-sheet.mjs <out-dir> [base] [--only daniel,inbal] [--cols 6]
//   base defaults to http://localhost:3277. Writes <out>/<key>.png per room and <out>/studies.png.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const args = process.argv.slice(2), flag = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const only = flag('--only'), cols = Number(flag('--cols') || 6);
const [out, base = 'http://localhost:3277'] = args;
if (!out) { console.error('usage: node scripts/semibart/study-sheet.mjs <out-dir> [base] [--only a,b] [--cols n]'); process.exit(1); }
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(base + '/semibart'); await p.waitForTimeout(1500);
await p.evaluate(() => window.quest.start());
await p.addStyleTag({ content: '#title, #fade { display: none !important; }' });   // signed out the sign-in card stays up; the rooms are what we want
await p.evaluate(() => { const S = window.quest.S; setInterval(() => { S.line = null; S.busy = false; }, 50); });
await p.waitForTimeout(1500);
const keys = only ? only.split(',') : await p.evaluate(() => ['bart'].concat(Object.keys(window.quest.PEOPLE)));
const files = [];
for (const k of keys) {
  await p.evaluate(k => { const S = window.quest.S; S.scene = 'room'; S.room = k; S.x = 316; S.y = 140; S.face = 0; S.path = []; }, k);
  await p.waitForTimeout(900);
  const f = `${out}/${k}.png`;
  await p.locator('#cv').screenshot({ path: f }); files.push([k, f]);
}
// the sheet, made in the page (this ffmpeg has no drawtext): each room at 320 x 180, its key in the corner
const { readFileSync, writeFileSync } = await import('node:fs');
const sheet = await p.evaluate(async ({ files, cols }) => {
  const rows = Math.ceil(files.length / cols), c = document.createElement('canvas'); c.width = cols * 320; c.height = rows * 180;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < files.length; i++) {
    const img = new Image(); img.src = 'data:image/png;base64,' + files[i][1]; await img.decode();
    const X = (i % cols) * 320, Y = Math.floor(i / cols) * 180; x.drawImage(img, X, Y, 320, 180);
    x.fillStyle = 'rgba(0,0,0,0.7)'; x.fillRect(X, Y, 86, 15); x.fillStyle = '#fff'; x.font = '11px monospace'; x.fillText(files[i][0], X + 4, Y + 11);
  }
  return c.toDataURL('image/png').split(',')[1];
}, { files: files.map(([k, f]) => [k, readFileSync(f).toString('base64')]), cols });
writeFileSync(`${out}/studies.png`, Buffer.from(sheet, 'base64'));
await b.close();
console.log(`${files.length} studies -> ${out}/studies.png${errs.length ? '\npage errors: ' + [...new Set(errs)].join(' | ') : ''}`);
