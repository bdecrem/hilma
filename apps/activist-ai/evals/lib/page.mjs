#!/usr/bin/env node
// Loads a page the agent built, headless, the way a visitor would, and prints what it shows.
//   node lib/page.mjs <site dir> '<spec json>'
// spec: { path: "index.html", width: 1280, read: ["css selector", ...], select: [["#sel", "value"]],
//         override: { "data.json": "<replacement body>" } }
// The site is served from a local HTTP server on a random loopback port (so fetch() works);
// `override` swaps a file's body at serve time, which tells a page that reads its data at
// run time from one with the numbers typed in. `audit: true` adds the measurements the workspace's
// own ola-page makes (contrast from the page's colors, text sizes, fonts, clipped text, things past
// the right edge), from the same script, so a checker and the agent measure alike. Prints one JSON line.
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
// hilma's own playwright, or the nearest one up from here (a clone of apps/activist-ai alone, as on
// the mini: hilma's path then points at the home folder and every page check failed as "page_reader_failed").
const near = createRequire(import.meta.url)
const { chromium } = (() => {
  try {
    return createRequire(path.join(here, '../../../../package.json'))('playwright')
  } catch {
    return near('playwright')
  }
})()
const [site, specJson] = process.argv.slice(2)
const spec = JSON.parse(specJson || '{}')
const root = path.resolve(site)
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.csv': 'text/csv', '.png': 'image/png' }
const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html'
  const file = path.resolve(root, rel)
  if (!file.startsWith(root)) return res.writeHead(403).end()
  try {
    const body = spec.override && rel in spec.override ? spec.override[rel] : await readFile(file)
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }).end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}/`
const out = { ok: false, errors: [], missing: [] }
const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: spec.width || 1280, height: 900 } })
  await ctx.route((u) => !u.href.startsWith(base) && !u.href.startsWith('data:'), (r) => { out.external = (out.external || 0) + 1; r.abort() })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => out.errors.push(String(e.message).slice(0, 200)))
  p.on('response', (r) => { if (r.status() === 404) out.missing.push(new URL(r.url()).pathname) })
  const res = await p.goto(base + (spec.path || 'index.html'), { waitUntil: 'networkidle', timeout: 20000 })
  out.status = res?.status()
  for (const [sel, value] of spec.select || []) {
    await p.selectOption(sel, value, { timeout: 5000 }).catch((e) => out.errors.push('select ' + sel + ': ' + String(e.message).slice(0, 120)))
    await p.waitForTimeout(400)
  }
  out.text = await p.evaluate(() => document.body?.innerText || '')
  out.scroll = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  out.values = {}
  for (const sel of spec.read || []) out.values[sel] = await p.$$eval(sel, (els) => els.map((e) => e.innerText)).catch(() => [])
  out.links = await p.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')))
  out.charts = await p.$$eval('svg, canvas', (els) => els.filter((e) => e.getBoundingClientRect().width > 50).length)
  if (spec.audit) {
    const src = readFileSync(path.join(here, '../../workspace/ola-page'), 'utf8')
    const measure = /MEASURE = r"""([\s\S]*?)"""/.exec(src)[1]
    out.audit = JSON.parse(await p.evaluate(measure))
  }
  // The first screen as a picture (the designer's same-layout measure reads it, u8).
  if (spec.shot) await p.screenshot({ path: spec.shot, clip: { x: 0, y: 0, width: spec.width || 1280, height: 800 } })
  out.ok = out.status === 200
} catch (e) {
  out.error = String(e.message).slice(0, 200)
} finally {
  await browser.close()
  server.close()
}
console.log(JSON.stringify(out))
