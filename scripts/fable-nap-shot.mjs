import { chromium } from 'playwright';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1200,height:630}});
await p.goto('file://'+process.cwd()+'/public/fable-nap/index.html');await p.waitForTimeout(14000);
await p.screenshot({path:'public/fable-nap/og.png'});
await p.setViewportSize({width:390,height:844});await p.waitForTimeout(5000);
await p.screenshot({path:process.env.SP+'/f.png'});await b.close();
