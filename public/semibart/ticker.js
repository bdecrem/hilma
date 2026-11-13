/* CASBS Quest, the dock and the wire. One place for everything that is not the game itself: three
   small squares at the bottom left, and nothing in any other corner.
     - the wire (an antenna): announcements from the server ("Bart just added ten cute rats to
       their study." "Inbal left a note on Mary's desk."). The dark strip slides out of the dock
       to the right; click the antenna to shut it or open it again. It starts open and the choice
       is kept on this device. Open, new lines scroll as they arrive and the day's last few come
       round again in between. Shut, the square counts what you have not seen.
     - Who's where (a magnifier), on the map only.
     - you (your own face): your menu, drawn by accounts.js: sound, full screen, passcode, sign out.
   The server keeps the announcements (semibart_events); this file polls GET /api/semibart/events
   and tells the other files with a 'semibart:event' event on window (detail { id, kind, actor,
   room, text }). Nothing shows over a dialog, a slide or a box that owns the bottom edge.
   window.questTicker.local(text) scrolls a line only this player sees. Loaded by notes.js. */
(() => {
'use strict';
const q = window.quest;
if (!q || window.questTicker) return;
const S = q.S, calm = !!(q.gfx && q.gfx.calm);
const stage = document.getElementById('stage'), $ = id => document.getElementById(id);
const API = '/api/semibart/events', POLL_MS = 12000, KEEP = 6, REPLAY_AFTER_MS = 6000;

const css = document.createElement('style');
css.textContent = `
#tk { --h: max(32px, 3.6cqw); position: absolute; left: 0; right: 0; bottom: 0; height: var(--h); z-index: 3; display: flex; align-items: stretch; pointer-events: none; transform: translateY(110%); transition: transform 0.25s steps(5); }
#tk.on { transform: none; }
#tk .tk-b { flex: none; width: var(--h); display: grid; place-items: center; position: relative; z-index: 1; pointer-events: auto; cursor: pointer; background: rgba(8, 7, 5, 0.86); color: #fff7e6; border-top: 0.3cqw solid var(--hot); }
#tk .tk-b[hidden] { display: none; }
#tk .tk-b:hover, #tk .tk-b:focus-visible { color: var(--hot); outline: none; }
#tk .tk-b svg, #tk .tk-b canvas { width: 62%; height: 62%; display: block; image-rendering: pixelated; }
#tk .tk-tag { background: var(--hot); color: #000; }
#tk .tk-tag:hover, #tk .tk-tag:focus-visible { background: #fff; color: #000; border-top-color: #fff; }
#tk.shut .tk-tag { background: rgba(8, 7, 5, 0.86); color: var(--hot); }
#tk.shut .tk-tag:hover, #tk.shut .tk-tag:focus-visible { color: #fff; border-top-color: var(--hot); }
#tk .tk-new { position: absolute; right: 0; top: 0; min-width: 1.7cqw; padding: 0 0.3cqw; background: var(--hot); color: #000; font-size: max(10px, 1.7cqw); line-height: 1.15; text-align: center; }
#tk .tk-new[hidden], #tk .tk-dot[hidden] { display: none; }
#tk .tk-dot { position: absolute; right: 12%; top: 12%; width: 18%; height: 18%; background: var(--cyan); box-shadow: 0 0 0 0.15cqw #000; }
#tk .tk-body { flex: 1; min-width: 0; overflow: hidden; }
#tk .tk-strip { height: 100%; display: flex; background: rgba(8, 7, 5, 0.86); border-top: 0.3cqw solid var(--hot); transition: transform 0.3s steps(8); }
#tk.shut .tk-strip { transform: translateX(-101%); }
#tk .tk-win { flex: 1; min-width: 0; position: relative; overflow: hidden; }
#tk .tk-run { position: absolute; left: 0; top: 0; height: 100%; display: flex; align-items: center; white-space: nowrap; font-size: 2.5cqw; color: #fff7e6; will-change: transform; }
#tk .tk-run .me { color: var(--cyan); }
#tk .tk-run .sys { color: var(--hot); }
#tk .tk-run .old { color: #b9b2a0; }
#tk .tk-run i { font-style: normal; color: var(--choice); padding: 0 1.6cqw; }
@media (prefers-reduced-motion: reduce) { #tk, #tk .tk-strip { transition: none; } }
`;
document.head.appendChild(css);
const ICON = {
  wire: 'M1 1h1v1H1zM0 2h1v4H0zM1 6h1v1H1zM3 2h1v1H3zM2 3h1v2H2zM3 5h1v1H3zM5 3h2v2H5zM5 6h2v3H5zM4 9h4v1H4zM8 2h1v1H8zM9 3h1v2H9zM8 5h1v1H8zM10 1h1v1h-1zM11 2h1v4h-1zM10 6h1v1h-1z',
  who: 'M3 1h4v1H3zM2 2h1v1H2zM7 2h1v1H7zM1 3h1v4H1zM8 3h1v4H8zM2 7h1v1H2zM7 7h1v1H7zM3 8h4v1H3zM8 8h1v1H8zM9 9h1v1H9zM10 10h1v1h-1z'
};
const svg = d => `<svg viewBox="0 0 12 12" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
const bar = document.createElement('div'); bar.id = 'tk';
bar.innerHTML = `<button type="button" class="tk-b tk-tag" aria-expanded="true" aria-controls="tkStrip">${svg(ICON.wire)}<span class="tk-new" hidden></span></button>`
  + `<button type="button" class="tk-b tk-who" aria-label="Who's where">${svg(ICON.who)}</button>`
  + `<button type="button" class="tk-b tk-me" aria-label="You: sound, full screen, passcode, sign out"><canvas width="12" height="12"></canvas><span class="tk-dot" hidden></span></button>`
  + '<div class="tk-body"><div class="tk-strip" id="tkStrip"><div class="tk-win" aria-live="polite"><div class="tk-run"></div></div></div></div>';
stage.insertBefore(bar, $('fade'));
const tag = bar.querySelector('.tk-tag'), badge = bar.querySelector('.tk-new'), win = bar.querySelector('.tk-win'), run = bar.querySelector('.tk-run');
const whoBtn = bar.querySelector('.tk-who'), meBtn = bar.querySelector('.tk-me'), dot = bar.querySelector('.tk-dot');
// The canvas listens for clicks and keys on the stage and the window; the dock's are its own.
bar.querySelectorAll('.tk-b').forEach(b => {
  ['pointerdown', 'pointerup', 'contextmenu'].forEach(ev => b.addEventListener(ev, e => e.stopPropagation()));
  b.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') e.stopPropagation(); });
});
whoBtn.addEventListener('click', e => { e.stopPropagation(); if (typeof q.openWho === 'function') q.openWho(); });
meBtn.addEventListener('click', e => { e.stopPropagation(); if (window.semibartAccounts && window.semibartAccounts.toggleMenu) window.semibartAccounts.toggleMenu(); });
// Your square is your own face, in your character's colours.
function paintMe() {
  const u = q.me, c = meBtn.querySelector('canvas').getContext('2d'), L = (u && typeof q.lookOf === 'function' && q.lookOf(u.character)) || { skin: '#e8b08f', skinD: '#c98d6c', hair: '#3b2416', shirt: '#e8743b' };
  const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  c.clearRect(0, 0, 12, 12);
  R(3, 1, 6, 2, L.hair); R(2, 2, 8, 2, L.hair); R(3, 3, 6, 5, L.skin); R(2, 4, 1, 2, L.hair); R(9, 4, 1, 2, L.hair);
  R(4, 5, 1, 1, '#141414'); R(7, 5, 1, 1, '#141414'); R(5, 8, 2, 1, L.skinD || L.skin); R(1, 9, 10, 3, L.shirt); R(0, 10, 12, 2, L.shirt);
  dot.hidden = !(u && u.passcodeIsDefault);
}
paintMe(); window.addEventListener('semibart:user', paintMe);

const queue = [];          // { text, cls } waiting to scroll
const recent = [];         // the last few real announcements, to come round again while it is quiet
let running = null;        // { items, t0, dur, from, to }
const seen = new Set();
let lastId = 0, primed = false, unseen = 0, idleSince = performance.now();

/* ---------- open and shut ---------- */
const STORE = 'semibart:wire';
let open = true;
try { open = localStorage.getItem(STORE) !== 'shut'; } catch (e) {}
function paintTag() {
  bar.classList.toggle('shut', !open);
  tag.setAttribute('aria-expanded', String(open));
  tag.setAttribute('aria-label', open ? 'The CASBS wire, open. Click to close.' : `The CASBS wire, closed${unseen ? ', ' + unseen + ' new' : ''}. Click to open.`);
  badge.hidden = open || !unseen; badge.textContent = unseen > 9 ? '9+' : String(unseen);
}
function setOpen(v) {
  open = !!v;
  try { localStorage.setItem(STORE, open ? 'open' : 'shut'); } catch (e) {}
  if (open) { unseen = 0; idleSince = performance.now() - REPLAY_AFTER_MS; }
  else if (running) { queue.unshift(...running.items.filter(it => it.cls !== 'old')); running = null; }
  paintTag();
}
tag.addEventListener('click', e => { e.stopPropagation(); setOpen(!open); const cv = $('cv'); if (cv && cv.focus) cv.focus(); });
paintTag();

/* ---------- what scrolls ---------- */
// Nothing shows over a dialog, a slide or a box that owns the bottom of the screen.
function blocked() {
  if (!S.started || S.choices || S.zoomT >= 0) return true;
  for (const id of ['deck', 'screen', 'who', 'deco']) { const el = $(id); if (el && !el.hidden) return true; }
  return !!stage.querySelector('.nb-veil, .sb-veil, .cl-panel, .bk-veil');
}
function begin(items) {
  run.innerHTML = items.map(it => `<span class="${it.cls || ''}"></span>`).join('<i>&#10022;</i>');
  run.querySelectorAll('span').forEach((el, i) => { el.textContent = items[i].text; });
  const w = win.clientWidth, tw = run.scrollWidth;
  if (calm) running = { items, t0: performance.now(), dur: 4000 + items.length * 2500, from: 8, to: 8 };
  else running = { items, t0: performance.now(), dur: (w + tw) / (w * 0.115) * 1000, from: w, to: -tw };
  run.style.transform = `translateX(${Math.round(running.from)}px)`;
}
function frame(now) {
  const hide = blocked();
  bar.classList.toggle('on', !hide);
  if (whoBtn.hidden !== (S.scene !== 'map')) whoBtn.hidden = S.scene !== 'map';
  if (hide && window.semibartAccounts && window.semibartAccounts.menuOpen && window.semibartAccounts.menuOpen()) window.semibartAccounts.closeMenu();
  if (running) {
    if (hide) {
      // Cut off before most of it was read: the new lines go back in line.
      if ((now - running.t0) / running.dur < 0.6) queue.unshift(...running.items.filter(it => it.cls !== 'old'));
      running = null; run.innerHTML = '';
    } else {
      const k = (now - running.t0) / running.dur;
      if (k >= 1) { running = null; idleSince = now; if (!calm) run.innerHTML = ''; }
      else run.style.transform = `translateX(${Math.round(running.from + (running.to - running.from) * k)}px)`;
    }
  } else if (!hide && open) {
    if (queue.length) begin(queue.splice(0, 4));
    else if (recent.length && now - idleSince > REPLAY_AFTER_MS) begin(recent.slice(-4).map(it => ({ text: it.text, cls: 'old' })));
    else if (!recent.length && primed && !run.firstChild) { run.innerHTML = '<span class="old"></span>'; run.firstChild.textContent = 'Quiet on the wire.'; run.style.transform = 'translateX(8px)'; }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function add(item, isNew) {
  queue.push(item);
  while (queue.length > 12) queue.shift();
  if (item.cls !== 'me') { recent.push(item); while (recent.length > KEEP) recent.shift(); }
  if (isNew && !open) { unseen++; paintTag(); }
  if (run.firstChild && !running) run.innerHTML = '';
}
async function poll() {
  if (document.hidden) return;
  try {
    const r = await fetch(API + '?after=' + lastId);
    if (!r.ok) return;
    const evs = (await r.json()).events || [];
    for (const ev of evs) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id); lastId = Math.max(lastId, ev.id);
      add({ text: ev.text, cls: ev.kind === 'system' ? 'sys' : '' }, primed);
      if (primed) window.dispatchEvent(new CustomEvent('semibart:event', { detail: ev }));
    }
    primed = true;
  } catch (e) {}
}
poll(); setInterval(poll, POLL_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

window.questTicker = {
  local: text => { queue.unshift({ text: String(text), cls: 'me' }); if (!open) { unseen++; paintTag(); } },
  poll, queue, setOpen, toggle: () => setOpen(!open),
  state: () => ({ open, running: !!running, queued: queue.length, unseen, lastId })
};
})();
