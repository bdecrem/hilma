// Prototype: share cards with the real app in them. For the last N gallery
// creations: screenshot the deployed page at phone size, compose it onto the
// branded card (emoji, name, the ask on the left; the phone on the right),
// write public/surf/og-proto/<slug>.png and an index page to compare them at
// card size and at thumbnail size.
//   node scripts/surf/og-proto.mjs [n]
import { chromium } from 'playwright'
import fs from 'node:fs/promises'

const N = Number(process.argv[2] || 10)
const OUT = 'public/surf/og-proto'
const apps = (await (await fetch(`https://tokensurfers.app/api/surf/apps?sort=new&limit=${N}`)).json()).apps

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

function card({ emoji, title, prompt, owner, shot }) {
  const size = title.length > 22 ? 64 : title.length > 14 ? 84 : 104
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Montserrat:wght@700;900&display=swap" rel="stylesheet">
<style>
  body{margin:0;width:1200px;height:630px;overflow:hidden;background:#f4703a;font-family:Montserrat,Arial,sans-serif;position:relative}
  .ray{position:absolute;left:-400px;top:259px;width:2000px;height:112px;background:#e85b26;transform-origin:50% 50%}
  .left{position:absolute;left:64px;top:0;height:630px;width:560px;display:flex;flex-direction:column;justify-content:center}
  .emoji{font-size:110px;line-height:1}
  .title{font-family:Anton,Impact,sans-serif;font-size:${size}px;line-height:.95;color:#fff;margin-top:14px;
         text-shadow:4px 4px 0 #17131f,-2px -2px 0 #17131f,2px -2px 0 #17131f,-2px 2px 0 #17131f;letter-spacing:.01em}
  .ask{font-weight:700;font-size:26px;color:#17131f;margin-top:18px;max-width:520px}
  .by{font-weight:900;font-size:22px;color:#fff;margin-top:14px;text-shadow:2px 2px 0 #17131f}
  .foot{position:absolute;left:64px;bottom:34px;font-weight:900;font-size:22px;color:#fff;text-shadow:2px 2px 0 #17131f}
  .phone{position:absolute;right:70px;top:48px;width:300px;height:560px;border-radius:44px;background:#17131f;padding:10px;
         box-shadow:0 14px 0 #17131f;transform:rotate(-4deg)}
  .phone img{width:280px;height:540px;border-radius:36px;object-fit:cover;object-position:top;display:block;background:#fff}
</style></head><body>
${[1, 3, 5, 7, 9, 11].map(i => `<div class="ray" style="transform:rotate(${i * 15}deg)"></div>`).join('')}
<div class="left">
  <div class="emoji">${esc(emoji)}</div>
  <div class="title">${esc(title)}</div>
  <div class="ask">“${esc(prompt.slice(0, 80))}”</div>
  <div class="by">by @${esc(owner)}</div>
</div>
<div class="foot">made with Token Surfers 🏄 · tokensurfers.app</div>
<div class="phone"><img src="data:image/png;base64,${shot}"></div>
</body></html>`
}

const b = await chromium.launch()
const rows = []
for (const a of apps) {
  const url = a.siteUrl || `https://tokensurfers.app/a/${a.slug}?full=1`
  const ctx = await b.newContext({ viewport: { width: 390, height: 750 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  let shot = null
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 })
    await page.waitForTimeout(1500)
    shot = (await page.screenshot({ type: 'png' })).toString('base64')
  } catch (e) { console.log(a.slug, 'shot failed:', e.message.slice(0, 80)) }
  await ctx.close()
  if (!shot) continue
  const cctx = await b.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  const cp = await cctx.newPage()
  await cp.setContent(card({ ...a, shot }), { waitUntil: 'networkidle' })
  await cp.waitForTimeout(600)
  await cp.screenshot({ path: `${OUT}/${a.slug}.png` })
  await cctx.close()
  rows.push(a)
  console.log('card', a.slug, a.title)
}
await b.close()

const index = `<!doctype html><html><head><meta charset="utf-8"><title>OG prototype</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:24px;background:#1b1d20;color:#eee;font:15px/1.4 -apple-system,system-ui,sans-serif}
h1{font-size:18px;margin:0 0 6px}p{margin:0 0 24px;color:#aaa}
.row{display:grid;grid-template-columns:600px 300px 1fr;gap:20px;align-items:center;margin-bottom:28px}
img{display:block;border-radius:8px;background:#000} .big{width:600px} .small{width:300px}
.meta{font-size:13px;color:#bbb}.meta b{color:#fff;font-size:15px}
@media(max-width:1000px){.row{grid-template-columns:1fr}.big{width:100%}}</style></head><body>
<h1>Share cards with the app in them — prototype</h1>
<p>Left: the card at half size (what a link preview shows). Middle: at 300px, the thumbnail size iMessage and Slack often use.</p>
${rows.map(a => `<div class="row"><a href="${a.slug}.png"><img class="big" src="${a.slug}.png"></a><img class="small" src="${a.slug}.png">
<div class="meta"><b>${esc(a.emoji)} ${esc(a.title)}</b><br>@${esc(a.owner)} · “${esc(a.prompt)}”<br><a href="${a.siteUrl || 'https://tokensurfers.app/a/' + a.slug}" style="color:#8cf">${a.siteUrl || 'gallery page'}</a></div></div>`).join('\n')}
</body></html>`
await fs.writeFile(`${OUT}/index.html`, index)
console.log('wrote', rows.length, 'cards +', `${OUT}/index.html`)
