// What the demo intro sounds like, in numbers: plays ola.cx/semibart/demo.html in a browser (signed out is
// enough), taps everything on its way to the speakers, and prints the loudness a quarter second at a time from
// the click to the jingle, with the peak. For checking a change to the score in public/semibart/intro.js
// without ears: a new sound should show up in its own quarter seconds and nothing should reach 0 dB.
// Usage: node scripts/semibart/intro-listen.mjs [base]   (base: http://localhost:3277)
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:3277';
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 960, height: 540 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => {
  // every node that connects to the speakers also feeds a recorder
  const connect = AudioNode.prototype.connect; window.__rec = [];
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (dest instanceof AudioDestinationNode) { const ac = dest.context;
      if (!ac.__tap) { ac.__tap = ac.createScriptProcessor(2048, 2, 1); ac.__tap.onaudioprocess = e => { const l = e.inputBuffer.getChannelData(0), r = e.inputBuffer.getChannelData(1), m = new Float32Array(l.length); for (let i = 0; i < l.length; i++) m[i] = Math.max(Math.abs(l[i]), Math.abs(r[i])) * Math.sign(l[i] || r[i] || 1); window.__rec.push([e.playbackTime, m]); };
        const quiet = ac.createGain(); quiet.gain.value = 0; connect.call(ac.__tap, quiet); connect.call(quiet, dest); window.__sr = ac.sampleRate; }
      connect.call(this, ac.__tap); }
    return connect.call(this, dest, ...rest);
  };
});
await p.goto(base + '/semibart/demo.html');
await p.waitForFunction(() => !!window.quest && !!document.querySelector("#qIntro canvas"), null, { timeout: 60000, polling: 250 });
await p.waitForTimeout(800);
await p.mouse.click(480, 270);
await p.evaluate(() => { window.__t0 = window.quest.sound().ac.currentTime + 0.2; });
await p.waitForTimeout(10500);
const rows = await p.evaluate(() => { const sr = window.__sr, q = 0.25, n = 40, sum = new Float64Array(n), cnt = new Float64Array(n), peak = new Float64Array(n);
  for (const [at, m] of window.__rec) for (let i = 0; i < m.length; i++) { const k = Math.floor((at + i / sr - window.__t0) / q); if (k < 0 || k >= n) continue; sum[k] += m[i] * m[i]; cnt[k]++; peak[k] = Math.max(peak[k], Math.abs(m[i])); }
  return Array.from({ length: n }, (_, k) => [k * q, cnt[k] ? Math.sqrt(sum[k] / cnt[k]) : 0, peak[k]]); });
const db = v => v > 1e-5 ? (20 * Math.log10(v)).toFixed(1).padStart(6) : '  -inf';
let top = 0;
for (const [t, rms, pk] of rows) { top = Math.max(top, pk); console.log(`${t.toFixed(2).padStart(5)} s  rms ${db(rms)} dB  peak ${db(pk)} dB  ${'#'.repeat(Math.max(0, Math.round((20 * Math.log10(rms + 1e-5) + 60) / 2)))}`); }
console.log(`peak ${db(top)} dB${top >= 0.999 ? '  CLIPPED' : ''}`);
if (errs.length) console.log('page errors:', errs.join(' | '));
await b.close();
process.exit(top >= 0.999 || errs.length ? 1 : 0);
