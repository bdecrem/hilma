#!/usr/bin/env node
// Publish against the real host (OLA-209): the same module the front desk uses (sites.mjs), its
// real calls to Vercel's deploy API, the real sites.ola.cx, with a made-up page; then the takedown.
//
//   node frontdesk/sites-live.mjs <shots dir> [--keep]      (on a machine where `vercel` is signed in)
//
// The calls go through the Vercel CLI (`vercel api`), so this script never reads or holds a token:
// the CLI adds its own sign-in. The front desk itself calls the API with the project-scoped token in
// ~/.ola/sites.env (sites.mjs). What it proves: the files upload by sha1, the deployment is made and
// becomes ready, sites.ola.cx serves it with the strict headers, the page loads signed out at phone
// width with its own style and picture and no storage (the sandbox), a missing address is 404, the
// deployment before is removed, and after Unpublish the address answers 404. Screenshots in <dir>.
// Leaves the site empty (the root page and the 404 page) unless --keep.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { folderCtx, makeSites, sitesConfig, SITE_CSP } from './sites.mjs'

const shots = process.argv[2]
if (!shots) throw new Error('usage: sites-live.mjs <shots dir> [--keep]')
fs.mkdirSync(shots, { recursive: true })
const TEAM = process.env.OLA_SITES_TEAM_ID ?? 'team_Sk4ACYBzkT6l0ENDOGoV1ZYK'
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ola-sites-live-'))

/** fetch, as far as sites.mjs uses it, through `vercel api` (the CLI's own sign-in; no token here). */
async function viaCli(url, { method = 'GET', headers = {}, body } = {}) {
  const u = new URL(url)
  if (!u.searchParams.has('teamId')) u.searchParams.set('teamId', TEAM)
  const args = ['api', u.pathname + u.search, '-X', method, '-i', '--raw', '--dangerously-skip-permissions']
  for (const [k, v] of Object.entries(headers)) if (!['authorization', 'content-length'].includes(k.toLowerCase())) args.push('-H', `${k}:${v}`)
  if (body !== undefined) {
    const f = path.join(tmp, `body-${process.hrtime.bigint()}`)
    fs.writeFileSync(f, body)
    args.push('--input', f)
  }
  const out = await new Promise((resolve, reject) => {
    const c = spawn('vercel', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const parts = []
    let err = ''
    c.stdout.on('data', (d) => parts.push(d))
    c.stderr.on('data', (d) => (err += d))
    c.on('error', reject)
    c.on('close', () => {
      const o = Buffer.concat(parts).toString('utf8')
      if (!/^HTTP \d{3}/m.test(o)) console.error(`vercel api ${method} ${u.pathname}: ${err.trim().split('\n').pop()?.slice(0, 200)}`)
      resolve(o)
    })
  })
  const m = /^HTTP (\d{3})/m.exec(out)
  const status = m ? Number(m[1]) : 0
  const text = out.slice(out.indexOf('\n\n') >= 0 ? out.indexOf('\n\n') + 2 : 0)
  return { status, ok: status >= 200 && status < 300, json: async () => JSON.parse(text.slice(text.indexOf('{'))) }
}

fs.writeFileSync(path.join(tmp, 'sites.env'), 'OLA_SITES_VERCEL_TOKEN=held-by-the-cli\nOLA_SITES_PROJECT=ola-sites\n', { mode: 0o600 })
const cfg = sitesConfig({ OLA_FD_SITES_FILE: path.join(tmp, 'sites.env') })
const sites = makeSites({ cfg, dataDir: path.join(tmp, 'fd'), log: (m) => console.log(m), request: viaCli })
const slug = 'ola-publish-check'
const root = path.join(tmp, 'work')
const put = (rel, b) => (fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }), fs.writeFileSync(path.join(root, rel), b))
put('flyer/index.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Made-up tenants meeting</title><link rel="stylesheet" href="look.css"></head>
<body><main><p class="kicker">North District Tenants (made up)</p><h1 id="h">Tenants meeting, Thursday at 7</h1><p>The community room, Elm Street 12. Bring a neighbor. Childcare and Spanish translation on site.</p>
<img id="pic" src="pics/dot.svg" alt="" width="64" height="64"><p class="small">This page is a check of Ola’s Publish, with made-up content.</p></main>
<script>try { localStorage.setItem('x', '1'); document.body.dataset.storage = 'open' } catch { document.body.dataset.storage = 'blocked' }</script></body></html>`)
put('flyer/look.css', 'body{margin:0;background:#f6f1e7;color:#1d1a16;font:18px/1.55 Georgia,serif}main{max-width:34rem;padding:32px 16px}h1{font-size:2rem;line-height:1.15;color:rgb(29,26,22);margin:.2em 0 .5em}.kicker{letter-spacing:.08em;text-transform:uppercase;font:600 13px/1.4 system-ui,sans-serif;color:#7a3b1d}.small{font-size:15px;color:#5a544c}')
put('flyer/pics/dot.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="28" fill="#b93d17"/></svg>')
put('flyer/unused.txt', 'not used by the page, so not published')
const ctx = folderCtx(slug, root)

const say = (ok, what, detail = '') => (console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? ` (${detail})` : ''}`), ok)
let all = true
const pre = await sites.preview(ctx, { page: 'flyer/index.html' })
all &= say(pre.status === 200 && pre.body.items.map((i) => i.as).join(',') === 'index.html,look.css,pics/dot.svg', 'the list: the page and what it uses, nothing else', pre.body.items?.map((i) => i.as).join(','))
const t0 = Date.now()
const pub = await sites.publish(ctx, { page: 'flyer/index.html' }, pre.body.fingerprint)
all &= say(pub.status === 200 && pub.body.live, `published to ${pub.body.url} in ${Math.round((Date.now() - t0) / 1000)} s`, JSON.stringify(pub.body).slice(0, 200))
const browser = await chromium.launch()
try {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage()
  const res = await page.goto(pub.body.url)
  const s = await page.evaluate(() => ({ title: document.title, color: getComputedStyle(document.getElementById('h')).color, img: document.getElementById('pic').naturalWidth, storage: document.body.dataset.storage, wide: document.documentElement.scrollWidth > innerWidth }))
  await page.screenshot({ path: path.join(shots, 'sites-ola-cx-390.png') })
  const h = res.headers()
  all &= say(res.status() === 200 && s.title === 'Made-up tenants meeting' && s.color === 'rgb(29, 26, 22)' && s.img === 64 && !s.wide, 'signed out at 390 px: its own style and picture, no sideways scroll', JSON.stringify(s))
  all &= say(s.storage === 'blocked' && h['content-security-policy'] === SITE_CSP && h['x-frame-options'] === 'DENY' && h['x-content-type-options'] === 'nosniff' && !h['set-cookie'], 'sandboxed (no storage), the strict headers, no cookie', `${s.storage}; ${h['content-security-policy']?.slice(0, 60)}`)
  const unused = await fetch(new URL('unused.txt', pub.body.url))
  const nothing = await fetch(`${cfg.origin}/no-such-project/`)
  all &= say(unused.status === 404 && nothing.status === 404, 'a file not in the list and an address with nothing are 404', `${unused.status} ${nothing.status}`)
  if (!process.argv.includes('--keep')) {
    const un = await sites.unpublish(slug)
    all &= say(un.status === 200 && un.body.gone, 'Unpublish: the address answers 404', JSON.stringify(un.body))
    await page.goto(pub.body.url)
    await page.screenshot({ path: path.join(shots, 'sites-ola-cx-after-unpublish-390.png') })
  }
} finally {
  await browser.close()
  fs.rmSync(tmp, { recursive: true, force: true })
}
console.log(all ? 'sites-live: all good' : 'sites-live: FAILED')
process.exit(all ? 0 : 1)
