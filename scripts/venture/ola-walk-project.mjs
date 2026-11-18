// Walk the project page on app.ola.cx as a person on a phone (iPhone 14), screenshots as it goes:
// sign in, the list of projects, a project (it opens on its conversation), the three tabs, the
// Menu, the Lots of permissions switch (and that it is remembered), then one real request. A
// "this may be a stretch" card is answered "Not now" (Ola does it), a question from Ola with its
// first choice.
//   OLA_WALK_PASSWORD_FILE=<file> node scripts/venture/ola-walk-project.mjs <out dir> <name> "<project words>" "<request>" [--minutes 12] [--base https://app.ola.cx]
// The password comes from a file, never the command line. Exit 0 only if every line passes.
import fs from 'node:fs'
import { webkit, devices } from 'playwright'

const a = process.argv.slice(2)
const [out, name, projectWords, request] = a
const opt = (k) => { const i = a.indexOf(k); return i > 0 ? a[i + 1] : null }
const minutes = Number(opt('--minutes') ?? 12)
const base = opt('--base') ?? 'https://app.ola.cx'
const pw = fs.readFileSync(process.env.OLA_WALK_PASSWORD_FILE, 'utf8').trim()
fs.mkdirSync(out, { recursive: true })

// Safari's engine, as on his phone.
const b = await webkit.launch()
const ctx = await b.newContext({ ...devices['iPhone 14'] })
const p = await ctx.newPage()
let n = 0
let failed = 0
const shot = async (label) => { await p.waitForTimeout(700); await p.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${label}.png` }) }
const say = (ok, what, note = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${note ? `  (${note})` : ''}`) }
const text = async (sel = 'body') => (await p.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim()

try {
  await p.goto(`${base}/`)
  await p.waitForSelector('input[type=password]', { timeout: 30_000 })
  await shot('sign-in')
  await p.locator('input').first().fill(name)
  await p.locator('input[type=password]').fill(pw)
  await p.getByRole('button', { name: /sign in/i }).click()
  await p.waitForSelector('.project-title, .projects, h1', { timeout: 30_000 })
  await p.waitForTimeout(2500)
  await shot('after-sign-in')

  // The list of projects, always there.
  await p.goto(`${base}/#/projects`)
  await p.waitForTimeout(2500)
  await shot('projects')
  const list = await text()
  say(new RegExp(projectWords, 'i').test(list), 'the projects list names the project', list.slice(0, 120))
  await p.getByRole('link').or(p.getByRole('button')).filter({ hasText: new RegExp(projectWords, 'i') }).first().click()
  await p.waitForSelector('.drawer.open #ask-input', { timeout: 30_000 })
  await shot('project')
  say(/project/i.test(await text('.project-kicker')), 'the word Project over its name', `${await text('.project-kicker')} / ${await text('h1')}`)
  say((await p.getByRole('link', { name: 'Your projects' }).count()) > 0, 'a way back to Your projects')
  const tabs = await p.getByRole('tab').allInnerTexts()
  // Sources is a tab only once Ola has downloaded something into this project.
  say(tabs.length >= 2 && /^Conversation/.test(tabs[0]) && /^Made by Ola/.test(tabs[1]) && (await p.getByRole('tab', { name: 'Conversation' }).getAttribute('aria-selected')) === 'true', 'the tabs, opened on the conversation', tabs.join(' | ').replace(/\s+/g, ' '))
  const input = await p.locator('#ask-input').boundingBox()
  say(input && input.y + input.height <= 844, 'the place to type is on the screen', input ? `ends at ${Math.round(input.y + input.height)} of 844` : 'not found')
  const wide = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  say(wide <= 0, 'no sideways scroll', `${wide} px`)

  // Lots of permissions: one switch, and it is remembered.
  const sw = p.getByRole('switch', { name: 'Lots of permissions' })
  const was = await sw.isChecked()
  await p.locator('label.lots-toggle').click()
  say((await sw.isChecked()) === !was, 'the Lots of permissions switch flips', `${was ? 'On' : 'Off'} to ${was ? 'Off' : 'On'}: ${await text('.autonomy-hint')}`)
  await shot('switch-flipped')
  await p.reload()
  await p.waitForSelector('.drawer.open #ask-input', { timeout: 30_000 })
  await p.getByRole('button', { name: 'New conversation' }).click({ timeout: 2000 }).catch(() => {})
  say((await sw.isChecked()) === !was, 'the choice is still there after the page is opened again')
  if ((await sw.isChecked()) !== true) await p.locator('label.lots-toggle').click()
  say(await sw.isChecked(), 'left on: Lots of permissions', await text('.autonomy-hint'))

  // The other tabs and the Menu.
  await p.getByRole('tab', { name: /Made by Ola/ }).click()
  await p.waitForTimeout(1200)
  await shot('made')
  if (await p.getByRole('tab', { name: /Sources/ }).count()) {
    await p.getByRole('tab', { name: /Sources/ }).click()
    await p.waitForTimeout(1200)
    await shot('sources')
  }
  await p.getByRole('button', { name: 'Menu' }).click()
  await p.locator('dialog.menu-sheet[open]').waitFor({ timeout: 5000 })
  const items = (await p.locator('dialog.menu-sheet[open] .menu-name').allInnerTexts()).join(', ')
  say(/Settings/.test(items) && /Your projects/.test(items) && /Sign out/.test(items), 'one Menu with every other place', items)
  await shot('menu')
  await p.keyboard.press('Escape')
  await p.locator('dialog.menu-sheet[open]').waitFor({ state: 'detached', timeout: 3000 }).catch(async () => { await p.locator('dialog.menu-sheet[open] button').first().click().catch(() => {}) })
  await p.getByRole('tab', { name: /Conversation/ }).click()

  if (request) {
    await p.getByRole('button', { name: 'New conversation' }).click({ timeout: 2000 }).catch(() => {})
    await p.fill('#ask-input', request)
    await shot('typed')
    await p.press('#ask-input', 'Enter')
    const t0 = Date.now()
    let card = false
    let asked = 0
    let approvals = 0
    let status = null
    while (Date.now() - t0 < minutes * 60_000) {
      await p.waitForTimeout(4000)
      if (await p.locator('.stretch-card').isVisible().catch(() => false)) {
        card = true
        await p.locator('.stretch-card').scrollIntoViewIfNeeded()
        await shot('confidence-card')
        console.log(`      card: ${await text('.stretch-card')}`.slice(0, 400))
        await p.locator('.stretch-card').getByRole('button', { name: /Not now|OK/ }).first().click()
        continue
      }
      const q = p.locator('.question-card')
      if (await q.isVisible().catch(() => false)) {
        asked++
        await q.scrollIntoViewIfNeeded()
        await shot(`question-${asked}`)
        console.log(`      question: ${await text('.question-card')}`.slice(0, 300))
        await q.locator('button').first().click()
        await p.waitForTimeout(1500)
        continue
      }
      if (await p.locator('dialog.approval[open]').count()) {
        approvals++
        await shot(`approval-${approvals}`)
        console.log(`      approval: ${await text('dialog.approval[open]')}`.slice(0, 300))
        await p.locator('dialog.approval[open] button').first().click()
        continue
      }
      status = await p.locator('.drawer .turn').last().getAttribute('data-status').catch(() => null)
      if (status && ['done', 'failed', 'stopped'].includes(status)) break
    }
    await shot('end')
    const answer = await text('.drawer .turn:last-child .answer')
    say(status === 'done', 'the request ran to the end', `${status}, ${Math.round((Date.now() - t0) / 1000)} s; ${answer.slice(0, 200)}`)
    say(approvals === 0, 'no approval question under Lots of permissions', `${approvals} asked`)
    console.log(`      confidence card shown: ${card}; questions from Ola answered: ${asked}`)
    const made = p.locator('.made-pages a, .drawer .turn:last-child a').first()
    if (await made.count()) console.log(`      opens: ${(await made.innerText()).replace(/\s+/g, ' ')}`)
    await p.getByRole('tab', { name: /Made by Ola/ }).click()
    await p.waitForTimeout(1500)
    await shot('made-after')
  }
} catch (e) {
  say(false, 'the walk stopped', String(e?.message ?? e).split('\n')[0])
  await shot('stopped').catch(() => {})
} finally {
  await b.close()
}
console.log(failed ? `FAILED (${failed})` : 'ALL PASSED')
process.exit(failed ? 1 : 0)
