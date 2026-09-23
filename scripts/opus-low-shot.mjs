import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1200,height:630}});
await p.goto('file://'+process.cwd()+'/public/opus-low/index.html'); await p.waitForTimeout(1500);
await p.screenshot({path:'public/opus-low/og.png'});
await p.click('#next'); await p.waitForTimeout(1200);
await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(500);
await p.screenshot({path:process.env.SP+'/m.png'}); await b.close();
