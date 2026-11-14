// The chaos at the seminar's question mic, through the real page, as the check account (an admin
// that owns no study; SEMIBART_CHECK_NAME / SEMIBART_CHECK_PASS in .env.local).
// Part one plays hand-written scenes that use every move in flamewar.js (no Claude call) and shoots
// each as a sheet of frames: <out>/<scene>.png. Part two (unless --no-live) clicks the mic like a
// player, presses "Stir up some stuff for me" (one Claude call, kept off the wire), plays what comes
// back, and checks the mic refuses a second grab and that leaving puts the room back.
// Usage: set -a; source ./.env.local; set +a
//        node scripts/semibart/chaos-check.mjs <out-dir> [base] [--no-live] [--only paper,coffee]
//        (base: http://localhost:3277)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const args = process.argv.slice(2), flag = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const noLive = args.includes('--no-live'); if (noLive) args.splice(args.indexOf('--no-live'), 1);
const only = flag('--only')?.split(',');
const [out, base = 'http://localhost:3277'] = args;
const NAME = process.env.SEMIBART_CHECK_NAME, PASS = process.env.SEMIBART_CHECK_PASS;
if (!out || !NAME || !PASS) { console.error('usage: node scripts/semibart/chaos-check.mjs <out-dir> [base] [--no-live] [--only a,b], with SEMIBART_CHECK_NAME / SEMIBART_CHECK_PASS set'); process.exit(1); }
mkdirSync(out, { recursive: true });

// The first seminar (S.sem.v = 0): garance presents; salman, lawrence, milena, kevin, daniel sit.
const L = (who, text) => ({ who, text }), D = (act, who, style) => ({ act, ...(who ? { who } : {}), ...(style ? { style } : {}) });
const SCENES = {
  paper: [L('garance', 'Bold.'), L('kevin', 'In 1984, yes.'), D('throw', 'salman'), D('storm', 'salman'), L('garance', 'Slide two.')],
  coffee: [D('slam', 'milena'), D('spill', 'lawrence'), L('daniel', 'My notes.'), D('faint', 'kevin'), L('kevin', 'I am fine down here.')],
  table: [D('jump', 'daniel'), L('daniel', 'Hear me out.'), D('music', null, 'disco'), D('dance'), L('garance', 'Slide two.')],
  alarm: [D('rise', 'milena'), D('alarm'), L('milena', 'This is fine.'), D('storm', 'garance')],
  turkey: [D('freeze'), D('turkey'), L('turkey', 'Gobble.'), L('daniel', 'Best question all year.'), D('music', null, 'polka'), D('dance'), D('conga'), L('you', 'Was it something I said?')],
  lights: [D('lights', 'kevin'), L('kevin', 'As I was saying.'), D('clap', 'salman'), D('spin', 'lawrence'), D('music', null, 'tango'), D('dance')],
};

let fails = 0;
const expect = (what, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ' (' + detail + ')' : ''}`); };
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push(m.text()); });
await p.goto(base + '/semibart');
const login = await p.evaluate(async ({ name, passcode }) => (await fetch('/api/semibart/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, passcode }) })).status, { name: NAME, passcode: PASS });
expect('the check account signs in', login === 200, 'status ' + login);
await p.reload(); await p.waitForFunction(() => window.quest && window.quest.me && window.questFlamewar);
await p.evaluate(() => window.quest.start()); await p.waitForTimeout(1200);
// Lines go by fast: each is cut short once it has been on screen a moment.
await p.evaluate(() => { const S = window.quest.S; setInterval(() => { if (S.line && S.line.t > 0.7) S.line.t = S.line.dur; }, 40); });

const enter = () => p.evaluate(() => { const S = window.quest.S; S.scene = 'room'; S.room = 'seminar'; S.x = 236; S.y = 134; S.face = -1; S.path = []; S.busy = false; S.line = null; });
// leaving the room, the way leaveSeminar does it, but staying on the same week's cast
async function leave() {
  await p.evaluate(() => { window.quest.S.scene = 'map'; });
  await p.waitForTimeout(700);
  await p.evaluate(() => { const S = window.quest.S; S.sem.gone.clear(); S.sem.lift = {}; S.sem.presX = undefined; S.sem.pose = {}; S.sem.at = {}; S.sem.wild = false; });
}
function sheet(files, dest) {
  const n = files.length, cols = 3;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...files.flatMap(f => ['-i', f]), '-filter_complex',
    `${files.map((_, i) => `[${i}:v]scale=640:-1:flags=neighbor[v${i}]`).join(';')};${files.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${n}:layout=${files.map((_, i) => `${(i % cols) * 640}_${Math.floor(i / cols) * 360}`).join('|')}:fill=black`, dest]);
}

for (const [name, script] of Object.entries(SCENES)) {
  if (only && !only.includes(name)) continue;
  await enter(); await p.waitForTimeout(500);
  await p.evaluate(s => { const f = window.questFlamewar; f.take(); window.quest.S.sem.wild = true; window.__chaos = 'playing'; f.play(s).then(() => { window.__chaos = 'done'; }, e => { window.__chaos = 'error: ' + e.message; }); }, script);
  const files = []; const t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    const f = `${out}/${name}-${String(files.length).padStart(2, '0')}.png`;
    await p.screenshot({ path: f }); files.push(f);
    if (await p.evaluate(() => window.__chaos !== 'playing')) break;
    await p.waitForTimeout(650);
  }
  const st = await p.evaluate(() => ({ chaos: window.__chaos, gone: [...window.quest.S.sem.gone], bodies: Object.values(window.questFlamewar.B()).map(b => `${b.k}:${b.mode}`) }));
  expect(`${name}: plays to the end`, st.chaos === 'done', `${st.chaos}; ${st.bodies.join(' ')}${st.gone.length ? '; gone ' + st.gone.join(',') : ''}`);
  const pick = files.length <= 9 ? files : Array.from({ length: 9 }, (_, i) => files[Math.round(i * (files.length - 1) / 8)]);
  sheet(pick, `${out}/${name}.png`);
  await leave();
  expect(`${name}: leaving puts the room back`, await p.evaluate(() => !Object.keys(window.questFlamewar.B()).length && !Object.keys(window.quest.S.sem.pose).length));
}

if (!noLive) {
  await enter(); await p.waitForTimeout(600);
  const h = await p.evaluate(() => window.quest.hot().find(x => x.name === 'microphone'));
  expect('live: the mic is in the room', !!h);
  const box = await p.locator('#cv').boundingBox();
  await p.mouse.click(box.x + (h.r[0] + h.r[2] / 2) / 320 * box.width, box.y + (h.r[1] + 38) / 162 * box.height);
  await p.waitForSelector('.fw-panel', { timeout: 15000 });
  await p.click('.fw-stir');
  const t0 = Date.now(), lines = [], files = [];
  while (Date.now() - t0 < 150000) {
    const st = await p.evaluate(() => ({ busy: window.questFlamewar.fw.busy, wild: window.quest.S.sem.wild, line: window.quest.S.line && [window.quest.S.line.who, window.quest.S.line.text] }));
    if (st.line && (!lines.length || lines[lines.length - 1][1] !== st.line[1])) lines.push(st.line);
    if (st.wild && files.length < 30) { const f = `${out}/live-${String(files.length).padStart(2, '0')}.png`; await p.screenshot({ path: f }); files.push(f); }
    if (!st.busy) break;
    await p.waitForTimeout(500);
  }
  console.log(`  live: ${((Date.now() - t0) / 1000).toFixed(0)}s`); lines.forEach(l => console.log(`    ${l[0].padEnd(10)} ${l[1]}`));
  expect('live: the scene played to the end', await p.evaluate(() => window.questFlamewar.fw.done));
  if (files.length) sheet(files.length <= 9 ? files : Array.from({ length: 9 }, (_, i) => files[Math.round(i * (files.length - 1) / 8)]), `${out}/live.png`);
  await p.evaluate(() => { window.quest.S.line = null; });
  await p.evaluate(() => window.quest.run(() => window.questFlamewar.grabMic()));
  expect('live: the mic will not start a second one', await p.evaluate(() => !document.querySelector('.fw-panel')));
  await leave();
  expect('live: away from the room the mic is reset', await p.evaluate(() => !window.questFlamewar.fw.done));
}
await b.close();
expect('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
