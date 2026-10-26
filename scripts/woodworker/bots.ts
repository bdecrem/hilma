// Plays Cyriel's minigames for the Playwright scripts. Each bot runs inside
// the page on requestAnimationFrame (the games are timing games, so the
// decisions have to be made at frame rate) and sends the same pointer and key
// events a player would. It returns once the episode shows its result.
import type { Page } from 'playwright'
import type { EpisodeId } from '../../src/app/woodworker/lib/episodes'

const BOT = `
    const arena = () => document.querySelector('.arena')
    const rect = (el) => el.getBoundingClientRect()
    const fire = (type, x, y, el = arena()) =>
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true }))
    const key = (k, type = 'keydown') => window.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }))
    return new Promise((done) => {
      let last = null
      let steered = 0
      const frame = (now) => {
        if (document.querySelector('.episode.done') || !arena()) return done()
        const a = rect(arena())
        const px = (r) => ((r.left + r.width / 2 - a.left) / a.width) * 100
        const py = (r) => ((r.top + r.height / 2 - a.top) / a.height) * 100
        if (id === 'taxi') {
          // Throw when the taxi will be on the X as the throw lands (0.8 s from now).
          const x = px(rect(document.querySelector('.cab')))
          if (last && now > last.t) {
            const v = (x - last.x) / ((now - last.t) / 1000)
            const flying = document.querySelector('.flung:not(.landed)')
            if (!flying && v > 0 && Math.abs(x + v * 0.8 - 64) < 1.6) fire('pointerdown', a.left + 10, a.top + 10)
          }
          last = { x, t: now }
        } else if (id === 'krul') {
          for (const p of document.querySelectorAll('.pop.is-krul:not(.booped)')) {
            const r = rect(p)
            fire('pointerdown', r.left + r.width / 2, r.top + r.height / 3, p)
          }
        } else if (id === 'achoo') {
          // Under the lowest sneeze still falling, else under Cyriel's nose.
          const drops = [...document.querySelectorAll('.drop:not(.caught):not(.splat)')].map(rect).sort((p, q) => q.top - p.top)
          const target = drops[0] ?? rect(document.querySelector('.sniffly'))
          fire('pointermove', target.left + target.width / 2, a.top + a.height * 0.86)
        } else if (id === 'court') {
          const lanes = [22, 50, 78]
          const van = rect(document.querySelector('.van'))
          const lane = lanes.reduce((b, l, i) => (Math.abs(l - px(van)) < Math.abs(lanes[b] - px(van)) ? i : b), 0)
          // Head for the gap in the nearest row that hasn't passed yet.
          const ahead = [...document.querySelectorAll('.obstacle:not(.knocked)')].map(rect).filter((r) => py(van) - py(r) > -6)
          const near = Math.max(...ahead.map(py), -1e9)
          const row = ahead.filter((r) => Math.abs(py(r) - near) < 3)
          const blocked = (l) => row.some((r) => Math.abs(px(r) - lanes[l]) < 8)
          const free = [0, 1, 2].filter((l) => !blocked(l)).sort((p, q) => Math.abs(p - lane) - Math.abs(q - lane))
          if (row.length && blocked(lane) && free.length && now - steered > 90) {
            key(free[0] < lane ? 'ArrowLeft' : 'ArrowRight')
            steered = now
          }
        }
        requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
`

export async function playEpisode(page: Page, id: EpisodeId): Promise<{ score: number; max: number; label: string }> {
  // Sent as source: tsx would otherwise wrap named functions in a helper the page doesn't have.
  await page.evaluate(`((id) => {${BOT}})(${JSON.stringify(id)})`)
  await page.waitForTimeout(300)
  const score = Number(await page.locator('.ep-score b').textContent())
  const max = Number((await page.locator('.ep-score span').textContent())!.replace('/', ''))
  const label = (await page.locator('.ep-card .label').textContent()) ?? ''
  return { score, max, label }
}
