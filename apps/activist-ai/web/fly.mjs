#!/usr/bin/env node
// fly.mjs <page.html or url> <out dir>: a finger on a phone-size screen drags across a canvas toy
// (left and up, across to the right, let go), with a picture at each stage. Prints errors and frames a second.
// Run from the repo root: node apps/activist-ai/web/fly.mjs <page> <dir>
import { chromium, devices } from 'playwright'
import path from 'node:path'
const [target, dir] = process.argv.slice(2)
const url = /^https?:/.test(target) ? target : 'file://' + path.resolve(target)
const b = await chromium.launch()
const c = await b.newContext({ ...devices['iPhone 14'] })
const p = await c.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()))
await p.goto(url)
await p.waitForTimeout(1500)
await p.screenshot({ path: path.join(dir, 'fly-0-start.png') })
const cdp = await c.newCDPSession(p)
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
await touch('touchStart', 195, 560)
for (let i = 0; i <= 30; i++) (await touch('touchMove', 195 - i * 4, 560 - i * 9), await p.waitForTimeout(30))
await p.waitForTimeout(700)
await p.screenshot({ path: path.join(dir, 'fly-1-up-left.png') })
for (let i = 0; i <= 40; i++) (await touch('touchMove', 75 + i * 7, 290 + Math.sin(i / 4) * 60), await p.waitForTimeout(30))
await p.waitForTimeout(700)
await p.screenshot({ path: path.join(dir, 'fly-2-right.png') })
await touch('touchEnd', 0, 0)
await p.waitForTimeout(3000)
await p.screenshot({ path: path.join(dir, 'fly-3-let-go.png') })
const fps = await p.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 1000 ? requestAnimationFrame(f) : r(n) }; requestAnimationFrame(f) }))
const info = await p.evaluate(() => ({ canvases: document.querySelectorAll('canvas').length, sideways: document.documentElement.scrollWidth > innerWidth, theme: document.querySelector('meta[name=theme-color]')?.content || null, words: document.body.innerText.trim().slice(0, 120) }))
console.log(JSON.stringify({ errs, fps, info }))
await b.close()
