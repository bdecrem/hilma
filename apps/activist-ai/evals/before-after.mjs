#!/usr/bin/env node
// NOTE (OLA-504, Nov 27): the 'with' half measured OLA-479's nudge and hand-off, removed from the page after this measurement; ESCALATIONS, NUDGE, FINISH and ESCALATE.to are no longer in steps.ts, so only the 'without' half still runs as written.
// Before and after (OLA-480; Bart, voice call Nov 26: "10 tasks ... without this new stuff, and then
// with this new stuff ... what it produced ... how long it took ... make them progressively more
// demanding"). The new stuff: Ola's model can run its own tests (OLA-474), and Ola makes a test run
// for a request that computes and hands it to a bigger model after failed tests, loops or cut-off
// replies (OLA-479).
//
// Ten requests, easy to hard, typed into the real website the way a person uses it: headless Chromium
// on a phone-size screen, signed in as the made-up account of evals/asks, a new conversation in its
// cloud project, the request typed and sent, every card answered yes (a permission sheet "once", a
// question card its yes or first option), three times each. Half of OLA-479 lives in the page itself
// (web/src/lib/ola.ts: the one "test it" nudge Ola sends on its own, the hand-off to the hosted model),
// so only the page measures it; the server's routes never nudge and never hand off. A run is finished
// when the page is quiet: the last turn ended, no card up, and nothing new for 10 s (the nudge and the
// hosted turn follow within a second of the turn before), all inside the 20-minute cut. Ola ending on a
// question gets "Yes, go ahead." typed in the box, twice at most.
//
// The arms: `without` changes nothing in the project. `with` turns the owner's switch for the hosted
// model on for the project (Settings; with it on, what OLA-479 counted goes over without a card, ola.ts
// planFor), and set back as it was when the arm ends. A stretch card that still comes up for what
// OLA-479 counted gets "Just this once"; one for any older reason (an error, a big request) gets "Not
// now" in both arms, so the hosted model only takes what OLA-479 hands it.
//
// Recorded per run, from the conversation (opencode's messages, read on the website's own route) and
// the page, not guessed: `tested` (a step whose command runs ola-test or a test runner, the page's own
// ESCALATE.test, or a "Tested …" step on the page), `nudged` (Ola's own "test it" turn, NUDGE in
// web/src/lib/steps.ts), `escalated` (a request marked HANDOFF_MARK or a reply by the hosted model),
// `handoffWhy` (the sentence shown on the hand-off), `finishedBy` (ola | hosted | claude: who wrote the
// last reply). After each run the project's files are copied out and judged by the checks that already
// exist for that request (evals/apps checks use the page like a person; evals/bigmodels scores the
// website, the data question and the bug). One line per run in ~/ola-before-after/results.jsonl.
//
//   node evals/before-after.mjs --arm without        before the two changes reach the machine
//   node evals/before-after.mjs --arm with           after
//   node evals/before-after.mjs --table              the two side by side
//   options: --only id,id   --tries 3   (an arm that was stopped carries on where it stopped)
//            --force tests|loop|length|untested   for checking this script only: opens the page with
//            ?escalate=<reason> (ola.ts treats every run as if Ola had counted that), so a hand-off is
//            seen without waiting for a real one. Never for a measured arm.
//
// Run it on the machine whose Ola it measures (it needs the server's admin command and the project's
// computer, as the asks do), from a checkout with playwright in reach (web/node_modules), under nohup:
//   nohup node evals/before-after.mjs --arm without > ~/ola-before-after/without.log 2>&1 &
// OLA_BA_HOME moves the results folder. On the Mac Studio it refuses to start a run unless Ola's own
// model is the one loaded (ops/studio/big-model.sh status), and its browser reaches app.ola.cx through
// the asks' local front (localFrontProxy). A run is cut at 20 minutes; a run that breaks is recorded as
// broken and the next one starts. It shares the asks' made-up account, so it takes the asks' run lock
// (waits while an asks run goes) and the machine's turn for each run.
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import path from 'node:path'
import { AI, emptyProject, inProject, liveRelease, localFrontProxy, modelUsedUp, ORIGIN, PROJECT, prepareAccount, say, signIn, signOutAccount, stopProject, takeDownSites, takeRunLock, timedFetch, WHO, cloudTransport } from './asks/lib.mjs'

const HERE = path.join(AI, 'evals')
const OUT = process.env.OLA_BA_HOME || path.join(homedir(), 'ola-before-after')
const RESULTS = path.join(OUT, 'results.jsonl')
const RUN_MIN = 20
// 30 s, not 10 (OLA-515): the page presses a handed-over page for up to 20 s before its one follow-up turn starts.
const QUIET_MS = 30_000

// The ten, easy to hard. "shows" only shows things (the control: the new stuff must not slow them);
// "computes" is what the new stuff is for. The words are the existing lists', not copied here.
const REQUESTS = [
  { id: 'website', from: 'big', kind: 'shows' },
  { id: 'countdown', from: 'apps', kind: 'shows' },
  { id: 'tip-split', from: 'apps', kind: 'computes' },
  { id: 'unit-converter', from: 'apps', kind: 'computes' },
  { id: 'todo-due', from: 'apps', kind: 'computes' },
  { id: 'signup-sheet', from: 'apps', kind: 'computes' },
  { id: 'memory-game', from: 'apps', kind: 'computes' },
  { id: 'data', from: 'big', kind: 'computes' },
  { id: 'debug', from: 'big', kind: 'computes' },
  { id: 'spreadsheet', from: 'apps', kind: 'computes' },
]
const APPS = JSON.parse(readFileSync(path.join(HERE, 'apps/problems.json'), 'utf8'))
const BIG = JSON.parse(readFileSync(path.join(HERE, 'bigmodels/tasks.json'), 'utf8'))
for (const r of REQUESTS) {
  const src = (r.from === 'apps' ? APPS : BIG).find((p) => p.id === r.id)
  r.say = src.request
  r.files = src.files ? path.join(HERE, 'bigmodels/files', src.files) : null
}

// The page's own marks and patterns (OLA-474, OLA-479), from this checkout's web/src/lib/steps.ts:
// fixed strings, so they read a conversation of the older release too (where none of them occur).
const STEPS = await import(path.join(AI, 'web/src/lib/steps.ts'))
const { stripEngines } = await import(path.join(AI, 'web/src/lib/conversation.ts'))
const { ESCALATE, ESCALATIONS, NUDGE, FINISH, HANDOFF_MARK, STRETCH_WHY, commandParts } = STEPS
const runsTest = (command) => commandParts(String(command ?? '')).some((p) => (STEPS.TEST_COMMAND ?? ESCALATE.test).test(p))

const args = process.argv.slice(2)
const arg = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d)
const rows = () => (existsSync(RESULTS) ? readFileSync(RESULTS, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])

if (args.includes('--table')) table(), process.exit(0)
const ARM = arg('--arm', null)
if (!ARM) console.error('--arm without|with, or --table'), process.exit(2)
const TRIES = Number(arg('--tries', 3))
const ONLY = arg('--only', null)?.split(',')
const FORCE = arg('--force', null)
if (FORCE && !ESCALATIONS.includes(FORCE)) console.error(`--force takes one of ${ESCALATIONS.join(', ')}`), process.exit(2)
const todo = REQUESTS.filter((r) => !ONLY || ONLY.includes(r.id))
if (ONLY && todo.length !== ONLY.length) console.error(`unknown request in --only (${REQUESTS.map((r) => r.id).join(', ')})`), process.exit(2)
mkdirSync(OUT, { recursive: true })

// Playwright: the web app's own (web/node_modules, as on the test server's release), else hilma's.
const { chromium } = (() => {
  for (const from of [path.join(AI, 'web/package.json'), path.join(AI, 'package.json'), path.join(AI, '../../package.json')]) {
    try {
      return createRequire(from)('playwright')
    } catch {}
  }
  throw new Error('no playwright in reach (web/node_modules, apps/activist-ai or hilma)')
})()

/** On the Studio (it has Ola's model as a service): Ola's own model, and no big one, or no run. */
function modelProblem() {
  if (!existsSync(path.join(homedir(), 'Library/LaunchAgents/cx.ola.model.plist'))) return null
  const r = spawnSync('/bin/zsh', [path.join(AI, 'ops/studio/big-model.sh'), 'status'], { encoding: 'utf8' })
  const out = `${r.stdout}${r.stderr}`
  return /no big model is running/.test(out) && /Ola's own model: loaded/.test(out) ? null : `the Studio is not on Ola's own model: ${out.trim().replace(/\s+/g, ' ')}`
}

// One asks-style run at a time on the made-up account: wait for the asks' lock.
while (!(await takeRunLock({ after: false }))) await new Promise((r) => setTimeout(r, 60_000))
const TURN = await import(path.join(AI, 'ops/turn.mjs'))
let signedIn = null
let password = null
let stopping = false
let browser = null // one headless Chromium at a time, closed after each run
let restore = null // the `with` arm's switches as they were
const closeBrowser = async () => {
  const b = browser
  browser = null
  await b?.close().catch(() => {})
}
const finish = async (code) => {
  stopping = true
  await closeBrowser()
  if (restore) {
    try {
      say(`switches set back: ${await restore()}`)
    } catch (e) {
      say(`setting the switches back FAILED: ${e.message}`)
    }
  }
  if (password) {
    try {
      await takeDownSites()
      say(`cleanup: ${await signOutAccount()}`)
    } catch (e) {
      say(`cleanup FAILED: ${e.message}`)
    }
  }
  process.exit(code)
}
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => (say(`${s}: stopping; the next start of this arm carries on`), finish(3)))

// A forced run (a check of this script) is not a measured run: it never stands in for one.
const done = new Set(rows().filter((r) => r.arm === ARM && Boolean(r.forced) === Boolean(FORCE)).map((r) => `${r.id}#${r.try}`))
say(`before-after: arm ${ARM}, ${todo.length} requests x ${TRIES}, ${done.size} already done, against ${liveRelease()}, through the website${FORCE ? ` (forced hand-off: ?escalate=${FORCE}, a check of this script)` : ''}`)
password = await prepareAccount()
signedIn = await signIn(password)
if (ARM === 'with') await handOverWithoutAsking()
// Round by round, so an arm cut short still has every request.
for (let t = 1; t <= TRIES; t++) {
  for (const r of todo) {
    if (stopping) break
    if (done.has(`${r.id}#${t}`)) continue
    const bad = modelProblem()
    if (bad) say(`STOP: ${bad}. Start this arm again once Ola's own model is back; it carries on.`), await finish(4)
    const held = await TURN.acquire({ label: `before-after ${ARM}`, on: (m) => say(`turn: ${m}`) })
    let row
    try {
      row = await Promise.race([one(r, t), new Promise((_, no) => setTimeout(() => no(new Error(`no end after ${RUN_MIN + 5} min`)), (RUN_MIN + 5) * 60_000))])
    } catch (e) {
      await closeBrowser()
      if (e.usedUp) held.release(), say(`STOP: ${e.usedUp}; not counted. Start this arm again after that; it carries on.`), await finish(5)
      row = { broken: String(e.message).split('\n')[0].slice(0, 300) }
      signedIn = null // sign in again before the next run, in case that was the fault
    }
    held.release()
    row = { at: new Date().toISOString(), arm: ARM, id: r.id, kind: r.kind, try: t, release: liveRelease(), ...(FORCE ? { forced: FORCE } : {}), ...row }
    appendFileSync(RESULTS, JSON.stringify(row) + '\n')
    say(`${row.broken ? 'BROKEN' : row.works ? 'works ' : 'fails '} ${r.id} #${t}: ${row.broken ?? `${row.secs} s, ${row.steps} steps, test ${row.tested ? 'ran' : 'did not run'}, ${row.nudged ? 'nudged' : 'no nudge'}, ${row.escalated ? `handed over${row.handoffWhy ? ` (${row.handoffWhy})` : ''}` : 'not handed over'}, finished by ${row.finishedBy}, ${row.score}`}`)
    try {
      await takeDownSites()
    } catch {}
  }
}
await stopProject().catch(() => {})
say(`before-after: arm ${ARM} done. node evals/before-after.mjs --table`)
await finish(0)

/** The website's own routes as the signed-in owner (what Settings and the stretch card send). */
async function desk(method, p, body) {
  signedIn ??= await signIn(password)
  const res = await timedFetch(ORIGIN + p, {
    method,
    headers: { cookie: signedIn.cookie, origin: ORIGIN, 'x-ola-workspace': PROJECT, 'x-ola-csrf': signedIn.csrf, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (res.status >= 300) throw new Error(`${method} ${p}: ${res.status} ${text.slice(0, 160)}`)
  return text ? JSON.parse(text) : null
}

/** The `with` arm: the hosted model on for the project and "hand it over without asking", set back at the end. */
async function handOverWithoutAsking() {
  const f = await desk('GET', '/api/fallback')
  const h = f?.hosted
  if (!h?.configured) say(`NOTE: this machine has no hosted model set up (${h?.unavailable ?? 'no answer'}): nothing can be handed over in this arm`)
  else if (h.model !== ESCALATE.to) say(`NOTE: the hosted model here is ${h.model}, not ${ESCALATE.to}: the page hands nothing over to it (ola.ts planFor)`)
  if (!f?.canChange) return say(`NOTE: ${WHO} cannot change the project's switches; a hand-off comes as a card and gets "Just this once"`)
  // Only the switch: what OLA-479 counted goes over without a card once it is on (ola.ts planFor). The
  // older "when a request looks like a stretch" setting stays as it is (were it "hand over", an error or
  // a big request would go to the hosted model too, which is not what this compares); only "never" is
  // lifted, as it would stop the hand-off. Its cards get "Not now" in both arms (see one()).
  const was = { enabled: !!h?.enabled, stretch: f.stretch, stretchTo: f.stretchTo }
  if (h?.configured && !h.enabled) await desk('POST', '/api/hosted/settings', { enabled: true, consent: true })
  if (f.stretch === 'never') await desk('POST', '/api/fallback/settings', { stretch: 'suggest', stretchTo: f.stretchTo })
  say(`with: the hosted model ${h?.enabled ? 'was already on' : 'turned on'} for ${PROJECT}, so Ola hands over without asking (were: hosted ${was.enabled ? 'on' : 'off'}, stretch ${was.stretch})`)
  restore = async () => {
    signedIn = null // the run's own sign-in may be gone
    if (was.stretch === 'never') await desk('POST', '/api/fallback/settings', { stretch: was.stretch, stretchTo: was.stretchTo })
    if (h?.configured && !was.enabled) await desk('POST', '/api/hosted/settings', { enabled: false })
    return `hosted ${was.enabled ? 'on' : 'off'}, stretch ${was.stretch}`
  }
}

async function one(r, t) {
  signedIn ??= await signIn(password)
  const T = cloudTransport(signedIn)
  await emptyProject()
  if (r.files) for (const f of ['members.csv', 'formula.mjs', 'SPEC.md'].filter((f) => existsSync(path.join(r.files, f)))) await T.wrote(f, { text: readFileSync(path.join(r.files, f), 'utf8') })
  const dir = path.join(OUT, ARM, `${r.id}-${t}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(path.join(dir, 'files'), { recursive: true })
  const end = Date.now() + RUN_MIN * 60_000

  const proxy = localFrontProxy()
  browser = await chromium.launch({ headless: true, ...(proxy ? { proxy: { server: proxy } } : {}) })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const shot = (name) => page.screenshot({ path: path.join(dir, `${name}.png`) }).catch(() => {})
  const answered = []
  const stepWords = new Set()
  let page0
  let t0
  let quietSince = null
  let status = null
  try {
    // Signed in the way the sign-in screen does it (the same route), then the project's address.
    const si = await ctx.request.post(`${ORIGIN}/api/auth/password`, { headers: { origin: ORIGIN }, data: { handle: WHO, password } })
    if (si.status() !== 200) throw new Error(`sign-in on the page: ${si.status()} ${(await si.text()).slice(0, 160)}`)
    await page.goto(`${ORIGIN}/?w=${PROJECT}${FORCE ? `&escalate=${FORCE}` : ''}`)
    await page.waitForSelector('.project-title', { timeout: 90_000 })
    // A phone opens on the conversation; if not, its tab or the ask bar first (as web/bart-test.mjs).
    if (!(await page.locator('#ask-input:visible').count())) {
      await page.waitForTimeout(1500)
      const tab = page.getByRole('tab', { name: /Conversation/ })
      if (await page.locator('#ask-input:visible').count()) {
      } else if (await tab.isVisible().catch(() => false)) await tab.click()
      else await page.locator('.askbar-open').click({ timeout: 5000 }).catch(() => {})
    }
    await until(async () => !(await page.getByText('Opening your project').count()) && !(await page.getByText('Lost the connection').count()), 240_000, 'the project to open')
    if (!(await page.locator('#ask-input:visible').count())) await page.locator('.askbar-open, .askbar input, .askbar textarea').first().click({ timeout: 5000 }).catch(() => {})
    await page.locator('#ask-input:visible').waitFor({ timeout: 30_000 })
    if (await page.locator('.turn').count()) throw new Error('the page opened on an earlier conversation, not a new one')
    page0 = Date.now()

    const send = async (text) => {
      const before = await page.locator('.turn').count()
      await page.locator('#ask-input').fill(text)
      await page.locator('.composer button[type="submit"]').click()
      await until(async () => (await page.locator('.turn').count()) > before, 30_000, 'the request in the conversation')
      quietSince = null
    }
    t0 = Date.now()
    await send(r.say)
    await shot('sent')

    let yeses = 0
    let lastShot = Date.now()
    for (;;) {
      if (Date.now() > end) break
      for (const w of await page.locator('.step-words').allInnerTexts().catch(() => [])) stepWords.add(w.replace(/\s+/g, ' ').trim())
      // A permission sheet: "once" (Lots of permissions is on, so these are rare).
      const dlg = page.locator('dialog.approval[open]')
      if (await dlg.count()) {
        const title = (await dlg.locator('.sheet-title').innerText().catch(() => '')).replace(/\s+/g, ' ')
        const names = await dlg.getByRole('button').allInnerTexts()
        const pick = names.find((b) => /once/i.test(b)) ?? names.find((b) => /^(yes|allow|ok)/i.test(b)) ?? names[0]
        answered.push(`${secsFrom(t0)} s: sheet "${title}" → ${pick}`)
        await dlg.getByRole('button', { name: pick, exact: true }).first().click()
        await until(async () => !(await page.locator('dialog.approval[open]').count()), 15_000, 'the sheet closing').catch(() => {})
        quietSince = null
        continue
      }
      // The stretch card. For what OLA-479 counted, `with` should not see it (the switch is on); if it
      // comes, "Just this once". Any other reason (an error, a big request: older logic, in both
      // releases) gets "Not now" in both arms, so the hosted model only ever takes what OLA-479 sends.
      const card = page.locator('.stretch-card')
      if (await card.count()) {
        const title = (await card.locator('.stretch-title').innerText().catch(() => '')).replace(/\s+/g, ' ')
        const why = (await card.locator('.stretch-why').innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
        const counted = ESCALATIONS.some((k) => why.startsWith(STRETCH_WHY[k]))
        const want = ARM === 'with' && counted ? 'Just this once' : 'Not now'
        const b = card.getByRole('button', { name: want, exact: true })
        const pick = (await b.count()) ? want : 'OK'
        await shot('stretch-card')
        answered.push(`${secsFrom(t0)} s: stretch card "${title}" → ${pick}`)
        await card.getByRole('button', { name: pick, exact: true }).first().click()
        await until(async () => !(await page.locator('.stretch-card').count()), 30_000, 'the stretch card closing').catch(() => {})
        quietSince = null
        continue
      }
      // A question card: its yes, else the first option; a question with no options gets the words.
      const q = page.locator('.question-card').last()
      if ((await q.count()) && (await q.getAttribute('aria-busy').catch(() => null)) !== 'true') {
        const text = (await q.innerText()).replace(/\s+/g, ' ')
        const said = []
        const fields = q.locator('.question-field')
        for (let i = 0; i < Math.max(1, await fields.count()); i++) {
          const f = (await fields.count()) ? fields.nth(i) : q
          const options = await f.locator('.question-option-label').allInnerTexts()
          const pick = options.find((o) => /^(yes|publish|go ahead|ok|okay|sure|do it|allow|continue|confirm)/i.test(o)) ?? options[0]
          if (pick) {
            await f.locator('.question-option').filter({ hasText: pick }).first().click()
            said.push(pick)
          } else {
            await f.locator('.question-own input, .question-own textarea').first().fill('Yes, go ahead.')
            await f.locator('.question-own').getByRole('button', { name: 'Answer' }).click().catch(() => {})
            said.push('typed: Yes, go ahead.')
          }
          await page.waitForTimeout(500)
        }
        const go = q.locator('.question-actions .primary-button')
        if ((await q.count()) && (await go.count()) && (await go.isEnabled().catch(() => false))) await go.click().catch(() => {})
        answered.push(`${secsFrom(t0)} s: question card "${text.slice(0, 200)}" → ${said.join('; ')}`)
        await page.waitForTimeout(2500)
        quietSince = null
        continue
      }
      const st = await page.locator('.turn').last().getAttribute('data-status').catch(() => null)
      const busy = !st || st === 'working' || st === 'sending' || (await page.locator('.drawer-mark.working').count())
      if (busy) quietSince = null
      else if (quietSince === null) quietSince = Date.now()
      else if (Date.now() - quietSince >= QUIET_MS) {
        // Quiet: Ola is done, unless it ended on a question in words: "Yes, go ahead." (twice at most).
        const reply = await page.locator('.turn').last().locator('.said-ola').innerText().catch(() => '')
        if (st === 'done' && yeses < 2 && endsOnQuestion(reply)) {
          yeses++
          answered.push(`${secsFrom(t0)} s: Ola asked in words → typed "Yes, go ahead."`)
          await send('Yes, go ahead.')
          continue
        }
        status = st
        break
      }
      if (Date.now() - lastShot > 120_000) (lastShot = Date.now()), await shot('working')
      await page.waitForTimeout(1000)
    }
    // The quiet wait is not Ola's time.
    const secs = status ? Math.round((quietSince - t0) / 1000) : Math.round((Date.now() - t0) / 1000)
    if (!status) {
      // Cut: the page's Stop, then the run itself is told to stop.
      await page.getByRole('button', { name: /Stop/ }).first().click({ timeout: 5000 }).catch(() => {})
      status = 'timeout'
    }
    await shot('finished')
    const pageText = (await page.locator('.turns').innerText().catch(() => '')).trim()
    const lastSaid = page.locator('.turn').last().locator('.said-ola')
    const lastBy = (await lastSaid.getAttribute('class').catch(() => '')) ?? ''
    const handoffShown = await page.locator('.handoff').allInnerTexts().catch(() => [])
    const pageError = (await page.locator('.turn').last().locator('.problem').innerText().catch(() => '')).trim()
    const sid = await page.evaluate((k) => sessionStorage.getItem(k), `ola.open.${PROJECT}`).catch(() => null)
    await closeBrowser()

    // What happened, from the conversation itself (opencode's messages, the website's own route).
    const conv = await conversationOf(T, sid, page0)
    if (status === 'timeout' && conv.id) await T.call('POST', `/api/session/${conv.id}/interrupt`, {}).catch(() => {})
    const lastTurn = conv.turns.at(-1)
    if (status === 'failed') {
      const usedUp = modelUsedUp({ why: `${lastTurn?.error ?? ''} ${pageError}` })
      if (usedUp) throw Object.assign(new Error(usedUp), { usedUp })
    }
    const steps = conv.turns.flatMap((x) => x.tools)
    const handoffWhy = handoffShown[0] ?? conv.turns.find((x) => x.handoff)?.handoff ?? null
    const escalated = conv.turns.some((x) => x.handoff || x.by === 'hosted') || handoffShown.length > 0

    // What it produced, kept, and judged by the request's own check.
    const tar = await inProject("cd /work && tar -cf - --exclude ./.ola --exclude './project.db*' --exclude node_modules . | base64")
    const x = spawnSync('/usr/bin/tar', ['-xf', '-', '-C', path.join(dir, 'files')], { input: Buffer.from(tar.replace(/\s+/g, ''), 'base64') })
    if (x.status !== 0) throw new Error(`copying the project's files out: ${String(x.stderr).slice(0, 200)}`)
    writeFileSync(path.join(dir, 'conversation.json'), JSON.stringify({ request: r.say, conversation: conv.id, answered, steps: [...stepWords], turns: conv.turns, page: pageText.slice(0, 20000) }, null, 2))
    const s = score(r, path.join(dir, 'files'))
    return {
      secs,
      end: status === 'timeout' ? `cut at ${RUN_MIN} min` : `${status}${pageError ? `: ${pageError.slice(0, 200)}` : ''}`,
      steps: steps.length,
      tested: steps.some((s) => runsTest(s.input)) || [...stepWords].some((w) => /^Tested\b/.test(w)),
      nudged: conv.turns.some((x) => x.nudge === 'test'),
      escalated,
      handoffWhy: handoffWhy ? reasonOf(handoffWhy) : null,
      finishedBy: /said-claude/.test(lastBy) ? 'claude' : /said-hosted/.test(lastBy) || lastTurn?.by === 'hosted' ? 'hosted' : 'ola',
      turns: conv.turns.length,
      answered: answered.length,
      works: status === 'done' && s.works,
      score: s.line,
      answer: (conv.turns.findLast((x) => x.texts.length)?.texts.at(-1) ?? '').slice(0, 400),
      dir,
    }
  } catch (e) {
    await shot('error')
    throw e
  } finally {
    await closeBrowser()
  }
}

/** The page's conversation (its id from the tab, else the newest one started after the page opened), folded. */
async function conversationOf(T, sid, since) {
  if (!sid) {
    const r = await T.call('GET', '/api/session')
    const all = Array.isArray(r.json) ? r.json : (r.json?.data ?? [])
    sid = all.filter((s) => (s.time?.created ?? 0) >= since - 60_000).sort((a, b) => (b.time?.created ?? 0) - (a.time?.created ?? 0))[0]?.id ?? null
  }
  if (!sid) throw new Error('could not find the conversation the page started')
  const r = await T.call('GET', `/api/session/${sid}/message?limit=200`)
  if (r.status >= 300) throw new Error(`reading the conversation: ${r.status} ${r.text.slice(0, 160)}`)
  const messages = Array.isArray(r.json) ? r.json : (r.json?.data ?? [])
  const turns = []
  for (const m of [...messages].sort((a, b) => (a.time?.created ?? 0) - (b.time?.created ?? 0))) {
    if (m.type === 'user') {
      const text = stripEngines(String(m.text ?? ''))
      const handoff = text.startsWith(HANDOFF_MARK) ? text.slice(HANDOFF_MARK.length).split('\n')[0] : null
      const nudge = handoff ? 'handoff' : text.startsWith(NUDGE) ? 'test' : text.startsWith(FINISH) ? 'finish' : null
      turns.push({ request: handoff ? `(hand-off) ${handoff}` : nudge ? `(Ola: ${nudge})` : text, nudge, handoff, by: 'ola', texts: [], tools: [], status: 'working' })
      continue
    }
    const t = turns.at(-1)
    if (!t) continue
    if (m.type === 'assistant') {
      if (m.model?.id === 'hosted') t.by = 'hosted'
      for (const part of m.content ?? []) {
        if (part.type === 'text' && String(part.text ?? '').trim()) t.texts.push(String(part.text))
        if (part.type === 'tool') t.tools.push({ name: part.name, input: part.state?.input?.command ?? JSON.stringify(part.state?.input ?? {}).slice(0, 300), status: part.state?.status })
      }
      if (m.error) t.error = JSON.stringify(m.error).slice(0, 300)
    }
    if (m.type === 'idle') t.status = m.outcome === 'succeeded' ? 'done' : m.outcome === 'interrupted' ? 'stopped' : 'failed'
  }
  return { id: sid, turns }
}

/** The reason a hand-off sentence names (STRETCH_WHY), else the sentence. */
function reasonOf(sentence) {
  return Object.entries(STRETCH_WHY).find(([, w]) => sentence.startsWith(w))?.[0] ?? sentence.slice(0, 160)
}

const secsFrom = (t0) => Math.round((Date.now() - t0) / 1000)
async function until(fn, ms, what) {
  const stop = Date.now() + ms
  for (;;) {
    try {
      if (await fn()) return
    } catch {}
    if (Date.now() > stop) throw new Error(`waited ${Math.round(ms / 1000)} s for ${what}`)
    await new Promise((r) => setTimeout(r, 400))
  }
}

function score(r, folder) {
  const node = (argv) => spawnSync(process.execPath, argv, { cwd: AI, encoding: 'utf8', timeout: 300_000, maxBuffer: 64 << 20 })
  if (r.from === 'apps') {
    const o = node([path.join(HERE, 'apps/run.mjs'), 'check', r.id, folder])
    try {
      const j = JSON.parse(o.stdout)
      const failed = j.checks.filter((c) => !c.pass).map((c) => c.name)
      return { works: !failed.length, line: `${j.checks.length - failed.length}/${j.checks.length}${failed.length ? ` (not: ${failed.join(', ')})` : ''}` }
    } catch {
      return { works: false, line: `the check did not run: ${(o.stderr || o.stdout || '').trim().slice(-200)}` }
    }
  }
  const o = node([path.join(HERE, 'bigmodels/run.mjs'), '--score', r.id, '--folder', folder])
  const m = new RegExp(`^${r.id}: (\\d+)/(\\d+) (\\[.*?\\]) \\[`, 'm').exec(o.stdout)
  if (!m) return { works: false, line: `the scorer did not run: ${(o.stderr || o.stdout || '').trim().slice(-200)}` }
  const failed = JSON.parse(m[3])
  return { works: m[1] === m[2], line: `${m[1]}/${m[2]}${failed.length ? ` (not: ${failed.join(', ')})` : ''}` }
}

function endsOnQuestion(t) {
  return /\?\s*\**\s*$/.test(t.trim()) || /\b(shall i|should i|do you want me to|would you like me to|want me to|ready to publish)\b/i.test(t.slice(-300))
}

function table() {
  // Runs with a forced hand-off were checks of this script, not measurements.
  const all = rows().filter((r) => !r.forced)
  const arms = ['without', 'with', ...new Set(all.map((r) => r.arm).filter((a) => a !== 'without' && a !== 'with'))].filter((a) => all.some((r) => r.arm === a))
  if (!arms.length) return console.log(`no runs yet (${RESULTS})`)
  const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : null)
  const time = (s) => (s == null ? '-' : s < 90 ? `${s} s` : `${(s / 60).toFixed(1)} min`)
  const cell = (rs) => {
    const ran = rs.filter((r) => !r.broken)
    if (!rs.length) return 'not run'
    const b = rs.length - ran.length
    const h = ran.filter((r) => r.escalated).length
    return `${ran.filter((r) => r.works).length} of ${ran.length} work, ${time(median(ran.map((r) => r.secs)))}${h ? `, ${h} handed over` : ''}${b ? `, ${b} broke` : ''}`
  }
  const W = 46
  console.log(['request'.padEnd(26), ...arms.map((a) => a.padEnd(W))].join(' '))
  for (const q of REQUESTS) console.log([`${q.id} (${q.kind})`.padEnd(26), ...arms.map((a) => cell(all.filter((r) => r.arm === a && r.id === q.id)).padEnd(W))].join(' '))
  const tot = (a) => {
    const rs = all.filter((r) => r.arm === a && !r.broken)
    const secs = rs.reduce((s, r) => s + r.secs, 0)
    return `${rs.filter((r) => r.works).length} of ${rs.length} work, ${Math.round(secs / 60)} min in all`
  }
  console.log(['total'.padEnd(26), ...arms.map((a) => tot(a).padEnd(W))].join(' '))
  const extra = (a) => {
    const rs = all.filter((r) => r.arm === a && !r.broken)
    // Rows from before the page driver have no nudged / finishedBy: counted as not.
    return `tests ran ${rs.filter((r) => r.tested).length}, nudged ${rs.filter((r) => r.nudged).length}, handed over ${rs.filter((r) => r.escalated).length} (hosted finished ${rs.filter((r) => r.finishedBy === 'hosted').length})`
  }
  console.log([''.padEnd(26), ...arms.map((a) => extra(a).padEnd(W))].join(' '))
  console.log(`\nOne line per run: ${RESULTS}; what each run made: ${OUT}/<arm>/<request>-<try>/files (and conversation.json, screenshots)`)
}
