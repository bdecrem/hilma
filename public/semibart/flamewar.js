/* CASBS Quest, the question mic at the seminar (2026-11-13). Rides on the game through window.quest.
   - A floor mic stands in the Margaret Levi Meeting Room, between the end of the table and the
     presenter. Click it: the mic goes live, the speakers squeal, and a line opens along the bottom.
     Type a comment (it is never a question), or press "Stir up some stuff for me" and the room
     picks its own fight.
   - The server (src/lib/semibart/flamewar.ts, POST /api/semibart/flamewar) writes the whole scene
     in one Claude call; this file plays it: the six people tear into it in character, rise out of
     their seats, steam, papers fly, and the presenter (or, when you are the presenter, someone at
     the table) storms out through the door. The wire gets a line about it.
   - The game's side is a few hooks in index.html: HOOKS.seminarMid / seminarFront / seminarSpots,
     S.sem.gone (who has left), S.sem.lift (who is half out of their seat), S.sem.presX (the
     presenter, walking), and quest.seminar (who is in the room and what the talk is about).
   Loaded by notes.js. */
(() => {
'use strict';
const q = window.quest;
if (!q || !q.hooks || !q.hooks.seminarMid || !q.seminar || window.questFlamewar) return;
const G = q.gfx, g = G.g, S = q.S, R = (x, y, w, h, c) => G.rect(g, x, y, w, h, c);
const stage = document.getElementById('stage');
const INK = '#141414';
const me = () => (q.me && q.me.character) || '';
const fw = { live: false, busy: false, done: false, papers: [], steam: [], heat: 0, speaking: null };

/* ---------- the mic: a floor stand, 13 wide, base on the floor at y 128 ---------- */
const MX = 256;   // the pole
q.hooks.seminarMid.push(t => {
  const calm = G.calm;
  R(MX - 9, 129, 21, 1, 'rgba(20,20,20,0.25)');
  R(MX - 7, 127, 15, 2, INK); R(MX - 6, 127, 13, 1, '#3b3d4a');   // the base
  for (let i = 0; i < 26; i++) R(MX + 8 + i, 128 + (i % 9 < 4 ? 0 : 1), 1, 1, INK);   // the cable, off to the wall
  R(MX, 95, 2, 32, INK); R(MX, 95, 1, 32, '#5a5d6b');   // the pole
  R(MX - 1, 98, 4, 3, INK);   // the clamp
  R(MX - 2, 91, 6, 7, INK); R(MX - 1, 92, 4, 5, '#8a8c99'); R(MX - 1, 92, 4, 1, '#c4c6cf'); R(MX, 94, 1, 1, '#5a5d6b'); R(MX + 2, 95, 1, 1, '#5a5d6b');   // the head
  const on = fw.live && (calm || Math.floor(t * 2.5) % 4 !== 0);
  R(MX, 99, 2, 1, on ? '#ff3b2f' : '#3b1612');
  if (fw.live && !calm) { const k = Math.floor(t * 6) % 3; R(MX + 5 + k * 2, 89 - k, 1, 1, 'rgba(255,255,255,0.7)'); R(MX - 5 - k * 2, 89 - k, 1, 1, 'rgba(255,255,255,0.7)'); }
});
// Generous on purpose: the stand is thin, so the whole of it, the base and the cable on the floor
// all answer, well past the pixels.
const MIC_ON = { look: 'The question mic. Nobody has asked a question at it since 2009.', use: () => grabMic(), talk: () => grabMic(), open: () => grabMic() };
q.hooks.seminarSpots.push(() => [
  { name: 'microphone', r: [MX - 11, 82, 23, 52], walk: { x: MX - 12, y: 134 }, def: 'use', on: MIC_ON },
  { name: 'microphone', r: [MX + 12, 124, 26, 9], walk: { x: MX - 12, y: 134 }, def: 'use', on: MIC_ON },
]);

/* ---------- the heat: people half out of their seats, steam, papers in the air ---------- */
const seatOf = k => { const a = q.seminar.seats().find(s => s.k === k); return a ? { x: a.x + 14, y: 62 - (S.sem.lift[k] || 0) } : null; };
const headOf = k => {
  if (k === q.seminar.presenter().k) return S.sem.gone.has(k) ? null : { x: q.seminar.presenter().x + 14, y: 36 };
  return S.sem.gone.has(k) ? null : seatOf(k);
};
q.hooks.seminarFront.push(t => {
  const calm = G.calm;
  // steam over whoever is talking, once it is hot
  if (fw.speaking && fw.heat > 0.4 && !calm && Math.random() < 0.5 + fw.heat * 0.5) {
    const h = headOf(fw.speaking); if (h) fw.steam.push({ x: h.x + (Math.random() < 0.5 ? -13 : 10) + Math.round(Math.random() * 3), y: h.y + 6, t0: t });
  }
  fw.steam = fw.steam.filter(p => t - p.t0 < 1.2);
  fw.steam.forEach(p => {   // a puff that grows as it rises and thins out
    const a = t - p.t0, s = 2 + Math.floor(a * 4), x = p.x + Math.round(Math.sin(a * 5 + p.x) * 2), y = p.y - Math.round(a * 20), al = (0.9 * (1 - a / 1.2)).toFixed(2);
    R(x, y, s, s, `rgba(255,255,255,${al})`); R(x - 1, y + 1, s + 2, Math.max(1, s - 2), `rgba(255,255,255,${al})`);
  });
  // papers off the table, once it is very hot
  if (fw.heat > 0.65 && !calm && fw.papers.length < 16 && Math.random() < 0.08 + fw.heat * 0.1) {
    const from = q.seminar.seats().filter(a => !S.sem.gone.has(a.k))[Math.floor(Math.random() * 5)];
    if (from) fw.papers.push({ x: from.x + 8 + Math.random() * 12, y: 90, vx: (Math.random() - 0.5) * 70, vy: -50 - Math.random() * 40, t: t, flip: 0 });
  }
  fw.papers.forEach(p => {
    const dt = Math.min(0.05, t - p.t); p.t = t;
    p.vy += 60 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.flip += dt * 8;
    if (p.y > 136) { p.y = 136; p.vx = 0; p.vy = 0; }
    const w = Math.floor(p.flip) % 2 ? 5 : 3;
    R(Math.round(p.x) - 1, Math.round(p.y) - 1, w + 2, 6, INK); R(Math.round(p.x), Math.round(p.y), w, 4, '#fff7e6');
  });
});

/* ---------- the line along the bottom: a comment, or stir it up ---------- */
const css = document.createElement('style');
css.textContent = `
.fw-panel { --h: max(36px, 4.4cqw); position: absolute; left: 0; right: 0; bottom: 0; height: var(--h); z-index: 6; background: rgba(8, 7, 5, 0.92); border-top: 0.3cqw solid #ff3b2f; color: #fff7e6; }
.fw-panel form { display: flex; align-items: stretch; height: 100%; }
.fw-gt { flex: none; display: grid; place-items: center; width: var(--h); color: #ff3b2f; font-size: 2.4cqw; line-height: 1; }
.fw-panel input { flex: 1; min-width: 0; font: inherit; font-size: max(16px, 2.8cqw); padding: 0; background: none; color: #fff7e6; border: 0; outline: none; border-radius: 0; caret-color: #ff3b2f; }
.fw-panel input::placeholder { color: #7d766a; }
.fw-stir { flex: none; margin: 0.5cqw 0; padding: 0 1.6cqw; background: var(--hot); color: #000; font-size: max(13px, 2.1cqw); letter-spacing: 0.06em; text-transform: uppercase; box-shadow: 0.3cqw 0.3cqw 0 #8a7a1e; }
.fw-stir:hover, .fw-stir:focus-visible { background: #fff; outline: none; }
.fw-x { flex: none; padding: 0 1.6cqw; color: #7d766a; font-size: max(13px, 2.1cqw); letter-spacing: 0.08em; }
.fw-x:hover, .fw-x:focus-visible { color: var(--hot); outline: none; }
`;
document.head.appendChild(css);
// What the empty line suggests, one each time it opens.
const TRY = ['the book is dead', 'nobody reads past the abstract', 'peer review is hazing', 'all of this is just economics', 'tenure is a vibe', 'the footnotes are the real book', 'pickleball is a cult'];
let tries = Math.floor(Math.random() * TRY.length), panel = null, panelDone = null;
function closePanel(v) {
  if (!panel) return;
  panel.remove(); panel = null;
  const d = panelDone; panelDone = null; if (d) d(v || null);
  const cv = document.getElementById('cv'); cv.focus && cv.focus();
}
function askComment() {
  panel = document.createElement('div'); panel.className = 'fw-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'The question mic');
  panel.innerHTML = '<form><span class="fw-gt" aria-hidden="true">&#9679;</span><input type="text" maxlength="280" autocomplete="off" spellcheck="false" aria-label="Your comment. It is not a question."><button class="fw-stir" type="button">Stir up some stuff for me</button><button class="fw-x" type="button" aria-label="Put the mic down">esc</button></form>';
  stage.appendChild(panel);
  ['pointerdown', 'pointerup', 'click', 'contextmenu', 'keyup', 'wheel', 'mousemove'].forEach(ev => panel.addEventListener(ev, e => e.stopPropagation()));
  const inp = panel.querySelector('input');
  inp.placeholder = TRY[tries++ % TRY.length];
  panel.querySelector('form').addEventListener('submit', e => { e.preventDefault(); const v = inp.value.trim(); if (v) closePanel({ comment: v }); });
  panel.querySelector('.fw-stir').addEventListener('click', () => closePanel({ comment: '' }));
  panel.querySelector('.fw-x').addEventListener('click', () => closePanel(null));
  panel.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closePanel(null); });
  setTimeout(() => inp.focus(), 30);
  return new Promise(res => { panelDone = res; });
}
q.hooks.keyBlock.push(e => { if (!panel) return false; if (e.key === 'Escape') closePanel(null); return true; });
setInterval(() => { if (panel && (S.scene !== 'room' || S.room !== 'seminar')) closePanel(null); }, 300);
// Leaving the room puts everything back for next week's seminar.
setInterval(() => { if ((S.scene !== 'room' || S.room !== 'seminar') && (fw.done || fw.papers.length)) { fw.done = false; fw.papers = []; fw.steam = []; fw.heat = 0; fw.live = false; } }, 500);

/* ---------- the show ---------- */
const WAITING = ['Oh no.', 'Here we go.', 'Is this a question?', 'It is never a question.', 'I have a flight at six.', 'Let them finish.', 'This will be in my book.', 'Someone note the time.'];
const present = () => q.seminar.cast().filter(k => k !== me() && !S.sem.gone.has(k));
async function walkOut(k) {
  const pr = q.seminar.presenter();
  q.SFX.step && q.SFX.step();
  if (k === pr.k) {
    let x = pr.x;
    while (x > 14) { x -= G.calm ? 40 : 4; S.sem.presX = Math.max(14, x); if (Math.round(x) % 12 < 4 && q.SFX.step) q.SFX.step(true); await q.wait(0.05); }
  } else {
    S.sem.lift[k] = 10; await q.wait(0.25); q.SFX.swoosh && q.SFX.swoosh();
  }
  q.SFX.creak && q.SFX.creak();
  S.sem.gone.add(k); S.sem.presX = undefined; delete S.sem.lift[k];
  await q.wait(0.35);
  q.SFX.slam && q.SFX.slam();
}
async function grabMic() {
  if (fw.busy) return;
  if (S.sem.gone.size || fw.done) { await q.say('you', "I think I've said enough for one seminar."); return; }
  if (!q.me) { await q.say('you', 'I should sign in before I start anything.'); return; }
  fw.busy = true;
  try {
    S.face = -1;
    fw.live = true; q.SFX.squeal && q.SFX.squeal();
    const pr = q.seminar.presenter();
    if (pr.k !== me()) await q.say(pr.k, 'Questions at the end, please.');
    const ask = await askComment();
    if (!ask) { fw.live = false; await q.say('you', 'Never mind.'); return; }
    const cast = q.seminar.cast();
    await q.say('you', "It's more of a comment than a question.");
    let res = null;
    const call = fetch('/api/semibart/flamewar', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comment: ask.comment, cast, topic: q.seminar.topic() }) })
      .then(r => r.json().catch(() => ({ ok: false }))).catch(() => ({ ok: false })).then(d => { res = d; });
    // the room murmurs while the scene is written
    let w = Math.floor(Math.random() * WAITING.length);
    const t0 = performance.now();
    while (!res && performance.now() - t0 < 120000) {
      const who = present().filter(k => k !== pr.k);
      await q.say(who[w % who.length] || 'you', WAITING[w++ % WAITING.length]);
      if (!res) await Promise.race([call, q.wait(0.9)]);
    }
    if (!res || !res.ok || !Array.isArray(res.script)) {
      fw.live = false;
      await q.say('you', (res && typeof res.say === 'string' && res.say) || 'The mic cut out. Everyone looks relieved.');
      return;
    }
    await q.say('you', res.comment);
    const n = res.script.length;
    for (let i = 0; i < n; i++) {
      const it = res.script[i];
      fw.heat = (i + 1) / n;
      if (it.exit) { fw.speaking = null; await walkOut(it.exit); continue; }
      const who = it.who === me() ? 'you' : it.who;
      if (who !== 'you' && S.sem.gone.has(who)) continue;
      fw.speaking = who === 'you' ? null : who;
      const seated = q.seminar.seats().some(a => a.k === who);
      const up = fw.heat > 0.6 ? 11 : fw.heat > 0.3 ? 6 : 0;
      let shake = 0;
      const jitter = seated && fw.heat > 0.6 && !G.calm ? setInterval(() => { shake = 1 - shake; S.sem.lift[who] = up + shake; }, 90) : 0;
      if (seated) S.sem.lift[who] = up;
      await q.say(who, it.text);
      clearInterval(jitter);
      if (seated) S.sem.lift[who] = fw.heat > 0.5 ? 3 : 0;
    }
    fw.speaking = null; fw.live = false; fw.done = true;
    Object.keys(S.sem.lift).forEach(k => { S.sem.lift[k] = 0; });
    if (window.questTicker && window.questTicker.poll) setTimeout(window.questTicker.poll, 400);
  } finally {
    fw.busy = false; fw.live = false; fw.speaking = null;
    if (panel) closePanel(null);
  }
}

window.questFlamewar = { grabMic, fw };
})();
