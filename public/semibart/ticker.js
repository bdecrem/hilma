/* CASBS Quest, the wire (2026-11-12): announcements that scroll along the bottom of the screen.
   "Bart just added ten cute rats to their study." "Inbal left a note on Mary's desk."
   The server keeps them (semibart_events, written when a note is left, a room changes, someone
   changes their lines, or an admin announces); this file polls GET /api/semibart/events, scrolls
   each new line across once, and tells the other files with a 'semibart:event' event on window
   (detail { id, kind, actor, room, text }). On arrival it replays the last few of the day.
   window.questTicker.local(text) scrolls a line only this player sees. Loaded by notes.js. */
(() => {
'use strict';
const q = window.quest;
if (!q || window.questTicker) return;
const S = q.S, calm = !!(q.gfx && q.gfx.calm);
const stage = document.getElementById('stage'), $ = id => document.getElementById(id);
const API = '/api/semibart/events', POLL_MS = 12000;

const css = document.createElement('style');
css.textContent = `
#tk { position: absolute; left: 0; right: 0; bottom: 0; height: 3.6cqw; z-index: 3; display: flex; align-items: stretch; background: rgba(8, 7, 5, 0.86); border-top: 0.3cqw solid var(--hot); pointer-events: none; transform: translateY(110%); transition: transform 0.25s steps(5); }
#tk.on { transform: none; }
#tk .tk-tag { flex: none; display: grid; place-items: center; padding: 0 1.2cqw; background: var(--hot); color: #000; font-size: 2.2cqw; letter-spacing: 0.12em; }
#tk .tk-win { flex: 1; min-width: 0; position: relative; overflow: hidden; }
#tk .tk-run { position: absolute; left: 0; top: 0; height: 100%; display: flex; align-items: center; white-space: nowrap; font-size: 2.5cqw; color: #fff7e6; will-change: transform; }
#tk .tk-run .me { color: var(--cyan); }
#tk .tk-run .sys { color: var(--hot); }
#tk .tk-run i { font-style: normal; color: var(--choice); padding: 0 1.6cqw; }
#stage.tk-on #tools { bottom: 4.4cqw; }
@media (prefers-reduced-motion: reduce) { #tk { transition: none; } }
`;
document.head.appendChild(css);
const bar = document.createElement('div'); bar.id = 'tk'; bar.setAttribute('aria-live', 'polite');
bar.innerHTML = '<span class="tk-tag">CASBS WIRE</span><div class="tk-win"><div class="tk-run"></div></div>';
stage.insertBefore(bar, $('fade'));
const win = bar.querySelector('.tk-win'), run = bar.querySelector('.tk-run');

const queue = [];          // { text, cls }
let running = null;        // { items, t0, dur, from, to }
const seen = new Set();
let lastId = 0, primed = false;

// Nothing scrolls over a dialog, a slide or a box that owns the bottom of the screen.
function blocked() {
  if (!S.started || S.choices || S.zoomT >= 0) return true;
  for (const id of ['deck', 'screen', 'who', 'deco']) { const el = $(id); if (el && !el.hidden) return true; }
  return !!stage.querySelector('.nb-veil, .sb-veil, .cl-panel');
}
function show(on) { bar.classList.toggle('on', on); stage.classList.toggle('tk-on', on); }
function begin() {
  const items = queue.splice(0, 4);
  run.innerHTML = items.map(it => `<span class="${it.cls || ''}"></span>`).join('<i>&#10022;</i>');
  run.querySelectorAll('span').forEach((el, i) => { el.textContent = items[i].text; });
  show(true);
  const w = win.clientWidth, tw = run.scrollWidth;
  if (calm) { running = { items, t0: performance.now(), dur: 4000 + items.length * 2500, from: Math.max(8, (w - tw) / 2), to: Math.max(8, (w - tw) / 2) }; }
  else running = { items, t0: performance.now(), dur: (w + tw) / (w * 0.115) * 1000, from: w, to: -tw };
}
function frame(now) {
  if (running) {
    if (blocked()) {
      // Cut off before most of it was read: it goes back in line.
      if ((now - running.t0) / running.dur < 0.6) queue.unshift(...running.items);
      running = null; show(false);
    } else {
      const k = (now - running.t0) / running.dur;
      if (k >= 1) { running = null; if (!queue.length) show(false); }
      else run.style.transform = `translateX(${Math.round(running.from + (running.to - running.from) * k)}px)`;
    }
  } else if (queue.length && !blocked()) begin();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

async function poll() {
  if (document.hidden) return;
  try {
    const r = await fetch(API + '?after=' + lastId);
    if (!r.ok) return;
    const evs = (await r.json()).events || [];
    for (const ev of evs) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id); lastId = Math.max(lastId, ev.id);
      queue.push({ text: ev.text, cls: ev.kind === 'system' ? 'sys' : '' });
      if (primed) window.dispatchEvent(new CustomEvent('semibart:event', { detail: ev }));
    }
    primed = true;
  } catch (e) {}
}
poll(); setInterval(poll, POLL_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

window.questTicker = { local: text => { queue.unshift({ text: String(text), cls: 'me' }); }, poll, queue, state: () => ({ running: !!running, queued: queue.length, lastId }) };
})();
