#!/usr/bin/env node
// The web app's checks, against the real stack: dev.mjs (the front desk stand-in), the gateway,
// `opencode serve` and the built page in Chromium.
//
//   node check.mjs              builds the page, runs every check with the scripted model, then
//                               ONE real request through Together (needs TOGETHER_API_KEY or the
//                               repo's .env.local; about a cent)
//   node check.mjs --no-live    the scripted model only (no model calls)
//
// What it proves: the home renders its things; a request runs end to end in the drawer with its
// steps in plain words and an answer; an approval can be answered (yes and no); a failure and a
// lost connection are said out loud and the page recovers; upload, list, download and delete
// work; nothing is requested from another origin; no sideways scroll at 390 px; no text under
// 15 px; text contrast is AA; motion stops under reduced motion; keyboard focus is visible;
// the door to opencode refuses routes the page does not use. Exit code 0 only if all pass.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const LIVE = !process.argv.includes('--no-live')
const results = []
const foreign = new Set()

function ok(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`${pass ? '  ok  ' : '  FAIL'} ${name}${detail ? ` (${detail})` : ''}`)
}
async function check(name, fn) {
  try {
    const detail = await fn()
    ok(name, true, typeof detail === 'string' ? detail : '')
  } catch (e) {
    ok(name, false, String(e?.message ?? e).split('\n')[0].slice(0, 300))
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

// ---------------------------------------------------------------- build and serve
console.log('building the page…')
const built = spawnSync(path.join(HERE, 'node_modules/.bin/vite'), ['build', '--logLevel', 'error'], { cwd: HERE, encoding: 'utf8' })
if (built.status !== 0) {
  console.error(built.stderr || built.stdout)
  process.exit(1)
}

async function startDev(extra) {
  const p = spawn(process.execPath, [path.join(HERE, 'dev.mjs'), '--dist', '--port', '0', ...extra], {
    cwd: HERE,
    env: { ...process.env, OLA_DEV_CONTROLS: '1', OLA_DEV_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'ola-check-')) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  p.stderr.on('data', (d) => (out += d))
  const url = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`dev server did not start:\n${out}`)), 60_000)
    p.stdout.on('data', (d) => {
      out += d
      const m = /ready (http:\/\/\S+)/.exec(out)
      if (m) {
        clearTimeout(t)
        resolve(m[1])
      }
    })
    p.on('exit', (c) => reject(new Error(`dev server exited ${c}:\n${out}`)))
  })
  return { url, origin: new URL(url).origin, stop: () => new Promise((r) => (p.once('exit', r), p.kill('SIGTERM'))) }
}

const browser = await chromium.launch()
async function newPage(origin, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, ...opts })
  const page = await ctx.newPage()
  page.on('request', (r) => {
    const u = r.url()
    if (u.startsWith('data:') || u.startsWith('blob:')) return
    if (new URL(u).origin !== origin) foreign.add(u)
  })
  return { ctx, page }
}

// Steps as the person reads them: the sentence in each step row.
const stepWords = (page) => page.locator('.drawer .turn:last-child .step .step-words').evaluateAll((els) => els.map((e) => e.firstChild ? e.innerText.split(' · ')[0].replace(/\s+waiting for your yes$/, '').replace(/\s+\(did not work\)$/, '').trim() : ''))

async function send(page, text) {
  const drawerOpen = await page.locator('.drawer.open').count()
  if (drawerOpen) {
    await page.fill('#ask-input', text)
    await page.press('#ask-input', 'Enter')
  } else {
    await page.fill('#askbar-input', text)
    await page.press('#askbar-input', 'Enter')
  }
}
const lastTurn = (page) => page.locator('.drawer .turn').last()
const waitDone = (page, ms = 60_000) => page.waitForFunction(() => {
  const t = [...document.querySelectorAll('.drawer .turn')].pop()
  return t && ['done', 'failed', 'stopped'].includes(t.dataset.status)
}, null, { timeout: ms })

// ---------------------------------------------------------------- the scripted model
console.log('\nwith the scripted model (no model calls):')
const dev = await startDev(['--fake-model'])
const { ctx, page } = await newPage(dev.origin)

await check('the home renders the project and its things', async () => {
  await page.goto(dev.url)
  await page.waitForSelector('.thing')
  const h1 = await page.locator('h1').innerText()
  assert(h1 === 'Spring eviction report', `h1 is "${h1}"`)
  const kinds = await page.locator('.thing-slot').evaluateAll((els) => els.map((e) => e.dataset.kind))
  for (const k of ['dashboard', 'document', 'chart', 'table', 'site']) assert(kinds.includes(k), `no ${k}`)
  assert(await page.getByRole('link', { name: 'What Ola has of yours' }).isVisible(), 'no "What Ola has of yours" in the header')
  assert(await page.getByRole('button', { name: 'Add files' }).first().isVisible(), 'no Add files')
  assert(await page.locator('#askbar-input').isVisible(), 'no Ask Ola bar')
  return `${kinds.length} things`
})

await check('both typefaces load from our own origin', async () => {
  await page.evaluate(() => document.fonts.ready)
  const fams = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')))
  assert(fams.includes('Bricolage Grotesque') && fams.includes('Literata'), `loaded: ${fams.join(', ')}`)
})

await check('a request runs end to end in the drawer, in plain words', async () => {
  await send(page, 'How many rows does survey.csv have? Count them with a short program and write the number to rows.md.')
  await page.waitForSelector('.drawer.open')
  await waitDone(page)
  const status = await lastTurn(page).getAttribute('data-status')
  assert(status === 'done', `turn ended ${status}`)
  const words = await stepWords(page)
  const want = ['Looked through the project folder', 'Read survey.csv', 'Ran a short program', 'Wrote rows.md']
  assert(JSON.stringify(words) === JSON.stringify(want), `steps: ${JSON.stringify(words)}`)
  const answer = await lastTurn(page).locator('.answer').last().innerText()
  assert(/there are \d+/.test(answer), `answer: ${answer}`)
  return words.join(' / ')
})

await check('"Show details" reveals the raw command', async () => {
  const step = lastTurn(page).locator('.step').nth(2)
  await step.getByRole('button', { name: 'Show details' }).click()
  const pre = await step.locator('pre').first().innerText()
  assert(pre.startsWith('python3 -c'), `details: ${pre.slice(0, 60)}`)
})

await check('what Ola made appears among the things', async () => {
  await page.keyboard.press('Escape')
  await page.waitForSelector('.drawer:not(.open)')
  await page.waitForSelector('.thing-slot h2:text("Rows in survey.csv")', { timeout: 10_000 })
})

await check('an approval can be answered, yes and then no', async () => {
  await page.getByRole('button', { name: 'Ask Ola' }).click()
  await page.getByRole('button', { name: 'New conversation' }).click()
  await page.locator('.autonomy label', { hasText: 'Ask me first' }).click()
  await send(page, 'Count the rows in survey.csv with a short program and write the number to rows.md.')
  const dialog = page.locator('dialog.approval[open]')
  await dialog.waitFor({ timeout: 30_000 })
  const t1 = await dialog.locator('h2').innerText()
  assert(t1 === 'Ola wants to run code on its computer', `first question: ${t1}`)
  assert((await dialog.locator('pre').innerText()).includes('python3'), 'the exact command is not shown')
  const focused = await page.evaluate(() => document.activeElement?.textContent)
  assert(focused?.includes('Yes, this once'), `focus went to ${focused}`)
  await dialog.getByRole('button', { name: 'Yes, this once' }).click()
  await page.waitForFunction(() => document.querySelector('dialog.approval[open] h2')?.textContent === 'Ola wants to write a file', null, { timeout: 30_000 })
  await page.locator('dialog.approval[open]').getByRole('button', { name: 'No, don’t' }).click()
  await waitDone(page)
  const err = await lastTurn(page).locator('.step[data-status="failed"] .step-error').innerText()
  assert(/You said no/.test(err), `the refused step says: ${err}`)
  const ran = await lastTurn(page).locator('.step', { hasText: 'Ran a short program' }).getAttribute('data-status')
  assert(ran === 'done', `the approved step is ${ran}`)
})

await check('a failed request is said out loud', async () => {
  await page.getByRole('button', { name: 'New conversation' }).click()
  await send(page, 'please fail')
  await waitDone(page)
  const text = await lastTurn(page).locator('.problem').innerText()
  assert(text.length > 20, `problem box: ${text}`)
  return text.split('\n')[0].slice(0, 70)
})

await check('a lost network is said out loud, and the page recovers', async () => {
  await ctx.setOffline(true)
  await page.waitForSelector('.banner-lost', { timeout: 10_000 })
  const bar = await page.locator('.drawer .banner-lost').innerText()
  assert(/Lost the connection/.test(bar), bar)
  await ctx.setOffline(false)
  await page.waitForSelector('.banner-lost', { state: 'detached', timeout: 20_000 })
})

await check('a stopped workspace is said out loud, and the page recovers', async () => {
  await page.evaluate(() => fetch('/__dev/opencode?to=stop', { method: 'POST' }))
  await page.waitForSelector('.banner-lost', { timeout: 15_000 })
  await page.evaluate(() => fetch('/__dev/opencode?to=start', { method: 'POST' }))
  await page.waitForSelector('.banner-lost', { state: 'detached', timeout: 30_000 })
})

await check('Escape closes the drawer and focus returns to the bar', async () => {
  await page.locator('#ask-input').focus()
  await page.keyboard.press('Escape')
  await page.waitForSelector('.drawer:not(.open)')
  const id = await page.evaluate(() => document.activeElement?.id)
  assert(id === 'askbar-input', `focus on ${id}`)
})

const madeFile = path.join(os.tmpdir(), `ola-check-notes-${process.pid}.txt`)
fs.writeFileSync(madeFile, 'Made-up notes for the upload check.\nNo real person is named here.\n')
await check('files: list, upload, download, delete', async () => {
  await page.getByRole('link', { name: 'What Ola has of yours' }).click()
  await page.waitForSelector('table.files')
  const listed = await page.locator('table.files .file-name').allInnerTexts()
  assert(listed.some((t) => t.includes('survey.csv')), `listed: ${listed}`)
  assert(await page.getByText('It does not go to any AI company').isVisible(), 'no line on where uploads go')
  await page.setInputFiles('#file-picker', madeFile)
  const name = path.basename(madeFile)
  await page.waitForSelector(`table.files .file-name:has-text("${name}")`)
  const row = page.locator('table.files tr', { hasText: name })
  const size = await row.locator('.file-meta').innerText()
  assert(/bytes/.test(size), `size shown: ${size}`)
  const [download] = await Promise.all([page.waitForEvent('download'), row.getByRole('link', { name: /^Download/ }).click()])
  const got = fs.readFileSync(await download.path(), 'utf8')
  assert(got === fs.readFileSync(madeFile, 'utf8'), 'the download differs from the upload')
  await row.getByRole('button', { name: /^Delete/ }).click()
  const confirm = page.locator('dialog.confirm[open]')
  await confirm.waitFor()
  assert(/cannot be undone/.test(await confirm.innerText()), 'the confirmation does not say it is permanent')
  await confirm.getByRole('button', { name: /^Delete / }).click()
  await page.waitForSelector(`table.files .file-name:has-text("${name}")`, { state: 'detached' })
  const api = await page.evaluate(() => fetch('/api/files').then((r) => r.json()))
  assert(!api.files.some((f) => f.path === name), 'still in the workspace after delete')
  return 'upload, same bytes back, deleted'
})
fs.rmSync(madeFile, { force: true })

await check('a bad file name is refused with a reason', async () => {
  const r = await page.evaluate(() => fetch('/api/files?name=..%2Fescape.txt', { method: 'POST', body: 'x' }).then(async (r) => [r.status, (await r.json()).message]))
  assert(r[0] === 400 && /characters/.test(r[1]), JSON.stringify(r))
})

await check('the door to opencode refuses what the page does not use', async () => {
  const codes = await page.evaluate(async () => {
    const out = {}
    for (const [m, p] of [['GET', '/oc/api/config'], ['POST', '/oc/api/session/x/shell'], ['GET', '/oc/api/credential'], ['POST', '/oc/api/pty']]) out[`${m} ${p}`] = (await fetch(p, { method: m })).status
    return out
  })
  assert(Object.values(codes).every((c) => c === 403), JSON.stringify(codes))
  const csp = await page.evaluate(() => fetch('/').then((r) => r.headers.get('content-security-policy')))
  assert(/default-src 'self'/.test(csp ?? '') && /connect-src 'self'/.test(csp ?? ''), `csp: ${csp}`)
})

await check('keyboard: a skip link first, and focus is visible', async () => {
  await page.goto(dev.url)
  await page.waitForSelector('.thing')
  await page.keyboard.press('Tab')
  const first = await page.evaluate(() => document.activeElement?.className)
  assert(first === 'skip-link', `first stop: ${first}`)
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  const ring = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement)
    return `${s.outlineStyle} ${s.outlineWidth}`
  })
  assert(ring.startsWith('solid 3px'), `focus ring: ${ring}`)
})

// The page's text: sizes and contrast, in every view.
async function textAudit(p) {
  return p.evaluate(() => {
    const parse = (c) => (c.match(/[\d.]+/g) ?? []).map(Number)
    const lum = ([r, g, b]) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const bgOf = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor)
        if (c.length === 3 || (c.length === 4 && c[3] > 0.5)) return c.slice(0, 3)
      }
      return [37, 64, 122]
    }
    const small = []
    const low = []
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('.sr-only, [aria-hidden="true"], [inert], svg, option')) continue
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
      if (!own) continue
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || el.closest('dialog:not([open])')) continue
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || s.display === 'none') continue
      const size = parseFloat(s.fontSize)
      const text = el.textContent.trim().slice(0, 40)
      if (size < 15) small.push(`${text} ${size}px`)
      if (el.closest('button:disabled, input::placeholder')) continue
      const fg = parse(s.color).slice(0, 3)
      const [a, b] = [lum(fg), lum(bgOf(el))]
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700)
      if (ratio < (large ? 3 : 4.5)) low.push(`"${text}" ${ratio.toFixed(2)}`)
    }
    return { small, low }
  })
}

await check('no text under 15 px and AA contrast: home', async () => {
  const { small, low } = await textAudit(page)
  assert(!small.length, `small: ${small.slice(0, 4).join('; ')}`)
  assert(!low.length, `low contrast: ${low.slice(0, 4).join('; ')}`)
})
await check('no text under 15 px and AA contrast: the drawer with a finished run', async () => {
  await page.getByRole('button', { name: 'Ask Ola' }).click()
  await page.locator('.earlier summary').click()
  await page.locator('.earlier li button').last().click()
  await page.waitForSelector('.drawer .step')
  const { small, low } = await textAudit(page)
  assert(!small.length, `small: ${small.slice(0, 4).join('; ')}`)
  assert(!low.length, `low contrast: ${low.slice(0, 4).join('; ')}`)
})
await check('no text under 15 px and AA contrast: files', async () => {
  await page.goto(`${dev.url}#/files`)
  await page.waitForSelector('table.files')
  const { small, low } = await textAudit(page)
  assert(!small.length, `small: ${small.slice(0, 4).join('; ')}`)
  assert(!low.length, `low contrast: ${low.slice(0, 4).join('; ')}`)
})

await check('no sideways scroll at 390 px (home, drawer, files)', async () => {
  const { ctx: c2, page: p2 } = await newPage(dev.origin, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const over = []
  const measure = async (label) => {
    const [sw, cw] = await p2.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
    if (sw > cw) over.push(`${label} ${sw}>${cw}`)
  }
  await p2.goto(dev.url)
  await p2.waitForSelector('.thing')
  await measure('home')
  await p2.getByRole('button', { name: 'Ask Ola' }).click()
  await p2.waitForSelector('.drawer.open')
  await measure('drawer')
  await p2.goto(`${dev.url}#/files`)
  await p2.waitForSelector('table.files')
  await measure('files')
  await c2.close()
  assert(!over.length, over.join(', '))
})

await check('reduced motion stops the lamp and the slides', async () => {
  const { ctx: c3, page: p3 } = await newPage(dev.origin, { reducedMotion: 'reduce' })
  await p3.goto(dev.url)
  await p3.waitForSelector('.thing')
  const s = await p3.evaluate(() => {
    const d = getComputedStyle(document.querySelector('.drawer'))
    const probe = document.createElement('span')
    probe.className = 'lamp-dot'
    document.body.append(probe)
    const a = getComputedStyle(probe).animationName
    probe.remove()
    return { transition: d.transitionDuration, animation: a }
  })
  await c3.close()
  assert(s.animation === 'none' && /^0s/.test(s.transition), JSON.stringify(s))
})

await ctx.close()
await dev.stop()

// ---------------------------------------------------------------- one real request
if (LIVE) {
  console.log('\nwith a real model (GLM-5.3-Flash on Together, through the gateway):')
  let live
  try {
    live = await startDev([])
  } catch (e) {
    ok('the live stack starts', false, String(e.message).split('\n')[0])
  }
  if (live) {
    const { ctx: lc, page: lp } = await newPage(live.origin)
    await check('a real request runs end to end in the drawer, in plain words', async () => {
      await lp.goto(live.url)
      await lp.waitForSelector('.thing')
      await send(lp, 'How many respondents are in survey.csv? Count them by running a short program, and say the number in one sentence.')
      // Under "Go ahead" nothing should ask; if it does, the check says yes once.
      const deadline = Date.now() + 240_000
      while (Date.now() < deadline) {
        const st = await lastTurn(lp).getAttribute('data-status').catch(() => null)
        if (st && ['done', 'failed', 'stopped'].includes(st)) break
        if (await lp.locator('dialog.approval[open]').count()) await lp.getByRole('button', { name: 'Yes, this once' }).click()
        await lp.waitForTimeout(500)
      }
      const st = await lastTurn(lp).getAttribute('data-status')
      const words = await stepWords(lp)
      const answer = (await lastTurn(lp).locator('.answer').allInnerTexts()).pop() ?? ''
      assert(st === 'done', `ended ${st}: ${await lastTurn(lp).innerText()}`)
      assert(words.length >= 1, 'no steps shown')
      assert(!words.join(' ').includes('/var/') && !words.join(' ').includes('/tmp'), `machine paths in the words: ${words}`)
      assert(answer.trim().length > 0, 'no answer')
      return `${words.length} steps: ${words.join(' / ')}; answer: ${answer.slice(0, 80)}`
    })
    await lc.close()
    await live.stop()
  }
}

await browser.close()
ok('no request left the origin', foreign.size === 0, [...foreign].slice(0, 3).join(' '))
const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length} of ${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
