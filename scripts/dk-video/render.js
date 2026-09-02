const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const P = JSON.parse(fs.readFileSync('plan.json'));
const FPS = P.fps, DT = 1000 / FPS;
const segs = []; let v = 0; for (const s of P.segments) { segs.push({ ...s, v0: v, v1: v + s.dur }); v += s.dur; }
const TOTAL = v; const NF = Math.round(TOTAL * FPS);
const [A, B1, B2, C] = segs;
const morph2v0 = C.v0 - 0.093, morph2v1 = C.v0 + 1.507;   // w3 crosses the 0.01 draw gate exactly on the red clay downbeat; orbits dissolve over the next ~1.4s
const m1a = A.v1 - P.morph1.before, m1b = A.v1 + P.morph1.after;          // morph A->B1 window
function srcAt(vt) { for (const s of segs) if (vt < s.v1 || s === C) return s.src + (vt - s.v0); }
function wtAt(vt) {
  const T1 = P.T1, T2 = P.T2;
  if (vt < m1a) return srcAt(vt);
  if (vt < A.v1) return (T1 - 7) + 7 * (vt - m1a) / P.morph1.before;
  if (vt < m1b) return T1 + 7 * (vt - A.v1) / P.morph1.after;
  if (vt < morph2v0) return (T1 + 7) + (vt - m1b);
  if (vt < morph2v1) return (T2 - 7) + 14 * (vt - morph2v0) / (morph2v1 - morph2v0);
  return (T2 + 7) + (vt - morph2v1);
}
function m2tAt(vt) { return Math.max(0, vt - A.v1); }
console.log('segments', segs.map(s => `${s.name} v${s.v0.toFixed(4)}-${s.v1.toFixed(4)} src ${s.src}`).join(' | '));
console.log('total', TOTAL.toFixed(4), 'frames', NF, 'morph1', m1a.toFixed(3), '-', m1b.toFixed(3), 'morph2', morph2v0.toFixed(3), '-', morph2v1.toFixed(3));
(async () => {
  fs.mkdirSync('frames', { recursive: true }); for (const f of fs.readdirSync('frames')) fs.unlinkSync(path.join('frames', f));
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu-vsync', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: P.W, height: P.H }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('PAGE ERROR', e.message));
  await page.goto('file://' + path.resolve('harness.html'));
  await page.waitForFunction(() => typeof window.__frame === 'function');
  let now = 1000;
  await page.evaluate((n) => { audio.paused = false; window.__setLast(n); }, now - DT);
  const step = (t, wt, m2t) => { now += DT; return page.evaluate(([t, wt, m2t, now]) => { audio.currentTime = t; window.__wt = wt; window.__m2t = m2t; window.__frame(now); }, [t, wt, m2t, now]); };
  // Phase 0: lattice pre-warm (red clay only) ending at the state C needs when the brake morph begins
  const t0 = Date.now();
  const latEnd = C.src;   // lattice resumes scrolling at the drop
  for (let i = 0; i < P.latticeWarm * FPS; i++) await step(latEnd - P.latticeWarm + i / FPS, P.T2 + 60, 0);
  await page.evaluate(() => window.__reset());
  console.log('lattice warm done', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  // Phase 1: interceptor warm-up
  for (let i = 0; i < P.aWarm * FPS; i++) { const t = A.src - P.aWarm + i / FPS; await step(t, t, 0); }
  console.log('A warm done');
  // Captured run
  for (let i = 0; i < NF; i++) {
    const vt = i / FPS;
    await step(srcAt(vt), wtAt(vt), m2tAt(vt));
    await page.screenshot({ path: `frames/${String(i).padStart(5, '0')}.png`, type: 'png', animations: 'disabled', caret: 'hide' });
    if (i % 300 === 0) { const d = await page.evaluate(() => window.__dk.debug()); console.log(`frame ${i} v=${vt.toFixed(2)} src=${srcAt(vt).toFixed(2)} wt=${wtAt(vt).toFixed(1)} w=[${d.w.map(x=>x.toFixed(2))}] rings=${d.rings} bells=${d.bells} debris=${d.debris} ${((Date.now()-t0)/1000).toFixed(0)}s`); }
  }
  await browser.close();
  console.log('DONE', NF, 'frames in', ((Date.now() - t0) / 1000).toFixed(1) + 's');
})().catch(e => { console.error('FAILED', e); process.exit(1); });
