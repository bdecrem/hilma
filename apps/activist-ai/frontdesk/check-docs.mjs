// Reading real documents and Open for every kind, through the front desk (README, "Reading real
// documents" and "Open for every kind"). Called by frontdesk/check.mjs with its helpers, after its
// own "Open" checks; every browser check runs in Chromium and in WebKit.
//
// The made-up files are written inside alice's workspace by workspace/testdata/mkdocs.py, with
// every outside address in the hostile ones pointing at a counting server on this machine: the
// browser could reach it, so "nothing arrived" means nothing in those files ran or loaded.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { webkit } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export async function docChecks({ check, assert, api, A, a, v, FA, CTR, ORIGIN, CK, SHOTS, sleep, until, auditRows, dataDir, live = false }) {
  const hits = []
  const beacon = http.createServer((req, res) => (hits.push(req.url), res.writeHead(200, { 'access-control-allow-origin': '*' }).end('ok')))
  await new Promise((r) => beacon.listen(0, '127.0.0.1', r))
  const BEACON = `http://127.0.0.1:${beacon.address().port}`
  const inside = (args, input) => spawnSync(CTR, ['exec', ...(input !== undefined ? ['-i'] : []), `ola-${FA}`, ...args], { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const wk = await webkit.launch()
  // alice in WebKit: her session cookie in a fresh WebKit context (the cookie is ola-local on http://localhost).
  const wkCtx = await wk.newContext({ viewport: { width: 1280, height: 860 } })
  await wkCtx.addCookies([{ name: CK, value: a.cookie, url: ORIGIN }])
  const engines = [
    ['Chromium', A.ctx],
    ['WebKit', wkCtx],
  ]
  const outsideOf = (page) => {
    const seen = []
    page.on('request', (r) => !r.url().startsWith(`${ORIGIN}/`) && !r.url().startsWith('data:') && !r.url().startsWith('about:') && seen.push(r.url()))
    return seen
  }
  try {
    await check('documents: the made-up files (scans, hostile files of each kind) are made inside the workspace, pointing at a counting server', async () => {
      const r = inside(['python3', '-I', '-', '/work/dx', '--beacon', BEACON], readFileSync(path.join(HERE, '../workspace/testdata/mkdocs.py')))
      assert(r.status === 0, r.stderr.trim().split('\n').pop())
      // Things "Ola made" at the top of the folder: a chart, the hostile SVG, a PDF, a Word file, a table.
      const cp = inside(['sh', '-c', 'cp dx/chart.png chart.png && cp dx/hostile.svg drawing.svg && cp dx/two-column.pdf water-report.pdf && cp dx/remote-template.docx notes.docx && cp dx/formulas.xlsx budget.xlsx && ola-db add dx/scan.pdf >/dev/null && ola-db add water-report.pdf >/dev/null'])
      assert(cp.status === 0, cp.stderr)
      return 'in /work/dx and five at the top of the folder'
    })

    await check('the project home lists what Ola made by kind (pages, charts and images, tables, documents); a hostile SVG shown there as a picture runs nothing and loads nothing, in Chromium and WebKit', async () => {
      const out = []
      for (const [name, ctx] of engines) {
        const page = await ctx.newPage()
        const outside = outsideOf(page)
        const n0 = hits.length
        await page.goto(`${ORIGIN}/?w=${FA}#/`)
        await page.waitForSelector('.thing-group[data-group="charts"] .pic-frame img', { timeout: 30_000 })
        const groups = await page.locator('.thing-group .group-title').allInnerTexts()
        await page.waitForFunction(() => [...document.querySelectorAll('.pic-frame img')].every((i) => i.complete), null, { timeout: 15_000 })
        const sizes = await page.locator('.pic-frame img').evaluateAll((xs) => xs.map((i) => [i.getAttribute('src'), i.naturalWidth]))
        if (SHOTS && name === 'Chromium') await page.screenshot({ path: path.join(SHOTS, 'dx-home-groups.png'), fullPage: true })
        await sleep(1500)
        await page.close()
        assert(groups.some((g) => g.startsWith('Pages')) && groups.some((g) => g.startsWith('Charts and images')) && groups.some((g) => g.startsWith('Tables')) && groups.some((g) => g.startsWith('Documents')), `${name}: groups ${groups.map((g) => g.replace(/\s+/g, ' ')).join(' | ')}`)
        assert(sizes.length >= 2 && sizes.every(([src, w]) => src.startsWith('/api/thumb?') && w > 0), `${name}: pictures ${JSON.stringify(sizes)}`)
        assert(hits.length === n0 && !outside.length, `${name}: the outside got ${hits.slice(n0).join(' ')} ${outside.join(' ')}`)
        out.push(`${name}: ${groups.map((g) => g.replace(/\s+\d+$/, '')).join(', ')}`)
      }
      // The picture route answers image requests only, under a sandbox CSP.
      const doc = await api(`/api/thumb?w=${FA}&path=drawing.svg`, { cookie: a.cookie, headers: { 'sec-fetch-dest': 'document' } })
      const img = await api(`/api/thumb?w=${FA}&path=drawing.svg`, { cookie: a.cookie, headers: { 'sec-fetch-dest': 'image' } })
      assert(doc.status === 404 && img.status === 200 && img.headers.get('content-type') === 'image/svg+xml' && /^sandbox/.test(img.headers.get('content-security-policy') ?? ''), `thumb as a document ${doc.status}, as an image ${img.status} ${img.headers.get('content-security-policy')}`)
      return `${out.join('; ')}; as a document 404`
    })

    await check('Open on a picture: the hostile SVG is shown only as an image (its script, onload and outside images do nothing), a direct visit is refused, in Chromium and WebKit', async () => {
      for (const [name, ctx] of engines) {
        const page = await ctx.newPage()
        const outside = outsideOf(page)
        const n0 = hits.length
        await page.goto(`${ORIGIN}/api/open?w=${FA}&path=dx%2Fhostile.svg`)
        await page.waitForFunction(() => document.querySelector('.pic img')?.complete && document.querySelector('.pic img').naturalWidth > 0, null, { timeout: 15_000 })
        const title = await page.title()
        const src = await page.locator('.pic img').getAttribute('src')
        if (SHOTS && name === 'Chromium') await page.screenshot({ path: path.join(SHOTS, 'dx-open-svg.png') })
        const direct = await page.goto(`${ORIGIN}${src}`)
        const directStatus = direct.status()
        await sleep(1500)
        await page.close()
        assert(title === 'hostile.svg · Ola' && directStatus === 403, `${name}: ${title}, direct ${directStatus}`)
        assert(hits.length === n0 && !outside.length, `${name}: the outside got ${hits.slice(n0).join(' ')} ${outside.join(' ')}`)
      }
      return 'shown as an image in both; a top-level visit 403; nothing reached the counting server'
    })

    await check('Open on a scanned PDF at a page: the link opens at page 2 (no script), the page is a picture made in the VM, its text is there marked as read from a scan; the PDF with JavaScript and a Launch action runs nothing, in Chromium and WebKit', async () => {
      const res = []
      for (const [name, ctx] of engines) {
        const page = await ctx.newPage()
        const outside = outsideOf(page)
        const n0 = hits.length
        await page.goto(`${ORIGIN}/api/open?w=${FA}&path=dx%2Fscan.pdf&page=2#page-2`)
        await page.waitForFunction(() => {
          const i = document.querySelector('#page-2 img')
          return i && i.complete && i.naturalWidth > 0
        }, null, { timeout: 30_000 })
        await sleep(400)
        const top = await page.evaluate(() => Math.round(document.getElementById('page-2').getBoundingClientRect().top))
        const cited = await page.locator('#page-2 .pno').innerText()
        const text = await page.locator('#page-2 .txt').textContent()
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `dx-open-pdf-page2-${name.toLowerCase()}.png`) })
        await page.goto(`${ORIGIN}/api/open?w=${FA}&path=dx%2Fhostile.pdf`)
        await page.waitForFunction(() => document.querySelector('#page-1 img')?.naturalWidth > 0, null, { timeout: 30_000 })
        await sleep(1500)
        await page.close()
        assert(top >= 0 && top < 140 && /the page cited/.test(cited) && /read from a scan/.test(cited) && /4\.2\s*million/.test(text ?? ''), `${name}: page 2 at ${top}px, "${cited}", text ${JSON.stringify((text ?? '').slice(0, 60))}`)
        assert(hits.length === n0 && !outside.length, `${name}: the outside got ${hits.slice(n0).join(' ')} ${outside.join(' ')}`)
        res.push(`${name} page 2 at ${top}px`)
      }
      return res.join(', ')
    })

    await check('Open on a Word file with a remote template and picture, and on Markdown with a script: readable pages made in the VM, shown in a frame that runs and loads nothing, in Chromium and WebKit', async () => {
      for (const [name, ctx] of engines) {
        for (const [file, heading] of [['dx/remote-template.docx', 'Notes on the Drought Relief Hearing'], ['dx/notes.md', 'Hearing notes'], ['dx/plain.txt', null]]) {
          const page = await ctx.newPage()
          const outside = outsideOf(page)
          const n0 = hits.length
          await page.goto(`${ORIGIN}/api/open?w=${FA}&path=${encodeURIComponent(file)}`)
          let frame
          await until(() => (frame = page.frames().find((f) => f.url().endsWith('/@doc'))), 15_000, 'the document frame')
          await frame.waitForSelector('body', { timeout: 15_000 })
          const h1 = heading ? await frame.locator('h1').first().innerText() : await frame.locator('pre').innerText()
          if (SHOTS && name === 'Chromium' && file.endsWith('docx')) await page.screenshot({ path: path.join(SHOTS, 'dx-open-docx.png') })
          await sleep(1000)
          await page.close()
          assert(heading ? h1 === heading : /<b>Not bold<\/b>/.test(h1), `${name} ${file}: ${h1.slice(0, 60)}`)
          assert(hits.length === n0 && !outside.length, `${name} ${file}: the outside got ${hits.slice(n0).join(' ')} ${outside.join(' ')}`)
        }
      }
      const f = await api(`/api/open?w=${FA}&path=dx%2Fnotes.md`, { cookie: a.cookie })
      const grant = /\/v\/([A-Za-z0-9_-]{43})\/@doc/.exec(f.text)?.[1]
      const top = await api(`/v/${grant}/@doc`, { headers: { 'sec-fetch-dest': 'document' } })
      const other = await api(`/v/${grant}/dx/notes.md`, { headers: { 'sec-fetch-dest': 'iframe' } })
      assert(grant && top.status === 403 && other.status === 404 && /^sandbox;/.test(top.headers.get('content-security-policy') ?? '') && !/allow-scripts/.test(top.headers.get('content-security-policy') ?? ''), `top ${top.status}, other file ${other.status}, csp ${top.headers.get('content-security-policy')}`)
      return 'Word, Markdown and text in both engines; under its grant only @doc, only in a frame, CSP sandbox without scripts'
    })

    await check('Open on a spreadsheet with formulas and external links: the app’s table view, its sheets as tabs, formulas shown as text, sorting, nothing reached; the same from Open on the home, in Chromium and WebKit', async () => {
      const r = await api(`/api/open?w=${FA}&path=budget.xlsx`, { cookie: a.cookie })
      assert(r.status === 303 && r.headers.get('location') === `/?w=${FA}#/table?path=budget.xlsx`, `open ${r.status} ${r.headers.get('location')}`)
      for (const [name, ctx] of engines) {
        const page = await ctx.newPage()
        const outside = outsideOf(page)
        const n0 = hits.length
        await page.goto(`${ORIGIN}/?w=${FA}#/table?path=budget.xlsx`)
        await page.waitForSelector('table.grid tbody tr', { timeout: 30_000 })
        const cells = await page.locator('table.grid tbody').innerText()
        const tabs = await page.locator('.sheet-tab').allInnerTexts()
        await page.locator('.sheet-tab', { hasText: 'Districts' }).click()
        await page.waitForFunction(() => document.querySelector('table.grid thead')?.textContent?.includes('Households'), null, { timeout: 15_000 })
        await page.locator('th button', { hasText: 'Households' }).click()
        await page.locator('th button', { hasText: 'Households' }).click()
        await page.waitForFunction(() => document.querySelector('table.grid tbody tr td')?.textContent === 'West', null, { timeout: 15_000 })
        if (SHOTS && name === 'Chromium') await page.screenshot({ path: path.join(SHOTS, 'dx-open-xlsx.png') })
        await sleep(800)
        await page.close()
        assert(/=WEBSERVICE\("http:\/\/127\.0\.0\.1:\d+\/xlsx-webservice"\)/.test(cells) && /=SUM\(B2:B3\)/.test(cells) && tabs.join() === 'Budget,Districts', `${name}: ${cells.slice(0, 120)} | ${tabs}`)
        assert(hits.length === n0 && !outside.length, `${name}: the outside got ${hits.slice(n0).join(' ')} ${outside.join(' ')}`)
      }
      return 'rows, two sheets, sorted Households desc → West; in both engines'
    })

    await check('a library in pieces: a zip sent in 1 MiB pieces, resumed after a "dropped" piece, unpacked into its folder and indexed; a zip bomb is refused and kept as a file; a SQLite database is attached and its tables are in Data; a damaged one is refused; a viewer cannot upload', async () => {
      const read = (f) => Buffer.from(inside(['base64', '-w0', `/work/dx/${f}`]).stdout, 'base64')
      const csrf = { cookie: a.cookie, csrf: a.csrf, ws: FA }
      const send = async (name, bytes, { dropAfter = -1 } = {}) => {
        const s = await api('/api/uploads', { ...csrf, method: 'POST', body: JSON.stringify({ name, size: bytes.length }), headers: { 'content-type': 'application/json' } })
        assert(s.status === 201 || s.status === 200, `start ${name}: ${s.status} ${s.text}`)
        let have = s.json.have
        let pieces = 0
        while (have < bytes.length) {
          const piece = bytes.subarray(have, have + s.json.chunk)
          const r = await api(`/api/uploads/${s.json.id}?offset=${have}`, { ...csrf, method: 'PUT', body: piece, headers: { 'content-type': 'application/octet-stream' } })
          assert(r.status === 200, `piece at ${have}: ${r.status} ${r.text}`)
          have = r.json.have
          pieces++
          if (pieces === dropAfter + 1) {
            // The page lost its place: it starts again with the same file, and carries on.
            const again = await api('/api/uploads', { ...csrf, method: 'POST', body: JSON.stringify({ name, size: bytes.length }), headers: { 'content-type': 'application/json' } })
            assert(again.status === 200 && again.json.id === s.json.id && again.json.have === have, `resume: ${again.status} ${JSON.stringify(again.json)}`)
            const wrong = await api(`/api/uploads/${s.json.id}?offset=0`, { ...csrf, method: 'PUT', body: piece, headers: { 'content-type': 'application/octet-stream' } })
            assert(wrong.status === 409 && wrong.json.have === have, `a piece at the wrong place: ${wrong.status}`)
          }
        }
        const f = await api(`/api/uploads/${s.json.id}/finish`, { ...csrf, method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })
        return { ...f, pieces }
      }
      // A zip larger than one piece: the papers zip with a made-up 2.5 MB padding file.
      const big = inside(['python3', '-I', '-c', 'import zipfile, os\nz = zipfile.ZipFile("/work/dx/library.zip", "w")\nz.write("/work/dx/one-column.pdf", "library/one-column.pdf")\nz.write("/work/dx/right-paper.pdf", "library/right-paper.pdf")\nz.writestr("library/padding.bin", os.urandom(2500000))\nz.close()'])
      assert(big.status === 0, big.stderr)
      const lib = await send('library.zip', read('library.zip'), { dropAfter: 0 })
      assert(lib.status === 201 && lib.json.unpacked?.folder === 'library' && lib.json.unpacked.files === 3 && lib.pieces >= 3, `library.zip: ${lib.status} ${lib.text.slice(0, 200)}`)
      const bomb = await send('bomb.zip', read('bomb.zip'))
      assert(bomb.status === 201 && /zip bomb/.test(bomb.json.refused ?? ''), `bomb.zip: ${bomb.text.slice(0, 200)}`)
      const db = await send('library.db', read('library.db'))
      const bad = await send('corrupt.db', read('corrupt.db'))
      assert(db.json.attached?.alias === 'library' && /integrity check/.test(bad.json.refused ?? ''), `db: ${db.text.slice(0, 160)} | corrupt: ${bad.text.slice(0, 160)}`)
      const data = await api('/api/data', { cookie: a.cookie, ws: FA })
      const t = data.json?.tables?.find((x) => x.name === 'library.papers')
      const rows = await api(`/api/data/table?name=library.papers&sort=year&dir=desc&limit=5`, { cookie: a.cookie, ws: FA })
      assert(t?.attached && t.rows === 1000 && rows.json?.rows?.length === 5, `Data: ${JSON.stringify(t)?.slice(0, 160)} rows ${rows.status}`)
      await until(async () => (await api('/api/data/docs?q=tenants', { cookie: a.cookie, ws: FA })).json?.hits?.some((h) => h.path === 'library/one-column.pdf'), 60_000, 'the unpacked papers indexed')
      const files = (await api('/api/files', { cookie: a.cookie, ws: FA })).json.files
      const listed = (p) => files.find((f) => f.path === p)
      assert(listed('library/one-column.pdf')?.origin === 'uploaded' && !listed('library.zip') && listed('bomb.zip')?.origin === 'uploaded', `files: ${files.map((f) => f.path).join(', ').slice(0, 300)}`)
      const viewer = await api('/api/uploads', { cookie: v.cookie, csrf: v.csrf, ws: FA, method: 'POST', body: JSON.stringify({ name: 'x.zip', size: 10 }), headers: { 'content-type': 'application/json' } })
      assert(viewer.status === 403, `viewer ${viewer.status}`)
      // No file name in the platform database: the audit log has keyed hashes only.
      const raw = readFileSync(path.join(dataDir, 'platform.db')).toString('latin1') + (() => {
        try {
          return readFileSync(path.join(dataDir, 'platform.db-wal')).toString('latin1')
        } catch {
          return ''
        }
      })()
      const names = ['library.zip', 'one-column', 'right-paper', 'bomb.zip', 'corrupt.db', 'budget.xlsx', 'hostile.svg', 'scan.pdf']
      assert(!names.some((n) => raw.includes(n)), `a file name in platform.db: ${names.filter((n) => raw.includes(n))}`)
      const rowsA = auditRows(FA).filter((x) => x.action === 'page_opened' || x.action === 'file_uploaded')
      return `library.zip in ${lib.pieces} pieces, resumed once, 3 files unpacked and indexed; bomb refused and kept; library.db attached (1,000 rows); corrupt.db refused; viewer 403; ${rowsA.length} open and upload rows in the audit log, no names`
    })

    await check('Settings shows the project’s room (files, data, Ola’s own notes), from the VM, in Chromium and WebKit', async () => {
      const d = await api('/api/disk', { cookie: a.cookie, ws: FA })
      assert(d.status === 200 && d.json.total > 0 && d.json.files > 0 && d.json.uploaded > 0, `disk ${d.status} ${d.text}`)
      for (const [name, ctx] of engines) {
        const page = await ctx.newPage()
        await page.goto(`${ORIGIN}/?w=${FA}#/settings`)
        await page.waitForSelector('.disk-use .disk-bar', { timeout: 30_000 })
        const say = await page.locator('.disk-use .setting-say').innerText()
        if (SHOTS && name === 'Chromium') await page.locator('.disk-use').screenshot({ path: path.join(SHOTS, 'dx-settings-room.png') })
        await page.close()
        assert(/used of/.test(say) && /free/.test(say), `${name}: ${say}`)
      }
      return `${Math.round(d.json.files / 1024)} KiB of files, ${Math.round(d.json.data / 1024)} KiB of data`
    })
    // The live run (with the real model; skipped by --no-live): a made-up scanned two-column
    // report, uploaded through the page; a question whose answer is only on page 2; the reply's
    // citation opens page 2.
    if (live) {
      await check('live: a scanned two-column PDF uploaded through the page, a question answered from page 2, and the reply’s citation opens the PDF at page 2', async () => {
        const scan = Buffer.from(inside(['base64', '-w0', '/work/dx/scan.pdf']).stdout, 'base64')
        await A.page.goto(`${ORIGIN}/?w=${FA}#/files`)
        await A.page.waitForSelector('#file-picker', { state: 'attached' })
        await A.page.setInputFiles('#file-picker', { name: 'water-board-scan.pdf', mimeType: 'application/pdf', buffer: scan })
        await A.page.waitForSelector('text=water-board-scan.pdf', { timeout: 60_000 })
        await until(async () => (await api('/api/data/docs?q=dike%20repairs', { cookie: a.cookie, ws: FA })).json?.hits?.some((h) => h.path === 'water-board-scan.pdf' && h.page === 2), 120_000, 'the scan read by OCR')
        await A.page.goto(`${ORIGIN}/?w=${FA}#/`)
        await A.page.waitForSelector('.project-title')
        await A.page.fill('#askbar-input', 'In water-board-scan.pdf, how much did the Lowland Water Board set aside for dike repairs, and in which year? Answer in one sentence and cite the page.')
        await A.page.press('#askbar-input', 'Enter')
        const last = A.page.locator('.drawer .turn').last()
        const end = Date.now() + 300_000
        while (Date.now() < end) {
          const st = await last.getAttribute('data-status').catch(() => null)
          if (st && ['done', 'failed', 'stopped'].includes(st)) break
          if (await A.page.locator('dialog.approval[open]').count()) await A.page.getByRole('button', { name: 'Yes, this once' }).click()
          await A.page.waitForTimeout(500)
        }
        const answer = (await last.locator('.answer').allInnerTexts()).pop() ?? ''
        const href = await last.locator('a.cite').first().getAttribute('href').catch(() => null)
        if (SHOTS) await A.page.locator('.drawer').screenshot({ path: path.join(SHOTS, 'dx-live-reply.png') })
        assert(/4\.2 million/.test(answer) && /2019/.test(answer), `answer: ${answer.slice(0, 200)}`)
        assert(href && /path=water-board-scan\.pdf&page=2#page-2$/.test(href), `citation ${href}; answer: ${answer.slice(0, 200)}`)
        const [tab] = await Promise.all([A.ctx.waitForEvent('page'), last.locator('a.cite').first().click()])
        await tab.waitForFunction(() => document.querySelector('#page-2 img')?.naturalWidth > 0, null, { timeout: 60_000 })
        await sleep(400)
        const top = await tab.evaluate(() => Math.round(document.getElementById('page-2').getBoundingClientRect().top))
        if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, 'dx-live-citation-page2.png') })
        await tab.close()
        assert(top >= 0 && top < 140, `page 2 at ${top}px`)
        return `answer: ${answer.replace(/\s+/g, ' ').slice(0, 160)}; citation ${href}; page 2 at ${top}px`
      })
    }
  } finally {
    // Leave alice's project as the later checks expect it: the uploads deleted through the page
    // (their rows and documents go with them), the rest of what these checks made removed.
    const csrf = { cookie: a?.cookie, csrf: a?.csrf, ws: FA }
    for (const f of ['library/one-column.pdf', 'library/right-paper.pdf', 'library/padding.bin', 'bomb.zip', 'library.db', 'corrupt.db', 'water-board-scan.pdf'])
      await api(`/api/files/${f.split('/').map(encodeURIComponent).join('/')}`, { ...csrf, method: 'DELETE' }).catch(() => {})
    inside(['sh', '-c', 'rm -rf /work/dx /work/library /work/chart.png /work/drawing.svg /work/water-report.pdf /work/notes.docx /work/budget.xlsx; ola-db init'])
    beacon.close()
    await wk.close()
  }
}
