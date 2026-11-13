#!/usr/bin/env node
// A real test call to the founding interview, no human needed: headless
// Chromium with a fake microphone that plays one spoken answer (macOS `say`),
// so the whole path runs — mint, WebRTC, Claude speaking first, transcription
// of the answer, turns stored, hang up, resume. The session is marked "test".
//   node scripts/venture/interview-check.mjs <outDir> [base]   (default http://localhost:3288)
// The access key comes from VENTURE_KEY.
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const out = path.resolve(process.argv[2] || 'venture-check')
const base = process.argv[3] || 'http://localhost:3288'
const key = process.env.VENTURE_KEY
if (!key) throw new Error('VENTURE_KEY is not set')
mkdirSync(out, { recursive: true })

// 14 s of silence (the opening plays), the answer, then silence.
const aiff = path.join(out, 'answer.aiff')
const wav = path.join(out, 'answer.wav')
execFileSync('say', ['-o', aiff, 'It is mostly an experiment, to see what an A.I. can do when it runs a business by itself. Making some money would be a bonus.'])
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-t', '14', '-i', 'anullsrc=r=48000:cl=mono', '-i', aiff, '-f', 'lavfi', '-t', '40', '-i', 'anullsrc=r=48000:cl=mono', '-filter_complex', '[1:a]aresample=48000[a];[0:a][a][2:a]concat=n=3:v=0:a=1', '-ac', '1', '-ar', '48000', wav])

const browser = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${wav}%noloop`, '--autoplay-policy=no-user-gesture-required'],
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['microphone'] })
const page = await ctx.newPage()
page.on('console', (m) => m.type() === 'error' && console.log('  console:', m.text()))
const results = []
const ok = (name, pass, detail = '') => {
  results.push(pass)
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}
const turns = () => page.$$eval('.vi-turn', (els) => els.map((e) => ({ role: e.classList.contains('claude') ? 'claude' : 'bart', text: e.textContent.replace(/^(Claude|You)/, '') })).reverse())

await page.goto(`${base}/venture/interview`)
await page.waitForSelector('h1')
ok('no key: explains, no start button', (await page.locator('.vi-btn').count()) === 0 && /own link/.test(await page.locator('.vi-sub').innerText()))

await page.goto(`${base}/venture/interview?k=${key}`)
await page.waitForSelector('.vi-btn.primary')
await page.screenshot({ path: path.join(out, '1-idle.png') })
await page.click('.vi-btn.primary')
await page.waitForFunction(() => document.querySelector('.vi-status')?.textContent !== 'connecting…' && document.querySelectorAll('.vi-btn').length === 2, null, { timeout: 30_000 })
ok('call connects', true)
await page.waitForSelector('.vi-turn.claude', { timeout: 40_000 })
const opening = (await turns())[0]
ok('Claude speaks first', opening.role === 'claude', opening.text.slice(0, 160))
await page.screenshot({ path: path.join(out, '2-live.png') })
await page.waitForSelector('.vi-turn.bart', { timeout: 60_000 })
ok('the answer is transcribed', true, (await turns()).find((t) => t.role === 'bart').text.slice(0, 120))
await page.waitForFunction(() => document.querySelectorAll('.vi-turn.claude').length >= 2, null, { timeout: 40_000 })
const second = (await turns()).filter((t) => t.role === 'claude')[1]
ok('Claude follows up', true, second.text.slice(0, 200))
await page.waitForFunction(() => /^(\d+) of \1 /.test(document.querySelector('.vi-saved')?.textContent ?? ''), null, { timeout: 15_000 })
ok('every turn saved', true, await page.locator('.vi-saved').innerText())
await page.screenshot({ path: path.join(out, '3-talk.png') })

await page.click('text=Hang up')
await page.waitForSelector('text=On hold')
await page.screenshot({ path: path.join(out, '4-hold.png') })
const before = (await turns()).length
await page.click('.vi-btn.primary')
await page.waitForFunction((n) => document.querySelectorAll('.vi-turn').length > n, before, { timeout: 60_000 })
const back = (await turns())[before]
ok('resume continues, no second opening', back.role === 'claude' && !/fifteen minutes/i.test(back.text), back.text.slice(0, 200))
const session = await page.evaluate(() => localStorage.getItem('venture.interview.session'))

// The closing, typed through the dev hook: Claude says goodbye, calls
// finish_interview, and the page hangs up by itself.
if (await page.evaluate(() => !!window.__interview)) {
  const nudges = [
    'I have to run right now. Skip everything else, including the recap; there is nothing you should have asked. Say goodbye and end the call.',
    'No, nothing else. Goodbye.',
    'Goodbye. End the call now.',
  ]
  let done = false
  for (const n of nudges) {
    await page.waitForTimeout(2500)
    await page.evaluate((t) => window.__interview.say(t), n)
    done = await page.waitForSelector('text=Got all of it.', { timeout: 30_000 }).then(() => true, () => false)
    if (done) break
  }
  ok('goodbye ends the call by itself', done, (await turns()).pop().text.slice(0, 160))
  ok('finished session is forgotten locally', (await page.evaluate(() => localStorage.getItem('venture.interview.session'))) === null)
  await page.screenshot({ path: path.join(out, '5-done.png') })
} else {
  await page.waitForTimeout(1500)
  await page.click('text=Hang up')
}
const mark = await page.request.post(`${base}/api/venture/interview/turn`, { data: { key, session, role: 'event', text: 'test' } })
ok('session marked test', mark.ok(), session)
const bad = await page.request.post(`${base}/api/venture/interview/session`, { data: { key: 'nope' } })
ok('wrong key is a 404', bad.status() === 404)
const og = await page.request.get(`${base}/venture/interview/opengraph-image`)
ok('share image renders', og.ok() && (await og.body()).length > 10_000)
await browser.close()
console.log(results.every(Boolean) ? `\nall ${results.length} passed` : '\nFAILED')
process.exit(results.every(Boolean) ? 0 : 1)
