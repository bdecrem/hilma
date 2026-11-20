// What every check shares: find the page in a folder, serve it, open it in Chromium with every AI
// call stubbed, hand the page to the problem's check, take a 1280x800 screenshot.
//
// The folder is served by our own static server, never by a server the model wrote: a model's
// server could read a key and call a real model, and the check must need no key and no network to
// a model. Any request for a path that is not a file in the folder (an /api/... the model's own
// server would answer) and any request to a known AI host gets the stub's answer, which carries the
// same words in the shapes the common APIs use (Anthropic, OpenAI, Ollama, a plain {words:[...]}).
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { AI_HOSTS, stubBody } from './stub.mjs'
import { spawn } from 'node:child_process'
import os from 'node:os'
import net from 'node:net'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const WEB = '/Users/bartdecrem/Documents/coding2025/hilma/apps/activist-ai/web/package.json'
const require = createRequire(fs.existsSync(path.join(HERE, '../../../web/node_modules/playwright')) ? path.join(HERE, '../../../web/package.json') : WEB)
const { chromium } = require('playwright')

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain' }

// The page to open: index.html; else the one html file; else the html whose name or title has a
// problem keyword; else the newest. Looks one level of folders deep (dist/, public/, app/).
export function findPage(folder, keywords = []) {
  const htmls = []
  const walk = (d, depth) => {
    if (!fs.existsSync(d)) return
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue
      const f = path.join(d, e.name)
      if (e.isDirectory() && depth < 2) walk(f, depth + 1)
      else if (e.isFile() && /\.html?$/i.test(e.name)) htmls.push(f)
    }
  }
  walk(folder, 0)
  if (!htmls.length) return null
  const top = htmls.filter((f) => path.dirname(f) === folder)
  const pool = top.length ? top : htmls
  const idx = pool.find((f) => /^index\.html?$/i.test(path.basename(f)))
  if (idx && pool.length === 1) return idx
  if (pool.length === 1) return pool[0]
  const kw = pool.filter((f) => keywords.some((k) => (path.basename(f) + fs.readFileSync(f, 'utf8').slice(0, 3000).match(/<title>([^<]*)/i)?.[1]).toLowerCase().includes(k)))
  if (kw.length) return kw.find((f) => /^index/i.test(path.basename(f))) || kw[0]
  if (idx) return idx
  return pool.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
}

function serve(root, pageDir = root) {
  const calls = []
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x')
    let f = path.normalize(path.join(root, decodeURIComponent(u.pathname)))
    if (!f.startsWith(root)) { res.writeHead(403); return res.end() }
    // A page in public/ that asks for /style.css: look beside the page too.
    if (!fs.existsSync(f)) { const g = path.normalize(path.join(pageDir, decodeURIComponent(u.pathname))); if (g.startsWith(root) && fs.existsSync(g)) f = g }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html')
    if (fs.existsSync(f) && fs.statSync(f).isFile() && req.method === 'GET') {
      res.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' })
      return fs.createReadStream(f).pipe(res)
    }
    if (/\.(ico|css|js|mjs|png|jpe?g|gif|svg|webp|woff2?|ttf|otf|map|html?)$/i.test(u.pathname)) { res.writeHead(404); return res.end() }
    calls.push(`${req.method} ${u.pathname}`)
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
    res.end(stubBody())
  })
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ srv, port: srv.address().port, calls })))
}

// A Node server the model wrote, run so the page gets what that server computes (a grid built
// server-side, say): its own folder, an empty HOME, no keys but stand-ins, every AI call answered
// by the stub (preload.mjs). Started in its own process group and stopped by that id.
const SERVER_FILES = ['server.js', 'server.mjs', 'server.cjs', 'app.js', 'index.js', 'index.mjs', 'main.js']
async function startServer(folder) {
  const file = SERVER_FILES.map((f) => path.join(folder, f)).find((f) => fs.existsSync(f) && /createServer|express\(|\.listen\(|Bun\.serve|fastify|hono/.test(fs.readFileSync(f, 'utf8')))
  if (!file) return null
  const port = await new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)) }) })
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apps-server-'))
  const log = path.join(tmp, 'stub.log')
  const env = { PATH: process.env.PATH, HOME: tmp, TMPDIR: tmp, PORT: String(port), HOST: '127.0.0.1', APPS_STUB_LOG: log, ANTHROPIC_API_KEY: 'sk-ant-stub', OPENAI_API_KEY: 'sk-stub', TOGETHER_API_KEY: 'stub', NODE_ENV: 'production', BROWSER: '/usr/bin/true' }
  const out = fs.openSync(path.join(tmp, 'server.log'), 'a')
  const c = spawn(process.execPath, ['--import', pathToFileURL(path.join(HERE, 'preload.mjs')).href, file], { cwd: folder, env, detached: true, stdio: ['ignore', out, out] })
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250))
    const up = await new Promise((ok) => { const s = net.connect(port, '127.0.0.1', () => { s.end(); ok(true) }); s.on('error', () => ok(false)) })
    if (up) return { pid: c.pid, port, log, note: `ran the model's server ${path.basename(file)} with AI calls stubbed` }
    if (c.exitCode !== null) break
  }
  try { process.kill(-c.pid, 'SIGTERM') } catch {}
  return { note: `the model's server ${path.basename(file)} did not start; served the files instead` }
}

export async function checkFolder(problem, folder, { shot } = {}) {
  // A private problem set (OLA_APP_PROBLEMS_DIR, run.mjs) keeps its checks beside its list.
  const checks = process.env.OLA_APP_PROBLEMS_DIR ? path.join(path.resolve(process.env.OLA_APP_PROBLEMS_DIR), 'checks') : path.join(HERE, '../checks')
  const mod = await import(pathToFileURL(path.join(checks, `${problem.id}.mjs`)).href + `?t=${Date.now()}`)
  const names = mod.NAMES
  const result = { page: null, checks: [], notes: [] }
  const fill = (got) => { result.checks = names.map((n) => ({ name: n, pass: !!got[n] })) }
  const page0 = findPage(folder, problem.keywords)
  if (!page0) { result.notes.push('no html file'); fill({}); return result }
  result.page = path.relative(folder, page0)
  const { srv, port, calls } = await serve(folder, path.dirname(page0))
  const own = await startServer(folder)
  if (own?.note) result.notes.push(own.note)
  const browser = await chromium.launch()
  const got = {}
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const aiCalls = []
    await ctx.route(AI_HOSTS, (r) => { aiCalls.push(r.request().url()); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: stubBody() }) })
    const errors = []
    const url = own?.port ? `http://127.0.0.1:${own.port}/` : `http://127.0.0.1:${port}/${result.page.split(path.sep).map(encodeURIComponent).join('/')}`
    const stubbedInServer = () => (own?.log && fs.existsSync(own.log) ? fs.readFileSync(own.log, 'utf8').split('\n').filter(Boolean).length : 0)
    const env = { ctx, url, errors, aiCalls, serverCalls: calls, notes: result.notes, folder, aiCount: () => calls.length + aiCalls.length + stubbedInServer() }
    await mod.check(env, got).catch((e) => result.notes.push(`check stopped: ${String(e.message || e).split('\n')[0].slice(0, 200)}`))
    if (shot && env.page) await env.page.screenshot({ path: shot }).catch(() => {})
    if (errors.length) result.notes.push(`page errors: ${errors.slice(0, 3).join(' | ').slice(0, 300)}`)
    if (aiCalls.length || calls.length) result.notes.push(`stubbed calls: ${[...calls, ...aiCalls].slice(0, 4).join(', ')}`)
  } finally {
    await browser.close()
    srv.close()
    if (own?.pid) { try { process.kill(-own.pid, 'SIGTERM') } catch {} }
  }
  fill(got)
  return result
}

// Small helpers the checks share.
export async function open(env, opts = {}) {
  const page = env.page || (await env.ctx.newPage())
  if (!env.page) {
    page.on('pageerror', (e) => env.errors.push(String(e.message || e)))
    page.on('dialog', (d) => { (env.dialogs ||= []).push(d.message()); d.accept(d.type() === 'prompt' ? 'Ana Lopez' : undefined).catch(() => {}) })
  }
  env.page = page
  await page.goto(env.url, { waitUntil: 'load', timeout: 20000 })
  await page.waitForTimeout(opts.settle ?? 800)
  return page
}
export const text = (page) => page.evaluate(() => document.body?.innerText || '')
export const wait = (page, ms) => page.waitForTimeout(ms)
// Visible, enabled buttons (and button-like links) whose text matches.
export async function clickText(page, re, { exclude, tried } = {}) {
  // Buttons before links (a nav link can say "New puzzle" too); with `tried`, each control once.
  for (const sel of ['button, [role=button], input[type=button], input[type=submit]', 'a']) {
    const els = page.locator(sel)
    const n = await els.count()
    for (let i = 0; i < n; i++) {
      const e = els.nth(i)
      if (!(await e.isVisible().catch(() => false))) continue
      const t = (((await e.innerText().catch(() => '')) || (await e.getAttribute('value')) || '') + ' ' + ((await e.getAttribute('aria-label')) || '') + ' ' + ((await e.getAttribute('title')) || '')).trim()
      if (!re.test(t) || (exclude && exclude.test(t)) || tried?.has(t)) continue
      tried?.add(t)
      await e.click({ timeout: 3000 }).catch(() => {})
      return t
    }
  }
  return null
}
// The visible text input that best matches a description (label, placeholder, name, id, aria-label).
export async function findInput(page, re, { type } = {}) {
  return page.evaluate(([src, type]) => {
    const re = new RegExp(src, 'i')
    const all = [...document.querySelectorAll('input, textarea, select')].filter((e) => {
      const r = e.getBoundingClientRect(); const s = getComputedStyle(e)
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !['hidden', 'button', 'submit', 'checkbox', 'radio', 'range', 'color', 'file'].includes(e.type)
    })
    const own = (e) => {
      const lab = (e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.innerText) || e.closest('label')?.innerText || ''
      return [lab, e.placeholder, e.name, e.id, e.getAttribute('aria-label')].join(' ')
    }
    const near = (e) => own(e) + ' ' + (e.previousElementSibling?.innerText || e.parentElement?.innerText?.slice(0, 80) || '')
    const ok = (e) => !type || e.type === type || (type === 'date' && /date/.test(e.type))
    let i = all.findIndex((e) => ok(e) && re.test(own(e)))
    if (i < 0) i = all.findIndex((e) => ok(e) && re.test(near(e)))
    if (i < 0) return null
    all.forEach((e, k) => e.toggleAttribute('data-apps-pick', k === i))
    return true
  }, [re.source, type]).then((ok) => (ok ? page.locator('[data-apps-pick]').first() : null))
}

// Put a value in an input or pick it in a select (by option text or value).
export async function setField(loc, value) {
  const tag = await loc.evaluate((e) => e.tagName)
  if (tag === 'SELECT') {
    const v = await loc.evaluate((e, re) => { const r = new RegExp(re, 'i'); const o = [...e.options].find((o) => r.test(o.textContent) || r.test(o.value)); return o ? o.value : null }, value instanceof RegExp ? value.source : String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    if (v === null) return false
    await loc.selectOption(v)
    return true
  }
  await loc.fill(String(value))
  await loc.dispatchEvent('change').catch(() => {})
  return true
}
// Everything a person can read: the page text plus every input's value.
export const readAll = (page) => page.evaluate(() => (document.body?.innerText || '') + ' ' + [...document.querySelectorAll('input, output, textarea, select')].map((e) => e.value ?? e.textContent).join(' '))
