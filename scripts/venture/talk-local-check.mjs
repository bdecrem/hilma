#!/usr/bin/env node
// One headless call on the talk page with the "Local voice" switch on (OLA-529): the ears and
// the mouth are Kit's voice server on the Mac Studio (apps/venture/voice-local/), reached over
// Tailscale, so this machine must be on the tailnet. A fake microphone plays one spoken
// question (macOS `say`, written to a file, nothing played aloud). Checks that the question is
// transcribed, Claude's reply arrives and is spoken, and prints the delay from the end of the
// question to the first sound of the reply. The session is marked "test".
//   VENTURE_KEY=<key> node scripts/venture/talk-local-check.mjs <outDir> [base]   (default https://ola.cx)
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const out = path.resolve(process.argv[2] || 'talk-local-check')
const base = process.argv[3] || 'https://ola.cx'
const key = process.env.VENTURE_KEY
if (!key) throw new Error('VENTURE_KEY is not set')
mkdirSync(out, { recursive: true })

// 6 s of silence (the opening line plays), the question, then silence.
const aiff = path.join(out, 'question.aiff')
const wav = path.join(out, 'question.wav')
execFileSync('say', ['-o', aiff, 'This is a test of the local voice. In one sentence, what is the most important thing on the board this week?'])
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-t', '6', '-i', 'anullsrc=r=48000:cl=mono', '-i', aiff, '-f', 'lavfi', '-t', '120', '-i', 'anullsrc=r=48000:cl=mono', '-filter_complex', '[1:a]aresample=48000[a];[0:a][a][2:a]concat=n=3:v=0:a=1', '-ac', '1', '-ar', '48000', wav])

const browser = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${wav}%noloop`, '--autoplay-policy=no-user-gesture-required'],
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['microphone'] })
await ctx.addInitScript(() => localStorage.setItem('venture.talk.local', '1'))
const page = await ctx.newPage()
page.on('console', (m) => m.type() === 'error' && console.log('  console:', m.text()))
const results = []
const ok = (name, pass, detail = '') => {
  results.push(pass)
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}
const turns = () => page.$$eval('.vi-turn', (els) => els.map((e) => ({ role: e.classList.contains('claude') ? 'claude' : 'bart', text: e.textContent.replace(/^(Claude|You)/, '') })).reverse())

await page.goto(`${base}/venture/talk?k=${key}`)
await page.waitForSelector('.vi-btn.primary')
ok('the switch is on and remembered', await page.locator('.vi-local input').isChecked())
await page.screenshot({ path: path.join(out, '1-idle.png') })
await page.click('.vi-btn.primary')
try {
  await page.waitForSelector('text=End the call', { timeout: 30_000 })
} catch {
  ok('call connects to the Studio', false, (await page.locator('.vi-error').textContent().catch(() => '')) || 'no error shown')
  await browser.close()
  process.exit(1)
}
ok('call connects to the Studio', true)
await page.waitForSelector('.vi-turn.claude', { timeout: 30_000 })
ok('fixed opening line spoken', /what is on your mind/i.test((await turns())[0].text))
await page.waitForSelector('.vi-turn.bart', { timeout: 60_000 })
ok('the question is transcribed', true, (await turns()).find((t) => t.role === 'bart').text)
await page.waitForFunction(() => document.querySelector('.vi-status')?.textContent === 'Claude is talking', null, { timeout: 40_000 })
await page.screenshot({ path: path.join(out, '2-talking.png') })
await page.waitForFunction(() => document.querySelector('.vi-status')?.textContent === 'go ahead' && document.querySelectorAll('.vi-turn.claude').length >= 2, null, { timeout: 90_000 })
const reply = (await turns()).filter((t) => t.role === 'claude')[1]?.text ?? ''
ok("Claude's reply arrives and is spoken", reply.length > 10, reply.slice(0, 300))
const delays = await page.evaluate(() => window.__kitVoice?.delays ?? [])
ok('reply audio played', delays.length >= 1, `end of question to first sound: ${delays.join(', ')} ms`)
await page.screenshot({ path: path.join(out, '3-log.png'), fullPage: true })
const session = await page.evaluate(() => localStorage.getItem('venture.talk.session'))
await page.click('text=End the call')
await page.waitForSelector('text=Got all of it.')
await page.waitForTimeout(2500)
const mark = await page.request.post(`${base}/api/venture/interview/turn`, { data: { key, session, role: 'event', text: 'test', call: 'talk' } })
ok('session marked test', mark.ok(), session)
await browser.close()
console.log(results.every(Boolean) ? `\nall ${results.length} passed` : '\nFAILED')
process.exit(results.every(Boolean) ? 0 : 1)
