// Films CASBS Quest for the trailer, one frame at a time. Every shot is a fresh page against a dev
// server (next dev -p 3277) with the clock frozen (Playwright's page.clock) and every API answered
// here, so nothing is read from or written to the real database. Each 1/30 s the clock moves on
// and the stage is screenshot at 1920x1080. Alongside the frames it logs what the game played: every
// SFX call and every spoken line (who, text) with its frame number, so score.html can play the
// game's own knocks, gobbles and garble voices in time with the picture.
// Usage: node apps/semibart-trailer/capture.mjs [shot,shot,...]     → out/shots/<shot>/00000.jpg + log.json
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || 'http://localhost:3277';
const FPS = 30;
const json = body => ({ contentType: 'application/json', body: JSON.stringify(body) });
const RATS = readFileSync(path.join(dir, 'rats.js'), 'utf8');   // the decorator's real answer to "add ten cute rats" (decorate-try.ts, not saved)
const RATS_SAY = 'Ten rats: six on patrol, one on the sill, one on the desk, one on the shelf, one guarding the plant. Very cute. Very many.';
const ME = { character: 'bart', name: 'Bart', study: '16', role: 'admin', passcodeIsDefault: false };
const EVENTS = [
  { id: 1, kind: 'room', actor: 'bart', room: 'bart', text: 'Bart just let ten cute rats loose in Study 16.' },
  { id: 2, kind: 'note', actor: 'inbal', room: 'mary', text: "Inbal left a note on Mary's desk." },
  { id: 3, kind: 'book', actor: 'kevin', room: 'kevin', text: 'A loose page blew off an oak by the Library.' },
];

const browser = await chromium.launch();

async function openGame({ pages = {}, events = [], wire = false } = {}) {
  const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  if (!wire) await p.addInitScript(() => { try { localStorage.setItem('semibart:wire', 'shut'); } catch (e) {} });
  p.on('pageerror', e => console.log('  page error:', e.message));
  await p.clock.install({ time: new Date('2026-11-13T15:00:00') });
  // routes: the last one registered is tried first, so the catch-all goes in first
  await p.route('**/api/semibart/**', r => r.fulfill(json({})));
  await p.route('**/api/semibart/me', r => r.fulfill(json({ user: ME })));
  await p.route('**/api/semibart/rooms', r => r.fulfill(json({ rooms: {} })));
  await p.route('**/api/semibart/desk**', r => r.fulfill(json({ notes: [] })));
  await p.route('**/api/semibart/events**', r => r.fulfill(json({ events: new URL(r.request().url()).searchParams.get('after') === '0' ? events : [] })));
  await p.route('**/api/semibart/personas', r => r.fulfill(json({ personas: {} })));
  await p.route('**/api/semibart/pages', r => r.request().method() === 'POST' ? r.fulfill(json({ pages: 4, picked: true })) : r.fulfill(json({ pages })));
  await p.route('**/api/semibart/agent', r => r.fulfill(json({ reply: RATS_SAY })));
  await p.goto(BASE + '/semibart');
  await p.addStyleTag({ content: '#fade { transition: none !important; } .sb-who { visibility: hidden; } * { caret-color: transparent; }' });
  await p.clock.runFor(1500);
  // a log of what the game plays: SFX calls by name, and each new spoken line
  await p.evaluate(() => {
    const q = window.quest; window.__log = []; window.__last = null;
    for (const k of Object.keys(q.SFX)) { const f = q.SFX[k]; q.SFX[k] = function (...a) { window.__log.push({ sfx: k, args: a }); return f.apply(this, a); }; }
  });
  return p;
}
const ev = (p, fn, arg) => p.evaluate(fn, arg);
const start = p => ev(p, () => window.quest.start());
const act = (p, name, verb) => ev(p, ([n, v]) => { const q = window.quest, h = q.hot().find(x => x.name === n) || q.hot().find(x => x.name.startsWith(n)) || q.hot().find(x => x.name.includes(n)); if (!h) return 'none: ' + n; q.run(() => q.doAction(v || h.def, h)); return h.name; }, [name, verb]);
const place = (p, o) => ev(p, o => { const S = window.quest.S; Object.assign(S, { path: [], busy: false, seated: false, line: null, camFree: true }, o); }, o);
const idle = async p => { for (let i = 0; i < 600; i++) { if (await ev(p, () => { const S = window.quest.S; return !S.busy && !S.line && !S.path.length; })) return; await p.clock.runFor(100); } };
const skipLines = p => ev(p, () => window.quest.skipLine());

// Records n frames; cues[f] runs before frame f is taken.
async function film(p, name, secs, cues = {}) {
  const out = path.join(dir, 'out/shots', name);
  rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  const n = Math.round(secs * FPS), log = [];
  await ev(p, () => { window.__log.length = 0; window.__last = window.quest.S.line; });
  for (let f = 0; f < n; f++) {
    if (cues[f]) await cues[f]();
    const got = await ev(p, () => {
      const S = window.quest.S, out = window.__log.splice(0);
      if (S.line && S.line !== window.__last) { window.__last = S.line; out.push({ say: S.line.who, text: S.line.text }); }
      if (!S.line) window.__last = null;
      return out;
    });
    got.forEach(e => log.push({ f, ...e }));
    await p.screenshot({ path: path.join(out, String(f).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 93 });
    await p.clock.runFor(1000 / FPS);
  }
  writeFileSync(path.join(out, 'log.json'), JSON.stringify({ fps: FPS, frames: n, log }, null, 1));
  console.log(name, n, 'frames', log.filter(e => e.say).map(e => `${e.f}:${e.say}: ${e.text}`).join(' | '), log.filter(e => e.sfx).map(e => `${e.f}:${e.sfx}`).join(' '));
  await p.close();
}

const SHOTS = {
  // the title card, as it sits waiting: where "EVERYTHING." lands
  async title() { const p = await openGame(); await film(p, 'title', 5); },
  // Start: the jingle, and the first lines
  async start() { const p = await openGame(); await film(p, 'start', 6, { 3: () => start(p) }); },
  // the hill: turkeys
  async turkeys() {
    const p = await openGame(); await start(p); await p.clock.runFor(400); await skipLines(p); await idle(p);
    await place(p, { x: 214, y: 112, cam: 4, face: -1 });
    await film(p, 'turkeys', 5, { 6: () => act(p, 'turkey', 'talk') });
  },
  // walking up to Inbal's door: knock, knock, come in
  async knock() {
    const p = await openGame(); await start(p); await p.clock.runFor(400);
    for (let i = 0; i < 4; i++) { await skipLines(p); await p.clock.runFor(200); } await idle(p);
    const h = await ev(p, () => { const h = window.quest.MAP.find(x => /Inbal/.test(x.name)); return h && { name: h.name, walk: h.walk, r: h.r }; });
    await place(p, { x: h.walk.x - 34, y: h.walk.y, cam: Math.max(0, h.walk.y - 110), camFree: false });
    await film(p, 'knock', 9, { 4: () => act(p, h.name) });
  },
  // the seminar: everybody is in there
  async seminar() {
    const p = await openGame(); await start(p); await p.clock.runFor(400);
    for (let i = 0; i < 4; i++) { await skipLines(p); await p.clock.runFor(200); } await idle(p);
    const h = await ev(p, () => { const h = window.quest.MAP.find(x => x.seminar); return { walk: h.walk }; });
    await place(p, { x: h.walk.x, y: h.walk.y, cam: Math.max(0, h.walk.y - 110) });
    await act(p, 'Margaret Levi');
    for (let i = 0; i < 3; i++) { await p.clock.runFor(300); await skipLines(p); }
    await film(p, 'seminar', 10);
  },
  // the restrooms: the second try flushes
  async flush() {
    const p = await openGame(); await start(p); await p.clock.runFor(400);
    for (let i = 0; i < 4; i++) { await skipLines(p); await p.clock.runFor(200); } await idle(p);
    const h = await ev(p, () => { const h = window.quest.MAP.find(x => x.name === 'Restrooms'); return { walk: h.walk }; });
    await place(p, { x: h.walk.x, y: h.walk.y, cam: Math.max(0, h.walk.y - 100) });
    await act(p, 'Restrooms', 'open'); for (let i = 0; i < 12; i++) { await p.clock.runFor(300); await skipLines(p); } await idle(p);
    await film(p, 'flush', 6, { 2: () => act(p, 'Restrooms', 'open') });
  },
  // a loose leaf falls from an oak; pick it up
  async leaf() {
    const p = await openGame(); await start(p); await p.clock.runFor(400);
    for (let i = 0; i < 4; i++) { await skipLines(p); await p.clock.runFor(200); } await idle(p);
    await ev(p, () => window.questLeaves.dropNow());
    const leaf = await ev(p, () => window.questLeaves.state().leaf);
    await place(p, { x: leaf.x - 40, y: leaf.y + 30, cam: Math.max(0, leaf.y - 80) });
    await ev(p, () => { const S = window.quest.S, q = window.quest; S.cam = Math.max(0, Math.min(q.world.height - 180, S.cam)); });
    await film(p, 'leaf', 7, { 40: () => act(p, 'loose leaf', 'pick') });
  },
  // your own study: ask the Claude on the door frame for ten cute rats, and there they are
  async rats() {
    const p = await openGame(); await start(p); await p.clock.runFor(400);
    for (let i = 0; i < 4; i++) { await skipLines(p); await p.clock.runFor(200); } await idle(p);
    await place(p, { scene: 'room', room: 'bart', x: 96, y: 134, face: -1 });
    await p.clock.runFor(500);
    const ask = 'add ten cute rats', cues = { 4: () => act(p, 'Claude', 'talk') };
    for (let i = 1; i <= ask.length; i++) cues[24 + i * 2] = () => p.fill('.cl-panel input', ask.slice(0, i));
    cues[24 + ask.length * 2 + 12] = () => p.press('.cl-panel input', 'Enter');
    cues[24 + ask.length * 2 + 40] = () => ev(p, code => window.questRooms.setRoom('bart', 2, code), RATS);
    await film(p, 'rats', 10, cues);
  },
  // the wire: what everyone just did, scrolling along the bottom
  async wire() {
    const p = await openGame({ events: EVENTS, wire: true }); await start(p); await p.clock.runFor(400);
    for (let i = 0; i < 4; i++) { await skipLines(p); await p.clock.runFor(200); } await idle(p);
    await ev(p, () => { const S = window.quest.S; S.cam = 220; S.camFree = true; });
    await film(p, 'wire', 6);
  },
};

const want = (process.argv[2] || Object.keys(SHOTS).join(',')).split(',');
for (const k of want) { console.log('shot', k); await SHOTS[k](); }
await browser.close();
