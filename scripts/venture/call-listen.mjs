#!/usr/bin/env node
// Hear how a call opens without being on it: headless Chromium with a silent
// fake microphone joins ola.cx/venture/call/<slug>, prints Claude's first
// turns, hangs up, and marks the session "test".
//   VENTURE_KEY=<key> node scripts/venture/call-listen.mjs <slug> [seconds=25] [base=https://ola.cx]
import { chromium } from 'playwright'

const [slug, secs = '25', base = 'https://ola.cx'] = process.argv.slice(2)
const key = process.env.VENTURE_KEY
if (!slug || !key) throw new Error('usage: VENTURE_KEY=<key> call-listen.mjs <slug> [seconds] [base]')
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ permissions: ['microphone'] })
const page = await ctx.newPage()
await page.goto(`${base}/venture/call/${slug}?k=${key}`)
console.log('title:', await page.locator('h1').innerText(), '|', await page.locator('.vi-sub').innerText())
await page.click('.vi-btn.primary')
// The fake device beeps; mute it so the interviewer hears silence.
await page.waitForSelector('text=Mute', { timeout: 30_000 })
await page.click('text=Mute')
await page.waitForSelector('.vi-turn.claude', { timeout: 60_000 })
await page.waitForTimeout(Number(secs) * 1000)
for (const t of (await page.$$eval('.vi-turn', (els) => els.map((e) => e.textContent))).reverse()) console.log('-', t)
await page.click('text=Hang up')
const session = await page.evaluate((s) => localStorage.getItem(`venture.call.${s}.session`), slug)
const mark = await page.request.post(`${base}/api/venture/interview/turn`, { data: { key, session, role: 'event', text: 'test', call: slug } })
console.log('marked test:', mark.ok(), session)
await browser.close()
