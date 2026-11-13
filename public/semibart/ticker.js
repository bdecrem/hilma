/* CASBS Quest, the wire (2026-11-12): announcements along the bottom of the screen.
   "Bart just added ten cute rats to their study." "Inbal left a note on Mary's desk."
   The server keeps them (semibart_events, written when a note is left, a room changes, someone
   changes their lines, or an admin announces); this file polls GET /api/semibart/events and tells
   the other files with a 'semibart:event' event on window (detail { id, kind, actor, room, text }).

   The wire is a slide-out widget (2026-11-13): the yellow CASBS WIRE tab sits at the bottom left
   and the dark strip slides out of it to the right. Click the tab to shut it or open it again;
   it starts open, and the choice is remembered on this device. Open, new lines scroll across
   as they arrive and the day's last few come round again in between. Shut, the tab counts what
   you have not seen. Nothing shows over a dialog, a slide or a box that owns the bottom edge.
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
#tk { position: absolute; left: 0; right: 0; bottom: 0; height: 3.6cqw; z-index: 3; display: flex; align-items: stretch; pointer-events: none; transform: translateY(110%); transition: transform 0.25s steps(5); }
#tk.on { transform: none; }
#tk .tk-tag { flex: none; display: flex; align-items: center; gap: 0.7cqw; padding: 0 1cqw 0 1.2cqw; background: var(--hot); color: #000; font-size: 2.2cqw; line-height: 1; letter-spacing: 0.12em; pointer-events: auto; cursor: pointer; border-top: 0.3cqw solid var(--hot); position: relative; z-index: 1; }
#tk .tk-tag:hover, #tk .tk-tag:focus-visible { background: #fff; border-top-color: #fff; outline: none; }
#tk .tk-arrow { width: 0; height: 0; border-top: 0.6cqw solid transparent; border-bottom: 0.6cqw solid transparent; border-right: 0.8cqw solid #000; }
#tk.shut .tk-arrow { border-right: 0; border-left: 0.8cqw solid #000; }
#tk .tk-new { min-width: 2cqw; padding: 0.15cqw 0.4cqw; background: #000; color: var(--hot); font-size: 1.9cqw; letter-spacing: 0; text-align: center; }
#tk .tk-new[hidden] { display: none; }
#tk .tk-body { flex: 1; min-width: 0; overflow: hidden; }
#tk .tk-strip { height: 100%; display: flex; background: rgba(8, 7, 5, 0.86); border-top: 0.3cqw solid var(--hot); transition: transform 0.3s steps(8); }
#tk.shut .tk-strip { transform: translateX(-101%); }
#tk .tk-win { flex: 1; min-width: 0; position: relative; overflow: hidden; }
#tk .tk-run { position: absolute; left: 0; top: 0; height: 100%; display: flex; align-items: center; white-space: nowrap; font-size: 2.5cqw; color: #fff7e6; will-change: transform; }
#tk .tk-run .me { color: var(--cyan); }
#tk .tk-run .sys { color: var(--hot); }
#tk .tk-run .old { color: #b9b2a0; }
#tk .tk-run i { font-style: normal; color: var(--choice); padding: 0 1.6cqw; }
#stage.tk-on #tools { bottom: 4.4cqw; }
@media (prefers-reduced-motion: reduce) { #tk, #tk .tk-strip { transition: none; } }
`;
document.head.appendChild(css);
const bar = document.createElement('div'); bar.id = 'tk';
bar.innerHTML = '<button type="button" class="tk-tag" aria-expanded="true" aria-controls="tkStrip"><span>CASBS WIRE</span><span class="tk-new" hidden></span><span class="tk-arrow" aria-hidden="true"></span></button><div class="tk-body"><div class="tk-strip" id="tkStrip"><div class="tk-win" aria-live="polite"><div class="tk-run"></div></div></div></div>';
stage.insertBefore(bar, $('fade'));
const tag = bar.querySelector('.tk-tag'), badge = bar.querySelector('.tk-new'), win = bar.querySelector('.tk-win'), run = bar.querySelector('.tk-run');

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
  tag.setAttribute('aria-label', open ? 'CASBS Wire. Click to close.' : `CASBS Wire, closed${unseen ? ', ' + unseen + ' new' : ''}. Click to open.`);
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
// The canvas listens for clicks and keys on the stage and the window; the tab's are its own.
['pointerdown', 'pointerup', 'contextmenu'].forEach(ev => tag.addEventListener(ev, e => e.stopPropagation()));
tag.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') e.stopPropagation(); });
paintTag();

/* ---------- what scrolls ---------- */
// Nothing shows over a dialog, a slide or a box that owns the bottom of the screen.
function blocked() {
  if (!S.started || S.choices || S.zoomT >= 0) return true;
  for (const id of ['deck', 'screen', 'who', 'deco']) { const el = $(id); if (el && !el.hidden) return true; }
  return !!stage.querySelector('.nb-veil, .sb-veil, .cl-panel');
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
  stage.classList.toggle('tk-on', !hide && open);
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
