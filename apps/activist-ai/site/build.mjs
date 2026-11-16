#!/usr/bin/env node
// Builds Ola's landing page into the repo's public/ola-site/ (served at ola.cx/ by a host rewrite of
// / to /ola-site/index.html): index.html, 404.html, icons, the share card, site.webmanifest, fonts.
//   node build.mjs            the pages (fast, no browser)
//   node build.mjs --images   also the PNG icons and the share card, rendered with Playwright
// The drawing lives in src/drawing.mjs, the signature in signature.svg, the fonts come from
// src/fonts.py. No page loads anything from another origin; check.mjs proves it.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { word, mark, ulURI, BTN, scene, T, cr } from './src/drawing.mjs'

// The two places the address lives. SITE_URL is the public address (canonical, og:url, og:image);
// BASE is the path the files are served from. Every asset URL is absolute under BASE, because the
// page itself is served at / by a rewrite, where relative URLs would point at the wrong folder.
const SITE_URL = 'https://ola.cx'
const BASE = '/ola-site/'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, '../../..', 'public', BASE.replace(/^\/|\/$/g, ''))

// ---------- copy ----------
const TITLE = 'Ola: a private AI agent for activists and academics'
const DESCRIPTION = 'An AI agent for activists and academics that works with your documents and data, and writes the code to do it, on one computer that never shares your work. By invitation, from December 2026.'
const MAILTO = 'mailto:hello@ola.cx?subject=An%20invitation%20to%20Ola'
const SCENE_LABEL = 'Drawing: a small computer on a desk in a study at night, with a paper tag reading Ola tied to it. A desk lamp bends over it, and its cable runs to the wall socket. Around it: books on a shelf and on the desk, a trailing plant, a mug, a wastepaper basket, and a window with the moon over the rooftops.'

// ---------- the signature slot: signature.svg, viewBox 0 0 160 70, one color ----------
const sigSrc = fs.readFileSync(path.join(HERE, 'signature.svg'), 'utf8')
const SIG_VB = sigSrc.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 160 70'
const SIG_INNER = sigSrc.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/fill="(?!none|currentColor)[^"]*"/g, 'fill="currentColor"').trim()
const signature = () => `<svg class="sig" viewBox="${SIG_VB}" role="img" aria-label="Bart">${SIG_INNER.includes('fill="currentColor"') ? SIG_INNER : `<g fill="currentColor">${SIG_INNER}</g>`}</svg>`

// ---------- shared head and styles ----------
const xmlns = (svg) => svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
const grain = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='8'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${T.grain} 0'/></filter><rect width='100%' height='100%' filter='url(#g)'/></svg>`)}")`

const fontFaces = (base) => `
@font-face{font-family:'Bricolage Grotesque';src:url(${base}fonts/bricolage.woff2) format('woff2');font-weight:650 720;font-style:normal;font-display:swap}
@font-face{font-family:'Literata';src:url(${base}fonts/literata.woff2) format('woff2');font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:'Literata';src:url(${base}fonts/literata-italic.woff2) format('woff2');font-weight:400;font-style:italic;font-display:swap}`
const preload = (base, files) => files.map((f) => `<link rel="preload" href="${base}fonts/${f}.woff2" as="font" type="font/woff2" crossorigin>`).join('\n')

const ROOT_CSS = `:root{--ground:${T.ground};--text:${T.text};--text2:${T.text2};--word:${T.word};--comma:${T.comma};--link:${T.link};--btn:${T.btn};--btn-text:${T.btnText};--btn-hover:${T.btnHover};--btn-hover-text:${T.btnHoverText};--grot:'Bricolage Grotesque',system-ui,sans-serif;--book:'Literata',Georgia,serif;color-scheme:dark}
*{box-sizing:border-box}
html{background:var(--ground);-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;min-height:100dvh;background:var(--ground) ${grain};color:var(--text);font-family:var(--book);font-size:17.5px;line-height:1.55;-webkit-font-smoothing:antialiased;font-variant-numeric:oldstyle-nums;overflow-x:hidden;
  padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}
a:focus-visible{outline:2px solid var(--link);outline-offset:3px;border-radius:3px}
.paint{position:relative;display:inline-flex;align-items:center;justify-content:center;min-width:262px;height:62px;padding:0 34px;color:var(--btn-text);text-decoration:none;font-family:var(--grot);font-weight:650;font-size:18.5px;letter-spacing:-.005em;-webkit-tap-highlight-color:transparent}
.paint svg{position:absolute;inset:0;width:100%;height:100%;fill:var(--btn);transition:fill .16s ease,transform .22s cubic-bezier(.3,1.6,.5,1)}
.paint span{position:relative;transition:transform .22s cubic-bezier(.3,1.6,.5,1)}
.paint:hover{color:var(--btn-hover-text)}
.paint:hover svg{fill:var(--btn-hover);transform:rotate(-1.2deg) scale(1.025)}
.paint:hover span{transform:translateX(2px)}
.paint:active svg{transform:rotate(-.4deg) scale(.985);transition-duration:.06s}
.paint:focus-visible{outline:none;color:var(--btn-text)}
.paint:focus-visible svg{fill:var(--link)}
.paint:focus-visible::after{content:"";position:absolute;left:4px;right:4px;bottom:-9px;height:7px;background:${ulURI(T.link)} center/100% 100% no-repeat}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{transition:none!important;animation:none!important}
  .paint:hover svg,.paint:hover span,.paint:active svg{transform:none}
}`

const head = ({ title, description, base, canonical, fonts, css, extra = '' }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="theme-color" content="${T.ground}">
<meta name="color-scheme" content="dark">
<meta name="referrer" content="no-referrer">
${canonical ? `<link rel="canonical" href="${canonical}">\n` : ''}<link rel="icon" href="${base}favicon.svg" type="image/svg+xml">
<link rel="icon" href="${base}favicon-32.png" sizes="32x32" type="image/png">
<link rel="icon" href="${base}favicon-16.png" sizes="16x16" type="image/png">
<link rel="apple-touch-icon" href="${base}apple-touch-icon.png">
<link rel="manifest" href="${base}site.webmanifest">
${extra}${preload(base, fonts)}
<style>${fontFaces(base)}
${ROOT_CSS}
${css}
</style>
</head>`

const btn = (text, href) => `<a class="paint" href="${href}"><svg viewBox="0 0 302 68" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${BTN}"/></svg><span>${text}</span></a>`

// ---------- the landing page ----------
// One drawing in the DOM. On a desk it sits to the right of the letter; on a phone the
// letter's box dissolves (display:contents) and the drawing is ordered in under the name.
const LANDING_CSS = `
.page{max-width:1360px;min-height:100dvh;margin:0 auto;padding:26px 0 26px 56px;display:grid;grid-template-columns:minmax(0,540px) minmax(0,1fr);grid-template-rows:auto 1fr;column-gap:40px}
.date{grid-column:1/-1;padding-right:56px;display:flex;justify-content:space-between;align-items:baseline;gap:16px;font-style:italic;font-size:15px;color:var(--text2);margin:0;max-width:none;font-variant-numeric:lining-nums}
.date a{color:var(--text);text-decoration:none;font-style:normal;font-family:var(--grot);font-weight:650;letter-spacing:.01em}
.date a:hover{color:var(--link)}
.letter{grid-column:1;grid-row:2;align-self:center;padding:4px 0}
.hello{display:block;width:236px;height:auto;margin:0 0 14px -7px;overflow:visible}
h1{margin:0 0 16px;font-weight:400}
h1 .h{display:block;font-family:var(--grot);font-weight:720;font-size:37px;line-height:1.06;letter-spacing:-.028em;max-width:14em;text-wrap:balance;font-variation-settings:'opsz' 72}
h1 .k{display:block;font-family:var(--book);font-size:20.5px;line-height:1.45;margin-top:10px;max-width:26em;text-wrap:pretty}
p{margin:0 0 12px;max-width:34em;text-wrap:pretty}
.sig{width:116px;height:auto;display:block;margin:0 0 4px -2px;color:var(--word)}
.ps{font-size:15.5px;line-height:1.5;color:var(--text2);margin:0 0 22px;max-width:35em}
.ps b{font-family:var(--grot);color:var(--text);font-weight:700;margin-right:.15em}
.act{display:flex;align-items:center;flex-wrap:wrap;gap:12px 22px}
.act small{font-size:15px;color:var(--text2)}
.act small a{color:var(--text);text-underline-offset:3px;text-decoration-color:var(--comma);text-decoration-thickness:1.5px}
.act small a:hover{color:var(--link);text-decoration-color:var(--link)}
.art{grid-column:2;grid-row:2;margin:0;align-self:end;display:flex;flex-direction:column;align-items:flex-end;min-width:0}
.art svg{display:block;width:100%;max-width:720px;max-height:calc(100dvh - 100px);height:auto}
figcaption{font-style:italic;font-size:14.5px;color:var(--text2);margin-top:4px;align-self:flex-start;padding-left:3%}
@media (max-width:900px){
  body{font-size:17px}
  .page{display:flex;flex-direction:column;padding:18px 20px 40px}
  .letter{display:contents}
  .date{order:0;font-size:13px;padding-right:0}
  .hello{order:1;align-self:flex-start;width:172px;margin-top:20px}
  .art{order:2;display:block;align-self:stretch;margin:0 -6px 18px}
  .art svg{width:100%;max-width:none;max-height:none}
  .art figcaption{padding-left:6px;margin-top:2px;font-size:14px}
  .art .wide{display:none}
  h1,.letter>p,.sig,.act{order:3}
  h1 .h{font-size:29px}
  h1 .k{font-size:19px}
  .sig{width:92px}
  .paint{min-width:100%}
}
/* large screens: the same letter, a size up (about ×1.13), so it does not float small in a big field */
@media (min-width:1680px) and (min-height:960px){
  body{font-size:19.5px}
  .page{max-width:1560px;padding:32px 0 32px 64px;grid-template-columns:minmax(0,610px) minmax(0,1fr);column-gap:48px}
  .date{font-size:16.5px;padding-right:64px}
  .hello{width:268px;margin-bottom:16px}
  h1 .h{font-size:42px}
  h1 .k{font-size:23px}
  .sig{width:132px}
  .ps{font-size:17.5px}
  .act small{font-size:17px}
  .paint{min-width:296px;height:70px;font-size:20.5px}
  .art svg{max-width:840px;max-height:calc(100dvh - 116px)}
  figcaption{font-size:16px}
}
/* tablets: the phone's order, the desk's type, and a drawing that leaves the opening in view */
@media (min-width:601px) and (max-width:900px){
  body{font-size:17.5px}
  .page{max-width:680px;margin:0 auto;padding:26px 32px 48px}
  .date{font-size:15px}
  .hello{width:236px;margin:20px 0 6px -7px}
  .art{margin:0 0 24px}
  .art svg{width:min(100%,calc(56dvh * 600 / 586));margin-left:auto}
  .art figcaption{font-size:14.5px}
  h1 .h{font-size:37px}
  h1 .k{font-size:20.5px}
  .sig{width:116px}
  .paint{min-width:262px}
}`

function landing() {
  return `${head({ title: TITLE, description: DESCRIPTION, base: BASE, canonical: `${SITE_URL}/`, fonts: ['literata', 'literata-italic', 'bricolage'], css: LANDING_CSS, extra: `<meta property="og:type" content="website">
<meta property="og:site_name" content="Ola">
<meta property="og:url" content="${SITE_URL}/">
<meta property="og:title" content="${TITLE}">
<meta property="og:description" content="${DESCRIPTION}">
<meta property="og:image" content="${SITE_URL}${BASE}og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Ola, a private AI agent for activists and academics, beside a drawing of a small computer on a desk at night under a lamp.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${TITLE}">
<meta name="twitter:description" content="${DESCRIPTION}">
<meta name="twitter:image" content="${SITE_URL}${BASE}og.png">
` })}
<body>
<main class="page">
  <p class="date"><span>From Bart Decrem’s office, November 2026</span><a href="/">ola.cx</a></p>
  <div class="letter">
    ${word('display', { cls: 'hello', label: 'Ola' })}
    <h1><span class="h">An AI agent for activists and academics</span> <span class="k">that works with your documents and data, and writes the code to do it, on one computer that never shares your work.</span></h1>
    <p>It reads what you give it, builds the small websites, databases and analyses you ask for, and runs on open models on a computer that I own and look after in my office, so no AI company sees your work. It opens in December, by invitation, to five to ten people.</p>
    ${signature()}
    <p class="ps"><b>P.S.</b> You would be trusting me, a person, not a proof: Ola is not built to stand up to a government that targets you. And open models trail the best closed ones, so it tells you, task by task, how well it is likely to do.</p>
    <div class="act">${btn('Ask for an invitation', MAILTO)}<small>or write to <a href="${MAILTO}">hello@ola.cx</a></small></div>
  </div>
  <figure class="art"><svg viewBox="0 26 600 586" role="img" aria-label="${SCENE_LABEL}">${scene(T)}</svg><figcaption>The computer, on my desk. Your files<span class="wide"> and the models</span> stay on it.</figcaption></figure>
</main>
</body>
</html>
`
}

// ---------- 404: the same study, the lamp off ----------
const OFF = { ...T, id: 'off', lampOff: true, bulb: '#cfc6b0', lit: '#3a4c78', sky: '#0f1d3b' }
const NOTFOUND_CSS = `
.nf{min-height:100dvh;max-width:600px;margin:0 auto;padding:26px 20px 40px;display:flex;flex-direction:column;justify-content:center;gap:10px}
.nf .hello{display:block;width:150px;height:auto;margin:0 0 4px -5px}
.nf svg.room{display:block;width:min(100%,calc((100dvh - 300px) * 600 / 586));min-width:min(100%,280px);height:auto;margin:0 0 8px}
.nf h1{margin:0;font-family:var(--grot);font-weight:720;font-size:29px;line-height:1.1;letter-spacing:-.024em;font-variation-settings:'opsz' 72;text-wrap:balance}
.nf a.home{align-self:flex-start;color:var(--text);font-size:17.5px;text-underline-offset:3px;text-decoration-color:var(--comma);text-decoration-thickness:1.5px}
.nf a.home:hover{color:var(--link);text-decoration-color:var(--link)}`
function notFound() {
  return `${head({ title: 'Not here · Ola', description: 'This page is not on the desk.', base: BASE, fonts: ['bricolage', 'literata'], css: NOTFOUND_CSS, extra: '<meta name="robots" content="noindex">\n' })}
<body>
<main class="nf">
  <a href="/" aria-label="Ola, home">${word('display', { cls: 'hello', label: 'Ola' }).replace('role="img" aria-label="Ola"', 'aria-hidden="true" focusable="false"')}</a>
  <svg class="room" viewBox="0 26 600 586" role="img" aria-label="The same study at night with the desk lamp switched off: the computer with its Ola tag, the plant, the mug, and the window over the dark rooftops.">${scene(OFF)}</svg>
  <h1>The lamp is off. There is nothing on this desk at that address.</h1>
  <a class="home" href="/">Back to the letter</a>
</main>
</body>
</html>
`
}

// ---------- the share card source, 1200 × 630, rendered by --images ----------
function ogCard(fontsDir) {
  const css = `
html,body{width:1200px;height:630px;overflow:hidden;padding:0}
.og{position:relative;width:1200px;height:630px;display:grid;grid-template-columns:470px 1fr;align-items:center;padding:0 0 0 76px}
.og .hello{display:block;width:380px;height:auto;margin:0 0 26px -10px;overflow:visible}
.og .tl{display:block;font-family:var(--grot);font-weight:650;font-size:33px;line-height:1.18;letter-spacing:-.012em;color:var(--text);font-variation-settings:'opsz' 36}
.og .tl span{color:var(--text2)}
.og .url{position:absolute;left:76px;bottom:44px;font-family:var(--book);font-style:italic;font-size:22px;color:var(--text2)}
.og svg.room{display:block;height:600px;width:auto;align-self:end;justify-self:end;margin:0 34px 4px 0}`
  return head({ title: 'Ola share card', description: '', base: fontsDir, fonts: [], css }) + `
<body><div class="og"><div>${word('display', { cls: 'hello', label: 'Ola' })}<span class="tl">A private AI agent<br><span>for activists and academics.</span></span></div>
<svg class="room" viewBox="0 26 600 586" aria-hidden="true">${scene(T)}</svg><span class="url">ola.cx</span></div></body></html>`
}

// ---------- icons ----------
const favicon = xmlns(mark(32, T))
const iconPage = (px, full) => `<!doctype html><html><body style="margin:0;background:transparent">${full ? mark(px, T).replace(/rx="[\d.]+"/, 'rx="0"') : mark(px, T)}</body></html>`
const manifest = {
  name: 'Ola',
  short_name: 'Ola',
  description: 'A private AI agent for activists and academics.',
  start_url: '/',
  scope: '/',
  display: 'browser',
  background_color: T.ground,
  theme_color: T.ground,
  icons: [
    { src: `${BASE}favicon.svg`, sizes: 'any', type: 'image/svg+xml' },
    { src: `${BASE}icon-192.png`, sizes: '192x192', type: 'image/png' },
    { src: `${BASE}icon-512.png`, sizes: '512x512', type: 'image/png' },
  ],
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'index.html'), landing())
fs.writeFileSync(path.join(OUT, '404.html'), notFound())
fs.writeFileSync(path.join(OUT, 'favicon.svg'), favicon + '\n')
fs.writeFileSync(path.join(OUT, 'site.webmanifest'), JSON.stringify(manifest, null, 2) + '\n')

const pairs = [['text on ground', T.text, T.ground], ['text2 on ground', T.text2, T.ground], ['button', T.btnText, T.btn], ['button hover', T.btnHoverText, T.btnHover], ['button focus', T.btnText, T.link], ['link hover', T.link, T.ground]]
console.log('contrast', pairs.map(([n, a, b]) => `${n} ${cr(a, b).toFixed(2)}`).join(' · '))
for (const f of ['index.html', '404.html']) console.log(f, (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1), 'KB')

if (process.argv.includes('--images')) {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  const tmp = fs.mkdtempSync(path.join(HERE, '.render-'))
  try {
    for (const [file, px, scale, full] of [['favicon-16.png', 16, 1], ['favicon-32.png', 32, 1], ['apple-touch-icon.png', 180, 1, true], ['icon-192.png', 192, 1, true], ['icon-512.png', 512, 1, true]]) {
      const src = path.join(tmp, `icon-${px}.html`)
      // 180 and up use the full-bleed tile: iOS and Android round the corners themselves
      fs.writeFileSync(src, iconPage(px <= 32 ? px : 180, full).replace(/width="\d+" height="\d+"/, `width="${px}" height="${px}"`))
      const page = await browser.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: scale })
      await page.goto(pathToFileURL(src).href)
      await page.locator('svg').screenshot({ path: path.join(OUT, file), omitBackground: true })
      await page.close()
    }
    const og = path.join(tmp, 'og.html')
    fs.writeFileSync(og, ogCard(pathToFileURL(OUT).href + '/'))
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
    await page.goto(pathToFileURL(og).href, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT, 'og.png') })
    await page.close()
  } finally {
    await browser.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  console.log('images written: favicons 16/32, apple-touch-icon 180, icons 192/512, og.png 1200×630')
}
