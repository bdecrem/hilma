// Adaptation Almanac: the web app. Hash routes: #/ home, #/c/<id> a conversation, #/artifacts, #/a/<id> one artifact.
const BASE = '/almanac'
const app = document.getElementById('app')
const state = { me: null, view: null }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const $ = (s, el = document) => el.querySelector(s)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const fmt = n => Number(n || 0).toLocaleString('en-US')
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
const KIND = { chart: 'Chart', table: 'Table', coding: 'Coding run', page: 'Page', document: 'Document' }

function when(iso) {
  if (!iso) return ''
  const d = new Date(iso), s = (Date.now() - d) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === new Date().toDateString()) return `today ${time}`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) })
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && path !== '/api/login' && path !== '/api/me') { state.me = null; route(); throw new Error('signed out') }
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`)
  return data
}

// markdown, with paper:ID#page links opening the PDF and artifact:ID links opening the artifact
marked.use({ gfm: true, renderer: {
  link({ href, title, tokens }) {
    const inner = this.parser.parseInline(tokens)
    let m, attrs = ' target="_blank" rel="noopener"'
    if ((m = String(href).match(/^paper:([\w.-]+)(?:#p?(\d+))?$/))) {
      href = `${BASE}/papers/${m[1]}.pdf${m[2] ? `#page=${m[2]}` : ''}`
      attrs = ` class="cite" target="_blank" rel="noopener" title="Open the PDF${m[2] ? ` at page ${m[2]}` : ''}"`
    } else if ((m = String(href).match(/^artifact:(\w+)$/))) { href = `#/a/${m[1]}`; attrs = ' class="artlink"' }
    return `<a href="${esc(href)}"${attrs}${title ? ` title="${esc(title)}"` : ''}>${inner}</a>`
  },
} })
const md = s => DOMPurify.sanitize(marked.parse(s || ''), { ADD_ATTR: ['target'] })

function autosize(ta) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 260) + 'px' }
  ta.addEventListener('input', fit); fit()
}
function submitOnEnter(ta, form) {
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit() }
  })
}

// ---------- shell + routing ----------
function shell(active, inner) {
  return `<header class="top"><a class="wordmark" href="#/"><span class="wm-a">Adaptation </span><em>Almanac</em></a>
  <nav><a href="#/" class="${active === 'home' ? 'on' : ''}">Ask</a><a href="#/artifacts" class="${active === 'artifacts' ? 'on' : ''}">Artifacts</a>
  <span class="who">${esc(state.me)}</span><button data-act="logout">Sign out</button></nav></header>${inner}`
}
app.addEventListener('click', async e => {
  const t = e.target.closest('[data-act]')
  if (!t) return
  const act = t.dataset.act
  if (act === 'logout') { await api('/api/logout', { method: 'POST' }).catch(() => {}); state.me = null; location.hash = '#/'; route() }
  if (act === 'new') location.hash = '#/'
  if (act === 'side') $('#chat')?.classList.toggle('side-open')
})
function route() {
  state.view?.teardown?.()
  state.view = null
  window.scrollTo(0, 0)
  if (!state.me) return renderSignin()
  const h = location.hash.replace(/^#/, '') || '/'
  let m
  if ((m = h.match(/^\/c\/(\w+)$/))) return renderChat(m[1])
  if (h === '/artifacts') return renderGallery()
  if ((m = h.match(/^\/a\/(\w+)$/))) return renderArtifact(m[1])
  return renderHome()
}
window.addEventListener('hashchange', route)

// ---------- sign-in ----------
function renderSignin() {
  let name = ''
  try { name = localStorage.getItem('almanac:name') || '' } catch {}
  app.innerHTML = `<div class="signin"><form class="card">
    <div class="kicker">The GAMI corpus</div>
    <h1>Adaptation <em>Almanac</em></h1>
    <p>A research assistant over 1,682 coded studies of how people adapt to climate change.</p>
    <label class="field"><span>Your name</span><input name="name" autocomplete="given-name" required value="${esc(name)}"></label>
    <label class="field"><span>Passcode</span><input name="passcode" type="password" autocomplete="current-password" required></label>
    <div class="err" role="alert"></div>
    <button class="btn" type="submit">Open the almanac</button></form></div>`
  const form = $('form', app)
  ;(name ? form.passcode : form.name).focus()
  form.addEventListener('submit', async e => {
    e.preventDefault()
    const btn = $('button', form); btn.disabled = true
    try {
      const r = await api('/api/login', { method: 'POST', body: { name: form.name.value, passcode: form.passcode.value } })
      try { localStorage.setItem('almanac:name', r.name) } catch {}
      state.me = r.name
      route()
    } catch (err) { $('.err', form).textContent = err.message; btn.disabled = false }
  })
}

// ---------- home ----------
const EXAMPLES = [
  'Which studies describe insurance as an adaptation decision, and what time horizons do they mention?',
  'Chart the number of studies per year by type of response.',
  'Find the papers about managed retreat and list who makes the decision in each.',
  'Draft a coding sheet for adaptation decisions (actor, decision, weather variable, time horizon) and pilot it on 15 papers.',
]
async function startChat(text) {
  const { id } = await api('/api/chats', { method: 'POST', body: { text } })
  location.hash = `#/c/${id}`
}
function renderHome() {
  app.innerHTML = shell('home', `<main class="page">
    <section class="hero">
      <div class="kicker">The Global Adaptation Mapping Initiative corpus</div>
      <h1>Adaptation <em>Almanac</em></h1>
      <p class="lede">Ask questions across every study the initiative coded, read the full texts, and keep what you find as charts, tables and documents.</p>
      <form class="askbox"><textarea rows="2" placeholder="Ask the almanac…" aria-label="Your question"></textarea><button class="btn" type="submit">Ask</button></form>
      <ul class="examples">${EXAMPLES.map(x => `<li><button type="button">${esc(x)}</button></li>`).join('')}</ul>
    </section>
    <section class="cols">
      <div><h2>Conversations</h2><ul class="list" id="h-chats"><li class="empty">Loading…</li></ul></div>
      <div><h2>Recent artifacts</h2><ul class="list" id="h-arts"><li class="empty">Loading…</li></ul></div>
      <div><h2>The corpus</h2><div id="h-corpus" class="muted">Loading…</div></div>
    </section>
    <p class="foot">Built on the GAMI database (Berrang-Ford et al. 2021, <i>Nature Climate Change</i>): studies of human adaptation to climate change, coded by the Global Adaptation Mapping Initiative, with full texts fetched through Stanford's library. Answers come from Claude reading the corpus. Every citation opens the PDF at its page.</p>
  </main>`)
  const form = $('.askbox'), ta = $('textarea', form)
  autosize(ta); submitOnEnter(ta, form); ta.focus()
  form.addEventListener('submit', async e => {
    e.preventDefault()
    const text = ta.value.trim(); if (!text) return
    const btn = $('button', form); btn.disabled = true
    try { await startChat(text) } catch (err) { btn.disabled = false; alertInline(form, err.message) }
  })
  $('.examples').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return
    ta.value = b.textContent; ta.dispatchEvent(new Event('input')); form.requestSubmit()
  })
  api('/api/chats').then(chats => {
    $('#h-chats').innerHTML = chats.length ? chats.slice(0, 8).map(c => `<li><a href="#/c/${c.id}"><div class="t">${esc(c.title)}</div><div class="m">${esc(c.author || '')} · ${when(c.updated)}${c.running ? ' · working' : ''}</div></a></li>`).join('')
      : '<li class="empty">Nothing asked yet.</li>'
  }).catch(() => {})
  api('/api/artifacts').then(arts => {
    $('#h-arts').innerHTML = arts.length ? arts.slice(0, 8).map(a => `<li><a href="#/a/${a.id}"><div class="t">${esc(a.title)}</div><div class="m">${KIND[a.kind] || a.kind} · ${when(a.created)}</div></a></li>`).join('')
      : '<li class="empty">Charts, tables and documents you make will collect here.</li>'
  }).catch(() => {})
  api('/api/stats').then(renderCorpus).catch(() => {})
}
function alertInline(after, msg) {
  const p = el('p', 'note-err', esc(msg)); after.after(p); setTimeout(() => p.remove(), 6000)
}
function bars(title, rows, total) {
  const max = Math.max(...rows.map(r => r.n), 1)
  return `<div class="bars"><h3>${esc(title)}</h3>${rows.map(r => `<div class="bar"><span class="lab" style="--w:${(100 * r.n / max).toFixed(1)}%" title="${esc(r.value)}">${esc(r.value)}</span><span class="n">${fmt(r.n)}</span></div>`).join('')}</div>`
}
function renderCorpus(s) {
  const t = s.totals
  const by = f => s.tags.filter(r => r.field === f)
  const yMax = Math.max(...s.years.map(y => y.n), 1)
  $('#h-corpus').classList.remove('muted')
  $('#h-corpus').innerHTML = `<div class="figs">
      <div class="fig"><b>${fmt(t.papers)}</b><span>coded studies</span></div>
      <div class="fig"><b>${fmt(t.full_text)}</b><span>in full text</span></div>
      <div class="fig"><b>${(t.words / 1e6).toFixed(1)}M</b><span>words</span></div>
      <div class="fig"><b>${t.first_year}–${String(t.last_year).slice(2)}</b><span>published</span></div></div>
    <div class="bars"><h3>Studies per year</h3><div class="years">${s.years.map(y => `<i style="height:${(100 * y.n / yMax).toFixed(1)}%" title="${y.year}: ${y.n}"></i>`).join('')}</div>
      <div class="years-axis"><span>${s.years[0]?.year ?? ''}</span><span>${s.years.at(-1)?.year ?? ''}</span></div></div>
    ${bars('By region', by('region'))}${bars('By type of response', by('response_type'))}${bars('By sector', by('sector'))}`
}

// ---------- conversation ----------
const LABEL = { sql: 'SQL', search: 'Search', read_paper: 'Read', save_table: 'Table', save_chart: 'Chart', save_page: 'Page',
  save_document: 'Document', list_artifacts: 'Artifacts', read_artifact: 'Open', code_papers: 'Coding run', job_status: 'Run status',
  cancel_job: 'Stop run', resume_job: 'Resume run' }
function describe(name, i = {}) {
  const one = s => String(s ?? '').replace(/\s+/g, ' ').trim()
  switch (name) {
    case 'sql': return one(i.query)
    case 'search': return one(i.query) + (i.where ? `   where ${one(i.where)}` : '')
    case 'read_paper': return `paper ${i.id}${i.pages ? `, pages ${i.pages}` : ''}`
    case 'save_table': case 'save_chart': case 'save_page': case 'save_document': return one(i.title)
    case 'read_artifact': return i.id
    case 'code_papers': return `${one(i.name)} · ${i.fields?.length ?? 0} fields · ${i.limit ? `${i.limit} papers` : 'all matching papers'}${i.source === 'summary' ? ' · summaries' : ''}${i.confirmed ? ' · confirmed' : ''}`
    case 'job_status': return i.job || 'all runs'
    case 'cancel_job': case 'resume_job': return i.job
    default: return ''
  }
}
async function loadSide(currentId) {
  const list = $('#side-list'); if (!list) return
  const chats = await api('/api/chats').catch(() => [])
  list.innerHTML = chats.map(c => `<li><a href="#/c/${c.id}" class="${c.id === currentId ? 'on' : ''}"><div class="t">${esc(c.title)}</div><div class="m">${esc(c.author || '')} · ${when(c.updated)}${c.running ? ' · working' : ''}</div></a></li>`).join('') || '<li class="empty">No conversations yet.</li>'
}
const nearBottom = () => window.innerHeight + window.scrollY > document.body.scrollHeight - 220
const toBottom = () => window.scrollTo(0, document.body.scrollHeight)

async function renderChat(id) {
  const view = { id, alive: true, last: 0, running: false, polling: false, answer: null, stream: null, streamText: '', streamTimer: null,
    steps: new Map(), jobs: new Map(),
    teardown() { this.alive = false; clearTimeout(this.streamTimer); for (const j of this.jobs.values()) clearInterval(j.timer) } }
  state.view = view
  app.innerHTML = shell('chat', `<div class="chat" id="chat">
    <aside class="side"><button class="btn" data-act="new">New question</button><ul class="list" id="side-list"></ul></aside>
    <div class="main"><div class="thread">
      <button class="btn ghost small side-toggle" data-act="side" style="margin-bottom:14px">All conversations</button>
      <div class="thread-meta"></div>
      <div id="turns"></div>
      <div class="thinking" hidden><span class="dot"></span><span class="tx">Working</span></div>
    </div>
    <div class="composer-wrap"><form class="composer"><textarea rows="1" placeholder="Ask a follow-up…" aria-label="Your message"></textarea><button class="btn" type="submit">Ask</button></form></div>
    </div></div>`)
  loadSide(id)
  view.turns = $('#turns'); view.thinkEl = $('.thinking')
  const form = $('.composer'), ta = $('textarea', form), btn = $('button', form)
  view.btn = btn
  autosize(ta); submitOnEnter(ta, form)
  form.addEventListener('submit', async e => {
    e.preventDefault()
    if (view.running) { btn.disabled = true; await api(`/api/chats/${id}/stop`, { method: 'POST' }).catch(() => {}); return }
    const text = ta.value.trim(); if (!text) return
    btn.disabled = true
    try {
      await api(`/api/chats/${id}/messages`, { method: 'POST', body: { text } })
      ta.value = ''; ta.dispatchEvent(new Event('input'))
      setRunning(view, true); poll(view)
    } catch (err) { alertInline(form, err.message) } finally { btn.disabled = false }
  })
  let snap
  try { snap = await api(`/api/chats/${id}`) } catch (err) { view.turns.innerHTML = `<p class="note-err">${esc(err.message)}</p>`; return }
  if (!view.alive) return
  document.title = `${snap.chat.title} · Adaptation Almanac`
  const meta = $('.thread-meta')
  meta.innerHTML = `<span>Started by ${esc(snap.chat.author || 'someone')} · ${when(snap.chat.created)}</span><button type="button" data-del>Delete conversation</button>`
  meta.querySelector('[data-del]').addEventListener('click', ev => confirmInline(ev.target, 'Delete this conversation?', async () => {
    await api(`/api/chats/${id}`, { method: 'DELETE' }); location.hash = '#/'
  }))
  for (const ev of snap.events) apply(view, ev)
  view.last = snap.last
  if (snap.partial) { ensureStream(view); view.streamText = snap.partial; renderStream(view) }
  setRunning(view, snap.running)
  toBottom()
  if (snap.running) poll(view)
  else ta.focus()
}
function setRunning(view, on) {
  view.running = on
  view.thinkEl.hidden = !on
  if (on) $('.tx', view.thinkEl).textContent = 'Working'
  view.btn.textContent = on ? 'Stop' : 'Ask'
  view.btn.classList.toggle('ghost', on)
  view.btn.disabled = false
}
async function poll(view) {
  if (view.polling) return
  view.polling = true
  while (view.alive && view.running) {
    try {
      const r = await api(`/api/chats/${view.id}/events?after=${view.last}&wait=25`)
      if (!view.alive) break
      const stick = nearBottom()
      for (const ev of r.events) if (ev.seq > view.last) { view.last = ev.seq; apply(view, ev) }
      if (!r.running) setRunning(view, false)
      if (stick) toBottom()
    } catch { if (!view.alive) break; await sleep(2500) }
  }
  view.polling = false
  if (view.alive) loadSide(view.id)
}
function answerEl(view) {
  if (!view.answer) { const t = el('section', 'turn'); t.append(view.answer = el('div', 'a')); view.turns.append(t) }
  return view.answer
}
function ensureStream(view) {
  if (!view.stream) { view.stream = el('div', 'md streaming'); answerEl(view).append(view.stream) }
}
function renderStream(view) { if (view.stream) view.stream.innerHTML = md(view.streamText) }
function stepsGroup(view) {
  const a = answerEl(view), last = a.lastElementChild
  if (last?.classList.contains('steps')) return last
  const g = el('div', 'steps'); a.append(g); return g
}
function stepEl(view, id, name, input) {
  let s = view.steps.get(id)
  if (!s) {
    s = el('div', 'step run', '<span class="st">●</span><span class="nm"></span><span class="dt"><span class="arg"></span><span class="res"></span></span>')
    s.addEventListener('click', () => s.classList.toggle('open'))
    stepsGroup(view).append(s)
    view.steps.set(id, s)
  }
  $('.nm', s).textContent = LABEL[name] || name
  if (input) $('.arg', s).textContent = describe(name, input) || ' '
  return s
}
function apply(view, ev) {
  switch (ev.type) {
    case 'user': {
      const t = el('section', 'turn', `<div class="q"><span class="who">${esc(ev.author || '')}</span><div class="qtext">${esc(ev.text)}</div></div>`)
      t.append(view.answer = el('div', 'a'))
      view.turns.append(t)
      view.stream = null; view.streamText = ''
      break
    }
    case 'delta':
      ensureStream(view)
      view.streamText += ev.text
      if (!view.streamTimer) view.streamTimer = setTimeout(() => { view.streamTimer = null; renderStream(view) }, 60)
      break
    case 'text':
      clearTimeout(view.streamTimer); view.streamTimer = null
      if (view.stream) { view.stream.innerHTML = md(ev.text); view.stream.classList.remove('streaming'); view.stream = null; view.streamText = '' }
      else answerEl(view).append(el('div', 'md', md(ev.text)))
      if (view.running) $('.tx', view.thinkEl).textContent = 'Working'
      break
    case 'thinking': {
      const line = String(ev.text || '').replace(/\s+/g, ' ').trim()
      $('.tx', view.thinkEl).textContent = line ? line.slice(-220) : 'Thinking'
      break
    }
    case 'tool_start': stepEl(view, ev.id, ev.name); break
    case 'tool': stepEl(view, ev.id, ev.name, ev.input); if (view.running) $('.tx', view.thinkEl).textContent = 'Working'; break
    case 'tool_result': {
      const s = view.steps.get(ev.id); if (!s) break
      s.classList.remove('run'); s.classList.add(ev.ok ? 'ok' : 'err')
      $('.st', s).textContent = ev.ok ? '✓' : '✕'
      $('.res', s).textContent = ev.summary || ''
      break
    }
    case 'artifact': answerEl(view).append(artifactCard(ev)); break
    case 'job': jobCard(view, ev); break
    case 'done':
      clearTimeout(view.streamTimer); view.streamTimer = null
      if (view.stream) { renderStream(view); view.stream.classList.remove('streaming'); view.stream = null }
      for (const s of view.steps.values()) if (s.classList.contains('run')) { s.classList.remove('run'); $('.st', s).textContent = '·' }
      if (ev.error) answerEl(view).append(el('p', 'note-err', esc(ev.error)))
      else if (ev.stopped) answerEl(view).append(el('p', 'note-stop', 'Stopped.'))
      break
    case 'error': answerEl(view).append(el('p', 'note-err', esc(ev.message))); break
  }
}
function confirmInline(btn, question, action) {
  const box = el('span', 'confirm', `${esc(question)} <button class="btn danger small" type="button">Delete</button><button class="btn ghost small" type="button">Keep</button>`)
  btn.replaceWith(box)
  const [yes, no] = box.querySelectorAll('button')
  yes.addEventListener('click', async () => { yes.disabled = true; try { await action() } catch (e) { box.replaceWith(el('span', 'note-err', esc(e.message))) } })
  no.addEventListener('click', () => box.replaceWith(btn))
}

// ---------- artifact cards, coding-run cards ----------
function artifactCard({ id, kind, title }) {
  const a = el('a', 'acard')
  a.href = `#/a/${id}`
  a.innerHTML = `<div class="hd"><span class="kind">${esc(KIND[kind] || kind)}</span><span class="tt">${esc(title)}</span><span class="open">Open →</span></div>`
  api(`/api/artifacts/${id}`).then(async art => {
    if (art.description) a.append(el('div', 'ds', esc(art.description)))
    if (art.kind === 'chart') a.append(el('div', 'pv', `<img src="${BASE}/a/${id}/chart.png" alt="${esc(art.title)}" loading="lazy">`))
    if (art.kind === 'table' || art.kind === 'coding') {
      const p = await fetch(`${BASE}/a/${id}/preview.json`).then(r => r.json())
      a.append(el('div', 'pv', `<div class="tbl-wrap">${dataTable(p, { limit: 5 })}</div>`))
    }
  }).catch(() => a.append(el('div', 'ds muted', 'This artifact was deleted.')))
  return a
}
function jobCard(view, ev) {
  let j = view.jobs.get(ev.job_id)
  if (!j) {
    j = { el: el('div', 'jobcard'), timer: null }
    view.jobs.set(ev.job_id, j)
    answerEl(view).append(j.el)
    const refresh = async () => {
      try {
        const job = await api(`/api/jobs/${ev.job_id}`)
        drawJob(j.el, job)
        if (job.status !== 'running') { clearInterval(j.timer); j.timer = null }
      } catch { clearInterval(j.timer); j.timer = null }
    }
    refresh()
    j.timer = setInterval(refresh, 4000)
  }
  drawJob(j.el, { id: ev.job_id, name: ev.name, status: ev.status, done: ev.done, total: ev.total, artifact_id: ev.artifact_id, errors: ev.errors || 0 })
}
function drawJob(box, job) {
  const pct = job.total ? (100 * (job.done + (job.errors || 0)) / job.total) : 0
  box.innerHTML = `<div class="row"><span class="kind kicker">Coding run</span><span class="tt">${esc(job.name)}</span><span class="stt ${esc(job.status)}">${esc(job.status)}</span></div>
    <div class="prog"><i style="width:${pct.toFixed(1)}%"></i></div>
    <div class="sub"><span>${fmt(job.done)} of ${fmt(job.total)} papers coded</span>${job.errors ? `<span>${fmt(job.errors)} errors</span>` : ''}
      ${job.est_tokens ? `<span>about ${(job.est_tokens / 1e6).toFixed(2)}M tokens</span>` : ''}
      ${job.artifact_id ? `<a href="#/a/${job.artifact_id}">Open the results →</a>` : ''}
      ${job.status === 'running' ? `<a href="#" data-stopjob="${job.id}">Stop</a>` : ''}</div>
    ${job.error ? `<div class="sub" style="color:var(--bad);margin-top:6px">${esc(job.error)}</div>` : ''}`
  const stop = box.querySelector('[data-stopjob]')
  if (stop) stop.addEventListener('click', async e => { e.preventDefault(); stop.textContent = 'Stopping…'; await api(`/api/jobs/${job.id}/cancel`, { method: 'POST' }).catch(() => {}) })
}

// ---------- tables ----------
function dataTable({ columns, rows }, { limit } = {}) {
  const pid = columns.indexOf('paper_id')
  const pageOf = {}
  columns.forEach((c, i) => { if (c.endsWith('_quote')) pageOf[i] = columns.indexOf(c.slice(0, -6) + '_page') })
  const shown = limit ? rows.slice(0, limit) : rows
  const cell = (v, i, r) => {
    const c = columns[i]
    if (v == null || v === '') return '<td></td>'
    if (typeof v === 'number') return `<td class="num">${esc(Number.isInteger(v) ? v : +v.toFixed(4))}</td>`
    const s = String(v)
    if (c.endsWith('_check')) return `<td class="${s === 'NOT FOUND' ? 'bad' : s.startsWith('found') ? 'good' : ''}">${esc(s)}</td>`
    if (c === 'pdf' && /^https?:/.test(s)) return `<td><a href="${esc(s.replace(/^https?:\/\/[^/]+/, ''))}" target="_blank" rel="noopener">PDF</a></td>`
    if (i === pid) return `<td class="num"><a href="${BASE}/papers/${encodeURIComponent(s)}.pdf" target="_blank" rel="noopener">${esc(s)}</a></td>`
    if (pid >= 0 && pageOf[i] >= 0 && r[pageOf[i]] != null) return `<td><div class="c"><a class="q" href="${BASE}/papers/${encodeURIComponent(r[pid])}.pdf#page=${r[pageOf[i]]}" target="_blank" rel="noopener" title="Open the PDF at page ${r[pageOf[i]]}">${esc(s)}</a></div></td>`
    return `<td><div class="c">${esc(s)}</div></td>`
  }
  return `<table class="data"><thead><tr>${columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${shown.map(r => `<tr>${r.map((v, i) => cell(v, i, r)).join('')}</tr>`).join('')}</tbody></table>`
}
document.addEventListener('click', e => {
  const c = e.target.closest('table.data td .c')
  if (c && !e.target.closest('a')) c.parentElement.classList.toggle('open')
})

// ---------- artifacts ----------
let vegaReady
const loadVega = () => (vegaReady ||= (async () => {
  for (const f of ['vega.js', 'vega-lite.js', 'vega-embed.js']) {
    await new Promise((ok, bad) => { const s = document.createElement('script'); s.src = `${BASE}/vendor/${f}`; s.onload = ok; s.onerror = bad; document.head.append(s) })
  }
})())

async function renderGallery() {
  document.title = 'Artifacts · Adaptation Almanac'
  app.innerHTML = shell('artifacts', `<main class="page">
    <div class="pagehead"><div><div class="kicker">Kept from conversations</div><h1>Artifacts</h1></div>
      <div class="chips">${['all', 'chart', 'table', 'coding', 'document', 'page'].map(k => `<button data-k="${k}" class="${k === 'all' ? 'on' : ''}">${k === 'all' ? 'All' : KIND[k] + 's'}</button>`).join('')}</div></div>
    <div class="grid" id="grid"><p class="empty">Loading…</p></div>
    <section class="runs"><h2>Coding runs</h2><div id="runs"><p class="empty">Loading…</p></div></section></main>`)
  const [arts, jobs] = await Promise.all([api('/api/artifacts'), api('/api/jobs')])
  const draw = k => {
    const list = arts.filter(a => k === 'all' || a.kind === k)
    $('#grid').innerHTML = list.length ? list.map(a => `<a class="gcard" href="#/a/${a.id}">
      <div class="thumb" data-thumb="${a.id}" data-kind="${a.kind}">${a.kind === 'chart' ? `<img src="${BASE}/a/${a.id}/chart.png" alt="" loading="lazy">` : `<span class="glyph">${{ table: '▦', coding: '✓', document: '¶', page: '⟨⟩' }[a.kind] || '·'}</span>`}</div>
      <div class="bd"><span class="kicker">${esc(KIND[a.kind] || a.kind)}</span><span class="tt">${esc(a.title)}</span><span class="ds">${esc(a.description)}</span>
      <span class="m">${esc(a.author || '')} · ${when(a.created)}${a.meta?.rows != null ? ` · ${fmt(a.meta.rows)} rows` : ''}</span></div></a>`).join('')
      : '<p class="empty">Nothing here yet. Ask for a chart, a table or a write-up in a conversation and it lands here.</p>'
    for (const t of document.querySelectorAll('[data-thumb][data-kind="table"], [data-thumb][data-kind="coding"]')) {
      fetch(`${BASE}/a/${t.dataset.thumb}/preview.json`).then(r => r.json()).then(p => {
        t.innerHTML = `<div style="transform:scale(.62);transform-origin:top left;width:161%;align-self:start;pointer-events:none">${dataTable({ columns: p.columns.slice(0, 4), rows: p.rows.map(r => r.slice(0, 4)) }, { limit: 7 })}</div>`
      }).catch(() => {})
    }
  }
  draw('all')
  $('.chips').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return
    document.querySelectorAll('.chips button').forEach(x => x.classList.toggle('on', x === b)); draw(b.dataset.k)
  })
  const runs = $('#runs')
  runs.innerHTML = jobs.length ? '' : '<p class="empty">No coding runs yet. Ask the almanac to code papers for you, starting with a small pilot.</p>'
  for (const j of jobs) { const box = el('div', 'jobcard'); drawJob(box, j); runs.append(box) }
}

async function renderArtifact(id) {
  app.innerHTML = shell('artifacts', `<main class="page"><div id="art"><p class="empty" style="padding-top:40px">Loading…</p></div></main>`)
  let a
  try { a = await api(`/api/artifacts/${id}`) } catch (e) { $('#art').innerHTML = `<p class="note-err" style="margin-top:40px">${esc(e.message)}</p>`; return }
  document.title = `${a.title} · Adaptation Almanac`
  const file = n => `${BASE}/a/${id}/${n}`
  $('#art').innerHTML = `<div class="ahead"><a class="kicker" href="#/artifacts" style="text-decoration:none">${esc(KIND[a.kind] || a.kind)} ←</a>
      <h1>${esc(a.title)}</h1>${a.description ? `<p class="ds">${esc(a.description)}</p>` : ''}
      <div class="m">Made ${when(a.created)}${a.author ? ` for ${esc(a.author)}` : ''}${a.chat_id ? ` in <a href="#/c/${a.chat_id}">${esc(a.chat_title || 'a conversation')}</a>` : ''}${a.meta?.rows != null ? ` · ${fmt(a.meta.rows)} rows` : ''}</div></div>
    <div class="actions">${(a.files || []).map(f => `<a class="btn ghost small" href="${file(f.name)}?download=1">${esc(f.label)}</a>`).join('')}
      ${a.kind === 'page' ? `<a class="btn ghost small" href="${file('page.html')}" target="_blank" rel="noopener">Open in a new tab</a>` : ''}
      <button class="btn danger small" type="button" data-del style="margin-left:auto">Delete</button></div>
    <div id="body"></div>`
  $('[data-del]').addEventListener('click', ev => confirmInline(ev.target, 'Delete this artifact?', async () => {
    await api(`/api/artifacts/${id}`, { method: 'DELETE' }); location.hash = '#/artifacts'
  }))
  const body = $('#body')
  if (a.kind === 'chart') {
    body.innerHTML = '<div class="panel"><div id="vis"></div></div>'
    try {
      const [spec] = await Promise.all([fetch(file('chart.json')).then(r => r.json()), loadVega()])
      // a single view fills the panel; facets and concatenations keep their own sizes
      if (!['facet', 'hconcat', 'vconcat', 'concat', 'repeat'].some(k => k in spec)) { spec.width = 'container'; spec.autosize = { type: 'fit-x', contains: 'padding' } }
      await window.vegaEmbed('#vis', spec, { actions: false, renderer: 'svg' })
    } catch (e) { $('#vis').innerHTML = `<img src="${file('chart.png')}" alt="" style="max-width:100%">` }
  } else if (a.kind === 'table' || a.kind === 'coding') {
    const p = await fetch(file('preview.json')).then(r => r.json())
    body.innerHTML = `<div class="tbl-wrap">${dataTable(p)}</div>${a.meta.rows > p.rows.length ? `<p class="muted" style="font-size:14px">Showing the first ${fmt(p.rows.length)} of ${fmt(a.meta.rows)} rows. The download has all of them.</p>` : ''}`
  } else if (a.kind === 'page') {
    body.innerHTML = `<iframe class="pageframe" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals" src="${file('page.html')}" title="${esc(a.title)}"></iframe>`
  } else if (a.kind === 'document') {
    const text = await fetch(file('document.md')).then(r => r.text())
    body.innerHTML = `<div class="panel doc md">${md(text)}</div>`
  }
}

// ---------- start ----------
api('/api/me').then(r => { state.me = r.name }).catch(() => {}).finally(route)
