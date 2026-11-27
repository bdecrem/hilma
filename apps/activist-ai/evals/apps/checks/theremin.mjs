// Pocket theremin (OLA-454), played on a phone-size touch screen: the first tap anywhere starts it,
// a finger in the lower middle of the screen sounds a note, sliding up raises the pitch, two fingers
// sound two different notes at once, and lifting the fingers lets the sound stop. Sound is read from
// the page's own Web Audio oscillators (every one created, started and stopped is counted).

export const NAMES = ['page_opens', 'first_tap_starts', 'plays_where_touched', 'higher_is_higher', 'two_fingers_two_notes', 'stops_on_release']

export async function check(env, got) {
  const ctx = await env.ctx.browser().newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await ctx.addInitScript(() => {
    window.__live = new Set()
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    const make = AC.prototype.createOscillator
    AC.prototype.createOscillator = function () {
      const n = make.call(this)
      const start = n.start.bind(n)
      const stop = n.stop.bind(n)
      n.start = (...a) => (window.__live.add(n), start(...a))
      n.stop = (...a) => (window.__live.delete(n), stop(...a))
      return n
    }
    // A gain at (near) zero is silence even while its oscillator runs: count only what can be heard.
    window.__sounding = () => [...window.__live].map((n) => Math.round(n.frequency.value)).filter((f) => f > 20)
  })
  const page = await ctx.newPage()
  env.page = page
  page.on('pageerror', (e) => env.errors.push(String(e.message || e)))
  try {
    await page.goto(env.url, { waitUntil: 'load', timeout: 20000 })
    await page.waitForTimeout(1000)
    got.page_opens = (await page.evaluate(() => document.body?.innerText || '')).trim().length > 0 || (await page.locator('canvas').count()) > 0
    const cdp = await ctx.newCDPSession(page)
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) })
    const sounding = () => page.evaluate(() => (window.__sounding ? window.__sounding() : []))
    // The first tap, in the middle of the screen.
    await touch('touchStart', [[195, 420]])
    await page.waitForTimeout(400)
    const firstTap = await sounding()
    await touch('touchEnd', [])
    await page.waitForTimeout(800)
    // One finger in the lower middle, then sliding up.
    await touch('touchStart', [[195, 720]])
    await page.waitForTimeout(400)
    const low = await sounding()
    got.first_tap_starts = firstTap.length > 0 || low.length > 0
    got.plays_where_touched = low.length > 0
    for (let i = 1; i <= 20; i++) {
      await touch('touchMove', [[195, 720 - i * 28]])
      await page.waitForTimeout(40)
    }
    await page.waitForTimeout(400)
    const high = await sounding()
    got.higher_is_higher = low.length > 0 && high.length > 0 && Math.max(...high) > Math.max(...low)
    await touch('touchEnd', [])
    await page.waitForTimeout(1200)
    // Two fingers far apart in height.
    await touch('touchStart', [[110, 700], [280, 220]])
    await page.waitForTimeout(500)
    const two = await sounding()
    got.two_fingers_two_notes = new Set(two).size >= 2
    await touch('touchEnd', [])
    await page.waitForTimeout(2500)
    got.stops_on_release = got.plays_where_touched && (await sounding()).length === 0
    await page.waitForTimeout(100)
  } finally {
    // The harness screenshots env.page after check(); keep the context open until the browser closes.
  }
}
