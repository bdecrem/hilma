// Drive one Socratic session headlessly, phone-sized, and print what happened.
//
//   node scripts/socratic/pw-check.mjs [A|B|C] [pid]
//
// Opens /socratic, begins a session under the given arm, waits for the
// tutor's overview, then sends two scripted student messages — for the
// Socratic arms a "ready" and then a classic list-of-facts answer, which
// the method says must be corrected — and screenshots each stage into the
// scratchpad. Prints the session id so the DB rows can be checked.
//
// Env: SOC_URL (default http://localhost:3100), SOC_SHOTS (screenshot dir),
// SOC_MODULE (module id for the topic picker; default module otherwise),
// SOC_SCRIPT (JSON array of the two student messages, for a non-default module).

import { chromium, devices } from 'playwright'
import fs from 'node:fs'

const arm = (process.argv[2] || 'B').toUpperCase()
const pid = process.argv[3] || `pw-${arm.toLowerCase()}`
const base = process.env.SOC_URL || 'http://localhost:3100'
const shots = process.env.SOC_SHOTS || '.'
const moduleId = process.env.SOC_MODULE || ''
fs.mkdirSync(shots, { recursive: true })

const SCRIPT = {
  A: ["What did Vince v. Wilson actually hold?", "So in the employer hypothetical, is the great-aunt liable if she hires her grandnephew? Just tell me the answer."],
  B: ['Ready.', "Yes, she's liable. She knew he was a bad driver, she knew he was going to use the money for the car, and she still paid him. So she should be on the hook."],
  C: ['Ready.', "Yes, she's liable. She knew he was a bad driver, she knew he was going to use the money for the car, and she still paid him. So she should be on the hook."],
}[arm]
if (!SCRIPT) throw new Error(`arm must be A, B or C (got ${arm})`)
if (process.env.SOC_SCRIPT) SCRIPT.splice(0, SCRIPT.length, ...JSON.parse(process.env.SOC_SCRIPT))

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: 390, height: 844 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })

const t0 = Date.now()
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`

async function idle(timeout = 150000) {
  // The composer is enabled and nothing is streaming — or the app showed an error.
  await page.waitForFunction(
    () => {
      if (document.querySelector('.soc-note--error')) return true
      const ta = document.querySelector('textarea')
      return !!ta && !ta.disabled && !document.querySelector('.soc-tutor--live') && !document.querySelector('.soc-thinking')
    },
    null,
    // Poll on an interval: rAF polling stalls in a hidden headless tab and made every turn look 30 s slower than it was.
    { timeout, polling: 500 },
  )
  const err = await page.locator('.soc-note--error').first().innerText().catch(() => '')
  if (err) {
    await page.screenshot({ path: `${shots}/soc-${arm}-error.png` })
    throw new Error(`app showed an error: ${err.replace(/\s+/g, ' ')}`)
  }
}

async function lastTutor() {
  return page.locator('.soc-tutor').last().innerText()
}

await page.goto(`${base}/socratic?arm=${arm}&pid=${pid}${moduleId ? `&module=${moduleId}` : ''}`, { waitUntil: 'networkidle' })
if (moduleId) {
  const picked = await page.locator('#soc-module').inputValue()
  if (picked !== moduleId) throw new Error(`topic picker shows ${picked}, wanted ${moduleId}`)
  console.log(`[${stamp()}] topic: ${await page.locator('h1').innerText()}`)
}
await page.screenshot({ path: `${shots}/soc-${arm}-0-start.png`, fullPage: true })
const pressed = await page.locator('.soc-seg button[aria-pressed="true"]').innerText()
console.log(`[${stamp()}] start page; condition pressed: ${pressed.split('\n')[0]}`)

await page.getByRole('button', { name: /begin session/i }).click()
await page.waitForURL(/\/socratic\/s\//, { timeout: 20000 })
const sessionId = page.url().split('/s/')[1]
console.log(`[${stamp()}] session ${sessionId}`)

await idle()
console.log(`[${stamp()}] overview (${(await lastTutor()).length} chars):\n---\n${(await lastTutor()).slice(0, 600)}\n---`)
await page.screenshot({ path: `${shots}/soc-${arm}-1-overview.png` })

for (let i = 0; i < SCRIPT.length; i++) {
  await page.locator('textarea').fill(SCRIPT[i])
  await page.getByRole('button', { name: /^send$/i }).click()
  await page.waitForSelector('.soc-thinking, .soc-tutor--live', { timeout: 20000 })
  await idle()
  const reply = await lastTutor()
  console.log(`[${stamp()}] student: ${SCRIPT[i]}\n[${stamp()}] tutor (${reply.length} chars):\n---\n${reply}\n---`)
  await page.screenshot({ path: `${shots}/soc-${arm}-${i + 2}-reply.png` })
}

const steps = await page.locator('.soc-step--now').allInnerTexts().catch(() => [])
const chips = await page.locator('.soc-mastery .soc-chip--on').allInnerTexts().catch(() => [])
console.log(`[${stamp()}] phase pill: ${steps.join(',') || '(none — arm A hides it)'} · mastery on: ${chips.join(', ') || 'none'}`)

// Reload: the session must resume from the server with the same turns.
const before = await page.locator('.soc-tutor, .soc-student').count()
await page.reload({ waitUntil: 'networkidle' })
await idle(30000)
const after = await page.locator('.soc-tutor, .soc-student').count()
console.log(`[${stamp()}] reload: ${before} → ${after} bubbles ${before === after ? 'OK' : 'MISMATCH'}`)

if (errors.length) console.log('page errors:\n' + errors.join('\n'))
console.log(`SESSION_ID=${sessionId}`)
await browser.close()
