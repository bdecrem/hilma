// The CASBS Wire widget, driven in the real game with the events API answered locally: open by
// default with the day's lines scrolling, shut by a click on the yellow tab, a count on the tab for
// what arrives while it is shut, open again by a click, and the choice kept across a reload.
// Usage: node scripts/semibart/wire-shots.mjs <out-dir> [base]     (base: http://localhost:3277)
import { chromium } from 'playwright';
const [out, base = 'http://localhost:3277'] = process.argv.slice(2);
const json = body => ({ contentType: 'application/json', body: JSON.stringify(body) });
let failed = 0;
const expect = (name, got, detail = '') => { if (!got) failed++; console.log(`${got ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`); };
const day = [{ id: 1, kind: 'room', actor: 'kevin', room: 'kevin', text: 'Kevin just let three rats loose in Study 27.' }, { id: 2, kind: 'room', actor: 'mikael', room: 'kevin', text: "Kevin's rats are out. Mikael's cat has the desk." }, { id: 3, kind: 'note', actor: 'raul', room: 'kevin', text: "Raul left a note on Kevin's desk." }];
let late = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const errs = [];
async function open() {
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.route('**/api/semibart/me', r => r.fulfill(json({ user: { character: 'alison', name: 'Alison', study: '36', role: 'user', passcodeIsDefault: false } })));
  await p.route('**/api/semibart/rooms', r => r.fulfill(json({ rooms: {} })));
  await p.route('**/api/semibart/desk**', r => r.fulfill(json({ notes: [] })));
  await p.route('**/api/semibart/personas', r => r.fulfill(json({ personas: {} })));
  await p.route('**/api/semibart/events**', r => { const after = Number(new URL(r.request().url()).searchParams.get('after')); r.fulfill(json({ events: after === 0 ? day : late.filter(e => e.id > after) })); });
  await p.goto(base + '/semibart'); await p.waitForFunction(() => window.quest && window.quest.me && window.questTicker);
  await p.evaluate(() => { const q = window.quest, S = q.S; q.start(); setInterval(() => { if (S.line && S.line.t > 0.15) S.line.t = S.line.dur; }, 30); });
  await p.waitForSelector('#tk.on', { timeout: 15000 });
  return p;
}
const state = p => p.evaluate(() => ({ ...window.questTicker.state(), shut: document.getElementById('tk').classList.contains('shut'), badge: document.querySelector('#tk .tk-new').hidden ? '' : document.querySelector('#tk .tk-new').textContent, text: document.querySelector('#tk .tk-run').textContent, strip: Math.round(document.querySelector('#tk .tk-strip').getBoundingClientRect().left), tag: Math.round(document.querySelector('#tk .tk-tag').getBoundingClientRect().right) }));

const p = await open();
await p.waitForTimeout(3500); await p.screenshot({ path: out + '/wire-1-open.png' });
let s = await state(p);
expect('open by default, the day scrolling', s.open && !s.shut && s.running && /Kevin just let three rats/.test(s.text), JSON.stringify(s));
await p.click('#tk .tk-tag'); await p.waitForTimeout(700); await p.screenshot({ path: out + '/wire-2-shut.png' });
s = await state(p);
expect('a click on the tab shuts it: the strip is off to the left, the tab stays', !s.open && s.shut && !s.running && s.strip < 0, JSON.stringify(s));
late = [{ id: 4, kind: 'room', actor: 'kevin', room: 'kevin', text: 'Six rats are back in Study 27, under a NO CATS sign.' }];
await p.evaluate(() => window.questTicker.poll()); await p.waitForTimeout(500); await p.screenshot({ path: out + '/wire-3-shut-one-new.png' });
s = await state(p);
expect('shut, a new line is counted on the tab and not scrolled', s.badge === '1' && !s.running && s.unseen === 1, JSON.stringify(s));
await p.click('#tk .tk-tag'); await p.waitForTimeout(2600); await p.screenshot({ path: out + '/wire-4-open-again.png' });
s = await state(p);
expect('a second click opens it and the new line scrolls', s.open && !s.shut && s.badge === '' && /Six rats are back/.test(s.text), JSON.stringify(s));
await p.click('#tk .tk-tag'); await p.waitForTimeout(300);
const again = await open(); await again.waitForTimeout(600);
s = await state(again);
expect('the choice is kept across a reload', !s.open && s.shut, JSON.stringify(s));
await again.click('#tk .tk-tag'); await again.waitForTimeout(300);
expect('the game did not take the click', await again.evaluate(() => window.quest.S.path.length === 0));
expect('no page errors', errs.length === 0, errs.join(' | '));
await b.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
