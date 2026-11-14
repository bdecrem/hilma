// The seminar's question mic, through the real page, API and Claude, as the check account (an
// admin that owns no study; SEMIBART_CHECK_NAME / SEMIBART_CHECK_PASS in .env.local). Twice: once
// typing a comment, once pressing "Stir up some stuff for me". Each run is one Claude call; the
// check account's flame wars stay off the wire. Screenshots go to <out>; a sheet of the second run too.
// Usage: set -a; source ./.env.local; set +a
//        node scripts/semibart/flamewar-check.mjs <out-dir> [base]     (base: http://localhost:3277)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
const [out, base = 'http://localhost:3277'] = process.argv.slice(2);
const NAME = process.env.SEMIBART_CHECK_NAME, PASS = process.env.SEMIBART_CHECK_PASS;
if (!out || !NAME || !PASS) { console.error('usage: node scripts/semibart/flamewar-check.mjs <out-dir> [base], with SEMIBART_CHECK_NAME / SEMIBART_CHECK_PASS set'); process.exit(1); }

let fails = 0;
const expect = (what, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ' (' + detail + ')' : ''}`); };
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(base + '/semibart');
const login = await p.evaluate(async ({ name, passcode }) => (await fetch('/api/semibart/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, passcode }) })).status, { name: NAME, passcode: PASS });
expect('the check account signs in', login === 200, 'status ' + login);
await p.reload(); await p.waitForFunction(() => window.quest && window.quest.me && window.questFlamewar);
await p.evaluate(() => window.quest.start()); await p.waitForTimeout(1200);

const enter = () => p.evaluate(() => { const S = window.quest.S; S.scene = 'room'; S.room = 'seminar'; S.x = 120; S.y = 134; S.face = 1; S.path = []; S.busy = false; S.line = null; });
const mic = () => p.evaluate(() => window.quest.hot().find(h => h.name === 'microphone'));
// Lines go by fast: every line is cut short once it has been on screen a moment.
await p.evaluate(() => { const S = window.quest.S; setInterval(() => { if (S.line && S.line.t > 0.6) S.line.t = S.line.dur; }, 40); });

async function show(ask, name) {
  await enter(); await p.waitForTimeout(600);
  const h = await mic();
  expect(`${name}: the mic is in the room`, !!h, h ? h.r.join(',') : '');
  // click it, the way a player does
  const box = await p.locator('#cv').boundingBox();
  await p.mouse.click(box.x + (h.r[0] + h.r[2] / 2) / 320 * box.width, box.y + (h.r[1] + 20 + 18) / 162 * box.height);
  await p.waitForSelector('.fw-panel', { timeout: 15000 });
  expect(`${name}: the line opens with the stir button`, await p.locator('.fw-stir').isVisible());
  await p.screenshot({ path: `${out}/${name}-0-panel.png` });
  if (ask) { await p.fill('.fw-panel input', ask); await p.keyboard.press('Enter'); } else await p.click('.fw-stir');
  expect(`${name}: the line closes`, await p.waitForSelector('.fw-panel', { state: 'detached', timeout: 5000 }).then(() => true, () => false));
  const t0 = Date.now(), shots = [], lines = [];
  let k = 0;
  while (Date.now() - t0 < 180000) {
    const st = await p.evaluate(() => ({ busy: window.questFlamewar.fw.busy, done: window.questFlamewar.fw.done, line: window.quest.S.line && [window.quest.S.line.who, window.quest.S.line.text], heat: window.questFlamewar.fw.heat, gone: [...window.quest.S.sem.gone] }));
    if (st.line && (!lines.length || lines[lines.length - 1][1] !== st.line[1])) lines.push(st.line);
    if (st.heat > 0 && k < 5 && st.heat >= k * 0.22) { const f = `${out}/${name}-${++k}.png`; await p.screenshot({ path: f }); shots.push(f); }
    if (!st.busy) break;
    await p.waitForTimeout(150);
  }
  const end = await p.evaluate(() => ({ done: window.questFlamewar.fw.done, gone: [...window.quest.S.sem.gone], presenter: window.quest.seminar.presenter().k, spots: window.quest.hot().map(h => h.name) }));
  const f = `${out}/${name}-end.png`; await p.screenshot({ path: f }); shots.push(f);
  console.log(`  ${name}: ${((Date.now() - t0) / 1000).toFixed(0)}s, ${lines.length} lines seen`); lines.forEach(l => console.log(`    ${l[0].padEnd(10)} ${l[1]}`));
  expect(`${name}: the scene played to the end`, end.done);
  expect(`${name}: someone stormed out and their hotspot went with them`, end.gone.length === 1 && !end.spots.includes(end.gone[0]), end.gone.join(','));
  // a second grab of the mic in the same seminar is refused, kindly
  await p.evaluate(() => { window.quest.S.line = null; });
  await p.evaluate(() => window.quest.run(() => window.questFlamewar.grabMic()));
  expect(`${name}: the mic will not start a second one`, await p.evaluate(() => !document.querySelector('.fw-panel')));
  // leaving brings next week's seminar, with everyone back
  await p.evaluate(() => { const S = window.quest.S; S.sem.gone.clear(); S.sem.lift = {}; S.sem.presX = undefined; S.sem.v++; S.scene = 'map'; });
  await p.waitForTimeout(700);
  expect(`${name}: away from the room the mic is reset`, await p.evaluate(() => !window.questFlamewar.fw.done));
  return shots;
}

await show('the footnotes are the real book', 'typed');
const shots = await show('', 'stir');
await b.close();
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...shots.slice(-6).flatMap(f => ['-i', f]), '-filter_complex', `${shots.slice(-6).map((_, i) => `[${i}:v]scale=640:-1:flags=neighbor[v${i}]`).join(';')};${shots.slice(-6).map((_, i) => `[v${i}]`).join('')}xstack=inputs=${shots.slice(-6).length}:layout=0_0|w0_0|0_h0|w0_h0|0_h0+h1|w0_h0+h1`, `${out}/flamewar-sheet.png`]);
expect('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
