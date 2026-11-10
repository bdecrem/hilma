// Knocks on Eli's door (study 14) six times and prints every line he says.
// Serve public/ first: (cd public && python3 -m http.server 3471). Usage: node scripts/semibart/eli.mjs <out-dir>
import { chromium } from 'playwright';
const out = process.argv[2], base = process.env.BASE || 'http://localhost:3471/semibart/index.html';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(base); await p.waitForTimeout(800); await p.click('#startBtn'); await p.waitForTimeout(300);
await p.evaluate(() => { const S = window.quest.S; S.line = null; S.busy = false; });
for (let k = 0; k < 6; k++) {
  await p.evaluate(() => { const q = window.quest; q.run(() => q.doAction('open', q.MAP.find(h => h.name === 'Study 14'))); });
  let last = null, shot = false;
  for (let i = 0; i < 200; i++) {
    await p.waitForTimeout(150);
    const st = await p.evaluate(() => { const S = window.quest.S; return { busy: S.busy, line: S.line && S.line.who + ': ' + S.line.text }; });
    if (st.line && st.line !== last) { console.log(k + 1, st.line); last = st.line; if (!shot && st.line.startsWith('eli')) { await p.screenshot({ path: out + `/eli${k + 1}.png` }); shot = true; } }
    if (!st.busy && !st.line && last) break;
  }
}
console.log('errors', errs);
await b.close();
