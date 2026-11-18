import { chromium, devices } from 'playwright'
const [token, pw, out] = process.argv.slice(2)
const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 14'] }); const p = await ctx.newPage()
const shot = async (n) => { await p.waitForTimeout(1200); await p.screenshot({ path: `${out}/${n}.png` }); console.log(n, '|', (await p.innerText('body')).replace(/\s+/g, ' ').slice(0, 300)) }
await p.goto(`https://app.ola.cx/#/invite/${token}`); await shot('1-invite')
const pws = p.locator('input[type=password]'); const n = await pws.count(); for (let i = 0; i < n; i++) await pws.nth(i).fill(pw)
await p.getByRole('button').filter({ hasText: /./ }).last().click(); await shot('2-after-setup')
await ctx.clearCookies(); await p.goto('https://app.ola.cx/'); await shot('3-signin-page')
console.log('inputs on sign-in:', await p.locator('input').evaluateAll(es => es.map(e => e.type + ':' + (e.getAttribute('autocomplete') || ''))))
await p.locator('input').first().fill('Walker'); await p.locator('input[type=password]').fill(pw)
await p.getByRole('button', { name: /sign in/i }).click(); await shot('4-signed-in')
await b.close()
