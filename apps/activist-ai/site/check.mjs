#!/usr/bin/env node
// Proves the page keeps its promise: nothing leaves for another origin.
//   node apps/activist-ai/site/check.mjs              serves the repo's public/ the way ola.cx will
//                                                     (/ rewritten to /ola-site/index.html, /architecture
//                                                     to /ola-site/architecture.html) and checks both pages
//   node apps/activist-ai/site/check.mjs https://…    checks a deployed copy, e.g. https://ola.cx/
// At five screen sizes it loads the page in a fresh browser, scrolls to the end, hovers and
// tabs to the button, and records every request. It fails on any request to an origin other
// than the page's own, on cookies or storage, on a script, on horizontal scroll, on a font
// that did not load, on a broken icon / manifest / share-card link, and on a 404 page that
// is not a 404. It prints the transferred bytes of the first visit.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '../../../public')
const SITE = '/ola-site/'
const SIZES = [[1280, 800], [390, 844], [768, 1024], [1440, 900], [1920, 1080]]

// ---------- a plain static server: / is the page, gzip for text, the 404 page for anything missing ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8' }
function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (p === '/') p = SITE + 'index.html'
    if (p === '/architecture') p = SITE + 'architecture.html'
    let file = path.join(ROOT, path.normalize(p))
    let status = 200
    if (!p.startsWith(SITE) || !file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { file = path.join(ROOT, SITE, '404.html'); status = 404 }
    const type = TYPES[path.extname(file)] ?? 'application/octet-stream'
    let body = fs.readFileSync(file)
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-store' }
    if (/text|svg|json/.test(type) && /gzip/.test(req.headers['accept-encoding'] ?? '')) { body = zlib.gzipSync(body, { level: 9 }); headers['Content-Encoding'] = 'gzip' }
    res.writeHead(status, headers).end(body)
  })
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)))
}

const arg = process.argv[2]
const server = arg ? null : await serve()
const BASE = arg ? arg.replace(/\/?$/, '/') : `http://127.0.0.1:${server.address().port}/`
const ORIGIN = new URL(BASE).origin
const failures = []
const fail = (m) => { failures.push(m); console.log('  FAIL', m) }

const browser = await chromium.launch()
const foreign = new Set()
let firstVisit = null
// the pages ola.cx serves from this site: the letter at /, How Ola works at /architecture (OLA-219)
const PAGES = ['', 'architecture']

for (const pagePath of PAGES) for (const [w, h] of SIZES) {
  const URL_ = new URL(pagePath, BASE).href, at = `${pagePath || '/'} ${w}×${h}`
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const reqs = []
  page.on('request', (r) => {
    const u = r.url()
    if (u.startsWith('data:') || u.startsWith('blob:')) return
    reqs.push(r)
    if (new URL(u).origin !== ORIGIN) foreign.add(u)
  })
  const res = await page.goto(URL_, { waitUntil: 'networkidle' })
  if (res.status() !== 200) fail(`${at}: page answered ${res.status()}`)
  await page.evaluate(() => document.fonts.ready)
  await page.mouse.wheel(0, 4000)
  await page.waitForTimeout(150)
  if (await page.$('a.paint')) await page.hover('a.paint')
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab')
  await page.waitForLoadState('networkidle')

  const st = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    scripts: document.scripts.length,
    cookie: document.cookie,
    storage: localStorage.length + sessionStorage.length,
    fonts: [...document.fonts].map((f) => `${f.family.replace(/"/g, '')} ${f.style} ${f.status}`),
    h1: document.querySelectorAll('h1').length,
    focus: document.activeElement?.className ?? '',
  }))
  if (st.overflow > 0) fail(`${at}: scrolls sideways by ${st.overflow}px`)
  if (st.scripts) fail(`${at}: ${st.scripts} script element(s)`)
  if (st.cookie || (await ctx.cookies()).length) fail(`${at}: a cookie was set`)
  if (st.storage) fail(`${at}: storage was written`)
  if (st.h1 !== 1) fail(`${at}: ${st.h1} h1 elements`)
  const notLoaded = st.fonts.filter((f) => !f.endsWith('loaded'))
  if (notLoaded.length) fail(`${at}: fonts not loaded: ${notLoaded.join(', ')}`)

  if (!firstVisit) {
    const sizes = await Promise.all(reqs.map(async (r) => { const s = await r.sizes().catch(() => null); return { url: r.url().replace(ORIGIN, ''), bytes: s ? s.responseBodySize + s.responseHeadersSize : 0 } }))
    firstVisit = sizes
  }
  console.log(`${at}: ${reqs.length} requests, ${reqs.filter((r) => new URL(r.url()).origin !== ORIGIN).length} to other origins, no sideways scroll: ${st.overflow <= 0}, fonts: ${st.fonts.length} loaded`)
  await ctx.close()
}

// every icon, the manifest and the share card resolve
{
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith('data:') && new URL(u).origin !== ORIGIN) foreign.add(u) })
  let checked = 0
  for (const pagePath of PAGES) {
    await page.goto(new URL(pagePath, BASE).href)
    const links = await page.evaluate(() => [...document.querySelectorAll('link[rel~=icon],link[rel=apple-touch-icon],link[rel=manifest]')].map((l) => l.href))
    const og = await page.evaluate(() => document.querySelector('meta[property="og:image"]')?.content)
    if (!og) fail(`${pagePath || '/'}: no share card (og:image)`)
    const manifestHref = await page.evaluate(() => document.querySelector('link[rel=manifest]').href)
    const manifest = await (await page.request.get(manifestHref)).json()
    // same-site links on the page (the letter's link to /architecture, the way back to /)
    const local = await page.evaluate((o) => [...document.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => h.startsWith(o)), ORIGIN)
    const targets = [...links, ...manifest.icons.map((i) => new URL(i.src, BASE).href), ...(og ? [new URL(new URL(og).pathname, BASE).href] : []), ...local]
    for (const t of targets) { const r = await page.request.get(t); if (r.status() !== 200) fail(`${pagePath || '/'}: ${t.replace(ORIGIN, '')} answered ${r.status()}`) }
    checked += targets.length
  }
  await page.goto(BASE)
  if (!(await page.$('a[href="/architecture"]'))) fail('the letter has no link to /architecture')
  console.log(`icons, manifest, share cards and same-site links: ${checked} checked`)

  const nf = await page.goto(new URL('/no/such/page', BASE).href, { waitUntil: 'networkidle' })
  if (nf.status() !== 404) fail(`a missing page answered ${nf.status()}, not 404`)
  const nfText = await page.locator('h1').innerText()
  const nfFonts = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === 'error').length })
  if (nfFonts) fail('404 page: a font did not load')
  console.log(`404: ${nf.status()}, "${nfText}"`)
  await ctx.close()
}
await browser.close()
server?.close()

if (foreign.size) fail(`requests to other origins:\n    ${[...foreign].join('\n    ')}`)
const total = firstVisit.reduce((a, b) => a + b.bytes, 0)
console.log(`\nfirst visit, transferred (gzip where the server offers it): ${(total / 1024).toFixed(1)} KB in ${firstVisit.length} requests`)
for (const r of firstVisit) console.log(`  ${(r.bytes / 1024).toFixed(1).padStart(6)} KB  ${r.url}`)
if (failures.length) { console.log(`\n${failures.length} check(s) failed`); process.exit(1) }
console.log(`\nall checks passed: every request stayed on ${ORIGIN}`)
