// On a phone: ask Ola something small, then under its reply "Compare with Claude" > "Just this once:
// the real task" > "Send it this once", and watch until Claude's side ends. Screenshots as it goes.
//   node scripts/venture/ola-walk-claude.mjs <out dir> <name> <password> "request"
import { chromium, devices } from 'playwright'
const [out, name, pw, request] = process.argv.slice(2)
const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 14'] }); const p = await ctx.newPage()
let n = 0; const shot = async (l) => { await p.waitForTimeout(800); await p.screenshot({ path: `${out}/c${String(++n).padStart(2, '0')}-${l}.png` }) }
const say = async (l) => console.log(l, '|', (await p.innerText('body')).replace(/\s+/g, ' ').slice(-500))
const idle = async (min) => { const t0 = Date.now(); while (Date.now() - t0 < min * 60000) { await p.waitForTimeout(15000); if (!/working on your request|Work is under way|is working|Sending|under way/i.test(await p.innerText('body')) && Date.now() - t0 > 30000) return true } return false }
await p.goto('https://app.ola.cx/'); await p.waitForSelector('input[type=password]')
await p.locator('input').first().fill(name); await p.locator('input[type=password]').fill(pw); await p.getByRole('button', { name: /sign in/i }).click(); await p.waitForTimeout(4000)
await p.locator('button.askbar-open').click(); await p.waitForTimeout(2500)
const box = p.locator('#ask-drawer textarea'); await box.fill(request); await box.press('Enter'); await shot('asked')
console.log('ola finished:', await idle(12)); await shot('ola-done'); await say('after ola')
const cmp = p.locator('#ask-drawer').getByRole('button', { name: /compare with claude/i }).last()
console.log('compare buttons:', await cmp.count()); if (!(await cmp.count())) { await b.close(); process.exit(1) }
await cmp.scrollIntoViewIfNeeded(); await cmp.click(); await p.waitForTimeout(2500); await shot('sheet')
console.log('sheet buttons:', JSON.stringify((await p.locator('button:visible').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(-12)))
const real = p.getByText(/Just this once: the real task/i).first(); if (await real.count()) { await real.click(); await p.waitForTimeout(1500); await shot('real-chosen') }
const once = p.getByRole('button', { name: /send it this once/i }).first(); console.log('send-once:', await once.count())
if (await once.count()) { await once.scrollIntoViewIfNeeded(); await once.click(); await p.waitForTimeout(6000); await shot('sent'); await say('after send') }
console.log('claude side finished:', await idle(12)); await shot('end'); await say('end')
await b.close()
