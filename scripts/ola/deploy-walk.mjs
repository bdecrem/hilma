#!/usr/bin/env node
// OLA-94 checker walk: a person on a phone (390 px, headless Chromium) uses app.ola.cx across the
// moment a deploy restarts the front desk, and every error, failed load, "Lost the connection"
// banner, hung request or lost message is written down with its time.
//
//   node scripts/ola/deploy-walk.mjs setup  <out dir>      made-up person + project on the test server
//   node scripts/ola/deploy-walk.mjs walk   <out dir> [--max-min 40]
//   node scripts/ola/deploy-walk.mjs cleanup <out dir>
//
// It does not start a deploy: it watches the mini (launchctl PIDs of cx.ola.frontdesk/tls/tunnel/
// gateway, and the newest ~/Library/Logs/ola/deploy-*.log) and acts on the deploy's own lines:
//   "suite tls: node"      → R1, a short request ("before"), answered before the restart
//   "suite restart: node"  → R2, a long answer on page A (streams across the restart), and a 40 MB
//                             upload on the Files page (in flight across it)
//   "suite restart: passed"→ R3, a short request in a second conversation (page F), landing while
//                             the front desk drains/restarts ("during")
//   R2 done                → R4, a short follow-up on page A ("after")
// Page B reloads the home page every ~0.7 s from the start until 90 s after the restart.
// The password and the setup link live in <out>/.secret (mode 600) and are never printed.
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [mode, OUT] = process.argv.slice(2)
const args = process.argv.slice(4)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
if (!mode || !OUT) throw new Error('usage: deploy-walk.mjs setup|walk|cleanup <out dir>')
mkdirSync(OUT, { recursive: true })
const ORIGIN = 'https://app.ola.cx'
const SSH = 'admin@100.95.51.98'
const WHO = process.env.OLA94_WHO || 'ola94check'
const ID = process.env.OLA94_ID || 'ola94-check'
const SECRET = path.join(OUT, '.secret')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const iso = (t = Date.now()) => new Date(t).toISOString().slice(11, 23)

const REMOTE = `
const fs = require('fs'), cp = require('child_process')
const env = { ...process.env, OLA_HOME: process.env.HOME + '/.ola' }
for (const l of fs.readFileSync(process.env.HOME + '/.ola/frontdesk.env', 'utf8').split('\\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const [tool, ...rest] = process.argv.slice(2)
const r = cp.spawnSync(process.execPath, [tool, ...rest], { env, encoding: 'utf8' })
process.stdout.write(r.stdout); process.stderr.write(r.stderr); process.exit(r.status ?? 1)
`
function remote(tool, a, { ok = false } = {}) {
  const q = a.map((s) => `'${String(s).replace(/'/g, `'\\''`)}'`).join(' ')
  const r = spawnSync('ssh', ['-o', 'ConnectTimeout=15', SSH, `cd ~/ola-staging/current/apps/activist-ai && PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin node - ${tool} ${q}`], { input: REMOTE, encoding: 'utf8', timeout: 600_000 })
  if (r.status !== 0 && !ok) throw new Error(`${tool} ${a[0]}: ${(r.stderr || '').trim().split('\n').pop()}`)
  return (r.stdout || '').trim()
}
const admin = (...a) => remote('frontdesk/admin.mjs', a)

if (mode === 'setup') {
  const listed = admin('list')
  if (new RegExp(`^person ${WHO} .* suspended`, 'm').test(listed)) throw new Error(`${WHO} is suspended from an earlier walk: set OLA94_WHO / OLA94_ID`)
  if (!new RegExp(`^person ${WHO} `, 'm').test(listed)) console.log(admin('add-person', WHO, '--name', 'Robin Checker (made up)').split('\n').filter((l) => !l.includes('://')).join('\n'))
  if (!new RegExp(`^workspace ${ID} `, 'm').test(listed)) console.log(admin('create-workspace', ID, '--name', 'Made-up block association', '--team', `${ID}-team`, '--team-name', 'Made-up Oak Street Block', '--owner', WHO, '--memory', '2g', '--disk', '2g', '--cpus', '2').split('\n').slice(-3).join('\n'))
  const link = admin('invite', WHO, '--hours', '3').split(/\s+/).find((w) => w.startsWith('https://'))
  if (!link) throw new Error('no setup link')
  writeFileSync(SECRET, JSON.stringify({ link, password: `made up ${randomBytes(9).toString('base64url')} walk` }))
  chmodSync(SECRET, 0o600)
  console.log(`setup done: person ${WHO}, project ${ID}; secret in ${SECRET}`)
  process.exit(0)
}
if (mode === 'cleanup') {
  const listed = admin('list')
  if (new RegExp(`^workspace ${ID} `, 'm').test(listed)) remote('workspace/ws.mjs', ['destroy', ID, '--confirm', ID], { ok: true }), console.log(`cleanup: ${ID} destroyed`)
  if (new RegExp(`^person ${WHO} .* active`, 'm').test(listed)) admin('suspend', WHO), console.log(`cleanup: ${WHO} suspended`)
  console.log(admin('list').split('\n').filter((l) => l.includes(WHO) || l.includes(ID)).join('\n') || 'cleanup: nothing of the walk is listed')
  process.exit(0)
}

// ---------------------------------------------------------------- walk
const { link, password } = JSON.parse(readFileSync(SECRET, 'utf8'))
const EV = path.join(OUT, 'events.jsonl')
const ev = (kind, data = {}) => {
  const row = { t: iso(), ms: Date.now(), kind, ...data }
  appendFileSync(EV, JSON.stringify(row) + '\n')
  console.log(`${row.t} ${kind} ${JSON.stringify(data).slice(0, 300)}`)
}
const problems = []
const problem = (what, data = {}) => (problems.push({ t: iso(), what, ...data }), ev('PROBLEM', { what, ...data }))

// The mini's side: PIDs and the deploy's own lines, as they happen.
const WATCH = `
const fs = require('fs'), cp = require('child_process'), path = require('path')
const L = process.env.HOME + '/Library/Logs/ola', K = process.env.HOME + '/ola-deploy-last.log'
const last = {}, sizes = {}; let first = true
const out = (o) => console.log(JSON.stringify({ mt: Date.now(), ...o }))
setInterval(() => {
  let o = ''; try { o = cp.execSync('launchctl list', { encoding: 'utf8' }) } catch {}
  for (const l of o.split('\\n')) { const m = l.split('\\t'); if (m[2] && /^cx\\.ola\\.(frontdesk|tls|tunnel|gateway)$/.test(m[2]) && last[m[2]] !== m[0]) { if (!first) out({ kind: 'pid', job: m[2], from: last[m[2]], to: m[0] }); else out({ kind: 'pid0', job: m[2], pid: m[0] }); last[m[2]] = m[0] } }
  const files = fs.readdirSync(L).filter((f) => f.startsWith('deploy-')).map((f) => path.join(L, f)).concat([K])
  for (const f of files) {
    let st; try { st = fs.statSync(f) } catch { continue }
    if (!(f in sizes)) { sizes[f] = first ? st.size : 0 }
    if (st.size < sizes[f]) sizes[f] = 0
    if (st.size > sizes[f]) {
      const fd = fs.openSync(f, 'r'); const b = Buffer.alloc(st.size - sizes[f]); fs.readSync(fd, b, 0, b.length, sizes[f]); fs.closeSync(fd); sizes[f] = st.size
      for (const l of b.toString().split('\\n')) if (/^(suite |restarted |cx\\.ola\\..* unchanged|the new release|refused|deploy rc=|turn:)/.test(l)) out({ kind: 'log', file: path.basename(f), line: l.slice(0, 200) })
    }
  }
  first = false
}, 250)
`
const watcher = spawn('ssh', ['-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=5', SSH, 'PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin node -'], { stdio: ['pipe', 'pipe', 'pipe'] })
watcher.stdin.end(WATCH)
const marks = {}
let buf = ''
watcher.stdout.on('data', (d) => {
  buf += d
  let i
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i)
    buf = buf.slice(i + 1)
    let o
    try { o = JSON.parse(line) } catch { continue }
    ev(`mini:${o.kind}`, o)
    if (o.kind === 'log') {
      if (/^suite frontdesk: passed/.test(o.line)) marks.fdPassed ??= Date.now()
      if (/^suite tls: node/.test(o.line)) marks.tls ??= Date.now()
      if (/^suite restart: node/.test(o.line)) marks.restartSuite ??= Date.now()
      if (/^suite restart: passed/.test(o.line)) marks.restartPassed ??= Date.now()
      if (/^suite \w+: FAILED|^refused/.test(o.line)) marks.refused ??= Date.now()
    }
    if (o.kind === 'pid' && o.job === 'cx.ola.frontdesk') {
      if (o.to === '-') marks.deskDown ??= Date.now()
      else marks.deskUp ??= Date.now()
    }
    if (o.kind === 'pid' && o.job !== 'cx.ola.frontdesk') marks.otherRestart = (marks.otherRestart ?? []).concat(o.job)
  }
})
watcher.stderr.on('data', (d) => ev('mini:stderr', { s: String(d).slice(0, 200) }))
const restartAt = () => marks.deskUp ?? marks.deskDown

const { chromium } = await import('playwright')
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const watchPage = (p, name) => {
  p.on('requestfailed', (r) => { const u = r.url(); if (name === 'B' && r.failure()?.errorText === 'net::ERR_ABORTED') return; if (!/^(data|blob):/.test(u)) problem(`${name}: request failed`, { url: u.slice(0, 160), method: r.method(), err: r.failure()?.errorText }) })
  p.on('response', (r) => { if (r.status() >= 500) problem(`${name}: HTTP ${r.status()}`, { url: r.url().slice(0, 160), method: r.request().method() }) })
  p.on('pageerror', (e) => problem(`${name}: page error`, { msg: String(e.message).slice(0, 200) }))
  p.on('console', (m) => { if (m.type() === 'error') ev(`${name}:console-error`, { text: m.text().slice(0, 200) }) })
}
let shotN = 0
const shot = async (p, label) => {
  const f = path.join(OUT, `${String(++shotN).padStart(3, '0')}-${iso().replace(/[:.]/g, '')}-${label}.png`)
  await p.screenshot({ path: f }).catch(() => {})
  return f
}

// The project's computer must stay asleep while the front desk suite checks the machine has room
// (a running project fills it and the deploy is refused): sign in only once that suite passed.
if (!args.includes('--now')) {
  ev('waiting for the front desk suite to pass before waking the project')
  const endW = Date.now() + Number(opt('--max-min', 40)) * 60_000
  while (!marks.fdPassed && !marks.refused && Date.now() < endW) await sleep(250)
  if (!marks.fdPassed) { ev('no front desk pass: stopping', { marks }); watcher.kill(); await browser.close(); process.exit(2) }
}
// Page A: sign in from the setup link, land in the project's conversation.
const A = await ctx.newPage()
watchPage(A, 'A')
const used = path.join(OUT, '.secret-used')
if (!existsSync(used)) {
  await A.goto(link)
  await A.getByLabel('Choose a password').fill(password)
  await A.getByRole('button', { name: 'Make my account' }).click()
  writeFileSync(used, '1')
} else {
  await A.goto(`${ORIGIN}/`)
  await A.waitForSelector('input[type=password]')
  await A.locator('input').first().fill(WHO)
  await A.locator('input[type=password]').fill(password)
  await A.getByRole('button', { name: /sign in/i }).click()
}
await A.waitForSelector('.project-title', { timeout: 90_000 })
await A.locator('.empty-title:visible, .thing:visible, .drawer.open #ask-input:visible').first().waitFor({ timeout: 90_000 })
const projectUrl = A.url()
ev('signed-in', { url: projectUrl.replace(/#.*/, '') })
await shot(A, 'A-signed-in')

async function openDrawer(p) {
  for (let i = 0; i < 40 && !(await p.locator('.drawer.open').count()) && !(await p.getByRole('tab', { name: /Conversation/ }).isVisible().catch(() => false)) && !(await p.locator('.askbar-open').isVisible().catch(() => false)); i++) await sleep(250)
  if (!(await p.locator('.drawer.open').count())) {
    const tab = p.getByRole('tab', { name: /Conversation/ })
    if (await tab.isVisible().catch(() => false)) await tab.click()
    else await p.locator('.askbar-open').click()
  }
  await p.locator('.drawer.open').waitFor({ timeout: 10_000 })
}
async function ask(p, name, text) {
  await openDrawer(p)
  const before = await p.locator('.drawer .turn').count()
  const t0 = Date.now()
  await p.locator('#ask-input').fill(text)
  const send = p.locator('.composer button[type="submit"]')
  if (await send.isDisabled().catch(() => true)) problem(`${name}: the send button is disabled`, { connection: await p.locator('.drawer').innerText().then((s) => s.slice(0, 160)).catch(() => '') })
  await send.click({ timeout: 30_000 })
  ev(`${name}:sent`, { text: text.slice(0, 80) })
  const end = Date.now() + 30_000
  while ((await p.locator('.drawer .turn').count()) <= before) {
    if (Date.now() > end) { problem(`${name}: the request never showed in the conversation`, { s: 30 }); return null }
    await sleep(200)
  }
  ev(`${name}:shown`, { ms: Date.now() - t0 })
  return t0
}
async function finish(p, name, t0, limitMs) {
  const end = Date.now() + limitMs
  let firstWords = null
  while (Date.now() < end) {
    const turn = p.locator('.drawer .turn').last()
    const st = await turn.getAttribute('data-status').catch(() => null)
    const said = ((await turn.locator('.said-ola').innerText().catch(() => '')) || '').trim()
    if (said && !firstWords) (firstWords = Date.now()), ev(`${name}:first-words`, { ms: firstWords - t0 })
    const card = p.locator('.drawer .question-card').last()
    if ((await card.count()) && (await card.isVisible().catch(() => false))) {
      const opt1 = card.locator('.question-option').first()
      ev(`${name}:question-card`, { text: (await card.innerText()).replace(/\s+/g, ' ').slice(0, 160) })
      if (await opt1.count()) await opt1.click().catch(() => {})
      await sleep(1500)
      continue
    }
    if (await p.locator('dialog.approval[open]').count()) {
      ev(`${name}:approval`, { text: (await p.locator('dialog.approval[open]').innerText()).replace(/\s+/g, ' ').slice(0, 160) })
      await p.locator('dialog.approval[open]').getByRole('button').first().click().catch(() => {})
      continue
    }
    if (st && st !== 'working' && st !== 'sending') {
      const words = said.split(/\s+/).filter(Boolean).length
      ev(`${name}:ended`, { status: st, ms: Date.now() - t0, words, tail: said.slice(-160) })
      writeFileSync(path.join(OUT, `${name}-reply.txt`), said)
      if (st !== 'done') problem(`${name}: the run ended "${st}"`, { tail: said.slice(-200) })
      if (!words) problem(`${name}: no answer text`)
      return { st, said }
    }
    await sleep(500)
  }
  problem(`${name}: no answer within ${Math.round(limitMs / 1000)} s (hung)`)
  await shot(p, `${name}-hung`)
  return null
}

// Warm-up: wake the project and prove the account works.
const t0w = await ask(A, 'R0', 'Say hello in one short line.')
if (t0w) await finish(A, 'R0', t0w, 300_000)
await shot(A, 'A-after-R0')

// Page F: a second tab of the same project, on a new conversation, ready for "during".
const F = await ctx.newPage()
watchPage(F, 'F')
await F.goto(projectUrl)
await F.waitForSelector('.project-title', { timeout: 60_000 })
await openDrawer(F)
await F.getByRole('button', { name: 'New conversation' }).click().catch((e) => ev('F:no-new-conversation', { e: e.message.slice(0, 100) }))
await sleep(1500)
ev('F:ready', { turns: await F.locator('.drawer .turn').count(), shot: await shot(F, 'F-ready') })

// Page E: the project's Files page, for the upload.
const E = await ctx.newPage()
watchPage(E, 'E')
const wid = new URL(projectUrl).searchParams.get('w')
await E.goto(`${ORIGIN}/?w=${wid}#/files`)
await E.waitForSelector('#file-picker', { state: 'attached', timeout: 60_000 })
ev('E:ready', { w: wid })

// The banner and the connection, on A and F, every 250 ms.
const banner = { A: null, F: null }
let stopAll = false
const bannerLoop = async (p, name) => {
  while (!stopAll) {
    const txt = await p.locator('body').innerText().catch(() => '')
    const on = /Lost the connection/i.test(txt)
    if (on && !banner[name]) (banner[name] = Date.now()), problem(`${name}: "Lost the connection" banner shown`), await shot(p, `${name}-banner`)
    if (!on && banner[name]) ev(`${name}:banner-gone`, { ms: Date.now() - banner[name] }), (banner[name] = null)
    await sleep(250)
  }
}
const bannerA = bannerLoop(A, 'A')
const bannerF = bannerLoop(F, 'F')

// Page B: the home page, reloaded every ~0.7 s.
const B = await ctx.newPage()
watchPage(B, 'B')
let reloads = 0
let reloadBad = 0
const reloadLoop = (async () => {
  while (!stopAll) {
    const r = restartAt()
    if (r && Date.now() - r > 90_000) break
    const t = Date.now()
    let status = null
    let err = null
    try {
      const resp = await B.goto(`${ORIGIN}/`, { timeout: 30_000, waitUntil: 'load' })
      status = resp?.status() ?? null
      await B.waitForSelector('main, .project-title, .projects, h1', { timeout: 15_000 })
    } catch (e) {
      err = String(e.message).split('\n')[0].slice(0, 160)
      if (/has been closed/.test(err)) break
    }
    const ms = Date.now() - t
    const body = (await B.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120)
    reloads++
    const bad = err || !status || status >= 400 || !body || /bad gateway|502|503|504|not available|can.t be reached|error/i.test(body)
    if (bad) reloadBad++, problem('B: home page reload went wrong', { status, ms, err, body, shot: await shot(B, 'B-bad') })
    else if (ms > 5000) problem('B: home page reload slow', { status, ms })
    if (reloads % 20 === 1 || bad || (r && Date.now() - r < 15_000)) ev('B:reload', { n: reloads, status, ms, body: body.slice(0, 60) })
    await sleep(700)
  }
})()

// The upload: 40 MB of made-up bytes, started at the restart suite.
let uploadDone = null
async function upload() {
  const name = `ola94 big scan ${Date.now() % 100000}.bin`
  const t = Date.now()
  ev('E:upload-start', { name, mb: 40 })
  try {
    await E.locator('#file-picker').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: randomBytes(40 * 1024 * 1024) })
    await E.waitForSelector(`table.files .file-name:has-text("${name}")`, { timeout: 240_000 })
    ev('E:upload-listed', { ms: Date.now() - t })
    // The list after a reload, from the server, not the page's own memory.
    await E.reload()
    await E.waitForSelector(`table.files .file-name:has-text("${name}")`, { timeout: 60_000 })
    ev('E:upload-listed-after-reload', { ms: Date.now() - t })
    uploadDone = true
  } catch (e) {
    uploadDone = false
    problem('E: the upload did not land', { err: String(e.message).split('\n')[0].slice(0, 200), page: (await E.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200) })
  }
  await shot(E, 'E-upload')
}

const until = async (fn, ms) => { const end = Date.now() + ms; while (!fn()) { if (Date.now() > end) return false; await sleep(150) } return true }
const maxMs = Number(opt('--max-min', 40)) * 60_000
ev('waiting for the deploy', { maxMin: maxMs / 60000 })
let r1 = null
if (await until(() => marks.tls || marks.restartSuite || marks.refused, maxMs)) {
  if (marks.refused && !marks.tls) ev('the deploy was refused before the restart')
  else {
    const t1 = await ask(A, 'R1', 'In three short lines: what should be on the agenda of a first block association meeting?')
    r1 = t1 ? finish(A, 'R1', t1, 240_000) : null
  }
}
await until(() => marks.restartSuite || marks.restartPassed || restartAt() || marks.refused, 10 * 60_000)
await r1
let r2 = null
let up = null
if (!marks.refused || marks.restartSuite) {
  up = upload()
  // R1 may still run: the long answer goes as soon as the composer is free.
  await until(() => !marks.restartPassed || true, 0)
  const t2 = await ask(A, 'R2', 'Write a long plain-text guide, about 1200 words, right here in the conversation (no files): how a small block association runs its first meeting, who speaks, how notes are taken, how decisions are made.')
  ev('R2 sent relative to the restart suite', { msAfterSuite: Date.now() - (marks.restartSuite ?? Date.now()) })
  r2 = t2 ? finish(A, 'R2', t2, 12 * 60_000) : null
}
await until(() => marks.restartPassed || restartAt(), 120_000)
await shot(A, 'A-at-restart')
const t3 = await ask(F, 'R3', 'In one line: how long should a first meeting last?')
ev('R3 sent relative to the restart', { msAfterRestartPassed: marks.restartPassed ? Date.now() - marks.restartPassed : null, deskDown: marks.deskDown ? Date.now() - marks.deskDown : null, deskUp: marks.deskUp ? Date.now() - marks.deskUp : null })
const r3 = t3 ? finish(F, 'R3', t3, 300_000) : null
await until(() => restartAt(), 60_000)
await shot(A, 'A-after-restart')
await shot(B, 'B-after-restart')
await r2
await r3
const t4 = await ask(A, 'R4', 'Thanks. In one line: what is the first item on that agenda?')
if (t4) await finish(A, 'R4', t4, 300_000)
await up
await shot(A, 'A-end')
await shot(F, 'F-end')
// Keep the reloads going to 90 s after the restart.
await reloadLoop
stopAll = true
await Promise.all([bannerA, bannerF])
// The conversation after a fresh load: every request and its answer still there.
await A.reload()
await openDrawer(A)
await sleep(3000)
const turns = await A.locator('.drawer .turn').count()
ev('A:after-fresh-load', { turns, text: (await A.locator('.drawer').innerText()).replace(/\s+/g, ' ').slice(0, 400) })
if (turns < 4) problem('A: after a fresh load the conversation has fewer turns than were sent', { turns, sent: 4 })
await shot(A, 'A-fresh-load')
watcher.kill()
await browser.close()
const summary = { marks: Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, typeof v === 'number' ? iso(v) : v])), reloads, reloadBad, uploadDone, problems }
writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
process.exit(0)
