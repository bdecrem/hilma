#!/usr/bin/env node
// A real test of the open conversation (ola.cx/venture/talk), no human
// needed: headless Chromium with a fake microphone that plays one spoken
// comment (macOS `say`). Checks the fixed opening line, the transcription,
// Claude's reply and how long it took to start, that the voice read what it
// was given, a typed turn and an interruption (dev hook only), and the end
// marker. The session is marked "test".
//   VENTURE_KEY=<key> node scripts/venture/talk-check.mjs <outDir> [base]   (default http://localhost:3288)
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const out = path.resolve(process.argv[2] || 'talk-check')
const base = process.argv[3] || 'http://localhost:3288'
const key = process.env.VENTURE_KEY
if (!key) throw new Error('VENTURE_KEY is not set')
mkdirSync(out, { recursive: true })

// 9 s of silence (the opening plays), the comment, then silence.
const aiff = path.join(out, 'comment.aiff')
const wav = path.join(out, 'comment.wav')
execFileSync('say', ['-o', aiff, 'Here is my worry. The citizenship idea feels small to me. Which of the three ideas do you actually believe in, and why?'])
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-t', '9', '-i', 'anullsrc=r=48000:cl=mono', '-i', aiff, '-f', 'lavfi', '-t', '120', '-i', 'anullsrc=r=48000:cl=mono', '-filter_complex', '[1:a]aresample=48000[a];[0:a][a][2:a]concat=n=3:v=0:a=1', '-ac', '1', '-ar', '48000', wav])

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
const count = (role) => page.$$eval(`.vi-turn.${role}`, (els) => els.length)
const status = () => page.locator('.vi-status').innerText()

const bad = await page.goto(`${base}/venture/talk`)
ok('no key is a 404', bad.status() === 404)
await page.goto(`${base}/venture/talk?k=${key}`)
await page.waitForSelector('.vi-btn.primary')
await page.screenshot({ path: path.join(out, '1-idle.png') })
await page.click('.vi-btn.primary')
await page.waitForSelector('text=End the call', { timeout: 30_000 })
ok('call connects', true)
await page.waitForSelector('.vi-turn.claude', { timeout: 30_000 })
ok('fixed opening line', /what is on your mind/i.test((await turns())[0].text), (await turns())[0].text)

await page.waitForSelector('.vi-turn.bart', { timeout: 60_000 })
const heardAt = Date.now()
ok('the comment is transcribed', true, (await turns()).find((t) => t.role === 'bart').text.slice(0, 140))
await page.waitForFunction(() => document.querySelector('.vi-status')?.textContent === 'Claude is talking', null, { timeout: 40_000 })
const firstSound = Date.now() - heardAt
ok('Claude starts speaking', firstSound < 8000, `${firstSound} ms after the transcript`)
await page.screenshot({ path: path.join(out, '2-talking.png') })
await page.waitForFunction(() => document.querySelector('.vi-status')?.textContent === 'go ahead' && document.querySelectorAll('.vi-turn.claude').length >= 2, null, { timeout: 90_000 })
const first = (await turns()).filter((t) => t.role === 'claude')[1].text
ok('Claude reacts in spoken prose', first.length > 20 && !/[*#\n]|^\s*-/.test(first), first.slice(0, 400))

const dev = await page.evaluate(() => !!window.__talk)
if (dev) {
  // Did the voice read what it was given?
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
  const fid = await page.evaluate(() => window.__talk.fidelity)
  let worst = 1
  for (const f of fid) {
    const a = norm(f.sent)
    const b = new Set(norm(f.heard))
    const share = a.filter((w) => b.has(w)).length / Math.max(a.length, 1)
    const extra = norm(f.heard).length / Math.max(a.length, 1)
    worst = Math.min(worst, share, 2 - extra)
    if (share < 0.9 || extra > 1.15) console.log(`  drift: sent "${f.sent.slice(0, 90)}" heard "${f.heard.slice(0, 90)}"`)
  }
  ok('the voice reads what Claude wrote', fid.length >= 2 && worst >= 0.85, `${fid.length} pieces, worst match ${worst.toFixed(2)}`)

  // A typed turn that asks for something long, then talk over it.
  await page.waitForFunction(() => document.querySelector('.vi-status')?.textContent === 'go ahead', null, { timeout: 60_000 })
  const n = await count('claude')
  await page.evaluate(() => window.__talk.say('Walk me through all seven dead ideas, one sentence each.'))
  await page.waitForFunction(() => document.querySelector('.vi-status')?.textContent === 'Claude is talking', null, { timeout: 40_000 })
  await page.waitForTimeout(2500)
  await page.evaluate(() => window.__talk.say('Stop. Different question: what is the single biggest risk in the research agents idea?'))
  const t1 = Date.now()
  await page.waitForFunction(() => document.querySelector('.vi-status')?.textContent === 'Claude is talking', null, { timeout: 40_000 })
  console.log(`     second reply: first sound ${Date.now() - t1} ms after the words`)
  await page.waitForFunction(() => document.querySelector('.vi-status')?.textContent === 'go ahead', null, { timeout: 90_000 })
  const after = await turns()
  const cutTurn = after.filter((t) => t.role === 'claude')[n]
  ok('the cut reply keeps only what was heard', / …$/.test(cutTurn.text) && cutTurn.text.split(/\s+/).length < 25, cutTurn.text)
  const last = after[after.length - 1]
  ok('it answers the new thing', last.role === 'claude' && /risk|network|channel|introduc|depend/i.test(last.text), last.text.slice(0, 300))
}
await page.screenshot({ path: path.join(out, '3-log.png'), fullPage: true })
const session = await page.evaluate(() => localStorage.getItem('venture.talk.session'))
await page.click('text=End the call')
await page.waitForSelector('text=Got all of it.')
ok('ending forgets the session locally', (await page.evaluate(() => localStorage.getItem('venture.talk.session'))) === null)
await page.waitForTimeout(2500)
const mark = await page.request.post(`${base}/api/venture/interview/turn`, { data: { key, session, role: 'event', text: 'test', call: 'talk' } })
ok('session marked test', mark.ok(), session)
await browser.close()
console.log(results.every(Boolean) ? `\nall ${results.length} passed` : '\nFAILED')
process.exit(results.every(Boolean) ? 0 : 1)
