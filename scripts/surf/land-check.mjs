import { chromium } from 'playwright'
const b = await chromium.launch(); const errs=[]
for (const [n,w,h] of [['desk',1280,900],['phone',390,844]]) {
  const p = await (await b.newContext({viewport:{width:w,height:h}})).newPage()
  p.on('pageerror',e=>errs.push(e.message))
  await p.goto('http://localhost:3219/surf',{waitUntil:'networkidle'}); await p.waitForTimeout(1200)
  await p.screenshot({path:`${process.argv[2]}/land-${n}.png`,fullPage:true})
}
await b.close(); console.log('errors', errs)
