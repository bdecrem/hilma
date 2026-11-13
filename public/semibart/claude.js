/* CASBS Quest, the Claude on the door frame (2026-11-12). Rides on the game through window.quest.
   - A small clay-colored spark sits on the door frame of your own study, and only there: in
     anyone else's study there is nothing to see. An admin is the exception and has one in every
     study, since an admin may change any of them. Click it and type what you want: "add ten cute rats", "make it
     pink", "I'm on the couch taking a nap", "make me grumpy today". It answers in a speech
     bubble while the room changes behind it.
   - The server (src/lib/semibart/social-agent.ts, POST /api/semibart/agent) is a Claude with
     tools: one hands the sentence to the room decorator, one rewrites your character's lines.
     Every change is announced on the ticker.
   - The lines people changed (GET /api/semibart/personas) are laid over the game's own here:
     what a visitor says looking at you, what you call through the door, what you say.
   Loaded by notes.js. The room drawing itself is rooms.js (window.questRooms.setRoom). */
(() => {
'use strict';
const q = window.quest;
if (!q || !q.hooks || !q.gfx || window.questClaude) return;
const G = q.gfx, g = G.g, S = q.S;
const stage = document.getElementById('stage');
const hasRoom = room => room === 'bart' || !!q.PEOPLE[room];
// Yours alone: the spark is drawn, and answers, only in the study you live in. An admin has one
// in every study (Bart, 2026-11-12, both rules).
const canUse = room => !!(q.me && hasRoom(room) && (q.me.role === 'admin' || q.occupants(room).includes(q.me.character)));
const nameOf = c => c === 'bart' ? 'Bart' : q.PEOPLE[c] ? q.PEOPLE[c].name : q.FELLOWS[c] ? q.FELLOWS[c].name : c;

/* ---------- the spark: 13 x 11, on top of the door frame (the door is x 4-35, from y 30) ---------- */
const PAL = { c: '#f39a6d', d: '#d97757', k: '#1d1b1e', w: '#fff7e6' };
const A = ['......c......', '..c...c...c..', '...c..c..c...', '....ddddd....', '...dcccccd...', 'cccdckckcdccc', '...dcccccd...', '....ddddd....', '...c..c..c...', '..c...c...c..', '......c......'];
const B = ['.c.........c.', '..c...c...c..', '...c..c..c...', '....ddddd....', '...dcccccd...', '.ccdckckcdcc.', '...dcccccd...', '....ddddd....', '...c..c..c...', '..c...c...c..', '.c.........c.'];
const blinkRow = '...dcccccd...';
const AT = [14, 19];
const chat = { open: false, room: null, busy: false, hopT: -9, logs: {} };
q.hooks.roomBack.push((room, t) => {
  if (!canUse(room)) return;
  const busy = chat.busy && chat.room === room, calm = G.calm;
  let rows = !calm && (busy ? Math.floor(t * 7) % 2 : Math.floor(t * 0.8) % 5 === 0) ? B : A;
  if (!calm && !busy && (t + 1.3) % 5.1 < 0.14) rows = rows.map((r, i) => i === 5 ? (rows === A ? 'ccc' + blinkRow.slice(3, 10) + 'ccc' : '.cc' + blinkRow.slice(3, 10) + 'cc.') : r);
  const hop = performance.now() / 1000 - chat.hopT;
  const dy = calm ? 0 : busy ? -Math.round(Math.abs(Math.sin(t * 6)) * 3) : hop < 0.4 ? -Math.round(Math.sin(hop / 0.4 * Math.PI) * 5) : Math.round(Math.sin(t * 1.7) * 0.6);
  G.oval(g, AT[0] + 6, AT[1] + 5 + dy, 9, 8, 'rgba(255,214,150,0.16)');
  G.rect(g, AT[0] + 3, AT[1] + 11, 7, 1, 'rgba(20,20,20,0.3)');
  G.sprite(g, rows, PAL, AT[0], AT[1] + dy);
  if (busy && !calm) { const k = Math.floor(t * 5) % 3; G.rect(g, AT[0] + 15 + k * 3, AT[1] + 2 - k, 1, 1, '#ffd93b'); }
});
q.hooks.roomSpots.push(room => canUse(room) ? [{ name: 'Claude', r: [AT[0] - 2, AT[1] - 3, 17, 16], walk: { x: 46, y: 132 }, def: 'talk', on: {
  look: q.occupants(room).includes(q.me.character) ? 'Claude. Small, clay-colored, sitting on my door frame. It changes the room if I ask.' : `Claude, on the door frame of ${q.occupants(room).length > 1 ? 'this study' : nameOf(room) + "'s study"}. I have the keys to this one.`,
  talk: () => openChat(room)
} }] : []);

/* ---------- the chat ----------
   Claude talks the way everyone in the game talks: plain outlined text floating by its own head,
   in its own colour, no box. You type on one line along the bottom, the way you type at a parser:
   Enter sends, Esc leaves. While Claude works, what you asked stays on the line. No buttons to
   choose from: the line itself suggests something different each time you open it. */
const css = document.createElement('style');
css.textContent = `
.cl-say { position: absolute; left: 10.5cqw; top: 5.5cqw; max-width: 62cqw; z-index: 6; margin: 0; color: #ffb38a; font-size: 3.5cqw; line-height: 1.08; letter-spacing: 0.02em; word-spacing: 0.06em; pointer-events: none; text-wrap: balance; }
.cl-say.wait::after { content: ''; display: inline-block; width: 0.45em; height: 0.8em; margin-left: 0.25em; background: #ffb38a; box-shadow: 0 0 0 0.22cqw #000; vertical-align: -0.05em; animation: blink 0.8s steps(1) infinite; }
.cl-panel { --h: max(36px, 4.4cqw); position: absolute; left: 0; right: 0; bottom: 0; height: var(--h); z-index: 6; background: rgba(8, 7, 5, 0.9); border-top: 0.3cqw solid #d97757; color: #fff7e6; }
.cl-panel form { display: flex; align-items: stretch; height: 100%; }
.cl-gt { flex: none; display: grid; place-items: center; width: var(--h); color: #d97757; font-size: 3cqw; line-height: 1; }
.cl-panel input { flex: 1; min-width: 0; font: inherit; font-size: max(16px, 2.8cqw); padding: 0; background: none; color: #fff7e6; border: 0; outline: none; border-radius: 0; caret-color: #d97757; }
.cl-panel input::placeholder { color: #7d766a; }
.cl-panel input:disabled { color: #a39c8c; -webkit-text-fill-color: #a39c8c; opacity: 1; }
.cl-x { flex: none; padding: 0 1.6cqw; color: #7d766a; font-size: max(13px, 2.1cqw); letter-spacing: 0.08em; }
.cl-x:hover, .cl-x:focus-visible { color: var(--hot); outline: none; }
`;
document.head.appendChild(css);
// What the empty line suggests, one each time it opens. Things a fellow might actually want.
const TRY = ['ten cute rats', 'make it pink', "I'm on the couch, napping", 'make me grumpy today', 'a fireplace and a cat', 'rain outside the window', 'a disco ball. no questions'];
const WAITING = ['Thinking.', 'Measuring the wall.', 'Finding the right pixels.', 'Moving things around.', 'Checking it against the furniture.', 'Sweeping up.', 'Nearly there.'];
let bubble = null, panel = null, chatDone = null, waitTimer = 0, tries = Math.floor(Math.random() * TRY.length);
function setBubble(text, waiting) {
  if (!bubble) return;
  bubble.classList.toggle('wait', !!waiting);
  bubble.textContent = text;
}
function closeChat() {
  if (!chat.open) return;
  chat.open = false; clearInterval(waitTimer);
  if (bubble) bubble.remove(); if (panel) panel.remove(); bubble = panel = null;
  const d = chatDone; chatDone = null; if (d) d();
  const cv = document.getElementById('cv'); cv.focus && cv.focus();
}
function openChat(room) {
  closeChat();
  chat.open = true; chat.room = room; chat.hopT = performance.now() / 1000; q.SFX.pick && q.SFX.pick();
  const log = chat.logs[room] || (chat.logs[room] = []);
  const own = q.occupants(room).includes(q.me.character);
  bubble = document.createElement('p'); bubble.className = 'cl-say outlined'; bubble.setAttribute('aria-live', 'polite');
  panel = document.createElement('div'); panel.className = 'cl-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Talk to Claude');
  panel.innerHTML = '<form><span class="cl-gt" aria-hidden="true">&gt;</span><input type="text" maxlength="600" autocomplete="off" spellcheck="false" aria-label="Tell Claude what you want"><button class="cl-x" type="button" aria-label="Done talking to Claude">esc</button></form>';
  stage.appendChild(bubble); stage.appendChild(panel);
  ['pointerdown', 'pointerup', 'click', 'contextmenu', 'keyup', 'wheel', 'mousemove'].forEach(ev => panel.addEventListener(ev, e => e.stopPropagation()));
  const inp = panel.querySelector('input');
  inp.placeholder = TRY[tries++ % TRY.length];
  const last = [...log].reverse().find(m => m.role === 'claude');
  setBubble(last ? last.text : own ? 'Your study. Say what you want in it. Or what you want to be.' : `You have the keys. What changes in ${q.occupants(room).length > 1 ? 'here' : nameOf(room) + "'s study"}?`);
  const setBusy = on => {
    chat.busy = on; inp.disabled = on; clearInterval(waitTimer);
    if (on) { let i = 0; setBubble(WAITING[0], true); waitTimer = setInterval(() => { i = Math.min(WAITING.length - 1, i + 1); setBubble(WAITING[i], true); }, 6000); }
  };
  async function send(text) {
    text = text.trim(); if (!text || chat.busy) return;
    log.push({ role: 'user', text });
    setBusy(true);   // what you asked stays on the line while Claude works
    let reply = 'That did not go through. Say it again.';
    try {
      const r = await fetch('/api/semibart/agent', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ room, messages: log.slice(-12) }) });
      const d = await r.json().catch(() => ({}));
      if (typeof d.reply === 'string' && d.reply) reply = d.reply;
      if (d.room && window.questRooms && window.questRooms.setRoom) window.questRooms.setRoom(d.room.room, d.room.version, d.room.code);
      if (d.personas) { Object.keys(d.personas).forEach(c => { personas[c] = d.personas[c]; }); applyAll(); }
      if ((d.room || d.personas || d.book) && window.questTicker) setTimeout(window.questTicker.poll, 400);
      if (r.ok) log.push({ role: 'claude', text: reply }); else log.pop();   // a refusal (the daily limit, say) still shows its line
    } catch (e) { log.pop(); }
    if (!chat.open || chat.room !== room) { chat.busy = false; return; }
    setBusy(false); inp.value = ''; inp.placeholder = ''; setBubble(reply); chat.hopT = performance.now() / 1000;
    inp.focus();
  }
  panel.querySelector('form').addEventListener('submit', e => { e.preventDefault(); send(inp.value); });
  panel.querySelector('.cl-x').addEventListener('click', closeChat);
  panel.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closeChat(); });
  setTimeout(() => inp.focus(), 30);
  return new Promise(res => { chatDone = res; });
}
q.hooks.keyBlock.push(e => { if (!chat.open) return false; if (e.key === 'Escape') closeChat(); return true; });
setInterval(() => { if (chat.open && (S.scene !== 'room' || S.room !== chat.room || !canUse(chat.room))) closeChat(); }, 300);
// The chat is the way in now: the plain Decorate box of rooms.js steps aside.
if (window.questRooms && typeof window.questRooms.ui === 'function') window.questRooms.ui(false);

/* ---------- personas: people's own lines, laid over the game's ---------- */
const personas = {}, orig = {};
function hostOf(c) { return c === 'bart' || q.PEOPLE[c] ? c : Object.keys(q.PEOPLE).find(k => (q.PEOPLE[k].mates || []).includes(c)); }
function applyOne(c) {
  const p = personas[c] || {}, host = hostOf(c); if (!host) return;
  const look = p.look || null, lines = p.lines && p.lines.length ? p.lines : null;
  if (c === 'bart') {
    const spot = q.ROOM.find(s => s.name === 'Bart'); if (!spot) return;
    const o = orig.bart || (orig.bart = { look: spot.on.look, talk: spot.on.talk, i: 0 });
    spot.on.look = look || o.look;
    spot.on.talk = lines ? async () => { await q.say('bart', lines[o.i++ % lines.length]); await o.talk(); } : o.talk;
    return;
  }
  if (q.PEOPLE[c]) {
    const P = q.PEOPLE[c], spot = P.spots.find(s => s.name === P.name);
    const o = orig[c] || (orig[c] = { look: P.look, come: P.come, hello: P.hello, talks: P.talks });
    P.look = look || (p.doing ? `${o.look} Right now: ${p.doing}.` : o.look);
    if (spot) spot.on.look = P.look;
    P.come = p.come || o.come;
    P.hello = p.hello ? [[c, p.hello]] : o.hello;
    P.talks = lines ? lines.map(l => [[c, l]]) : o.talks;
    return;
  }
  // someone who shares a study: their spot lives in the host's list
  const F = q.FELLOWS[c], spot = F && q.PEOPLE[host].spots.find(s => s.name === F.name); if (!spot) return;
  const o = orig[c] || (orig[c] = { look: spot.on.look, talk: spot.on.talk, i: 0 });
  spot.on.look = look || o.look;
  spot.on.talk = lines ? async () => { await q.say(c, lines[o.i++ % lines.length]); } : o.talk;
}
function applyAll() { new Set(Object.keys(personas).concat(Object.keys(orig))).forEach(applyOne); }
async function loadPersonas() {
  try {
    const r = await fetch('/api/semibart/personas'); if (!r.ok) return;
    const d = (await r.json()).personas || {};
    Object.keys(personas).forEach(c => { if (!d[c]) delete personas[c]; });
    Object.assign(personas, d); applyAll();
  } catch (e) {}
}
loadPersonas();
window.addEventListener('semibart:event', e => { if (e.detail && e.detail.kind === 'persona') loadPersonas(); });

window.questClaude = { openChat, closeChat, chat, personas, loadPersonas };
})();
