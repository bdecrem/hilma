// bartin16.xyz — "Small wonders". One sans voice (Inter Tight) on warm paper, the three
// photo objects linking straight out to the projects. Styles live in `_alts/styles.ts`
// under `.edition-three`, shared with the /hi/alt4 draft.
const FLOW = `<main class="three-main">
  <h1 class="three-title">Hey, I’m Bart.</h1>
  <div class="three-letter" aria-label="I like making ideas stick, machines jam, and old Macs think again.">
    <div class="letter-line"><span>I like making</span></div>
    <div class="letter-line"><a class="inline-object inline-dodo" href="https://dodo.foo" target="_blank" rel="noopener" aria-label="Dodo — dodo.foo"><img class="inline-front" src="/hi/alts/assets/dodo-peck.png" alt="Dodo’s playful Peck learning path"><img class="inline-back" src="/hi/alts/assets/dodo-topics.png" alt="Dodo’s topics library"><span class="object-index mono">dodo.foo ↗</span></a><span>ideas <em>stick,</em></span></div>
    <div class="letter-line"><span>machines</span><a class="inline-object inline-jam" href="https://jambot.to" target="_blank" rel="noopener" aria-label="Jambot — jambot.to"><img class="inline-front" src="/hi/alts/assets/jambot-controls.png" alt="Jambot synth controls"><img class="inline-back" src="/hi/alts/assets/jambot-tracks.png" alt="Jambot track sequencers"><span class="object-index mono">jambot.to ↗</span></a><span><em>jam,</em></span></div>
    <div class="letter-line"><span>and old Macs</span><span class="mac-slot"><a class="inline-object inline-mac" href="https://github.com/bdecrem/Macinclaude/blob/main/README.md" target="_blank" rel="noopener" aria-label="Macinclaude on GitHub"><img src="/hi/alts/assets/mac-plus.jpg" alt="The Macintosh Plus on Bart’s desk"><span class="object-index mono">macinclaude ↗</span></a><a class="object-alt mono" href="/hi/alts/assets/mac-plus.jpg" target="_blank" rel="noopener">full photo ↗</a></span></div>
    <div class="letter-line last-letter"><span><em>think again.</em></span></div>
  </div>
  @@BIO@@
</main>
<footer class="three-footer">@@LINKS@@<span class="foot-sep" aria-hidden="true">|</span> <a href="https://decremental.substack.com" target="_blank" rel="noopener">Substack</a><span class="foot-sep" aria-hidden="true">|</span> <a href="https://linkedin.com/in/bartdecrem" target="_blank" rel="noopener">LinkedIn</a><span class="foot-sep" aria-hidden="true">|</span> <a href="https://x.com/bartdecrem" target="_blank" rel="noopener">X</a></footer>`

// bartin16.xyz keeps the email and phone number in the paragraph; decremental.com
// swaps them for a message form (posts to /api/contact).
// bartin16.xyz is just the invitation plus the email and phone number; decremental.com
// keeps the CASBS line and puts the message form behind “talk to you”.
export const body = FLOW
  .replace('@@LINKS@@', `<a href="/hi/about">About me</a><span class="foot-sep" aria-hidden="true">|</span> <a href="https://decremental.com/projects" target="_blank" rel="noopener">decremental.com</a>`)
  .replace('@@BIO@@', `<div class="three-bottom"><div class="three-bio"><p>Come say hi, especially if you want to talk AI &amp; your work. I’m at <a href="mailto:bdecrem@gmail.com">bdecrem@gmail.com</a> or <a href="sms:6508989508">650-898-9508</a>.</p></div></div>`)

// decremental.com: one line, and the message form lives behind "talk to you" in a dialog.
export const bodyWithForm = FLOW
  .replace('@@LINKS@@', `<a href="/hi/about">More about me</a><span class="foot-sep" aria-hidden="true">|</span> <a href="https://decremental.com/projects">All my AI projects</a>`)
  .replace('@@BIO@@', `<div class="three-bottom"><div class="three-bio"><p>This year I’m at <a href="https://casbs.stanford.edu/" target="_blank" rel="noopener">CASBS</a>, exploring AI × human flourishing. Would love to <button type="button" class="talk-link" data-note>talk to you</button> if you’re into that.</p></div></div>`)
  + `
<dialog class="note-dialog">
  <button type="button" class="note-close" data-note-close aria-label="Close">×</button>
  <form class="three-form" novalidate>
    <p class="form-label">Shoot me a message</p>
    <textarea class="form-field" name="message" rows="3" placeholder="what’s on your mind" required></textarea>
    <div class="form-foot"><a class="form-send" href="mailto:bdecrem@gmail.com?subject=Hello%20from%20decremental.com">Send</a><span class="form-hint">opens your mail app</span></div>
  </form>
</dialog>`

// A landscape poster of the same sentence, rendered at /hi/card and screenshotted into
// the LinkedIn image. The three photo objects are lifted straight out of FLOW so they can
// never drift from the page; only the line breaks change, because a 16:9 frame wants three
// wide lines where the page wants five narrow ones.
const OBJECTS = FLOW.match(/<a class="inline-object[\s\S]*?<\/a>/g) as string[]
const [DODO, JAM, MAC] = OBJECTS

export const cardBody = `<main class="three-main">
  <div class="three-letter" aria-label="I like making ideas stick, machines jam, and old Macs think again.">
    <div class="letter-line"><span>I like making</span>${DODO}<span>ideas <em>stick,</em></span></div>
    <div class="letter-line"><span>machines</span>${JAM}<span><em>jam,</em> and old Macs</span></div>
    <div class="letter-line last-letter">${MAC}<span><em>think again.</em></span></div>
  </div>
</main>`

// Touch only: the first tap on a photo lifts it to the middle of the screen at ~3x with
// its address showing, over a scrim. Tapping the open photo again follows the link; the
// scrim, Escape, a scroll or a resize put it back. Devices with a real pointer keep the
// hover behaviour and never run any of this.
export const objectsScript = `
if (window.matchMedia('(hover: none)').matches) {
  const objects = [...document.querySelectorAll('.inline-object')]
  const scrim = document.createElement('div')
  scrim.className = 'obj-scrim'
  document.body.appendChild(scrim)
  let open = null

  const close = () => {
    if (!open) return
    open.classList.remove('is-open')
    open.removeAttribute('aria-expanded')
    open.style.removeProperty('--ox')
    open.style.removeProperty('--oy')
    open.style.removeProperty('--ok')
    open = null
    scrim.classList.remove('on')
  }

  const openIt = el => {
    close()
    const r = el.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    // as big as fits, capped at 3.2x, then drift to the middle of the screen
    const k = Math.min(3.2, (vw * 0.82) / r.width, (vh * 0.56) / r.height)
    // Each object's photos sit differently inside its box, and they shift again when the
    // open state fans them out, so read the open arrangement first (unscaled) and hang the
    // address off the photos' real bottom edge.
    el.classList.add('is-measuring')
    const photoBottom = Math.max(...[...el.querySelectorAll('img')].map(i => i.getBoundingClientRect().bottom))
    el.classList.remove('is-measuring')
    el.style.setProperty('--otag', (photoBottom - r.top).toFixed(1) + 'px')
    el.style.setProperty('--ok', k.toFixed(3))
    el.style.setProperty('--ox', Math.round(vw / 2 - (r.left + r.width / 2)) + 'px')
    el.style.setProperty('--oy', Math.round(vh * 0.44 - (r.top + r.height / 2)) + 'px')
    el.classList.add('is-open')
    el.setAttribute('aria-expanded', 'true')
    scrim.classList.add('on')
    open = el
  }

  objects.forEach(el => el.addEventListener('click', e => {
    if (open === el) return          // second tap follows the link
    e.preventDefault()
    openIt(el)
  }))

  scrim.addEventListener('click', close)
  document.addEventListener('click', e => {
    if (open && !open.contains(e.target)) close()
  }, true)
  window.addEventListener('scroll', close, { passive: true })
  window.addEventListener('resize', close)
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close() })
}
`

export const formScript = `
const dialog = document.querySelector('.note-dialog')
const form = dialog && dialog.querySelector('.three-form')
if (form) {
  const box = form.querySelector('textarea')
  const send = form.querySelector('.form-send')
  const base = 'mailto:bdecrem@gmail.com?subject=' + encodeURIComponent('Hello from decremental.com')
  const sync = () => {
    box.style.height = 'auto'
    box.style.height = box.scrollHeight + 'px'
    const message = box.value.trim()
    send.href = message ? base + '&body=' + encodeURIComponent(message) : base
  }
  box.addEventListener('input', sync)
  form.addEventListener('submit', e => { e.preventDefault(); send.click() })
  document.querySelectorAll('[data-note]').forEach(el => el.addEventListener('click', () => {
    dialog.showModal()
    box.focus()
  }))
  dialog.querySelector('[data-note-close]').addEventListener('click', () => dialog.close())
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close() })
}
`
