// The first-user walk's longer journeys, run only when asked (`--only C,E,F,G,H,I`): they look
// at more of the app than the gate needs, and say what a first person meets; most of their steps
// record rather than judge. Called by first-user.mjs with its helpers. Made-up data only.
//
//   C  six studies at once (one scanned, one two-column), a question answered on page 2 of the
//      two-column one, the citation followed to the page; then the same question of every study
//      as a job: the proposal, a trial, the whole job, Jobs, the job's table in Data
//   E  a one-page site, then "make it look better"
//   F  a drawing; a translation of a made-up Spanish law that keeps its article numbers
//   G  Settings: every switch on and off, with its words; the / commands; a compliment;
//      Compare with Claude under a reply
//   H  a second member who is not the owner: what they see and may do; then removed mid-visit
//   I  reload mid-run, two tabs, the back button, a sleeping project, a long reply, a weird file
//      name, a file over the size limit, a passkey this machine does not know, a moment offline
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const LAW = `LEY MODELO 12/2026 DE HUERTOS COMUNITARIOS (texto inventado para pruebas)

Artículo 1. Objeto.
Esta ley regula el uso de terrenos públicos vacíos como huertos comunitarios.

Artículo 2. Solicitud.
Cualquier grupo de al menos cinco vecinos puede pedir un terreno al ayuntamiento.

Artículo 3. Plazo.
El ayuntamiento responde en un plazo de sesenta días. Si no responde, la solicitud se entiende aceptada.

Artículo 4. Agua.
El ayuntamiento da acceso a una toma de agua a menos de cien metros del huerto.

Artículo 5. Fin del uso.
El uso termina con un aviso de seis meses, salvo emergencia declarada.
`

// A small volunteer log with two repeated rows (journey J's Compare with Claude). Right answer:
// Kitchen 14, Pantry 13, Delivery 11 hours once the repeats are left out.
const HOURS = ['date,team,volunteer,hours', '2026-10-01,Kitchen,Ana,4', '2026-10-01,Kitchen,Ana,4', '2026-10-02,Pantry,Ben,5', '2026-10-03,Delivery,Cy,3', '2026-10-04,Kitchen,Dee,6', '2026-10-05,Pantry,Eli,4', '2026-10-05,Pantry,Eli,4', '2026-10-06,Delivery,Fay,8', '2026-10-07,Kitchen,Gus,4', '2026-10-08,Pantry,Hal,4', ''].join('\n')

export async function moreJourneys(h) {
  const { run, step, ask, finishRun, answerText, openIn, admin, ORIGIN, sleep, until, ONLY, AI, newPerson } = h
  // J's steps are independent: one failing does not skip the next.
  const jstep = async (...a) => {
    h.fresh?.()
    // A sheet an earlier step left open would take every click.
    for (const d of await page.locator('dialog[open]').all()) await d.getByRole('button', { name: /^(Close|Not now|Don’t send)$/ }).first().click().catch(() => {})
    return step(...a)
  }
  const page = run.page
  const home = async () => {
    await page.goto(`${ORIGIN}/?w=${run.id}#/`)
    await page.waitForSelector('.project-title')
  }
  const closeDrawer = async () => {
    // On a phone the conversation is the page itself (its tab), with nothing to close.
    const close = page.getByRole('button', { name: 'Close the drawer' })
    if ((await page.locator('.drawer.open').count()) && (await close.isVisible().catch(() => false))) await close.click()
  }
  const lastTurnText = async () => (await page.locator('.drawer .turn').last().innerText().catch(() => '')).replace(/\s+/g, ' ')
  // The conversation: on a phone its tab, on a laptop the ask bar's button.
  const openDrawer = async (pg = page) => {
    await pg.locator('.drawer.open, .tabs [role="tab"], .askbar-open').first().waitFor({ timeout: 15_000 }).catch(() => {})
    if (await pg.locator('.drawer.open').count()) return
    const tab = pg.getByRole('tab', { name: 'Conversation' })
    if (await tab.isVisible().catch(() => false)) await tab.click()
    else await pg.locator('.askbar-open').click()
    await pg.locator('.drawer.open').waitFor({ timeout: 5000 })
  }

  if (ONLY.has('C')) {
    const dir = mkdtempSync(path.join(tmpdir(), 'ola-fu-docs-'))
    spawnSync('python3', ['-I', path.join(AI, 'workspace/testdata/mkdocs.py'), dir], { encoding: 'utf8' })
    const extra = spawnSync('python3', [path.join(AI, 'workspace/testdata/mkpdf.py'), 'A made-up study of rooftop gardens in an invented city. The city council decides where gardens go.', 'The plan runs to 2035. Made-up data for testing.']).stdout
    const files = [
      { name: 'study 1 water board.pdf', buffer: readFileSync(path.join(dir, 'two-column.pdf')) },
      { name: 'study 2 tenant survey.pdf', buffer: readFileSync(path.join(dir, 'one-column.pdf')) },
      { name: 'study 3 water board scan.pdf', buffer: readFileSync(path.join(dir, 'scan.pdf')) },
      { name: 'study 4 groundwater.pdf', buffer: readFileSync(path.join(dir, 'right-paper.pdf')) },
      { name: 'study 5 tourism.pdf', buffer: readFileSync(path.join(dir, 'wrong-paper.pdf')) },
      { name: 'study 6 rooftop gardens.pdf', buffer: extra },
    ].map((f) => ({ ...f, mimeType: 'application/pdf' }))
    await step(run, 'C', 'upload six studies at once', 60, async () => {
      await page.goto(`${ORIGIN}/?w=${run.id}#/files`)
      await page.waitForSelector('#file-picker', { state: 'attached' })
      await page.locator('#file-picker').setInputFiles(files)
      await until(async () => (await page.locator('table.files .file-name').allInnerTexts()).filter((t) => /study \d/.test(t)).length >= 6, 55_000, 'six studies in Files')
      return (await page.locator('.files-status').innerText().catch(() => '')).slice(0, 160)
    })
    await step(run, 'C', 'a question answered on page 2 of the two-column study; follow the citation', 300, async () => {
      await home()
      await ask(run, 'How much did the Lowland Water Board set aside for dike repairs in 2019? Say which study and which page.')
      const r = await finishRun(run, 290_000)
      const reply = await answerText(page)
      const cite = page.locator('.drawer .turn').last().locator('a.cite').first()
      if (!(await cite.count())) return `ended ${r.status}; NO citation link; reply: ${reply.slice(0, 200)}`
      const href = await cite.getAttribute('href')
      const tab = await openIn(run, cite)
      await sleep(1500)
      await tab.screenshot({ path: path.join(h.SHOTS, `${run.label}-C-citation.png`) })
      await tab.close()
      return `ended ${r.status}; 4.2 million ${/4[.,]2 million/.test(reply) ? 'found' : 'NOT found'}; citation ${href}`
    })
    await step(run, 'C', 'the same question of every study, as a job: proposal, trial, the whole job', 600, async () => {
      await ask(run, 'For every study I uploaded, find who makes the decisions and the year the plan runs to. Run it as a job over all of them and put the answers in a table.')
      // A person goes to Jobs once the conversation says a job waits there (or the run ends).
      await until(async () => (await page.locator('.drawer .turn').last().locator('.job-waits').count()) || !/working|sending/.test((await page.locator('.drawer .turn').last().getAttribute('data-status')) ?? ''), 300_000, 'a job written down')
      const r = { status: await page.locator('.drawer .turn').last().getAttribute('data-status') }
      const said = (await lastTurnText()).slice(-400)
      await closeDrawer()
      await page.goto(`${ORIGIN}/?w=${run.id}#/jobs`)
      await page.waitForSelector('#jobs-title')
      await sleep(1500)
      if (!(await page.locator('.job-card a').count())) return `ended ${r.status}; NO job in Jobs. The turn ended: ${said}`
      await page.locator('.job-card a').first().click()
      await page.waitForSelector('.job-head', { timeout: 15_000 })
      const trial = page.getByRole('button', { name: /Run a trial/ })
      if (await trial.count()) {
        await trial.click()
        await page.waitForFunction(() => /Trial done|Done/.test(document.querySelector('.job-head .job-state')?.textContent ?? ''), null, { timeout: 240_000 })
      }
      await page.screenshot({ path: path.join(h.SHOTS, `${run.label}-C-trial.png`), fullPage: true })
      const go = page.getByRole('button', { name: 'Start the whole job' })
      if (await go.count()) {
        const words = (await page.locator('.job-start').innerText()).replace(/\s+/g, ' ')
        if (/\btokens?\b/i.test(words)) throw new Error(`the whole job's budget speaks in tokens: ${words.slice(0, 300)}`)
        await page.locator('.job-start .job-consent input').last().check()
        await go.click()
        await page.waitForFunction(() => /Done/.test(document.querySelector('.job-head .job-state')?.textContent ?? ''), null, { timeout: 240_000 })
      }
      return `state: ${(await page.locator('.job-head .job-state').innerText()).replace(/\s+/g, ' ')}`
    })
    await step(run, 'C', 'the job’s table in Data, downloaded', 60, async () => {
      await page.goto(`${ORIGIN}/?w=${run.id}#/data`)
      await page.waitForSelector('#data-title')
      await sleep(1500)
      const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
      // The link reads "Excel" on screen; its full name (for a screen reader) names the table.
      const excel = page.getByRole('link', { name: /^Excel download of/ }).first()
      if (!(await excel.count())) return `no Excel download in Data: ${text.slice(0, 200)}`
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20_000 }), excel.click()])
      return `downloaded ${dl.suggestedFilename()}`
    })
  }

  if (ONLY.has('E')) {
    await step(run, 'E', 'a one-page site', 300, async () => {
      await home()
      await ask(run, 'Make a one-page site for our food bank: who we are, when we are open (Tuesdays and Saturdays, 9 to 12), and how to volunteer.')
      const r = await finishRun(run, 290_000)
      return `ended ${r.status}; Open: ${(await page.locator('.drawer .turn').last().locator('.made-pages a, .made-picture').allInnerTexts()).join(', ').replace(/\s+/g, ' ')}`
    })
    await step(run, 'E', 'make it look better: the design pass, seen without leaving the conversation', 420, async () => {
      await ask(run, 'Make it look better.', { fresh: false })
      const r = await finishRun(run, 410_000)
      const steps = (await page.locator('.drawer .turn').last().locator('.step-words').allInnerTexts()).map((s) => s.replace(/\s+/g, ' '))
      const pics = await page.locator('.drawer .turn').last().locator('.made-picture img').count()
      const page2 = page.locator('.drawer .turn').last().locator('.made-pages a').filter({ hasText: /\.html/ }).first()
      if (await page2.count()) {
        const tab = await openIn(run, page2)
        await sleep(1500)
        await tab.screenshot({ path: path.join(h.SHOTS, `${run.label}-E-after.png`), fullPage: true })
        await tab.close()
      }
      return `ended ${r.status}; ${pics} picture(s) under the reply; steps: ${steps.slice(0, 14).join(' | ')}`
    })
  }

  if (ONLY.has('F')) {
    await step(run, 'F', 'a drawing', 240, async () => {
      await home()
      await ask(run, 'Draw a simple picture of a food bank: a table with boxes of vegetables and a sign that says Open.')
      const r = await finishRun(run, 230_000)
      const pics = await page.locator('.drawer .turn').last().locator('.made-picture img').count()
      return `ended ${r.status}; ${pics} picture(s) shown under the reply`
    })
    await step(run, 'F', 'a translation of a Spanish law that keeps the article numbers', 300, async () => {
      await page.goto(`${ORIGIN}/?w=${run.id}#/files`)
      await page.waitForSelector('#file-picker', { state: 'attached' })
      await page.locator('#file-picker').setInputFiles({ name: 'ley huertos.txt', mimeType: 'text/plain', buffer: Buffer.from(LAW) })
      await page.waitForSelector('table.files .file-name:has-text("ley huertos.txt")', { timeout: 25_000 })
      await home()
      await ask(run, 'Translate ley huertos.txt into English. Keep the article numbers exactly as they are, and save it as a document.')
      const r = await finishRun(run, 290_000)
      const made = (await page.locator('.drawer .turn').last().locator('.made-pages a, .made-picture').allInnerTexts()).join(', ').replace(/\s+/g, ' ')
      const reply = await answerText(page)
      return `ended ${r.status}; Open: ${made || 'nothing'}; articles in the reply: ${(reply.match(/Article \d/g) || []).length}`
    })
  }

  if (ONLY.has('G')) {
    await step(run, 'G', 'Settings: read every switch', 30, async () => {
      await closeDrawer()
      await page.goto(`${ORIGIN}/?w=${run.id}#/settings`)
      await page.waitForSelector('#settings-title')
      await sleep(1500)
      await page.screenshot({ path: path.join(h.SHOTS, `${run.label}-G-settings-full.png`), fullPage: true })
      return (await page.getByRole('switch').evaluateAll((els) => els.map((e) => `${document.getElementById(e.getAttribute('aria-labelledby'))?.textContent?.trim()}=${e.getAttribute('aria-checked')}${e.disabled ? ' (disabled)' : ''}`))).join('; ')
    })
    const switches = await page.getByRole('switch').count()
    for (let i = 0; i < switches; i++) {
      await step(run, 'G', `switch ${i + 1}: on, then off`, 40, async () => {
        const sw = page.getByRole('switch').nth(i)
        const name = await sw.evaluate((e) => document.getElementById(e.getAttribute('aria-labelledby'))?.textContent?.trim())
        if (await sw.isDisabled()) return `${name}: disabled`
        const before = await sw.getAttribute('aria-checked')
        await sw.click()
        await sleep(700)
        const dlg = page.locator('dialog[open]')
        let asked = ''
        if (await dlg.count()) {
          asked = (await dlg.innerText()).replace(/\s+/g, ' ').slice(0, 300)
          await page.screenshot({ path: path.join(h.SHOTS, `${run.label}-G-switch-${i + 1}-asks.png`) })
          await dlg.locator('.primary-button').first().click()
          await sleep(700)
        }
        const mid = await sw.getAttribute('aria-checked')
        await page.screenshot({ path: path.join(h.SHOTS, `${run.label}-G-switch-${i + 1}-on.png`), fullPage: true })
        await sw.click()
        await sleep(700)
        if (await page.locator('dialog[open]').count()) await page.locator('dialog[open] .primary-button').first().click()
        await sleep(500)
        return `${name}: ${before} → ${mid} → ${await sw.getAttribute('aria-checked')}${asked ? `; asked: ${asked}` : ''}`
      })
    }
    for (const cmd of ['/help', '/files', '/new', '/claude say hello in one line', '/hosted say hello in one line', '/ola say hello in one line', '/stop', '/nope']) {
      await step(run, 'G', `the command ${cmd.split(' ')[0]}`, 120, async () => {
        await home()
        if (!(await page.locator('.drawer.open').count())) await page.locator('.askbar-open').click()
        await page.locator('.drawer.open').waitFor()
        const before = await page.locator('.drawer .turn').count()
        await page.locator('#ask-input').fill(cmd)
        const menu = (await page.locator('.command-menu').innerText().catch(() => '')).replace(/\s+/g, ' ')
        await page.locator('#ask-input').press('Enter')
        await sleep(2500)
        if ((await page.locator('.drawer .turn').count()) > before && /claude|hosted|ola /.test(cmd)) await finishRun(run, 100_000).catch(() => {})
        const note = (await page.locator('.command-note, .command-help').allInnerTexts()).join(' ').replace(/\s+/g, ' ')
        return `menu: ${menu.slice(0, 120)}; then: ${note.slice(0, 200) || (await lastTurnText()).slice(0, 200)}`
      })
    }
    await step(run, 'G', 'a compliment gets a reaction and no reply', 120, async () => {
      await ask(run, 'Make a tiny page that says Thank you volunteers.')
      await finishRun(run, 110_000)
      await ask(run, 'great job, thank you!', { fresh: false })
      const r = await finishRun(run, 60_000)
      const t = page.locator('.drawer .turn').last()
      return `ended ${r.status}; reaction ${await t.locator('.reaction').getAttribute('data-reaction').catch(() => 'none')}; reply shown: ${(await t.locator('.said-ola').count()) ? (await t.locator('.said-ola').innerText()).replace(/\s+/g, ' ').slice(0, 120) : 'none'}`
    })
    // Compare with Claude is journey J's (judged there, through to the side-by-side).
  }

  if (ONLY.has('H')) {
    const m = await newPerson('member')
    admin('add-member', run.team, m.who, 'member')
    await step(m.run, 'H', 'a second member: invited, lands in the shared project', 40, async () => {
      await m.page.goto(admin('invite', m.who))
      await m.page.getByLabel('Choose a password').fill('a member walks in')
      await m.page.getByRole('button', { name: 'Make my account' }).click()
      await m.page.waitForSelector('.project-title', { timeout: 30_000 })
      await sleep(1500)
      return (await m.page.locator('.project-head').innerText()).replace(/\s+/g, ' ')
    })
    await step(m.run, 'H', 'the member in Settings: what they may change', 30, async () => {
      await m.page.goto(`${ORIGIN}/?w=${run.id}#/settings`)
      await m.page.waitForSelector('#settings-title')
      await sleep(1500)
      return (await m.page.getByRole('switch').evaluateAll((els) => els.map((e) => `${e.getAttribute('aria-checked')}${e.disabled ? ' disabled' : ''}`))).join(', ')
    })
    await step(m.run, 'H', 'removed from the project mid-visit', 90, async () => {
      await m.page.goto(`${ORIGIN}/?w=${run.id}#/`)
      await m.page.waitForSelector('.project-title')
      // The owner has the project open too, drawer open, while the member is removed (B12).
      await home()
      await page.locator('.askbar-open').click()
      await page.locator('.drawer.open').waitFor()
      const r = spawnSync(process.execPath, [path.join(AI, 'frontdesk/admin.mjs'), 'remove-member', run.team, m.who], { env: h.env, encoding: 'utf8' })
      if (r.status !== 0) throw new Error(`remove-member: ${String(r.stderr).trim().split('\n').pop()}`)
      // Without a reload: the member's page says the project is no longer theirs (B11).
      await until(async () => /not one of yours/.test(await m.page.locator('body').innerText()), 30_000, 'the removed member told, without a reload')
      return (await m.page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 200)
    })
    await m.close()
    await step(run, 'H', 'the owner’s next request, right after the removal, is seen through to its end', 240, async () => {
      // Within seconds of the removal (the project restarts with new secrets): a new conversation and a request.
      await ask(run, 'Say hello in one short sentence.')
      const r = await finishRun(run, 220_000)
      const turns = await page.locator('.drawer .turn').count()
      if (!turns) throw new Error('the request vanished from the conversation')
      return `ended ${r.status}: ${(await lastTurnText()).slice(0, 160)}`
    })
  }

  if (ONLY.has('I')) {
    await step(run, 'I', 'reload mid-run', 300, async () => {
      await home()
      await ask(run, 'Write a 600-word history of community food banks in a made-up town, as a document.')
      await sleep(4000)
      await page.reload()
      await page.waitForSelector('.project-title')
      await sleep(2500)
      const afterReload = (await page.locator('.askdock, .drawer.open').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)
      await openDrawer()
      const r = await finishRun(run, 280_000)
      return `after the reload: "${afterReload}"; ended ${r.status}`
    })
    await step(run, 'I', 'the back button', 20, async () => {
      await closeDrawer()
      await page.goto(`${ORIGIN}/?w=${run.id}#/`)
      await page.getByRole('link', { name: /What Ola has of yours/ }).click()
      await page.waitForSelector('#files-title')
      await page.goBack()
      await page.waitForSelector('.project-title')
      return page.url()
    })
    await step(run, 'I', 'a file with a weird name', 60, async () => {
      await page.goto(`${ORIGIN}/?w=${run.id}#/files`)
      await page.waitForSelector('#file-picker', { state: 'attached' })
      await page.locator('#file-picker').setInputFiles({ name: 'Résumé (final) v2 — copy #3?.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') })
      await sleep(4000)
      const weird = (await page.locator('.files-status, .upload-note, .problem').allInnerTexts()).join(' ').replace(/\s+/g, ' ')
      await page.screenshot({ path: path.join(h.SHOTS, `${run.label}-I-weird-name.png`) })
      return `weird name: "${weird.slice(0, 200)}"`
    })
    // Two tabs, a moment offline and a 60 MB upload are journey J's (judged there).
    await step(run, 'I', 'a passkey this machine does not know (a browser that used one before, so the quiet link shows)', 30, async () => {
      const o = await newPerson('stranger')
      await o.page.goto(`${ORIGIN}/`)
      await o.page.evaluate(() => localStorage.setItem('ola.passkey-used', '1'))
      await o.page.reload()
      await o.page.getByRole('button', { name: 'Use a passkey instead' }).click()
      await sleep(3000)
      const said = (await o.page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300)
      await o.page.screenshot({ path: path.join(h.SHOTS, `${run.label}-I-wrong-passkey.png`) })
      await o.close()
      return said
    })
    if (process.env.OLA_FU_IDLE_MIN) {
      await step(run, 'I', 'the project sleeps, then wakes when opened', 300, async () => {
        const ws = await import('../workspace/ws.mjs')
        await until(() => !ws.running().some((c) => (c.configuration?.id || c.id) === `ola-${run.id}`), 240_000, 'the project going to sleep')
        await page.reload()
        const t0 = Date.now()
        const wakingSaid = await page.locator('.loading').innerText().catch(() => '')
        await page.waitForSelector('.thing, .drawer.open #ask-input', { timeout: 60_000 })
        return `said "${wakingSaid}", awake in ${((Date.now() - t0) / 1000).toFixed(1)} s`
      })
    }
  }

  // J: the four things a first person runs into that the other journeys only looked at (OLA-87).
  // Each step judges: it fails when the person would be left wondering.
  if (ONLY.has('J')) {
    await jstep(run, 'J', 'Compare with Claude under a reply: the made-up copy read, sent, and the side-by-side', 600, async () => {
      // The made-up copy is built for work on the person's data: a small spreadsheet and a question.
      await page.goto(`${ORIGIN}/?w=${run.id}#/files`)
      await page.waitForSelector('#file-picker', { state: 'attached' })
      await page.locator('#file-picker').setInputFiles({ name: 'volunteer hours.csv', mimeType: 'text/csv', buffer: Buffer.from(HOURS) })
      await page.waitForSelector('table.files .file-name:has-text("volunteer hours.csv")', { timeout: 25_000 })
      await home()
      await ask(run, 'In volunteer hours.csv, how many hours did each team give in total? Leave out the repeated rows.')
      const r0 = await finishRun(run, 200_000)
      if (r0.status !== 'done') throw new Error(`the request ended "${r0.status}"`)
      const btn = page.locator('.drawer .turn').last().getByRole('button', { name: 'Compare with Claude' })
      await btn.waitFor({ timeout: 15_000 }).catch(() => {})
      if (!(await btn.count())) throw new Error('no Compare with Claude under a finished reply (the owner)')
      await btn.click()
      const dlg = page.locator('dialog.compare-sheet[open]')
      await dlg.waitFor({ timeout: 5000 })
      await page.screenshot({ path: path.join(h.SHOTS, `${run.label}-J-compare-ask.png`) })
      await dlg.getByRole('button', { name: 'Make a made-up copy' }).click()
      // The copy is made by Ola's own model; the person reads it, then says send (or "anyway" when it
      // may still hold something of theirs).
      const send = dlg.getByRole('button', { name: /^(Send it to Claude|Send it anyway)$/ })
      await until(async () => (await send.count()) || /did not finish|stayed on this machine|could not make|could not read/.test(await dlg.innerText()), 300_000, 'the made-up copy to read')
      if (!(await send.count())) throw new Error(`no copy to read: ${(await dlg.innerText()).replace(/\s+/g, ' ').slice(0, 200)}`)
      const copy = (await dlg.innerText()).replace(/\s+/g, ' ')
      await page.screenshot({ path: path.join(h.SHOTS, `${run.label}-J-compare-copy.png`) })
      const sent = await send.innerText()
      await send.click()
      await until(async () => (await dlg.locator('.compare-sides').count()) || /did not finish/.test(await dlg.innerText()), 280_000, 'the side-by-side')
      const done = (await dlg.innerText()).replace(/\s+/g, ' ')
      await page.screenshot({ path: path.join(h.SHOTS, `${run.label}-J-compare-sides.png`) })
      if (!(await dlg.locator('.compare-sides').count())) throw new Error(`the comparison did not finish: ${done.slice(0, 200)}`)
      if ((await dlg.locator('.compare-sides > *').count()) !== 2) throw new Error('the side-by-side does not show Ola and Claude')
      const verdict = (await dlg.locator('.compare-verdict').innerText()).replace(/\s+/g, ' ')
      if (!verdict.trim()) throw new Error('no verdict line over the side-by-side')
      await dlg.getByRole('button', { name: 'Close' }).click()
      // Under the reply, the result stays: "How did Ola do?" and the verdict.
      await until(() => page.locator('.drawer .turn').last().locator('.compare-q').count(), 15_000, 'the verdict under the reply')
      return `${sent}; copy shown (${copy.length} characters); "${verdict.slice(0, 120)}"`
    })

    await jstep(run, 'J', 'two tabs: the second shows the run going on, and both end with the same reply', 300, async () => {
      await home()
      await ask(run, 'Write a 1,500-word history of community food banks in a made-up town, in six sections with headings, as a document.')
      await sleep(1000)
      const tab2 = await run.ctx.newPage()
      try {
        await tab2.goto(`${ORIGIN}/?w=${run.id}#/`)
        await tab2.waitForSelector('.project-title')
        // The run is said in the second tab: in its ask bar (laptop) or its conversation (phone).
        const said = await until(async () => {
          if (/Ola is working on your request/.test(await tab2.locator('.askbar-status').innerText().catch(() => ''))) return 'the ask bar says Ola is working'
          const st = await tab2.locator('.drawer.open .turn').last().getAttribute('data-status').catch(() => null)
          return st === 'working' || st === 'sending' ? 'its conversation shows the run working' : st === 'done' ? 'the run had already ended' : null
        }, 30_000, 'the second tab showing the run going on')
        await tab2.screenshot({ path: path.join(h.SHOTS, `${run.label}-J-second-tab-working.png`) })
        const r = await finishRun(run, 280_000)
        if (r.status !== 'done') throw new Error(`the run ended "${r.status}"`)
        const reply = await answerText(page)
        await openDrawer(tab2)
        const same = await until(async () => {
          const t = tab2.locator('.drawer .turn').last()
          if ((await t.getAttribute('data-status')) !== 'done') return null
          const r2 = ((await t.locator('.said-ola').innerText().catch(() => '')) || '').replace(/\s+/g, ' ')
          return r2 && r2.slice(0, 80) === reply.slice(0, 80) ? r2 : null
        }, 30_000, 'the same reply in the second tab').catch(async (e) => {
          // What the second tab shows instead, for whoever reads the failure.
          await tab2.screenshot({ path: path.join(h.SHOTS, `${run.label}-J-second-tab-not-done.png`) })
          const t = tab2.locator('.drawer .turn').last()
          throw new Error(`${e.message}: its last turn is "${await t.getAttribute('data-status').catch(() => '?')}", says "${((await t.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 160)}"; the first tab's reply starts "${reply.slice(0, 60)}"`)
        })
        await tab2.screenshot({ path: path.join(h.SHOTS, `${run.label}-J-second-tab-done.png`) })
        return `${said}; the same reply in both (${same.length} characters)`
      } finally {
        await tab2.close()
      }
    })

    await jstep(run, 'J', 'a moment offline: said at once, and a request works when it is back', 180, async () => {
      await home()
      await openDrawer()
      await run.ctx.setOffline(true)
      const off = await until(async () => /Lost the connection/.test(await page.locator('body').innerText()), 15_000, 'the page saying the connection is lost').then(() => 'said').catch((e) => e.message)
      await page.screenshot({ path: path.join(h.SHOTS, `${run.label}-J-offline.png`) })
      await run.ctx.setOffline(false)
      if (off !== 'said') throw new Error(off)
      await until(async () => !/Lost the connection/.test(await page.locator('body').innerText()), 30_000, 'the lost-connection line going away when it is back')
      await page.screenshot({ path: path.join(h.SHOTS, `${run.label}-J-back-online.png`) })
      await ask(run, 'Say hello in one short sentence.')
      const r = await finishRun(run, 150_000)
      if (r.status !== 'done') throw new Error(`the request after coming back ended "${r.status}"`)
      return `said, recovered, then a request ran to its end: ${(await answerText(page)).slice(0, 80)}`
    })

    await jstep(run, 'J', 'a 60 MB scan: sent in pieces with its progress, then in Files at its size', 240, async () => {
      await closeDrawer()
      await page.goto(`${ORIGIN}/?w=${run.id}#/files`)
      await page.waitForSelector('#file-picker', { state: 'attached' })
      const dir = mkdtempSync(path.join(tmpdir(), 'ola-fu-big-'))
      const file = path.join(dir, 'field survey scan.pdf')
      writeFileSync(file, bigScan(60 * 1024 * 1024))
      const t0 = Date.now()
      // The browser reads the file as it sends it: it stays until the upload is done.
      await page.locator('#file-picker').setInputFiles(file)
      const progress = await until(() => page.locator('.upload-progress').innerText().catch(() => ''), 20_000, 'the upload showing its progress').catch(() => '')
      await page.screenshot({ path: path.join(h.SHOTS, `${run.label}-J-big-upload-progress.png`) })
      await until(async () => (await page.locator('table.files .file-name').allInnerTexts()).some((t) => t.includes('field survey scan.pdf')), 200_000, 'the 60 MB scan in Files').finally(() => rmSync(dir, { recursive: true, force: true }))
      const secs = ((Date.now() - t0) / 1000).toFixed(1)
      await page.screenshot({ path: path.join(h.SHOTS, `${run.label}-J-big-upload-done.png`) })
      const problem = (await page.locator('.problem').allInnerTexts()).join(' ')
      if (problem) throw new Error(`a problem was said: ${problem.replace(/\s+/g, ' ').slice(0, 200)}`)
      const row = (await page.locator('table.files tr', { hasText: 'field survey scan.pdf' }).first().innerText()).replace(/\s+/g, ' ')
      if (!/\b(6\d|5\d)(\.\d)? MB\b/.test(row)) throw new Error(`its size in Files: ${row}`)
      return `${progress ? `progress "${progress.replace(/\s+/g, ' ').slice(0, 80)}"` : 'no progress shown'}; in Files after ${secs} s: ${row.slice(0, 120)}`
    })
  }
}

/** A one-page PDF that is a scan: one uncompressed grey-paper picture, `bytes` long or a little more. */
function bigScan(bytes) {
  const side = Math.ceil(Math.sqrt(bytes / 3))
  const pixels = Buffer.alloc(side * side * 3, 0xee)
  for (let i = 0; i < pixels.length; i += 4099) pixels[i] = 0x60 // specks, so it is not one flat color
  const parts = []
  const offsets = []
  let at = 0
  const put = (b) => (parts.push(b), (at += b.length))
  const obj = (n, body, stream) => {
    offsets[n] = at
    put(Buffer.from(`${n} 0 obj\n${body}\n${stream ? 'stream\n' : ''}`, 'latin1'))
    if (stream) put(stream), put(Buffer.from('\nendstream'))
    put(Buffer.from('\nendobj\n'))
  }
  put(Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1'))
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>')
  const content = Buffer.from('q 612 0 0 792 0 0 cm /Im0 Do Q')
  obj(4, `<< /Length ${content.length} >>`, content)
  obj(5, `<< /Type /XObject /Subtype /Image /Width ${side} /Height ${side} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${pixels.length} >>`, pixels)
  const xref = at
  put(Buffer.from(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => `${String(offsets[n]).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`, 'latin1'))
  return Buffer.concat(parts)
}

export const listShots = (dir) => readdirSync(dir)
