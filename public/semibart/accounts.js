/* CASBS Quest accounts, in the browser (2026-11-12). Rides on the game through window.quest:
   - the title card asks for your first name and passcode before Start (your first passcode is
     your study number); once you're in, you start at your own door
   - quest.me is { character, name, study, role, passcodeIsDefault } or null, and a
     'semibart:user' event fires on window whenever it changes (it starts undefined: wait for it)
   - the chip at top right is the one place for your account: your passcode (a dot on the chip
     until you've set your own four digits), sign out, and for admins the roster
   Server: src/lib/semibart (auth.ts, handlers.ts) behind /api/semibart/*. */
(function () {
  'use strict';
  const Q = window.quest;
  if (!Q) return;
  const API = '/api/semibart';
  const stage = document.getElementById('stage'), card = document.querySelector('#title .card'), startBtn = document.getElementById('startBtn');
  const css = document.createElement('style');
  css.textContent = `
  #title .card [hidden] { display: none !important; }
  .sb-form { display: grid; grid-template-columns: 1fr 0.7fr auto; gap: 1cqw; margin: 0 0 0.6cqw; }
  .sb-form input, .sb-pane input { font: inherit; font-size: 2.6cqw; padding: 0.6cqw 1cqw; background: #000; color: #fff7e6; border: 0.3cqw solid #4a4436; outline: none; min-width: 0; }
  .sb-form input:focus, .sb-pane input:focus { border-color: var(--hot); }
  .sb-btn { background: var(--hot); color: #000; font-size: 2.6cqw; padding: 0.6cqw 2cqw; box-shadow: 0.4cqw 0.4cqw 0 #8a7a1e; letter-spacing: 0.06em; }
  .sb-btn:hover { background: #fff; }
  .sb-btn[disabled] { opacity: 0.5; cursor: default; }
  .sb-quiet { color: var(--cyan); font-size: 2.2cqw; }
  .sb-quiet:hover { color: var(--hot); }
  .sb-hint { margin: 0.4cqw 0 0; font-size: 2.1cqw; color: #c9c3b4; }
  .sb-err { margin: 0.4cqw 0 0; font-size: 2.2cqw; color: #ff7a5c; min-height: 2.6cqw; }
  .sb-who { margin: 0 0 0.4cqw; font-size: 2.6cqw; color: #fff7e6; }
  .sb-who b { color: var(--hot); font-weight: 400; }
  #sbChip { position: absolute; top: 1cqw; right: 1cqw; z-index: 4; color: var(--hot); font-size: 2.5cqw; padding: 0.4cqw 1.1cqw; background: rgba(0, 0, 0, 0.55); }
  #sbChip:hover { color: #fff; }
  #sbChip .sb-dot { display: inline-block; width: 0.9cqw; height: 0.9cqw; margin-left: 0.6cqw; vertical-align: middle; background: var(--cyan); box-shadow: 0 0 0 0.2cqw #000; }
  #sbChip[hidden], #sbMenu[hidden], .sb-veil[hidden] { display: none; }
  #sbMenu { position: absolute; top: 5.2cqw; right: 1cqw; z-index: 5; background: #12100c; border: 0.35cqw solid var(--hot); display: flex; flex-direction: column; min-width: 24cqw; }
  #sbMenu button { text-align: left; padding: 0.8cqw 1.4cqw; font-size: 2.4cqw; color: #fff7e6; }
  #sbMenu button:hover, #sbMenu button:focus-visible { background: #2a2620; color: var(--hot); outline: none; }
  .sb-veil { position: absolute; inset: 0; z-index: 6; display: grid; place-items: center; background: rgba(0, 0, 0, 0.45); }
  .sb-pane { width: 52cqw; max-height: 50cqw; overflow-y: auto; background: #12100c; color: #fff7e6; border: 0.5cqw solid var(--hot); box-shadow: 0 0 0 0.5cqw #000, 1.2cqw 1.2cqw 0 0.5cqw #000; padding: 2cqw 3cqw 2.2cqw; }
  .sb-pane h2 { margin: 0 0 1.2cqw; color: var(--hot); font-size: 4.4cqw; font-weight: 400; line-height: 1; }
  .sb-pane label { display: block; margin: 0.8cqw 0 0.3cqw; font-size: 2.2cqw; color: var(--choice); }
  .sb-pane input { width: 100%; letter-spacing: 0.3em; }
  .sb-row { display: flex; gap: 1.6cqw; align-items: center; margin-top: 1.6cqw; }
  .sb-table { width: 100%; border-collapse: collapse; font-size: 2.1cqw; }
  .sb-table td { padding: 0.25cqw 0.6cqw; border-bottom: 0.15cqw solid #2c2820; }
  .sb-table td:last-child { text-align: right; }
  .sb-table .dim { color: #8a826f; }`;
  document.head.appendChild(css);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  async function call(path, opts) {
    const r = await fetch(API + path, Object.assign({ credentials: 'same-origin', headers: { 'content-type': 'application/json' } }, opts || {}));
    let body = {}; try { body = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(body.error || ('HTTP ' + r.status));
    return body;
  }
  function setUser(u) {
    Q.me = u;
    window.dispatchEvent(new CustomEvent('semibart:user', { detail: u }));
    paintCard(); paintChip();
  }
  window.SEMIBART_GATE = () => { if (Q.me) return true; const n = document.getElementById('sbName'); if (n) n.focus(); return false; };

  /* ---------- the title card: sign in, then Start ---------- */
  const dl = card.querySelector('dl'), box = document.createElement('div');
  box.id = 'sbSign'; card.insertBefore(box, startBtn);
  function paintCard() {
    const u = Q.me;
    if (u === undefined) { box.innerHTML = '<p class="sb-hint">One moment.</p>'; startBtn.hidden = true; return; }
    if (!u) {
      if (dl) dl.hidden = true; startBtn.hidden = true;
      box.innerHTML = `<form class="sb-form" autocomplete="on">
          <input id="sbName" name="username" autocomplete="username" placeholder="First name" aria-label="First name" spellcheck="false" autocapitalize="off">
          <input id="sbCode" name="password" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Passcode" aria-label="Passcode">
          <button class="sb-btn" type="submit">Sign in</button>
        </form>
        <p class="sb-hint">First time? Your passcode is your study number. Change it from your name, top right.</p>
        <p class="sb-err" role="alert"></p>`;
      const f = box.querySelector('form'), err = box.querySelector('.sb-err');
      f.addEventListener('submit', async e => {
        e.preventDefault(); e.stopPropagation();
        const btn = f.querySelector('button'); btn.disabled = true; err.textContent = '';
        try {
          const r = await call('/login', { method: 'POST', body: JSON.stringify({ name: f.sbName.value, passcode: f.sbCode.value }) });
          atYourDoor(r.user); setUser(r.user); startBtn.focus({ preventScroll: true });
        } catch (x) { err.textContent = x.message; btn.disabled = false; f.sbCode.select(); }
      });
      box.querySelectorAll('input').forEach(i => i.addEventListener('click', e => e.stopPropagation()));
      setTimeout(() => { const n = document.getElementById('sbName'); if (n && !Q.S.started) n.focus({ preventScroll: true }); }, 50);
      return;
    }
    if (dl) dl.hidden = false; startBtn.hidden = false;
    box.innerHTML = `<p class="sb-who">Signed in as <b>${esc(u.name)}</b> · Study ${esc(u.study)} <button class="sb-quiet" type="button">Not you?</button></p>`;
    box.querySelector('button').addEventListener('click', e => { e.stopPropagation(); signOut(); });
  }
  // you start the afternoon at your own door
  function atYourDoor(u) {
    if (!u || Q.S.started) return;
    const h = Q.MAP.find(h => h.study && h.n === u.study);
    if (!h) return;
    const S = Q.S, MH = Q.world.height, FH = Q.gfx.FH;
    S.x = h.walk.x; S.y = h.walk.y; S.cam = Math.max(0, Math.min(MH - FH, S.y - 90)); S.camFree = false;
  }
  async function signOut() {
    try { await call('/logout', { method: 'POST' }); } catch (e) {}
    location.reload();
  }

  /* ---------- the chip, top right ---------- */
  const chip = document.createElement('button'); chip.id = 'sbChip'; chip.type = 'button'; chip.className = 'outlined'; chip.hidden = true;
  const menu = document.createElement('div'); menu.id = 'sbMenu'; menu.hidden = true;
  stage.appendChild(chip); stage.appendChild(menu);
  function paintChip() {
    const u = Q.me;
    chip.hidden = !(u && Q.S.started);
    if (!u) return;
    // a dot until you've set your own passcode: the one nudge, in the one place for your account
    chip.textContent = u.name.split(' ')[0] + ' ▾';
    if (u.passcodeIsDefault) { const d = document.createElement('span'); d.className = 'sb-dot'; d.title = 'Your passcode is still your study number'; chip.appendChild(d); }
    menu.innerHTML = '';
    const item = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', e => { e.stopPropagation(); menu.hidden = true; fn(); }); menu.appendChild(b); };
    item(u.passcodeIsDefault ? 'Set your own passcode' : 'Change passcode', openPasscode);
    if (u.role === 'admin') item('Everyone (admin)', openAdmin);
    item('Sign out', signOut);
  }
  chip.addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener('click', () => { menu.hidden = true; });
  // the chip appears once the game starts
  startBtn.addEventListener('click', () => setTimeout(paintChip, 0));
  window.addEventListener('keydown', () => setTimeout(paintChip, 0));

  /* ---------- panes: passcode, admin ---------- */
  let pane = null;
  function openPane(html, wire) {
    closePane();
    pane = document.createElement('div'); pane.className = 'sb-veil';
    pane.innerHTML = `<div class="sb-pane" role="dialog" aria-modal="true">${html}</div>`;
    pane.addEventListener('click', e => { e.stopPropagation(); if (e.target === pane) closePane(); });
    stage.appendChild(pane); wire(pane.firstChild);
  }
  function closePane() { if (pane) { pane.remove(); pane = null; } }
  Q.hooks.keyBlock.push(e => { if (!pane) return false; if (e.key === 'Escape') closePane(); return true; });

  function openPasscode() {
    const u = Q.me; if (!u) return;
    openPane(`<h2>Your passcode</h2>
      <form>
        <label for="sbCur">${u.passcodeIsDefault ? 'Current passcode (your study number)' : 'Current passcode'}</label>
        <input id="sbCur" type="password" inputmode="numeric" autocomplete="current-password">
        <label for="sbNew">New passcode, four digits</label>
        <input id="sbNew" type="password" inputmode="numeric" autocomplete="new-password" maxlength="4" pattern="[0-9]{4}">
        <label for="sbNew2">Again</label>
        <input id="sbNew2" type="password" inputmode="numeric" autocomplete="new-password" maxlength="4">
        <p class="sb-err" role="alert"></p>
        <div class="sb-row"><button class="sb-btn" type="submit">Save</button><button class="sb-quiet" type="button">Cancel</button></div>
      </form>`, el => {
      const f = el.querySelector('form'), err = el.querySelector('.sb-err');
      el.querySelector('.sb-quiet').addEventListener('click', closePane);
      setTimeout(() => f.sbCur.focus(), 30);
      f.addEventListener('submit', async e => {
        e.preventDefault();
        if (!/^\d{4}$/.test(f.sbNew.value)) { err.textContent = 'Four digits, please.'; return; }
        if (f.sbNew.value !== f.sbNew2.value) { err.textContent = "Those two don't match."; return; }
        try {
          const r = await call('/passcode', { method: 'POST', body: JSON.stringify({ current: f.sbCur.value, next: f.sbNew.value }) });
          closePane(); Q.me = r.user; window.dispatchEvent(new CustomEvent('semibart:user', { detail: r.user })); paintChip();
          if (Q.S.started) Q.say('you', 'New passcode. Better not write it on a sticky note.');
        } catch (x) { err.textContent = x.message; }
      });
    });
  }
  async function openAdmin() {
    let users = [];
    try { users = (await call('/admin/users')).users; } catch (x) { return; }
    const rows = users.map(u => `<tr><td>${esc(u.name)}</td><td class="dim">${esc(u.study)}</td><td class="dim">${u.lastSeen ? new Date(u.lastSeen).toLocaleDateString() : 'never'}</td><td class="dim">${u.passcodeIsDefault ? 'study no.' : 'own code'}${u.locked ? ' · locked' : ''}</td><td>${u.passcodeIsDefault && !u.locked ? '' : `<button class="sb-quiet" data-c="${esc(u.character)}" type="button">reset</button>`}</td></tr>`).join('');
    openPane(`<h2>Everyone</h2><p class="sb-hint">${users.filter(u => u.lastSeen).length} of ${users.length} have signed in. Reset puts a passcode back to the study number.</p>
      <table class="sb-table">${rows}</table><div class="sb-row"><button class="sb-quiet" type="button" data-close>Close</button></div>`, el => {
      el.querySelector('[data-close]').addEventListener('click', closePane);
      el.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', async () => {
        b.disabled = true;
        try { await call('/admin/reset', { method: 'POST', body: JSON.stringify({ character: b.dataset.c }) }); b.textContent = 'done'; } catch (x) { b.textContent = x.message; }
      }));
    });
  }

  /* ---------- go ---------- */
  paintCard();
  call('/me').then(r => { atYourDoor(r.user); setUser(r.user); if (r.user) startBtn.focus({ preventScroll: true }); })
    .catch(() => { setUser(null); });
  window.semibartAccounts = { call, openPasscode, signOut };
})();
