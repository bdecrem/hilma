// Builds player.html — a standalone web page that plays the composition in
// real time without the HyperFrames runtime. It inlines script.js, the
// composition's CSS, markup and script from index.html, and the two fonts as
// data URIs, so the page is one self-contained file plus GSAP from a CDN.
//   node build-player.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')
const b64 = (p) => readFileSync(join(here, p)).toString('base64')

const index = read('index.html')
const script = read('script.js')
const S = new Function(`const window = {}; ${script}; return window.SCRIPT`)()

// The composition's own CSS, minus the page-level reset and html/body sizing.
let css = index.match(/<style>([\s\S]*?)<\/style>/)[1]
css = css.replace(/\s*\* \{[^}]*\}/, '').replace(/\s*html, body \{[^}]*\}/, '')
const root = index.match(/(<div id="root"[\s\S]*?<\/div>)\s*<script>/)[1]
const comp = index.match(/<\/div>\s*<script>([\s\S]*?)<\/script>\s*<\/body>/)[1]

const fonts = `
@font-face { font-family: 'Bricolage'; font-weight: 200 800; font-display: block; src: url(data:font/woff2;base64,${b64('assets/fonts/bricolage.woff2')}) format('woff2'); }
@font-face { font-family: 'JBMono'; font-weight: 400 800; font-display: block; src: url(data:font/woff2;base64,${b64('assets/fonts/jbmono.woff2')}) format('woff2'); }`

const total = S.scenes.reduce((a, s) => a + s.duration, 0)
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const names = { ask: 'The question', circles: 'Circles', grid: 'The rescaled grid', ceiling: 'The ceiling', exact: 'Exact values', result: 'May 2026', gap: 'The gap' }
let at = 0
const chapters = S.scenes.map((s) => { const c = { id: s.id, start: at, name: names[s.id] ?? s.id }; at += s.duration; return c })

const page = `<title>${S.title.replace(/\b\w/g, (c) => c.toUpperCase())}</title>
<style>
  /* Layout: one stage scaled to the viewport width, a chapter strip under it. */
  :root {
    --bg: #fbf7ee; --fg: #16121c; --muted: #6f6a63; --line: #e4dccb; --accent: #ff4b1f;
    --font-display: 'Bricolage', 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif;
    --font-mono: 'JBMono', 'JetBrains Mono', ui-monospace, Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #141217; --fg: #f3eee2; --muted: #a39d93; --line: #2b272f; --accent: #ff6a45; color-scheme: dark } }
  :root[data-theme="dark"] { --bg: #141217; --fg: #f3eee2; --muted: #a39d93; --line: #2b272f; --accent: #ff6a45; color-scheme: dark }
  ${fonts}
  body { background: var(--bg); color: var(--fg); font-family: var(--font-display); }
  .page { max-width: 1280px; margin: 0 auto; padding-inline: 16px; padding-block: 28px 48px; }
  .head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 24px; margin-bottom: 18px; }
  .head h1 { font-size: 28px; font-weight: 700; letter-spacing: -.02em; text-wrap: balance; }
  .head p { font-size: 15px; color: var(--muted); }
  .wrap { position: relative; width: 100%; aspect-ratio: 16 / 9; max-width: 100%; overflow: hidden; border-radius: 6px; background: #f7efdf; cursor: pointer; }
  .stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; transform-origin: top left; }
  .wrap .end { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(22,18,28,.42); color: #f7efdf; font-family: var(--font-mono); font-weight: 600; font-size: clamp(14px, 2vw, 22px); letter-spacing: .1em; text-transform: uppercase; opacity: 0; transition: opacity .3s; pointer-events: none; }
  .wrap.done .end { opacity: 1; }
  .bar { height: 4px; background: var(--line); margin-top: 14px; border-radius: 2px; overflow: hidden; }
  .bar i { display: block; height: 100%; width: 0; background: var(--accent); }
  .chapters { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 14px; font-family: var(--font-mono); font-size: 13px; }
  .chapters button { all: unset; cursor: pointer; color: var(--muted); padding: 4px 0; border-bottom: 2px solid transparent; }
  .chapters button b { font-weight: 600; color: var(--fg); margin-right: 6px; font-variant-numeric: tabular-nums; }
  .chapters button:hover, .chapters button:focus-visible { border-bottom-color: var(--accent); outline: none; }
  .chapters button.on { border-bottom-color: var(--accent); color: var(--fg); }
  .about { margin-top: 22px; font-size: 14px; color: var(--muted); max-width: 65ch; line-height: 1.5; }
  ${css}
</style>
<div class="page">
  <div class="head">
    <h1>${S.title} — the unit distance problem in ${Math.round(total)} seconds</h1>
    <p>Click the picture to replay. ${S.width}×${S.height}, ${S.fps} fps.</p>
  </div>
  <div class="wrap" id="wrap">
    <div class="stage" id="stage-box">
      ${root}
    </div>
    <div class="end" id="end">Replay</div>
  </div>
  <div class="bar"><i id="bar"></i></div>
  <div class="chapters" id="chapters">${chapters.map((c) => `<button type="button" data-start="${c.start}" data-id="${c.id}"><b>${mmss(c.start)}</b>${c.name}</button>`).join('')}</div>
  <p class="about">Every fact is from the Dodo topic “Unit Distance problem”. The animation is code: all words, numbers and timings live in one script, and the same file renders the MP4.</p>
</div>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<script>${script}</script>
<script>${comp}</script>
<script>
  (() => {
    const tl = window.__timelines.main
    const root = document.getElementById('root')
    const wrap = document.getElementById('wrap'), box = document.getElementById('stage-box')
    const bar = document.getElementById('bar'), chapters = [...document.querySelectorAll('#chapters button')]
    const clips = [...root.querySelectorAll('[data-start]')]
    const TOTAL = tl.duration()
    const fit = () => { box.style.transform = 'scale(' + wrap.clientWidth / ${S.width} + ')' }
    const sync = () => {
      const t = tl.time()
      for (const c of clips) {
        const s = +c.dataset.start, d = +c.dataset.duration
        c.style.visibility = t >= s && t < s + d ? 'visible' : 'hidden'
      }
      bar.style.width = (t / TOTAL) * 100 + '%'
      let cur = null
      for (const b of chapters) if (t >= +b.dataset.start) cur = b
      for (const b of chapters) b.classList.toggle('on', b === cur)
      wrap.classList.toggle('done', t >= TOTAL - 0.001)
    }
    tl.eventCallback('onUpdate', sync)
    tl.eventCallback('onComplete', sync)
    window.addEventListener('resize', fit)
    fit(); sync()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) { tl.seek(TOTAL - 0.01); sync(); wrap.classList.add('done') } else tl.play()
    wrap.addEventListener('click', () => { tl.restart() })
    for (const b of chapters) b.addEventListener('click', () => { tl.seek(+b.dataset.start); tl.play() })
  })()
</script>
`
writeFileSync(join(here, 'player.html'), page)
console.log('player.html', (page.length / 1024).toFixed(0) + ' KB')
