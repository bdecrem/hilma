// Records the background music from the real page (every connection to the
// speakers is mirrored into a MediaRecorder) and writes <out>/music.webm.
//   npx tsx scripts/woodworker/pw-music.ts <out-dir> [seconds=25] [base=http://localhost:3255]
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const [out = '/tmp/ww', secs = '25', base = 'http://localhost:3255'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })

async function main() {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
  const page = await browser.newPage()
  await page.addInitScript(() => {
    const connect = AudioNode.prototype.connect as (...a: unknown[]) => unknown
    const taps = new WeakMap<BaseAudioContext, MediaStreamAudioDestinationNode>()
    AudioNode.prototype.connect = function (this: AudioNode, ...a: unknown[]) {
      const ctx = this.context as AudioContext
      if (a[0] === ctx.destination) {
        let tap = taps.get(ctx)
        if (!tap) {
          tap = ctx.createMediaStreamDestination()
          taps.set(ctx, tap)
          const rec = new MediaRecorder(tap.stream)
          const parts: Blob[] = []
          rec.ondataavailable = (e) => parts.push(e.data)
          ;(window as unknown as { __stop: () => Promise<string> }).__stop = () =>
            new Promise((done) => {
              rec.onstop = async () => {
                const buf = new Uint8Array(await new Blob(parts).arrayBuffer())
                let s = ''
                for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i])
                done(btoa(s))
              }
              rec.stop()
            })
          rec.start()
        }
        connect.call(this, tap)
      }
      return connect.apply(this, a) as AudioNode
    } as typeof AudioNode.prototype.connect
  })
  await page.goto(`${base}/woodworker`)
  await page.waitForSelector('.note')
  await page.mouse.click(5, 5)
  await page.waitForTimeout(Number(secs) * 1000)
  const b64 = await page.evaluate(() => (window as unknown as { __stop: () => Promise<string> }).__stop())
  writeFileSync(`${out}/music.webm`, Buffer.from(b64, 'base64'))
  console.log(`wrote ${out}/music.webm`)
  await browser.close()
}
main()
