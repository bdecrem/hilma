// Builds public/woodworker/og.png (1200×630): the title, Cyriel, and two rooms
// shot from the live page, set on the tiled kitchen wall.
//   npx tsx scripts/woodworker/og.ts [base=http://localhost:3255]
import { chromium } from 'playwright'

const [base = 'http://localhost:3255'] = process.argv.slice(2)

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  await page.goto(`${base}/woodworker`)
  await page.waitForSelector('.note')
  await page.waitForTimeout(500)
  while (await page.locator('.scene').count()) await page.locator('.scene .skip').click()
  // Transparent wall while shooting the rooms, so the rotated cut-outs carry no background.
  const clear = await page.addStyleTag({ content: 'html, body, .ww { background: transparent !important; }' })
  const shot = async (room: number) => {
    await page.locator('.lvl').nth(room).click()
    await page.waitForTimeout(500)
    return (await page.locator('.stage').screenshot({ animations: 'disabled', omitBackground: true })).toString('base64')
  }
  const fridge = await shot(1)
  const espresso = await shot(0)
  await clear.evaluate((el) => el.remove())
  // Recompose: the page's own header and wall, the two rooms side by side.
  await page.evaluate(
    ([a, b]) => {
      const wrap = document.querySelector('.wrap') as HTMLElement
      for (const el of wrap.querySelectorAll('.levels, .note, .stats, .stage-wrap, .controls, .how')) (el as HTMLElement).remove()
      wrap.style.cssText = 'max-width:none;flex-direction:row;align-items:center;justify-content:center;gap:56px;height:590px;'
      const header = wrap.querySelector('header') as HTMLElement
      header.style.cssText = 'text-align:left;width:440px;'
      const h1 = header.querySelector('h1') as HTMLElement
      h1.style.cssText = 'font-size:68px;white-space:nowrap'
      const kick = header.querySelector('.kicker') as HTMLElement
      kick.textContent = 'A house puzzle in ten rooms'
      kick.style.fontSize = '15px'
      const sub = document.createElement('p')
      sub.textContent = 'Cyriel the carpenter rebuilt everything. Then left for the week.'
      sub.style.cssText = 'font-family:var(--f-hand);font-size:30px;line-height:1.1;color:var(--paper);margin:14px 0 0;transform:rotate(-1.5deg)'
      header.append(sub)
      const pics = document.createElement('div')
      pics.style.cssText = 'position:relative;width:560px;height:500px'
      for (const [src, css] of [
        [a, 'position:absolute;right:0;top:0;width:350px;transform:rotate(3deg);filter:drop-shadow(0 18px 24px rgba(0,0,0,.45))'],
        [b, 'position:absolute;left:0;bottom:0;width:330px;transform:rotate(-4deg);filter:drop-shadow(0 18px 24px rgba(0,0,0,.45))'],
      ]) {
        const img = document.createElement('img')
        img.src = `data:image/png;base64,${src}`
        img.style.cssText = css
        pics.append(img)
      }
      // Cyriel stands in front of the rooms, bottom left (the drawing has room either side of the figure).
      const me = document.createElement('img')
      me.src = '/woodworker/cyriel/cyriel.svg'
      me.style.cssText = 'position:absolute;left:-20px;bottom:-30px;height:540px;filter:drop-shadow(0 14px 18px rgba(0,0,0,.4))'
      pics.append(me)
      wrap.append(pics)
    },
    [fridge, espresso],
  )
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'public/woodworker/og.png', animations: 'disabled' })
  await browser.close()
  console.log('wrote public/woodworker/og.png')
}
main()
