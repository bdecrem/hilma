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
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
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

export async function moreJourneys(h) {
  const { run, step, ask, finishRun, answerText, openIn, admin, ORIGIN, sleep, until, ONLY, AI, newPerson } = h
  const page = run.page
  const home = async () => {
    await page.goto(`${ORIGIN}/?w=${run.id}#/`)
    await page.waitForSelector('.project-title')
  }
  const closeDrawer = async () => {
    if (await page.locator('.drawer.open').count()) await page.getByRole('button', { name: 'Close the drawer' }).click()
  }
  const lastTurnText = async () => (await page.locator('.drawer .turn').last().innerText().catch(() => '')).replace(/\s+/g, ' ')

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
    await step(run, 'G', 'Compare with Claude under a reply, through to the side-by-side', 600, async () => {
      const t = page.locator('.drawer .turn').nth(-2)
      const btn = t.getByRole('button', { name: 'Compare with Claude' })
      if (!(await btn.count())) return 'no Compare with Claude under the reply'
      await btn.click()
      await page.waitForSelector('dialog[open]')
      await page.screenshot({ path: path.join(h.SHOTS, `${run.label}-G-compare-ask.png`) })
      const go = page.getByRole('button', { name: 'Make a made-up copy' })
      await go.click()
      await until(async () => (await page.locator('.compare-sides').count()) || /could not|did not/.test(await page.locator('dialog[open]').innerText()), 560_000, 'the side-by-side')
      await page.screenshot({ path: path.join(h.SHOTS, `${run.label}-G-compare-sides.png`) })
      return (await page.locator('dialog[open]').innerText()).replace(/\s+/g, ' ').slice(0, 300)
    })
  }

  if (ONLY.has('H')) {
    const m = await newPerson('member')
    admin('add-member', run.team, m.who, 'member')
    await step(m.run, 'H', 'a second member: invited, lands in the shared project', 40, async () => {
      await m.page.goto(admin('invite', m.who))
      await m.page.getByRole('button', { name: 'Make my passkey' }).click()
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
    await step(run, 'I', 'reload mid-run, then a second tab', 300, async () => {
      await home()
      await ask(run, 'Write a 600-word history of community food banks in a made-up town, as a document.')
      await sleep(4000)
      await page.reload()
      await page.waitForSelector('.project-title')
      await sleep(2500)
      const afterReload = (await page.locator('.askdock, .drawer.open').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)
      const tab2 = await run.ctx.newPage()
      await tab2.goto(page.url())
      await tab2.waitForSelector('.project-title')
      await sleep(2000)
      const inTab2 = (await tab2.locator('.askdock').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)
      await tab2.screenshot({ path: path.join(h.SHOTS, `${run.label}-I-second-tab.png`) })
      await tab2.close()
      await page.locator('.askbar-open').click()
      const r = await finishRun(run, 280_000)
      return `after the reload: "${afterReload}"; second tab: "${inTab2}"; ended ${r.status}`
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
    await step(run, 'I', 'a file with a weird name; one over the size limit', 60, async () => {
      await page.goto(`${ORIGIN}/?w=${run.id}#/files`)
      await page.waitForSelector('#file-picker', { state: 'attached' })
      await page.locator('#file-picker').setInputFiles({ name: 'Résumé (final) v2 — copy #3?.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') })
      await sleep(4000)
      const weird = (await page.locator('.files-status, .upload-note, .problem').allInnerTexts()).join(' ').replace(/\s+/g, ' ')
      await page.screenshot({ path: path.join(h.SHOTS, `${run.label}-I-weird-name.png`) })
      await page.locator('#file-picker').setInputFiles({ name: 'big scan.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(60 * 1024 * 1024, 1) })
      await sleep(6000)
      const big = (await page.locator('.files-status, .upload-note, .problem').allInnerTexts()).join(' ').replace(/\s+/g, ' ')
      await page.screenshot({ path: path.join(h.SHOTS, `${run.label}-I-too-big.png`) })
      return `weird name: "${weird.slice(0, 200)}"; 60 MB: "${big.slice(0, 200)}"`
    })
    await step(run, 'I', 'a moment offline', 60, async () => {
      await home()
      await run.ctx.setOffline(true)
      await sleep(5000)
      const off = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      await page.screenshot({ path: path.join(h.SHOTS, `${run.label}-I-offline.png`) })
      await run.ctx.setOffline(false)
      await sleep(8000)
      const back = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      return `offline: ${/connection/i.test(off) ? off.match(/[^.]*connection[^.]*\./i)?.[0] : 'NOTHING SAID'}; back: ${/connection/i.test(back) ? 'still says lost' : 'recovered'}`
    })
    await step(run, 'I', 'a passkey this machine does not know', 30, async () => {
      const o = await newPerson('stranger')
      await o.page.goto(`${ORIGIN}/`)
      await o.page.getByRole('button', { name: 'Sign in with your passkey' }).click()
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
}

export const listShots = (dir) => readdirSync(dir)
