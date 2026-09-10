// bartin16.xyz — "Small wonders". One sans voice (Inter Tight) on warm paper, the three
// photo objects linking straight out to the projects. Styles live in `_alts/styles.ts`
// under `.edition-three`, shared with the /hi/alt4 draft.
const FLOW = `<main class="three-main">
  <h1 class="three-title">Hey, I’m Bart.</h1>
  <div class="three-letter" aria-label="I like making learning stick, machines sing, and old things new again.">
    <div class="letter-line"><span>I like making</span></div>
    <div class="letter-line"><a class="inline-object inline-dodo" href="https://dodo.foo" target="_blank" rel="noopener" aria-label="Dodo — dodo.foo"><img class="inline-front" src="/hi/alts/assets/dodo-peck.png" alt="Dodo’s playful Peck learning path"><img class="inline-back" src="/hi/alts/assets/dodo-topics.png" alt="Dodo’s topics library"><span class="object-index mono">dodo.foo ↗</span></a><span>learning <em>stick,</em></span></div>
    <div class="letter-line"><span>machines</span><a class="inline-object inline-jam" href="https://jambot.to" target="_blank" rel="noopener" aria-label="Jambot — jambot.to"><img class="inline-front" src="/hi/alts/assets/jambot-controls.png" alt="Jambot synth controls"><img class="inline-back" src="/hi/alts/assets/jambot-tracks.png" alt="Jambot track sequencers"><span class="object-index mono">jambot.to ↗</span></a><span><em>sing,</em></span></div>
    <div class="letter-line"><span>and old things</span><a class="inline-object inline-mac" href="https://github.com/bdecrem/Macinclaude/blob/main/README.md" target="_blank" rel="noopener" aria-label="Macinclaude on GitHub"><img src="/hi/alts/assets/mac-plus.jpg" alt="The Macintosh Plus on Bart’s desk"><span class="object-index mono">macinclaude ↗</span></a></div>
    <div class="letter-line last-letter"><span><em>new again.</em></span></div>
  </div>
  @@BIO@@
</main>
<footer class="three-footer">@@LINKS@@<a href="https://decremental.substack.com" target="_blank" rel="noopener">Substack</a><a href="https://linkedin.com/in/bartdecrem" target="_blank" rel="noopener">LinkedIn</a><a href="https://x.com/bartdecrem" target="_blank" rel="noopener">X</a></footer>`

// bartin16.xyz keeps the email and phone number in the paragraph; decremental.com
// swaps them for a message form (posts to /api/contact).
// bartin16.xyz keeps the email and phone number in the paragraph.
export const body = FLOW
  .replace('@@LINKS@@', `<a href="/hi/about">About me</a><a href="https://decremental.com/projects" target="_blank" rel="noopener">decremental.com</a>`)
  .replace('@@BIO@@', `<div class="three-bottom"><div class="three-bio"><p>This year I’m at CASBS, exploring AI × human flourishing.</p><p>My door is open. Swing by room 16, especially if you want to talk AI &amp; your work. I’m at <a href="mailto:bdecrem@gmail.com">bdecrem@gmail.com</a> or <a href="sms:6508989508">650-898-9508</a>.</p></div></div>`)

// decremental.com: one line, and the message form lives behind "talk to you" in a dialog.
export const bodyWithForm = FLOW
  .replace('@@LINKS@@', `<a href="/hi/about">More about me</a><a href="https://decremental.com/projects">All my AI projects</a>`)
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
  <div class="three-letter" aria-label="I like making learning stick, machines sing, and old things new again.">
    <div class="letter-line"><span>I like making</span>${DODO}<span>learning <em>stick,</em></span></div>
    <div class="letter-line"><span>machines</span>${JAM}<span><em>sing,</em> and old things</span></div>
    <div class="letter-line last-letter">${MAC}<span><em>new again.</em></span></div>
  </div>
</main>`

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
