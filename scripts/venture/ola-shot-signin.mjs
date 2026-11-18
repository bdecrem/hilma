// The app.ola.cx sign-in page on an iPhone 14, signed out; optional extra CSS to preview a change.
//   node scripts/venture/ola-shot-signin.mjs <out.png> ["css"]
import { chromium, devices } from 'playwright'
const [out, css] = process.argv.slice(2)
const b = await chromium.launch(); const p = await (await b.newContext({ ...devices['iPhone 14'], bypassCSP: true })).newPage()
await p.goto('https://app.ola.cx/'); await p.waitForSelector('input[type=password]')
if (css) await p.addStyleTag({ content: css })
await p.waitForTimeout(800); await p.screenshot({ path: out })
const btn = await p.getByRole('button', { name: /sign in/i }).boundingBox()
console.log('Sign in button bottom at', Math.round(btn.y + btn.height), 'of', p.viewportSize().height)
await b.close()
