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
import { chromium, webkit } from 'playwright'

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
    env: { ...process.env, OLA_DEV_CONTROLS: '1', OLA_DEV_PIECE_MS: '250', OLA_DEV_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'ola-check-')) },
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
  return { url, origin: new URL(url).origin, work: /workspace folder: (\S+)/.exec(out)?.[1] ?? null, stop: () => new Promise((r) => (p.once('exit', r), p.kill('SIGTERM'))) }
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

// ---------------------------------------------------------------- Data, Settings and the web approval
// The project database of the dev folder, made up: a 200,000-row table and a three-page PDF,
// through the real ola-db (../workspace/ola-db) as the agent would make them.
const OLA_DB = path.join(HERE, '../workspace/ola-db')
const seeded = (() => {
  if (!dev.work) return 'the dev server did not say its folder'
  const lines = ['id,country,year,title,score']
  for (let i = 0; i < 200_000; i++) lines.push(`${i},Country ${i % 46},${1950 + (i % 70)},"Made-up law ${i}, on rights",${((i * 7919) % 10000) / 100}`)
  fs.writeFileSync(path.join(dev.work, 'laws.csv'), lines.join('\n') + '\n')
  const pdf = spawnSync('python3', [path.join(HERE, '../workspace/testdata/mkpdf.py'), 'Page one is about drought in the Sahel.', 'Page two covers mangrove restoration in Tanzania.', 'Page three is about flood insurance.'])
  fs.writeFileSync(path.join(dev.work, 'report.pdf'), pdf.stdout)
  const env = { ...process.env, OLA_WORK: dev.work }
  for (const a of [['init'], ['load', 'laws.csv', '--table', 'laws', '--note', 'Made-up laws, one row each'], ['add', 'report.pdf', '--by', 'upload']]) {
    const r = spawnSync('python3', [OLA_DB, ...a], { env, encoding: 'utf8' })
    if (r.status !== 0) return `ola-db ${a[0]}: ${r.stderr}`
  }
  return null
})()
ok('the dev project database is made (200,000 rows and a three-page PDF)', !seeded, seeded ?? '')

for (const [engine, launcher] of [['Chromium', null], ['WebKit', webkit]]) {
  const b = launcher ? await launcher.launch().catch((e) => (ok(`${engine} starts`, false, String(e.message).split('\n')[0]), null)) : browser
  if (!b) continue
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  const pg = await c.newPage()
  pg.on('request', (r) => {
    const u = r.url()
    if (!u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== dev.origin) foreign.add(u)
  })
  await check(`${engine}: Data lists the tables with their rows and where they came from`, async () => {
    await pg.goto(`${dev.url}#/data`)
    await pg.waitForSelector('table.data-tables')
    const row = await pg.locator('table.data-tables tbody tr', { hasText: 'laws' }).innerText()
    assert(/200,000/.test(row) && /laws\.csv/.test(row) && /Made-up laws/.test(row), `row: ${row}`)
    assert((await pg.locator('h1').innerText()) === 'Your project’s data', 'heading')
  })
  await check(`${engine}: a 200,000-row table opens, sorts, searches and pages fast`, async () => {
    const t0 = Date.now()
    await pg.getByRole('button', { name: 'Open laws' }).click()
    await pg.waitForSelector('.grid tbody tr')
    const first = Date.now() - t0
    assert((await pg.locator('.grid tbody tr').count()) === 50, 'one page of 50 rows')
    assert(/Rows 1 to 50 of 200,000/.test(await pg.locator('.table-count').innerText()), 'the count')
    const t1 = Date.now()
    await pg.locator('.grid th button', { hasText: 'score' }).click()
    await pg.locator('.grid th button', { hasText: 'score' }).click()
    const settled = (what, fn, arg) => pg.waitForFunction(fn, arg, { timeout: 15_000 }).catch(() => pg.locator('.table-browser').innerText().then((t) => { throw new Error(`${what}: ${t.slice(0, 300).replace(/\s+/g, ' ')}`) }))
    await settled('sorted', () => document.querySelector('.grid th[aria-sort="descending"]') && !document.querySelector('.table-count')?.textContent?.includes('loading'))
    const top = Number(await pg.locator('.grid tbody tr:first-child td:nth-child(5)').innerText())
    assert(top >= 99.9, `highest score first: ${top}`)
    await pg.fill('#table-q', 'Country 7')
    await pg.press('#table-q', 'Enter')
    await settled('searched', () => /with “Country 7”/.test(document.querySelector('.table-count')?.textContent ?? '') && !/loading/.test(document.querySelector('.table-count')?.textContent ?? ''))
    const n = await pg.locator('.table-count').innerText()
    await pg.getByRole('button', { name: 'Next 50' }).click()
    await settled('next page', () => /^Rows 51 to 100/.test(document.querySelector('.table-count')?.textContent ?? ''))
    const rest = Date.now() - t1
    assert(first < 3000 && rest < 8000, `slow: first page ${first} ms, sort + search + next ${rest} ms`)
    return `first page ${first} ms; sort, search, next ${rest} ms; ${n}`
  })
  await check(`${engine}: a document search cites the right page`, async () => {
    await pg.getByRole('button', { name: 'All tables and documents' }).click()
    await pg.fill('#docs-q', 'mangrove')
    await pg.press('#docs-q', 'Enter')
    await pg.waitForSelector('.hit')
    const hit = await pg.locator('.hit').first().innerText()
    assert(/page 2/.test(hit) && /report\.pdf/.test(hit), `hit: ${hit}`)
    assert((await pg.locator('.hit mark').first().innerText()).toLowerCase() === 'mangrove', 'the word is marked')
  })
  await check(`${engine}: Settings shows the web choice and turns Always on and off`, async () => {
    await pg.goto(`${dev.url}#/settings`)
    const sw = pg.getByRole('switch', { name: 'Search and download without asking' })
    await pg.getByText('Off. Ola asks before each web search or download.', { exact: false }).waitFor()
    assert((await sw.getAttribute('aria-checked')) === 'false', 'starts off')
    await sw.click()
    await pg.getByText('On. Ola may search the web and download documents', { exact: false }).waitFor()
    assert((await sw.getAttribute('aria-checked')) === 'true', 'the switch is on')
    await sw.click()
    await pg.getByText('Off. Ola asks before each web search or download.', { exact: false }).waitFor()
    assert(/Brave Search/.test(await pg.locator('.web-setting .facts').innerText()), 'names the provider')
  })
  await check(`${engine}: the first web search asks in plain words, with what leaves the machine; Not now refuses it`, async () => {
    await pg.goto(dev.url)
    await pg.waitForSelector('.thing')
    await send(pg, 'Please search the web for coastal adaptation plans')
    const dialog = pg.locator('dialog.approval[open]')
    await dialog.waitFor({ timeout: 30_000 })
    const title = await dialog.locator('h2').innerText()
    assert(/Ola wants to search the web for:/.test(title) && /coastal adaptation plans/.test(title), `title: ${title}`)
    assert(/The words of the search go to Brave Search\. Nothing from your files is sent\./.test(await dialog.locator('.web-leaves').innerText()), 'the line on what leaves')
    for (const b of ['Allow once', 'Always in this project', 'Not now']) assert(await dialog.getByRole('button', { name: b }).isVisible(), `no ${b}`)
    await dialog.getByRole('button', { name: 'Not now' }).click()
    await waitDone(pg)
    const words = await stepWords(pg)
    assert(words.some((w) => /Searched the web for/.test(w)), `steps: ${words.join(' / ')}`)
  })
  await check(`${engine}: no sideways scroll at 390 px (data, a wide table, settings)`, async () => {
    const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: engine === 'Chromium', hasTouch: true })
    const p2 = await c2.newPage()
    const over = []
    const measure = async (label) => {
      const [sw, cw] = await p2.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
      if (sw > cw) over.push(`${label} ${sw}>${cw}`)
    }
    await p2.goto(`${dev.url}#/data`)
    await p2.waitForSelector('table.data-tables')
    await measure('data')
    await p2.getByRole('button', { name: 'Open laws' }).click()
    await p2.waitForSelector('.grid tbody tr')
    await measure('table')
    await p2.goto(`${dev.url}#/settings`)
    await p2.getByRole('switch', { name: 'Search and download without asking' }).waitFor()
    await measure('settings')
    await c2.close()
    assert(!over.length, over.join(', '))
  })
  await check(`${engine}: no text under 15 px and AA contrast: a table in Data`, async () => {
    await pg.goto(`${dev.url}#/data`)
    await pg.waitForSelector('table.data-tables')
    await pg.getByRole('button', { name: 'Open laws' }).click()
    await pg.waitForSelector('.grid tbody tr')
    const { small, low } = await textAudit(pg)
    assert(!small.length, `small: ${small.slice(0, 4).join('; ')}`)
    assert(!low.length, `low contrast: ${low.slice(0, 4).join('; ')}`)
  })

  // Open for every kind (2026-11-17): what the page does with it. The front desk's own routes and
  // wrappers are proved in frontdesk/check-docs.mjs; here, the page against dev.mjs's stand-ins.
  const DOCS_SHOTS = process.env.OLA_WEB_SHOTS || null
  await check(`${engine}: the home groups what Ola made by kind: pages, charts and images, tables, documents`, async () => {
    await pg.goto(dev.url)
    await pg.waitForSelector('.thing-group')
    const groups = await pg.locator('.thing-group .group-title').allInnerTexts()
    const names = groups.map((g) => g.trim().replace(/\s+\d+$/, ''))
    assert(JSON.stringify(names) === JSON.stringify(['Pages', 'Charts and images', 'Tables', 'Documents']), names.join(' | '))
    return names.join(', ')
  })
  await check(`${engine}: a drawing run shows its two pictures inline (the hostile SVG runs and loads nothing), Open for its table and note, and its citation opens report.pdf at page 2`, async () => {
    await pg.goto(dev.url)
    await pg.waitForSelector('.thing')
    const before = [...foreign].length
    await send(pg, 'draw the delta')
    await waitDone(pg)
    const turn = lastTurn(pg)
    await turn.locator('.made-picture img').first().waitFor({ timeout: 20_000 })
    await pg.waitForFunction(() => [...document.querySelectorAll('.drawer .turn:last-child .made-picture img')].every((i) => i.complete), null, { timeout: 15_000 })
    const pics = await turn.locator('.made-picture img').evaluateAll((xs) => xs.map((i) => [i.getAttribute('src'), i.naturalWidth]))
    const opens = await turn.locator('.made-pages a').allInnerTexts()
    const cite = await turn.locator('a.cite').getAttribute('href')
    const svgInPage = await pg.evaluate(() => document.querySelectorAll('.drawer svg image, .drawer svg script').length)
    if (DOCS_SHOTS && engine === 'Chromium') await pg.locator('.drawer').screenshot({ path: path.join(DOCS_SHOTS, 'dx-reply-pictures.png') })
    await pg.waitForTimeout(1500)
    const out = [...foreign].slice(before).filter((u) => /127\.0\.0\.1:9\//.test(u))
    assert(pics.length === 2 && pics.every(([src, w]) => src.startsWith('/api/thumb?') && w > 0), `pictures ${JSON.stringify(pics)}`)
    assert(opens.some((o) => /^Open totals\.csv/.test(o)) && opens.some((o) => /^Open notes\.md/.test(o)), `opens ${opens.join(' | ')}`)
    assert(cite === '/api/open?w=dev&path=report.pdf&page=2#page-2', `citation ${cite}`)
    assert(!svgInPage && !out.length, `the hostile SVG: ${svgInPage} nodes in the page, ${out.join(' ')}`)
    return `${pics.length} pictures, ${opens.length} Open items, citation ${cite}`
  })
  await check(`${engine}: Open on a CSV opens the table view: rows, sort, search`, async () => {
    await pg.goto(`${dev.url}#/table?path=laws.csv`)
    await pg.waitForSelector('table.grid tbody tr', { timeout: 30_000 })
    const n = await pg.locator('table.grid tbody tr').count()
    await pg.locator('th button', { hasText: 'score' }).click()
    await pg.locator('th button', { hasText: 'score' }).click()
    await pg.waitForFunction(() => document.querySelector('table.grid tbody tr td:last-child')?.textContent === '99.99', null, { timeout: 30_000 })
    const head = await pg.locator('#table-title').innerText()
    if (DOCS_SHOTS && engine === 'Chromium') await pg.screenshot({ path: path.join(DOCS_SHOTS, 'dx-table-view.png') })
    assert(n === 50 && head === 'laws.csv', `${n} rows, heading ${head}`)
    return '50 rows, sorted by score, descending'
  })
  await check(`${engine}: a large file goes in pieces, with its progress shown, and is then in Files`, async () => {
    await pg.goto(`${dev.url}#/files`)
    await pg.waitForSelector('#file-picker', { state: 'attached' })
    const name = `big-${engine.toLowerCase()}.bin`
    await pg.setInputFiles('#file-picker', { name, mimeType: 'application/octet-stream', buffer: Buffer.alloc(9 * 1024 * 1024, 7) })
    await pg.waitForSelector('.upload-progress progress', { timeout: 15_000 })
    const said = await pg.locator('.upload-progress .meta').innerText()
    if (DOCS_SHOTS && engine === 'Chromium') await pg.locator('.files-inner').screenshot({ path: path.join(DOCS_SHOTS, 'dx-upload-progress.png') })
    await pg.waitForSelector(`text=${name}`, { timeout: 60_000 })
    await pg.waitForSelector('.upload-progress', { state: 'detached', timeout: 60_000 })
    assert(/of 9 MB|of 9\.0 MB|of 9 MiB/.test(said) || /%/.test(said), said)
    return said.split('.')[0]
  })
  await check(`${engine}: Settings shows the project’s room`, async () => {
    await pg.goto(`${dev.url}#/settings`)
    await pg.waitForSelector('.disk-use .disk-bar', { timeout: 20_000 })
    const say = await pg.locator('.disk-use .setting-say').innerText()
    const { small, low } = await textAudit(pg)
    assert(/used of .* free/.test(say), say)
    assert(!small.length && !low.length, `small ${small.slice(0, 2)} low ${low.slice(0, 2)}`)
    return say
  })
  await c.close()
  if (launcher) await b.close()
}

await ctx.close()
await dev.stop()

// ---------------------------------------------------------------- Fallback to Claude (the stand-in)
// The page's side, in Chromium and WebKit (Bart's browser is Safari), against dev.mjs's stand-in
// for the front desk's Claude routes (server/claude-standin.mjs; the real path, Claude Code in a
// sealed VM through the gateway, is frontdesk/check.mjs's). Screenshots with OLA_WEB_SHOTS=<dir>.
const SHOTS = process.env.OLA_WEB_SHOTS || null
async function claudeChecks(engine, label) {
  const b = await engine.launch()
  const d = await startDev(['--fake-model'])
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const pg = await c.newPage()
  pg.on('request', (r) => {
    const u = r.url()
    if (!u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== d.origin) foreign.add(u)
  })
  const shot = async (name, page = pg) => SHOTS && (await page.screenshot({ path: path.join(SHOTS, `${label}-${name}.png`), fullPage: false }))
  const lastWho = () => pg.locator('.drawer .turn').last().locator('.said-ola .who').innerText()
  const errors = []
  pg.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))
  pg.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  try {
    await check(`${label}: with Claude off there is no Claude control anywhere, and the promise says nothing leaves`, async () => {
      await pg.goto(d.url)
      await pg.waitForSelector('.thing')
      await pg.getByRole('button', { name: 'Ask Ola' }).click()
      assert((await pg.locator('fieldset.engine').count()) === 0, 'the Ola / Claude choice is shown')
      assert((await pg.getByRole('button', { name: 'Ask Claude instead' }).count()) === 0, 'Ask Claude instead is shown')
      await pg.keyboard.press('Escape')
      await pg.getByRole('button', { name: 'On this machine' }).click()
      const promise = await pg.locator('dialog.promise').innerText()
      await pg.getByRole('button', { name: 'Close' }).click()
      assert(/not sent to any AI company/.test(promise), 'the promise lost its line')
    })
    await check(`${label}: Settings shows the toggle off; turning it on needs the confirming click, with the exact words`, async () => {
      await pg.getByRole('link', { name: 'Settings' }).click()
      await pg.waitForSelector('#settings-title')
      const sw = pg.getByRole('switch', { name: 'Fallback to Claude' })
      assert((await sw.getAttribute('aria-checked')) === 'false', 'not off by default')
      await shot('settings-off')
      await sw.click()
      const dlg = pg.locator('dialog.confirm[open]')
      await dlg.waitFor()
      const words = await dlg.locator('.sheet-lede').innerText()
      const want = 'When this is on, you can hand a request to Claude Code, run with Anthropic’s Claude. Your request, and the parts of your files Claude reads to answer it, leave this machine and go to Anthropic. It is off unless you turn it on. Every use is marked, and you can turn it off at any time.'
      assert(words === want, `the consent text is: ${words}`)
      await shot('settings-confirm')
      await dlg.getByRole('button', { name: 'Not now' }).click()
      assert((await sw.getAttribute('aria-checked')) === 'false', '"Not now" turned it on')
      await sw.click()
      await pg.locator('dialog.confirm[open]').getByRole('button', { name: 'Turn it on' }).click()
      await pg.waitForFunction(() => document.querySelector('[aria-labelledby=claude-setting]')?.getAttribute('aria-checked') === 'true')
      const stops = await pg.locator('.setting-stops .stop-label').allInnerTexts()
      assert(JSON.stringify(stops) === JSON.stringify(['Suggest it and let me decide', 'Hand it over without asking', 'Never suggest']), `stops: ${stops}`)
      assert((await pg.locator('.setting-stops input:checked').getAttribute('value')) === 'suggest', 'the default is not "Suggest it and let me decide"')
      const month = await pg.locator('.facts dd').first().innerText()
      assert(/^\$0\.00 of \$25\.00$/.test(month), `this month: ${month}`)
      await shot('settings-on')
      return month
    })
    await check(`${label}: a request handed to Claude runs in the drawer, marked "Claude, outside this machine", and wrote its file`, async () => {
      await pg.goto(`${d.url}#/`)
      await pg.getByRole('button', { name: 'Ask Ola' }).click()
      await pg.locator('fieldset.engine label', { hasText: 'Claude' }).click()
      await pg.fill('#ask-input', 'write hello-claude.txt saying hi')
      await pg.press('#ask-input', 'Enter')
      await waitDone(pg)
      const who = await lastWho()
      assert(who.replace(/\s+/g, ' ').trim() === 'Claude, outside this machine', `marked: ${who}`)
      const words = await stepWords(pg)
      assert(JSON.stringify(words) === JSON.stringify(['Wrote hello-claude.txt']), `steps: ${JSON.stringify(words)}`)
      const answer = await lastTurn(pg).locator('.answer').last().innerText()
      assert(/in your Files as hello-claude.txt/.test(answer), `answer: ${answer}`)
      const files = await pg.evaluate(() => fetch('/api/files').then((r) => r.json()))
      assert(files.files.some((f) => f.path === 'hello-claude.txt'), 'the file is not in the folder')
      await shot('drawer-claude')
    })
    await check(`${label}: under "Ask me first" Claude's write waits for a yes in the same sheet as Ola's, and a no is honored`, async () => {
      await pg.getByRole('button', { name: 'New conversation' }).click()
      await pg.locator('.autonomy label', { hasText: 'Ask me first' }).click()
      await pg.locator('fieldset.engine label', { hasText: 'Claude' }).click()
      await pg.fill('#ask-input', 'write asked.txt saying yes')
      await pg.press('#ask-input', 'Enter')
      const dlg = pg.locator('dialog.approval[open]')
      await dlg.waitFor({ timeout: 15_000 }).catch(async (e) => (await shot('approval-timeout'), Promise.reject(new Error(`no approval sheet; page errors: ${errors.join(' | ') || 'none'}`))))
      const title = await dlg.locator('h2').innerText()
      assert(title === 'Claude wants to write a file', `title: ${title}`)
      const answers = await dlg.locator('.sheet-actions button').allInnerTexts()
      assert(JSON.stringify(answers) === JSON.stringify(['Yes, this once', 'Yes, for the rest of this conversation', 'No, don’t']), `answers: ${answers}`)
      await shot('approval-claude')
      await dlg.getByRole('button', { name: 'No, don’t' }).click()
      await waitDone(pg)
      const err = await lastTurn(pg).locator('.step[data-status="failed"] .step-error').innerText()
      assert(/You said no, so Claude did not do this/.test(err), `the refused step says: ${err}`)
      const files = await pg.evaluate(() => fetch('/api/files').then((r) => r.json()))
      assert(!files.files.some((f) => f.path === 'asked.txt'), 'the refused file was written')
      await pg.locator('.autonomy label', { hasText: 'Go ahead' }).click()
    })
    await check(`${label}: "Ask Claude instead" on Ola's finished reply runs the same request with Claude`, async () => {
      await pg.getByRole('button', { name: 'New conversation' }).click()
      await pg.locator('fieldset.engine label', { hasText: 'Ola' }).click()
      await pg.fill('#ask-input', 'Say hello')
      await pg.press('#ask-input', 'Enter')
      await waitDone(pg)
      assert((await lastWho()).trim() === 'Ola', 'the first reply is not Ola’s')
      await lastTurn(pg).getByRole('button', { name: 'Ask Claude instead' }).click()
      await pg.waitForFunction(() => document.querySelectorAll('.drawer .turn').length === 2)
      await waitDone(pg)
      const req = await lastTurn(pg).locator('.request').innerText()
      assert(req === 'Say hello' && /outside this machine/.test(await lastWho()), `second turn: ${req} / ${await lastWho()}`)
    })
    await check(`${label}: Stop ends a Claude run, and the turn says so`, async () => {
      await pg.locator('fieldset.engine label', { hasText: 'Claude' }).click()
      await pg.fill('#ask-input', 'slow')
      await pg.press('#ask-input', 'Enter')
      await pg.waitForSelector('.drawer .turn:last-child .step')
      await lastTurn(pg).getByRole('button', { name: 'Stop' }).click()
      await waitDone(pg, 20_000)
      const line = await lastTurn(pg).locator('.stopped-line').innerText()
      assert(/Files Claude already wrote/.test(line), `after Stop: ${line}`)
    })
    await check(`${label}: with Claude on, the promise and the files view say what may leave`, async () => {
      await pg.keyboard.press('Escape')
      await pg.getByRole('button', { name: 'On this machine' }).click()
      const promise = await pg.locator('dialog.promise').innerText()
      await pg.getByRole('button', { name: 'Close' }).click()
      assert(/turned on Fallback to Claude/.test(promise) && !/not sent to any AI company/.test(promise), 'the promise still says nothing leaves')
      await pg.goto(`${d.url}#/files`)
      const facts = await pg.locator('.facts').innerText()
      assert(/Claude read/.test(facts), `files facts: ${facts.slice(0, 120)}`)
    })
    await check(`${label}: no sideways scroll at 390 px on Settings, and no text under 15 px`, async () => {
      const m = await b.newContext({ viewport: { width: 390, height: 844 } })
      const mp = await m.newPage()
      await mp.goto(`${d.url}#/settings`)
      await mp.waitForSelector('.setting-stops')
      const wide = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      const small = await mp.evaluate(() => [...document.querySelectorAll('.settings *')].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 15).map((e) => e.className))
      await shot('settings-390', mp)
      await m.close()
      assert(wide <= 0 && small.length === 0, `sideways ${wide} px; small text in ${small.join(', ')}`)
    })
    await check(`${label}: turning it off removes every Claude control again`, async () => {
      await pg.goto(`${d.url}#/settings`)
      await pg.getByRole('switch', { name: 'Fallback to Claude' }).click()
      await pg.waitForFunction(() => document.querySelector('[aria-labelledby=claude-setting]')?.getAttribute('aria-checked') === 'false')
      await pg.goto(`${d.url}#/`)
      await pg.getByRole('button', { name: 'Ask Ola' }).click()
      await pg.waitForTimeout(300)
      assert((await pg.locator('fieldset.engine').count()) === 0 && (await pg.getByRole('button', { name: 'Ask Claude instead' }).count()) === 0, 'a Claude control is still there')
    })
  } finally {
    await c.close()
    await b.close()
    await d.stop()
  }
}
{
  const { webkit } = await import('playwright')
  console.log('\nFallback to Claude, the page (stand-in front desk):')
  await claudeChecks(chromium, 'chromium')
  await claudeChecks(webkit, 'webkit')
}

// ---------------------------------------------------------------- the hosted open model and the stretch card
// The page against dev.mjs's stand-in (server/hosted-standin.mjs) with the REAL opencode and gateway
// behind it and two scripted models: Ola's own ("please fail" fails there) and the hosted one (it does
// not). In Chromium and WebKit. The sealed-VM path is frontdesk/check.mjs's.
const HOSTED_CONSENT = 'When this is on, you can hand a request to an open model that runs at Made-up Cloud, an outside company, instead of on this machine. Your request, and the parts of your files Ola reads to answer it, leave this machine and go to Made-up Cloud. It is off unless you turn it on. Every use is marked, and you can turn it off at any time.'
// A long build in many parts (the before-run check: at least 800 characters, 8 listed parts, a verb to make).
const LONG_BUILD = `Build a full website for our tenants' union, with these parts:\n${['A home page that says who we are and when we meet', 'A page for each of the six buildings, with the building rep and a short history', 'A form to report a repair problem, saved as a CSV in the project', 'A calendar page of the next twelve meetings, made from meetings.csv', 'A page of our demands, in English and Spanish, side by side', 'A members-only page with the phone tree, hidden from the menu', 'A printable flyer for the next general meeting, one page, large type', 'A page explaining how rent stabilization works, in plain words, with sources'].map((p, i) => `${i + 1}. ${p}`).join('\n')}\nKeep every page readable on a phone, use our colors (deep green and cream), and write all the text yourself in a warm, plain voice that a new tenant would understand. Put a short note at the bottom of each page saying when it was last updated.`
async function fallbackChecks(engine, label) {
  const b = await engine.launch()
  const d = await startDev(['--fake-model'])
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const pg = await c.newPage()
  pg.on('request', (r) => {
    const u = r.url()
    if (!u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== d.origin) foreign.add(u)
  })
  // After the card's 180 ms entrance, so a screenshot shows it as it rests.
  const shot = async (name, page = pg) => SHOTS && (await page.waitForTimeout(400), await page.screenshot({ path: path.join(SHOTS, `${label}-${name}.png`), fullPage: false }))
  const who = async () => (await lastTurn(pg).locator('.said-ola .who').innerText()).replace(/\s+/g, ' ').trim()
  const dev = (p, method = 'GET') => pg.evaluate(([p, method]) => fetch(p, { method }).then((r) => r.json()), [p, method])
  const settings = (p, body) => pg.evaluate(([p, body]) => fetch(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.status), [p, body])
  const card = () => pg.locator('.stretch-card')
  const ask = async (text) => {
    await pg.fill('#ask-input', text)
    await pg.press('#ask-input', 'Enter')
  }
  const engines = () => pg.locator('fieldset.engine label').allInnerTexts()
  const openDrawer = async () => {
    await pg.goto(`${d.url}#/`)
    await pg.waitForSelector('.thing')
    await pg.getByRole('button', { name: 'Ask Ola' }).click()
    await pg.waitForTimeout(300)
  }
  try {
    await check(`${label}: two switches, both off by default and independent; the drawer lists only what is on`, async () => {
      await pg.goto(`${d.url}#/settings`)
      await pg.waitForSelector('#settings-title')
      const hs = pg.getByRole('switch', { name: 'Fallback to a hosted open model' })
      const cs = pg.getByRole('switch', { name: 'Fallback to Claude' })
      assert((await hs.getAttribute('aria-checked')) === 'false' && (await cs.getAttribute('aria-checked')) === 'false', 'a switch is on by default')
      await hs.click()
      const dlg = pg.locator('dialog.confirm[open]')
      await dlg.waitFor()
      const words = await dlg.locator('.sheet-lede').innerText()
      assert(words === HOSTED_CONSENT, `the hosted consent text is: ${words}`)
      await shot('hosted-confirm')
      await dlg.getByRole('button', { name: 'Turn it on' }).click()
      await pg.waitForFunction(() => document.querySelector('[aria-labelledby=hosted-setting]')?.getAttribute('aria-checked') === 'true')
      assert((await cs.getAttribute('aria-checked')) === 'false', 'turning the hosted model on turned Claude on')
      const month = await pg.locator('.setting-block').first().locator('.facts dd').first().innerText()
      assert(/^\$0\.00 of \$20\.00$/.test(month), `hosted this month: ${month}`)
      const stops = await pg.locator('.setting-stops .stop-label').allInnerTexts()
      assert(JSON.stringify(stops) === JSON.stringify(['Suggest it and let me decide', 'Hand it over without asking', 'Never suggest']), `stretch: ${stops}`)
      await shot('settings-hosted-on')
      await openDrawer()
      const one = await engines()
      await pg.keyboard.press('Escape')
      await pg.goto(`${d.url}#/settings`)
      await cs.click()
      await pg.locator('dialog.confirm[open]').getByRole('button', { name: 'Turn it on' }).click()
      await pg.waitForFunction(() => document.querySelector('[aria-labelledby=claude-setting]')?.getAttribute('aria-checked') === 'true')
      await openDrawer()
      const both = await engines()
      await pg.goto(`${d.url}#/settings`)
      await hs.click()
      await pg.waitForFunction(() => document.querySelector('[aria-labelledby=hosted-setting]')?.getAttribute('aria-checked') === 'false')
      await openDrawer()
      const claudeOnly = await engines()
      await pg.goto(`${d.url}#/settings`)
      await cs.click()
      await pg.waitForFunction(() => document.querySelector('[aria-labelledby=claude-setting]')?.getAttribute('aria-checked') === 'false')
      await openDrawer()
      const none = await pg.locator('fieldset.engine').count()
      const want = [['Ola', 'Hosted open model'], ['Ola', 'Hosted open model', 'Claude'], ['Ola', 'Claude']]
      assert(JSON.stringify([one, both, claudeOnly]) === JSON.stringify(want) && none === 0, `drawer choices: ${JSON.stringify([one, both, claudeOnly])}, off: ${none}`)
      return 'hosted only, both, Claude only, none'
    })
    await check(`${label}: a stuck run with both switches off shows the owner the card: the hosted model first, "or Claude", three answers`, async () => {
      await ask('please fail')
      await card().waitFor({ timeout: 30_000 })
      const title = await card().locator('.stretch-title').innerText()
      const answers = await card().locator('.stretch-actions button').allInnerTexts()
      const leaves = await card().locator('.stretch-leaves').innerText()
      assert(title === 'This may be a stretch for Ola’s own model. Hand it to the hosted open model at Made-up Cloud?', `title: ${title}`)
      assert(JSON.stringify(answers) === JSON.stringify(['Just this once', 'Always in this project', 'Not now']), `answers: ${answers}`)
      assert(/go to Made-up Cloud\.$/.test(leaves), `what leaves: ${leaves}`)
      assert((await lastTurn(pg).getAttribute('data-status')) === 'failed', 'Ola’s turn is not kept as it ended')
      await shot('card-owner')
      await card().getByRole('button', { name: 'or Claude' }).click()
      const t2 = await card().locator('.stretch-title').innerText()
      assert(t2 === 'This may be a stretch for Ola’s own model. Hand it to Claude?' && /go to Anthropic\.$/.test(await card().locator('.stretch-leaves').innerText()), `after "or Claude": ${t2}`)
      await card().getByRole('button', { name: 'or the hosted open model' }).click()
    })
    await check(`${label}: "Just this once" runs exactly one request through the hosted model, marked, and leaves the switch off; a second is refused`, async () => {
      await card().getByRole('button', { name: 'Just this once' }).click()
      await pg.waitForFunction(() => document.querySelectorAll('.drawer .turn').length === 2)
      await waitDone(pg)
      const w = await who()
      const answer = await lastTurn(pg).locator('.answer').last().innerText()
      assert(w === 'Hosted open model, outside this machine', `marked: ${w}`)
      assert(/The hosted open model here/.test(answer), `answer: ${answer}`)
      await shot('drawer-hosted-once')
      let h
      for (let i = 0; i < 20 && (h = await dev('/__dev/hosted')).running; i++) await pg.waitForTimeout(500)
      assert(h.enabled === false && h.runs === 1 && JSON.stringify(h.grants) === '{}', `after: ${JSON.stringify(h)}`)
      const again = await settings('/api/hosted/run', { request: 'say hello', conversation: 'ses_x' })
      assert(again === 403, `a second request without a yes: ${again}`)
      return 'one run, switch off, grants empty, the next refused 403'
    })
    await check(`${label}: "Not now" goes on with Ola and does not ask again for the same reason in this conversation`, async () => {
      await ask('please fail')
      await card().waitFor({ timeout: 30_000 })
      await card().getByRole('button', { name: 'Not now' }).click()
      assert((await card().count()) === 0, 'the card stayed')
      await ask('please fail')
      await waitDone(pg)
      await pg.waitForTimeout(1500)
      assert((await card().count()) === 0 && (await lastTurn(pg).getAttribute('data-status')) === 'failed', 'it asked again')
    })
    await check(`${label}: before a run, a long build in many parts is offered to the hosted model; "Not now" sends it to Ola`, async () => {
      await pg.getByRole('button', { name: 'New conversation' }).click()
      const turns = await pg.locator('.drawer .turn').count()
      await ask(LONG_BUILD)
      await card().waitFor({ timeout: 15_000 })
      const why = await card().locator('.stretch-why').innerText()
      assert(turns === 0 && (await pg.locator('.drawer .turn').count()) === 0 && /long build in many parts\. Ola has not started on it\./.test(why), `before the run: ${why}`)
      assert((await card().locator('.stretch-request').innerText()).includes('tenants'), 'the card does not show the request')
      await shot('card-before-run')
      await card().getByRole('button', { name: 'Not now' }).click()
      await pg.waitForFunction(() => document.querySelectorAll('.drawer .turn').length === 1)
      await waitDone(pg)
      assert((await who()) === 'Ola', 'not sent to Ola')
    })
    await check(`${label}: "Always in this project" asks with the consent text, turns the switch on, and later stretches go over without asking`, async () => {
      await pg.getByRole('button', { name: 'New conversation' }).click()
      await ask('please fail')
      await card().waitFor({ timeout: 30_000 })
      await card().getByRole('button', { name: 'Always in this project' }).click()
      const dlg = pg.locator('.stretch-card dialog.confirm[open]')
      await dlg.waitFor()
      assert((await dlg.locator('.sheet-lede').innerText()) === HOSTED_CONSENT, 'not the consent text')
      await shot('card-always-confirm')
      await dlg.getByRole('button', { name: 'Turn it on' }).click()
      await pg.waitForFunction(() => document.querySelectorAll('.drawer .turn').length === 2)
      await waitDone(pg)
      const f = await dev('/api/fallback')
      assert(f.hosted.enabled === true && f.stretch === 'handover' && f.stretchTo === 'hosted' && f.claude.enabled === false, JSON.stringify({ h: f.hosted.enabled, s: f.stretch, to: f.stretchTo }))
      assert((await who()) === 'Hosted open model, outside this machine', 'the handed-over reply is not marked')
      await pg.getByRole('button', { name: 'New conversation' }).click()
      await ask('please fail')
      await pg.waitForFunction(() => document.querySelectorAll('.drawer .turn').length === 2, null, { timeout: 30_000 })
      await waitDone(pg)
      const handoff = await lastTurn(pg).locator('.handoff').innerText()
      assert((await card().count()) === 0 && /ran into an error on this request\. This project hands such requests to the hosted open model/.test(handoff), `handed over: ${handoff}`)
      const ended = await lastTurn(pg).getAttribute('data-status')
      assert(ended === 'done' && (await who()) === 'Hosted open model, outside this machine', `the handed-over run ended ${ended}: ${(await lastTurn(pg).innerText()).slice(-160)}`)
      await shot('drawer-hosted-handover')
    })
    await check(`${label}: with the switch on, "Ask the hosted model instead" under Ola's finished reply`, async () => {
      await pg.getByRole('button', { name: 'New conversation' }).click()
      await ask('Say hello')
      await waitDone(pg)
      assert((await who()) === 'Ola', 'not Ola’s')
      await lastTurn(pg).getByRole('button', { name: 'Ask the hosted model instead' }).click()
      await pg.waitForFunction(() => document.querySelectorAll('.drawer .turn').length === 2)
      await waitDone(pg)
      assert((await who()) === 'Hosted open model, outside this machine' && (await lastTurn(pg).locator('.request').innerText()) === 'Say hello', 'the same request was not handed over')
    })
    await check(`${label}: a member, with both switches off, gets the card that says who can turn it on, and nothing that sends`, async () => {
      assert((await settings('/api/hosted/settings', { enabled: false })) === 200 && (await settings('/api/fallback/settings', { stretch: 'suggest' })) === 200, 'could not reset')
      await dev('/__dev/role?to=member', 'POST')
      await openDrawer()
      await pg.getByRole('button', { name: 'New conversation' }).click().catch(() => {})
      await ask('please fail')
      await card().waitFor({ timeout: 30_000 })
      const title = await card().locator('.stretch-title').innerText()
      const buttons = await card().locator('button').allInnerTexts()
      const leaves = await card().locator('.stretch-leaves').innerText()
      await shot('card-member')
      assert(title === 'This may be a stretch for Ola’s own model.' && JSON.stringify(buttons) === JSON.stringify(['OK']) && /owner can turn on/.test(leaves), `member card: ${title} / ${buttons} / ${leaves}`)
      const once = await settings('/api/hosted/run', { request: 'x', conversation: 'ses_x', once: true })
      assert(once === 403, `a member's "just this once" by API: ${once}`)
      await card().getByRole('button', { name: 'OK' }).click()
      await dev('/__dev/role?to=owner', 'POST')
    })
    await check(`${label}: the card at 390 px: no sideways scroll, no text under 15 px`, async () => {
      const m = await b.newContext({ viewport: { width: 390, height: 844 } })
      const mp = await m.newPage()
      await mp.goto(`${d.url}#/`)
      await mp.waitForSelector('.thing')
      await mp.getByRole('button', { name: 'Ask Ola' }).first().click()
      await mp.waitForTimeout(300)
      await mp.fill('#ask-input', 'please fail')
      await mp.press('#ask-input', 'Enter')
      await mp.locator('.stretch-card').waitFor({ timeout: 30_000 })
      await mp.locator('.stretch-card').scrollIntoViewIfNeeded()
      const wide = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      const small = await mp.evaluate(() => [...document.querySelectorAll('.stretch-card *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 15).map((e) => e.className))
      await shot('card-390', mp)
      await mp.goto(`${d.url}#/settings`)
      await mp.waitForSelector('.setting-stops')
      await shot('settings-390-both', mp)
      await m.close()
      assert(wide <= 0 && small.length === 0, `sideways ${wide} px; small text in ${small.join(', ')}`)
    })
  } finally {
    await c.close()
    await b.close()
    await d.stop()
  }
}
{
  const { webkit } = await import('playwright')
  console.log('\nThe hosted open model and the stretch card, the page (stand-in front desk, real opencode):')
  await fallbackChecks(chromium, 'chromium')
  await fallbackChecks(webkit, 'webkit')
}

// ---------------------------------------------------------------- batch jobs (README, "Batch jobs")
// The page against the front desk's own jobs code (dev.mjs runs frontdesk/jobs.mjs), ola-batch on
// the dev folder, the real gateway's batch lane and the scripted model with its planted quotes.
async function jobsChecks(engine, label) {
  const b = await engine.launch()
  const d = await startDev(['--fake-model'])
  const c = await b.newContext({ viewport: { width: 1440, height: 1000 } })
  const pg = await c.newPage()
  pg.on('request', (r) => {
    const u = r.url()
    if (!u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== d.origin) foreign.add(u)
  })
  const shot = async (name, page = pg) => SHOTS && (await page.waitForTimeout(300), await page.screenshot({ path: path.join(SHOTS, `${label}-${name}.png`), fullPage: true }))
  const dev = (p, method = 'POST') => pg.evaluate(([p, method]) => fetch(p, { method }).then((r) => r.json()), [p, method])
  const post = (p, body) => pg.evaluate(([p, body]) => fetch(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json() })), [p, body])
  const state = () => pg.locator('.job-head .job-state').innerText()
  let job = null
  try {
    await pg.goto(`${d.url}#/`)
    await pg.waitForSelector('.thing')
    job = (await dev('/__dev/batch?corpus=30')).job
    await check(`${label}: a proposed job is listed under Jobs, waiting for a look, and nothing has run`, async () => {
      assert(job, 'no job was proposed')
      await pg.getByRole('link', { name: 'Jobs' }).click()
      await pg.waitForSelector('.job-card')
      const t = await pg.locator('.job-card').first().innerText()
      assert(/Who makes the adaptation decision/.test(t) && /Waiting for your look/.test(t) && /30 documents/.test(t), t)
      assert((await dev('/__dev/batch')).calls === 0, 'the model was called before anyone said yes')
      await shot('jobs-list-proposed')
      return t.replace(/\s+/g, ' ').slice(0, 120)
    })
    await check(`${label}: the proposal shows the form, the documents, the time and the share of the week, before anything runs`, async () => {
      await pg.locator('.job-card a').first().click()
      await pg.waitForSelector('.job-proposal')
      const t = (await pg.locator('.job-proposal').innerText()).replace(/\s+/g, ' ')
      for (const want of ['Who makes the adaptation decision?', 'households, local government, national government, firms, other, or not stated', 'In what year does the planning horizon end?', 'Documents 30', 'Of a week of this project’s use', 'Run a trial on 10 documents', 'never shown as checked']) assert(t.includes(want), `missing "${want}" in: ${t.slice(0, 600)}`)
      assert(!(await pg.locator('.job-models').count()), 'a model choice with no outside model on')
      await shot('proposal')
      return /Time on this machine (.*?) Model use/.exec(t)?.[1] ?? ''
    })
    await check(`${label}: with the hosted model on, the proposal offers it with its cost; a member cannot pick it, and the front desk refuses a member who tries`, async () => {
      assert((await post('/api/hosted/settings', { enabled: true, consent: true })).status === 200, 'hosted on')
      await pg.reload()
      await pg.waitForSelector('.job-models')
      const t = (await pg.locator('.job-models').innerText()).replace(/\s+/g, ' ')
      assert(/hosted open model at Made-up Cloud/.test(t) && /leaves this machine for Made-up Cloud/.test(t) && /About \$\d+\.\d\d for this job/.test(t), t)
      await pg.locator('.job-model', { hasText: 'hosted' }).locator('input').check()
      assert(await pg.getByRole('button', { name: /Run a trial/ }).isDisabled(), 'a trial on an outside model without the consent box')
      await shot('proposal-hosted')
      await dev('/__dev/role?to=member')
      await pg.reload()
      await pg.waitForSelector('.job-models')
      assert(await pg.locator('.job-model', { hasText: 'hosted' }).locator('input').isDisabled(), 'a member can pick the outside model')
      const r = await post('/api/jobs/trial', { job, model: 'hosted', consent: true })
      assert(r.status === 403 && r.json.error === 'owner_only', `a member's outside trial: ${r.status} ${r.json.error}`)
      await dev('/__dev/role?to=owner')
      assert((await post('/api/hosted/settings', { enabled: false })).status === 200, 'hosted off')
      return `a member's try: ${r.status}`
    })
    await check(`${label}: the trial codes 10 documents and shows each value with its quote, its page and the check; planted quotes are marked`, async () => {
      await pg.reload()
      await pg.getByRole('button', { name: /Run a trial on 10/ }).click()
      await pg.waitForFunction(() => /Trial done/.test(document.querySelector('.job-head .job-state')?.textContent ?? ''), null, { timeout: 60_000 })
      await pg.waitForSelector('.job-grid tbody tr')
      const rows = await pg.locator('.job-grid tbody tr').count()
      assert(rows === 10, `${rows} rows`)
      const planted = new Set((await dev('/__dev/batch')).planted.filter((x) => x.retry).map((x) => x.title))
      const docs = await pg.locator('.job-grid tbody tr').evaluateAll((trs) => trs.map((tr) => ({ doc: tr.querySelector('th')?.firstChild?.textContent?.trim(), first: tr.querySelector('td .job-check')?.textContent ?? '', quote: tr.querySelector('td .job-quote')?.textContent ?? '' })))
      for (const r of docs) {
        if (planted.has(r.doc)) assert(/Quote not found: not checked/.test(r.first), `${r.doc}: ${r.first}`)
        else assert(/Quote found/.test(r.first) && r.quote.length > 10, `${r.doc}: ${r.first}`)
      }
      assert((await pg.locator('.job-start').innerText()).includes('Start the whole job'), 'no way to start the whole job')
      await shot('trial-table')
      return `10 rows; ${[...planted].filter((t) => docs.some((r) => r.doc === t)).length} planted quote(s) in the trial, marked`
    })
    await check(`${label}: only the owner may start the whole job; it needs the budget confirmed; pause, resume, done; the table is in Data, marked machine-coded`, async () => {
      await dev('/__dev/role?to=member')
      await pg.reload()
      await pg.waitForSelector('.job-start')
      assert(/Only the project’s owner can start the whole job/.test(await pg.locator('.job-start').innerText()), 'a member sees a start button')
      const r = await post('/api/jobs/start', { job, budget: 1_000_000, confirm: true })
      assert(r.status === 403, `a member's start: ${r.status}`)
      await dev('/__dev/role?to=owner')
      await dev('/__dev/batch?delay=250')
      await pg.reload()
      await pg.waitForSelector('.job-start input[type=number]')
      const go = pg.getByRole('button', { name: 'Start the whole job' })
      assert(await go.isDisabled(), 'started without the budget confirmed')
      await pg.locator('.job-start .job-consent input').check()
      await go.click()
      await pg.waitForFunction(() => /Running/.test(document.querySelector('.job-head .job-state')?.textContent ?? ''), null, { timeout: 20_000 })
      await pg.waitForFunction(() => /left/.test(document.querySelector('.job-counts')?.textContent ?? ''), null, { timeout: 20_000 }).catch(() => {})
      await shot('job-running')
      await pg.goto(`${d.url}#/jobs`)
      await pg.waitForSelector('.job-card[data-state=running]')
      await shot('jobs-list-running')
      await pg.locator('.job-card a').first().click()
      await pg.getByRole('button', { name: 'Pause' }).click()
      await pg.waitForFunction(() => /Paused/.test(document.querySelector('.job-head .job-state')?.textContent ?? ''), null, { timeout: 10_000 })
      await pg.waitForTimeout(4000)
      const a = await pg.locator('.job-counts').innerText()
      await pg.waitForTimeout(3500)
      const b2 = await pg.locator('.job-counts').innerText()
      assert(a === b2, `still counting while paused: ${a} / ${b2}`)
      await pg.getByRole('button', { name: 'Resume' }).click()
      await pg.waitForFunction(() => /Done/.test(document.querySelector('.job-head .job-state')?.textContent ?? ''), null, { timeout: 60_000 })
      const done = await pg.locator('.job-counts').innerText()
      assert(/30 of 30/.test(done), done)
      assert((await dev('/__dev/batch')).maxInflight === 1, 'more than one batch request at a time')
      await shot('job-done')
      await pg.goto(`${d.url}#/data`)
      await pg.waitForSelector('.data-tables')
      const row = (await pg.locator('.data-tables tr', { hasText: 'decisions' }).innerText()).replace(/\s+/g, ' ')
      assert(/Machine-coded/.test(row) && /30/.test(row) && /A job Ola ran/.test(row), row)
      await shot('data-machine-coded')
      return `paused at "${a}", done: ${done}; Data: ${row.slice(0, 90)}`
    })
    await check(`${label}: no sideways scroll at 390 px on Jobs and a job's rows`, async () => {
      const m = await b.newContext({ viewport: { width: 390, height: 844 } })
      const mp = await m.newPage()
      const widths = []
      for (const h of ['#/jobs', `#/jobs/${job}`]) {
        await mp.goto(`${d.url}${h}`)
        await mp.waitForSelector(h === '#/jobs' ? '.job-card' : '.job-grid')
        widths.push(await mp.evaluate(() => document.documentElement.scrollWidth))
      }
      if (SHOTS) await mp.screenshot({ path: path.join(SHOTS, `${label}-job-390.png`), fullPage: true })
      await m.close()
      assert(widths.every((w) => w <= 390), `page widths ${widths.join(', ')}`)
      return `widths ${widths.join(', ')}`
    })
  } finally {
    await c.close()
    await b.close()
    await d.stop()
  }
}
{
  const { webkit } = await import('playwright')
  console.log('\nBatch jobs, the page (the front desk’s jobs code, ola-batch, the gateway’s batch lane, the scripted model):')
  await jobsChecks(chromium, 'jobs-chromium')
  await jobsChecks(webkit, 'jobs-webkit')
}

// ---------------------------------------------------------------- Compare with Claude
// README, "Compare with Claude". The page against server/compare-standin.mjs (the front desk's routes
// and replies, a canned copy and result; the sealed VMs are frontdesk/check.mjs's), in Chromium and
// WebKit: the action under a finished reply, the made-up copy shown before it goes, the side-by-side
// and the line it leaves, a held copy with what may be the person's, the real task just this once
// with its consent text, the Settings switches, a member with nothing that sends, the Quality page,
// 390 px, and none of our own words (twin, eval, judge) on any of it.
async function compareChecks(engine, label) {
  const b = await engine.launch()
  const d = await startDev(['--fake-model'])
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const pg = await c.newPage()
  pg.on('request', (r) => {
    const u = r.url()
    if (!u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== d.origin) foreign.add(u)
  })
  const shot = async (name, el = null) => SHOTS && (await pg.waitForTimeout(350), el ? await el.screenshot({ path: path.join(SHOTS, `${label}-${name}.png`) }) : await pg.screenshot({ path: path.join(SHOTS, `${label}-${name}.png`), fullPage: false }))
  const dev = (p, method = 'POST') => pg.evaluate(([p, method]) => fetch(p, { method }).then((r) => r.json()), [p, method])
  const post = (p, body) => pg.evaluate(([p, body]) => fetch(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.status), [p, body])
  const sheet = () => pg.locator('dialog.compare-sheet[open]')
  const ours = /\b(twin|twins|eval|evals|judge|judged)\b/i
  const openDrawer = async () => {
    await pg.goto(`${d.url}#/`)
    await pg.waitForSelector('.thing')
    await pg.getByRole('button', { name: 'Ask Ola' }).click()
    await pg.waitForTimeout(300)
  }
  const askAndWait = async (text) => {
    await pg.fill('#ask-input', text)
    await pg.press('#ask-input', 'Enter')
    await waitDone(pg)
  }
  try {
    await openDrawer()
    await askAndWait('How many rows does survey.csv have?')
    await check(`${label}: under a finished reply the owner sees "Compare with Claude"; it offers a made-up copy first, and nothing of theirs leaves`, async () => {
      const btn = lastTurn(pg).getByRole('button', { name: 'Compare with Claude' })
      await btn.waitFor({ timeout: 10_000 })
      await btn.click()
      await sheet().waitFor()
      const t = (await sheet().innerText()).replace(/\s+/g, ' ')
      assert(/Ola makes a made-up copy of this task/.test(t) && /Nothing of yours leaves this machine\./.test(t) && /Make a made-up copy/.test(t) && /Just this once: the real task/.test(t), t)
      assert(!/Send the real task/.test(t), 'the real task offered with the switch off')
      return 'offered'
    })
    await check(`${label}: the made-up copy is shown before it goes (request, files, what a right result must have); Send it to Claude; both results side by side`, async () => {
      await sheet().getByRole('button', { name: 'Make a made-up copy' }).click()
      await sheet().getByRole('button', { name: 'Send it to Claude' }).waitFor({ timeout: 15_000 })
      const t = (await sheet().innerText()).replace(/\s+/g, ' ')
      assert(/Here is the made-up copy\. Nothing of yours is in it\./.test(t) && /Remove the repeated rows from data\.csv/.test(t) && /data\.csv/.test(t) && /What a right result must have/i.test(t) && /A file named clean\.csv/.test(t), t)
      await shot('compare-copy', sheet())
      await sheet().getByRole('button', { name: 'Send it to Claude' }).click()
      await sheet().locator('.compare-sides').waitFor({ timeout: 20_000 })
      const r = (await sheet().innerText()).replace(/\s+/g, ' ')
      assert(/Claude did better: Claude removed the repeated rows into clean\.csv/.test(r) && /This was a made-up copy of your task\. Nothing of yours left this machine\./.test(r), r)
      assert((await sheet().locator('.compare-side').count()) === 2 && /0 of 4 right/.test(r) && /4 of 4 right/.test(r), r)
      assert(!ours.test(r), `our own words on the page: ${r.match(ours)}`)
      await shot('compare-side-by-side', sheet())
      return 'side by side'
    })
    await check(`${label}: closed, the reply keeps one line, "How did Ola do?", which opens the side-by-side again`, async () => {
      await sheet().getByRole('button', { name: 'Close' }).last().click()
      const line = lastTurn(pg).locator('.compare-line')
      await line.locator('.compare-q').waitFor({ timeout: 8000 })
      const t = (await line.innerText()).replace(/\s+/g, ' ')
      assert(/^How did Ola do\? Claude did better: Claude removed the repeated rows into clean\.csv and said how many; Ola only counted the rows\.$/.test(t.trim()), t)
      await shot('compare-line', pg.locator('.drawer'))
      await line.getByRole('button').click()
      await sheet().locator('.compare-sides').waitFor()
      await sheet().getByRole('button', { name: 'Close' }).last().click()
      return t
    })
    await check(`${label}: a copy that may still hold something of the person's is held: they read what, and "Don’t send" keeps it here`, async () => {
      await pg.getByRole('button', { name: 'New conversation' }).click()
      await askAndWait('How many rows does survey.csv have, again?')
      await dev('/__dev/compare?held=1')
      await lastTurn(pg).getByRole('button', { name: 'Compare with Claude' }).click()
      await sheet().getByRole('button', { name: 'Make a made-up copy' }).click()
      await sheet().getByRole('button', { name: 'Send it anyway' }).waitFor({ timeout: 15_000 })
      const t = (await sheet().innerText()).replace(/\s+/g, ' ')
      assert(/This made-up copy may still hold something of yours\. Read it before it goes\./.test(t) && /a word from your files: thaw/.test(t), t)
      await shot('compare-held', sheet())
      await sheet().getByRole('button', { name: 'Don’t send' }).click()
      await sheet().getByText('Not sent. It stays on this machine.').waitFor()
      await sheet().getByRole('button', { name: 'Close' }).click()
      return 'held, not sent'
    })
    await check(`${label}: the real task "Just this once" shows the consent text word for word first, then runs, and says it was the real task`, async () => {
      await pg.getByRole('button', { name: 'New conversation' }).click()
      await askAndWait('Count survey.csv once more.')
      await lastTurn(pg).getByRole('button', { name: 'Compare with Claude' }).click()
      await sheet().getByRole('button', { name: 'Just this once: the real task' }).click()
      const t = (await sheet().locator('.compare-once').innerText()).replace(/\s+/g, ' ')
      assert(t.includes('Let Claude redo finished work in this project so we can compare. Your request and the files Ola read for it go to Anthropic. Off unless you turn it on. Every time is shown here.') && /The switch in Settings stays off/.test(t), t)
      await shot('compare-once', sheet())
      await sheet().getByRole('button', { name: 'Send it this once' }).click()
      await sheet().locator('.compare-sides').waitFor({ timeout: 20_000 })
      assert(/This was your real task, sent to Claude with your yes\. Your files were not changed\./.test(await sheet().innerText()), 'real-task note')
      await sheet().getByRole('button', { name: 'Close' }).last().click()
      return 'sent once'
    })
    await check(`${label}: Settings: "Compare the real task" is off, turns on only after its consent text, off again; "A few each day, on their own" with a daily number and a budget`, async () => {
      await pg.goto(`${d.url}#/settings`)
      const sw = pg.getByRole('switch', { name: 'Compare the real task' })
      await sw.waitFor()
      assert((await sw.getAttribute('aria-checked')) === 'false', 'on by default')
      await sw.click()
      const consent = pg.locator('.compare-setting .compare-once')
      await consent.waitFor()
      assert((await consent.innerText()).includes('Let Claude redo finished work in this project so we can compare.'), await consent.innerText())
      assert((await post('/api/compare/settings', { real: true })) === 400, 'turned on without consent')
      await consent.getByRole('button', { name: 'Turn it on' }).click()
      await pg.waitForFunction(() => document.querySelector('[role=switch][aria-labelledby=compare-real]')?.getAttribute('aria-checked') === 'true')
      await pg.locator('.compare-setting label', { hasText: 'A few each day, on their own' }).click()
      await pg.locator('#compare-per-day').waitFor()
      await shot('compare-settings', pg.locator('.compare-setting'))
      await sw.click()
      await pg.waitForFunction(() => document.querySelector('[role=switch][aria-labelledby=compare-real]')?.getAttribute('aria-checked') === 'false')
      const t = await pg.locator('.compare-setting').innerText()
      assert(!ours.test(t), `our own words in Settings: ${t.match(ours)}`)
      return 'on with consent, off again'
    })
    await check(`${label}: the Quality page (admins): win, tie and loss by kind and model, why Ola lost, the cost, the list; no sideways scroll at 390 px`, async () => {
      await pg.goto(`${d.url}#/quality`)
      await pg.locator('.quality-table').first().waitFor()
      const t = (await pg.locator('.quality').innerText()).replace(/\s+/g, ' ')
      assert(/Compared/.test(t) && /By kind of work/.test(t) && /clean/.test(t) && /By model/.test(t) && /Why Ola lost/.test(t) && /stopped_early/.test(t) && /Remove the repeated rows from data\.csv/.test(t) && /made-up copy/.test(t), t.slice(0, 600))
      assert(!/\b(twin|eval|judge)\b/i.test(t), `our own words: ${t.match(/\b(twin|eval|judge)\b/i)}`)
      await shot('quality')
      await pg.setViewportSize({ width: 390, height: 844 })
      await pg.waitForTimeout(300)
      const wide = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      await shot('quality-390')
      await pg.setViewportSize({ width: 1440, height: 900 })
      assert(wide <= 0, `${wide} px sideways`)
      return 'quality'
    })
    await check(`${label}: at 390 px the side-by-side stacks, with no sideways scroll`, async () => {
      await pg.setViewportSize({ width: 390, height: 844 })
      await openDrawer()
      await askAndWait('How many rows, at phone width?')
      await lastTurn(pg).getByRole('button', { name: 'Compare with Claude' }).click()
      await sheet().getByRole('button', { name: 'Make a made-up copy' }).click()
      await sheet().getByRole('button', { name: 'Send it to Claude' }).click({ timeout: 15_000 })
      await sheet().locator('.compare-sides').waitFor({ timeout: 20_000 })
      const cols = await sheet().locator('.compare-sides').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
      const wide = await sheet().evaluate((el) => el.scrollWidth - el.clientWidth)
      await shot('compare-390', sheet())
      await sheet().getByRole('button', { name: 'Close' }).last().click()
      await pg.setViewportSize({ width: 1440, height: 900 })
      assert(cols === 1 && wide <= 0, `${cols} columns, ${wide} px sideways`)
      return 'one column'
    })
    await check(`${label}: a member sees no "Compare with Claude", no line, no setting and no Quality page, and the routes refuse them`, async () => {
      await dev('/__dev/role?to=member')
      await openDrawer()
      await pg.getByRole('button', { name: 'New conversation' }).click()
      await askAndWait('How many rows, as a member?')
      await pg.waitForTimeout(800)
      assert(!(await pg.locator('.drawer').getByRole('button', { name: 'Compare with Claude' }).count()) && !(await pg.locator('.compare-line').count()), 'a member sees the compare action')
      assert(!(await pg.getByRole('link', { name: 'Quality' }).count()), 'a member sees Quality')
      await pg.goto(`${d.url}#/settings`)
      await pg.waitForSelector('#settings-title')
      await pg.waitForTimeout(500)
      assert(!(await pg.locator('.compare-setting').count()), 'a member sees the compare setting')
      const st = await post('/api/compare/start', { conversation: 'ses_x', message: 'msg_x', mode: 'twin' })
      const q = await pg.evaluate(() => fetch('/api/quality').then((r) => r.status))
      await dev('/__dev/role?to=owner')
      assert(st === 403 && q === 404, `start ${st}, quality ${q}`)
      return 'nothing that sends'
    })
  } finally {
    await c.close()
    await b.close()
    await d.stop()
  }
}
{
  const { webkit } = await import('playwright')
  console.log('\nCompare with Claude, the page (the front desk’s routes, stood in):')
  await compareChecks(chromium, 'compare-chromium')
  await compareChecks(webkit, 'compare-webkit')
}

// ---------------------------------------------------------------- slash commands and reactions
// README, "Slash commands and reactions (all surfaces)". The page against the stand-ins (Claude's
// and the hosted model's, with the real opencode and gateway and the scripted models), in Chromium
// and WebKit. A watcher in the page records any text with a raw marker the moment it appears.
const unit = spawnSync(process.execPath, ['--test', 'test/commands.test.ts'], { cwd: HERE, encoding: 'utf8' })
ok('the command and reaction parsers (test/commands.test.ts)', unit.status === 0, (/(?:#|ℹ) pass (\d+)/.exec(unit.stdout)?.[1] ?? '?') + ' tests' + (unit.status === 0 ? '' : `: ${unit.stdout.split('\n').filter((l) => /not ok|Error/.test(l)).slice(0, 3).join(' | ')}`))
async function commandChecks(engine, label) {
  const b = await engine.launch()
  const d = await startDev(['--fake-model'])
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } })
  // Every text node the page ever shows is looked at as it appears: a raw marker anywhere is a failure.
  await c.addInitScript(() => {
    window.__rawMarkers = []
    const look = (n) => {
      const t = n.nodeType === 3 ? n.textContent : n.innerText ?? n.textContent
      if (t && t.includes('[[ola:')) window.__rawMarkers.push(t.slice(0, 120))
    }
    new MutationObserver((ms) => ms.forEach((m) => (m.type === 'characterData' ? look(m.target) : m.addedNodes.forEach(look)))).observe(document, { subtree: true, childList: true, characterData: true })
  })
  const pg = await c.newPage()
  pg.on('request', (r) => {
    const u = r.url()
    if (!u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== d.origin) foreign.add(u)
  })
  const shot = async (name, page = pg) => SHOTS && (await page.waitForTimeout(450), await page.screenshot({ path: path.join(SHOTS, `${label}-${name}.png`), fullPage: false }))
  const dev = (p, method = 'GET') => pg.evaluate(([p, method]) => fetch(p, { method }).then((r) => r.json()), [p, method])
  const turns = () => pg.locator('.drawer .turn').count()
  const rawBefore = []
  const chip = () => lastTurn(pg).locator('.said-you .reaction')
  const reactionOf = () => chip().getAttribute('data-reaction', { timeout: 2000 }).catch(() => null)
  const type = async (text) => {
    await pg.fill('#ask-input', text)
  }
  const enter = () => pg.press('#ask-input', 'Enter')
  const ask = async (text) => (await type(text), await enter())
  const openDrawer = async () => {
    await pg.goto(`${d.url}#/`)
    await pg.waitForSelector('.thing')
    await pg.getByRole('button', { name: 'Ask Ola' }).click()
    await pg.waitForTimeout(300)
  }
  const fresh = async () => {
    if (await pg.getByRole('button', { name: 'New conversation' }).count()) await pg.getByRole('button', { name: 'New conversation' }).click()
  }
  try {
    await check(`${label}: the app icon: the page names the favicon, the touch icon and the manifest on its own origin, and each loads with its type`, async () => {
      await pg.goto(d.url)
      await pg.waitForSelector('.thing')
      const got = await pg.evaluate(async () => {
        const links = [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')].map((l) => l.href)
        const manifest = links.find((h) => h.endsWith('.webmanifest'))
        const icons = manifest ? (await (await fetch(manifest)).json()).icons.map((i) => new URL(i.src, manifest).href) : []
        const all = [...links, ...icons, new URL('/favicon.ico', location.href).href]
        return Promise.all(all.map(async (h) => {
          const r = await fetch(h)
          return { path: new URL(h).pathname, same: new URL(h).origin === location.origin, status: r.status, type: (r.headers.get('content-type') ?? '').split(';')[0] }
        }))
      })
      const want = { '/favicon.svg': 'image/svg+xml', '/favicon-32.png': 'image/png', '/favicon-16.png': 'image/png', '/apple-touch-icon.png': 'image/png', '/manifest.webmanifest': 'application/manifest+json', '/icon-192.png': 'image/png', '/icon-512.png': 'image/png', '/favicon.ico': 'image/x-icon' }
      const bad = got.filter((g) => !g.same || g.status !== 200 || want[g.path] !== g.type)
      const missing = Object.keys(want).filter((p) => !got.some((g) => g.path === p))
      assert(!bad.length && !missing.length, `bad ${JSON.stringify(bad)}; missing ${missing}`)
      return `${got.length} files`
    })
    await check(`${label}: "/" shows the commands with a line each; arrows and Return choose; a word that matches none says so`, async () => {
      await openDrawer()
      await type('/')
      const names = await pg.locator('.command-menu .command-name').allInnerTexts()
      const lines = await pg.locator('.command-menu .command-summary').allInnerTexts()
      assert(JSON.stringify(names) === JSON.stringify(['/claude', '/ola', '/hosted', '/new', '/stop', '/files', '/help']) && lines.every((l) => l.length > 8), `menu: ${names} / ${lines}`)
      await pg.press('#ask-input', 'ArrowDown')
      const active = await pg.locator('.command-menu li[aria-selected="true"] .command-name').innerText()
      assert(active === '/ola', `after ArrowDown: ${active}`)
      await shot('command-menu')
      await enter()
      const draft = await pg.inputValue('#ask-input')
      assert(draft === '/ola ', `Return on /ola wrote: "${draft}"`)
      await type('/he')
      assert(JSON.stringify(await pg.locator('.command-menu .command-name').allInnerTexts()) === '["/help"]', 'typing /he does not narrow to /help')
      await type('/zz')
      assert(await pg.locator('.command-menu .command-none', { hasText: 'No such command' }).isVisible(), 'no "No such command" while typing /zz')
      await pg.locator('#ask-input').press('Escape')
      assert((await pg.locator('.command-menu').count()) === 0 && (await pg.locator('.drawer.open').count()) === 1, 'Escape did not put the menu away, or closed the drawer')
    })
    await check(`${label}: an unknown command is not sent: "No such command", the text left in place`, async () => {
      const before = await turns()
      await ask('/frobnicate the survey')
      await pg.waitForTimeout(400)
      const note = await pg.locator('.command-note').innerText()
      assert(/No such command/.test(note) && (await pg.inputValue('#ask-input')) === '/frobnicate the survey' && (await turns()) === before, `note: ${note}`)
    })
    await check(`${label}: /help lists the commands in the conversation, and nothing is sent`, async () => {
      await type('/help')
      await enter() // Return on an exact command in the menu runs it
      await pg.locator('.command-help').waitFor()
      const rows = await pg.locator('.command-help dt').allInnerTexts()
      assert(rows.length === 7 && (await turns()) === 0 && (await pg.inputValue('#ask-input')) === '', `help rows ${rows.length}, turns ${await turns()}`)
      await shot('command-help')
    })
    await check(`${label}: /claude as the owner with the switch off: one request through the one-time path, the command not in the request, marked Claude; the switch stays off`, async () => {
      const before = (await dev('/__dev/role?to=owner', 'POST')).claudeOnce
      await ask('/claude write slash-claude.txt saying hi')
      await pg.waitForFunction(() => document.querySelectorAll('.drawer .turn').length === 1)
      await waitDone(pg)
      const req = await lastTurn(pg).locator('.request').innerText()
      const mark = await lastTurn(pg).locator('.said-you .engine-mark').innerText()
      const who = (await lastTurn(pg).locator('.said-ola .who').innerText()).replace(/\s+/g, ' ').trim()
      const after = (await dev('/__dev/role?to=owner', 'POST')).claudeOnce
      const info = await dev('/api/claude')
      const files = await dev('/api/files')
      assert(req === 'write slash-claude.txt saying hi' && mark === 'Claude' && who === 'Claude, outside this machine', `request "${req}", mark ${mark}, who ${who}`)
      assert(after === before + 1 && info.enabled === false && files.files.some((f) => f.path === 'slash-claude.txt'), `one-time runs ${before} -> ${after}, switch ${info.enabled}`)
      assert((await reactionOf()) === 'done', `reaction ${await reactionOf()}`)
      await shot('claude-once')
      return 'one claude_once run; switch off; ✅'
    })
    await check(`${label}: /claude with no text runs the previous request again with Claude`, async () => {
      const before = (await dev('/__dev/role?to=owner', 'POST')).claudeOnce
      await type('/claude')
      await enter()
      await pg.waitForFunction(() => document.querySelectorAll('.drawer .turn').length === 2)
      await waitDone(pg)
      const req = await lastTurn(pg).locator('.request').innerText()
      assert(req === 'write slash-claude.txt saying hi' && (await dev('/__dev/role?to=owner', 'POST')).claudeOnce === before + 1, `rerun: ${req}`)
    })
    await check(`${label}: /claude as a member with the switch off: nothing is sent; one sentence says the owner can turn it on`, async () => {
      await dev('/__dev/role?to=member', 'POST')
      await openDrawer()
      const before = await turns()
      await ask('/claude write member.txt saying no')
      await pg.waitForTimeout(500)
      const note = await pg.locator('.command-note').innerText()
      const runs = (await dev('/__dev/role?to=owner', 'POST')).claudeOnce
      await shot('claude-member')
      assert(/owner can turn it on/.test(note) && (await turns()) === before && (await pg.inputValue('#ask-input')) === '/claude write member.txt saying no', `member: ${note}`)
      assert(!(await dev('/api/files')).files.some((f) => f.path === 'member.txt'), `the member's request ran (${runs} one-time runs)`)
      await openDrawer() // the owner again
    })
    await check(`${label}: /hosted as the owner with the switch off: one request with the hosted model, marked, the switch stays off`, async () => {
      await fresh()
      await ask('/hosted Count the rows in survey.csv')
      await pg.waitForFunction(() => document.querySelectorAll('.drawer .turn').length === 1)
      await waitDone(pg)
      const mark = await lastTurn(pg).locator('.said-you .engine-mark').innerText()
      const req = await lastTurn(pg).locator('.request').innerText()
      let h
      for (let i = 0; i < 20 && (h = await dev('/__dev/hosted')).running; i++) await pg.waitForTimeout(500)
      assert(mark === 'Hosted open model' && req === 'Count the rows in survey.csv' && h.enabled === false && JSON.stringify(h.grants) === '{}', `hosted: ${mark} / ${req} / ${JSON.stringify(h)}`)
    })
    await check(`${label}: /ola sends this one request to Ola's own model, without the command`, async () => {
      await ask('/ola say hi on one line')
      await pg.waitForFunction(() => document.querySelectorAll('.drawer .turn').length === 2)
      await waitDone(pg)
      const who = (await lastTurn(pg).locator('.said-ola .who').innerText()).trim()
      const req = await lastTurn(pg).locator('.request').innerText()
      assert(who === 'Ola' && req === 'say hi on one line', `${who} / ${req}`)
    })
    await check(`${label}: a marker on the same line as text is not a reaction: the text shows without it, and ✅`, async () => {
      const answer = await lastTurn(pg).locator('.answer').last().innerText()
      assert(answer.trim() === 'Hello!' && (await reactionOf()) === 'done', `answer "${answer}", reaction ${await reactionOf()}`)
    })
    await check(`${label}: 👀 the moment a run starts, ✅ when it ends well without a marker`, async () => {
      await ask('slow 2x1500')
      await pg.waitForFunction(() => document.querySelector('.drawer .turn:last-child')?.dataset.status === 'working')
      await chip().waitFor({ timeout: 3000 })
      const during = await reactionOf()
      await shot('reaction-eyes')
      await waitDone(pg)
      assert(during === 'eyes' && (await reactionOf()) === 'done', `during ${during}, after ${await reactionOf()}`)
      await shot('reaction-done')
    })
    await check(`${label}: /stop stops the run, and the 👀 goes`, async () => {
      await ask('slow 6x1500')
      await pg.waitForFunction(() => document.querySelector('.drawer .turn:last-child')?.dataset.status === 'working')
      await chip().waitFor({ timeout: 3000 })
      await ask('/stop')
      await waitDone(pg, 20_000)
      assert((await lastTurn(pg).getAttribute('data-status')) === 'stopped' && (await chip().count()) === 0, `after /stop: ${await lastTurn(pg).getAttribute('data-status')}, chip ${await chip().count()}`)
    })
    await check(`${label}: a compliment gets 🙏 and no reply at all (Ola's model), and the reaction survives a reload`, async () => {
      await type('/new')
      await enter()
      assert((await turns()) === 0, '/new did not start a new conversation')
      await ask('Great job, thank you!')
      await waitDone(pg)
      const t = lastTurn(pg)
      assert((await reactionOf()) === 'thanks' && (await t.locator('.said-ola').count()) === 0, `reaction ${await reactionOf()}, reply blocks ${await t.locator('.said-ola').count()}`)
      await shot('reaction-thanks')
      rawBefore.push(...(await pg.evaluate(() => window.__rawMarkers)))
      await pg.reload()
      await pg.waitForSelector('.thing')
      await pg.getByRole('button', { name: 'Ask Ola' }).click()
      await pg.locator('details.earlier summary').click()
      await pg.locator('details.earlier li button').first().click() // the newest conversation (opencode may retitle it)
      await pg.waitForFunction(() => document.querySelectorAll('.drawer .turn').length === 1)
      await pg.waitForTimeout(300)
      assert((await reactionOf()) === 'thanks' && (await lastTurn(pg).locator('.said-ola').count()) === 0, `after a reload: ${await reactionOf()}`)
    })
    await check(`${label}: a compliment to Claude gets 🙏 and no reply too`, async () => {
      await ask('/claude Great job, thank you!')
      await pg.waitForFunction(() => document.querySelectorAll('.drawer .turn').length === 2)
      await waitDone(pg)
      assert((await reactionOf()) === 'thanks' && (await lastTurn(pg).locator('.said-ola').count()) === 0, `Claude: ${await reactionOf()}`)
    })
    await check(`${label}: /files opens the files view`, async () => {
      await ask('/files')
      await pg.waitForFunction(() => location.hash.startsWith('#/files'))
      await pg.locator('#files-title').waitFor()
    })
    await check(`${label}: no raw marker was ever on the page`, async () => {
      const seen = [...rawBefore, ...(await pg.evaluate(() => window.__rawMarkers))]
      assert(seen.length === 0, `seen: ${JSON.stringify(seen.slice(0, 3))}`)
    })
    await check(`${label}: at 390 px the menu and the reactions fit: no sideways scroll, no text under 15 px`, async () => {
      const m = await b.newContext({ viewport: { width: 390, height: 844 } })
      const mp = await m.newPage()
      await mp.goto(`${d.url}#/`)
      await mp.waitForSelector('.thing')
      await mp.getByRole('button', { name: 'Ask Ola' }).first().click()
      await mp.waitForTimeout(300)
      await mp.fill('#ask-input', 'Thank you, this is great')
      await mp.press('#ask-input', 'Enter')
      await mp.waitForFunction(() => document.querySelector('.drawer .turn:last-child')?.dataset.status === 'done', null, { timeout: 30_000 })
      await mp.fill('#ask-input', '/')
      const wide = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      const small = await mp.evaluate(() => [...document.querySelectorAll('.command-menu *, .reaction')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 15).map((e) => e.className))
      const chipIn = await mp.evaluate(() => {
        const r = document.querySelector('.reaction')?.getBoundingClientRect()
        const d = document.querySelector('.drawer')?.getBoundingClientRect()
        return !!r && !!d && r.right <= d.right && r.left >= d.left
      })
      await shot('phone-390', mp)
      await m.close()
      assert(wide <= 0 && small.length === 0 && chipIn, `sideways ${wide} px; small text in ${small.join(', ')}; chip inside ${chipIn}`)
    })
  } finally {
    await c.close()
    await b.close()
    await d.stop()
  }
}
{
  const { webkit } = await import('playwright')
  console.log('\nSlash commands and reactions (stand-in front desk, real opencode):')
  await commandChecks(chromium, 'chromium')
  await commandChecks(webkit, 'webkit')
}

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
    await check('a real model: "Great job, thank you!" gets 🙏 and no reply (README, reactions)', async () => {
      await lp.getByRole('button', { name: 'New conversation' }).click()
      await send(lp, 'Great job, thank you!')
      await waitDone(lp, 120_000)
      const r = await lastTurn(lp).locator('.said-you .reaction').getAttribute('data-reaction').catch(() => null)
      const reply = await lastTurn(lp).locator('.said-ola').count() ? await lastTurn(lp).locator('.said-ola').innerText() : ''
      if (SHOTS) await lp.screenshot({ path: path.join(SHOTS, 'live-thanks.png') })
      assert(r === 'thanks' && !reply && !(await lp.locator('.drawer').innerText()).includes('[[ola:'), `reaction ${r}; reply: ${reply.slice(0, 160)}`)
      return 'a 🙏 and nothing else'
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
