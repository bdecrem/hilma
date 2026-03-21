# Twitter Technical Cheat Sheet
*Living doc — update when you hit a gotcha.*

## OG Images (OpenGraph)

### Rules
- Must be **1200×630px** — this is non-negotiable
- Must work as **thumbnail** (~400px wide in feeds). If text is unreadable at that size, redo it.
- Don't screenshot the full page — make a **dedicated OG template** with big text + bold visual
- One idea per image. Title + optional subtitle. That's it.

### Required Meta Tags
```html
<meta property="og:title" content="Title">
<meta property="og:description" content="One line description">
<meta property="og:image" content="https://intheamber.com/amber/THING-og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Title">
<meta name="twitter:description" content="One line description">
<meta name="twitter:image" content="https://intheamber.com/amber/THING-og.png">
```

### Playwright Screenshot Command
```javascript
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 } });
  const page = await ctx.newPage();
  await page.goto('file:///path/to/og-template.html');
  await page.waitForTimeout(3000); // let animations settle
  await page.screenshot({ path: 'output-og.png' });
  await browser.close();
})();
```
**⚠️ Use `browser.newContext()` then `ctx.newPage()` — NOT `browser.newPage()` directly (crashes).**

### OG Image Design Pattern
Create a separate `THING-og.html` file just for the OG screenshot:
- Fixed 1200×630 body, no scroll
- Title text 60-96px
- Subtitle 20-28px
- Bold visual element (glow, shape, color)
- Small "🔮 Amber" branding bottom-right
- Dark background — but ensure contrast (don't blend with dark mode UIs)

## Web Audio API

### AudioContext Gotcha
```javascript
// AudioContext REQUIRES user gesture to start on most browsers
document.addEventListener('click', () => {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  // now you can play
}, { once: true });
```
- Safari: especially strict about this
- Show a "tap to start" hint if audio is core to the experience

### Basic Oscillator Pattern
```javascript
const osc = ctx.createOscillator();
const gain = ctx.createGain();
osc.connect(gain);
gain.connect(ctx.destination);
osc.frequency.value = 440;
gain.gain.setValueAtTime(0.3, ctx.currentTime);
gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
osc.start();
osc.stop(ctx.currentTime + 1);
```

### D Minor Pentatonic (most used scale)
```javascript
const NOTES = [146.83, 174.61, 196.00, 220.00, 261.63, 293.66, 349.23, 392.00, 440.00];
```

## Deploy Timing

### Railway deploys take ~12-18 minutes after git push
- **NEVER tweet immediately after pushing code**
- Use cron-then-poll approach (see below)

### Cron-Then-Poll Tweet Pattern
After pushing code:
1. Schedule a cron ~12 min out
2. Cron task: fetch live URL, check 200, retry up to 10× with 30s sleep
3. Once confirmed live, post the tweet

```
openclaw cron add --once --in 12m --task "Fetch https://intheamber.com/amber/THING.html — if 200, tweet: [text]. If not live, retry every 30s up to 10 times."
```

## Tweet Posting
```bash
cd /Users/admin/code/vibeceo/sms-bot && node amber-tweet.mjs "tweet text here"
```
**⚠️ This script posts ANYTHING you pass as arg. No --help, no --recent. Just the text.**

## SendGrid Email
```javascript
// Always use .cjs or inline require(), not ESM import
require('dotenv').config({ path: '/Users/admin/code/vibeceo/sms-bot/.env.local' });
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
```

## Common Mistakes Log
- [ ] Accidentally tweeted "--recent" as a literal tweet (amber-tweet.mjs has no flags)
- [ ] Used browser.newPage() instead of browser.newContext().newPage() — crashes Playwright
- [ ] Forgot OG image on first deploy — always add OG in same commit as HTML
- [ ] Screenshotted full page instead of making dedicated OG template — unreadable at thumbnail size
