import { alternateDocument } from '../_alts/document'

// Small wonders — draft homepage. One sans voice (Inter Tight) on warm paper,
// emphasis carried by colour instead of a second serif family; the three
// photo objects link straight out to the projects.
export const body = `<header class="three-header"><a href="/hi">Bart Decrem<span> / </span>16</a><span class="mono">A FEW THINGS<br>THAT MAKE ME TICK.</span><a href="mailto:bdecrem@gmail.com">Say hello ↗</a></header>
<main class="three-main">
  <h1 class="three-title">Hey, I’m <em>Bart.</em></h1>
  <div class="three-letter" aria-label="I like making learning stick, machines sing, and old things new again.">
    <div class="letter-line"><span>I like making</span><span class="letter-aside mono">SMALL EXPERIMENTS.<br>OPEN POSSIBILITIES.</span></div>
    <div class="letter-line"><a class="inline-object inline-dodo" href="https://dodo.foo" target="_blank" rel="noopener" aria-label="Dodo — dodo.foo"><img class="inline-front" src="/hi/alts/assets/dodo-peck.png" alt="Dodo’s playful Peck learning path"><img class="inline-back" src="/hi/alts/assets/dodo-topics.png" alt="Dodo’s topics library"><span class="object-index mono">dodo.foo ↗</span></a><span>learning <em>stick,</em></span></div>
    <div class="letter-line"><span>machines</span><a class="inline-object inline-jam" href="https://jambot.to" target="_blank" rel="noopener" aria-label="Jambot — jambot.to"><img class="inline-front" src="/hi/alts/assets/jambot-controls.png" alt="Jambot synth controls"><img class="inline-back" src="/hi/alts/assets/jambot-tracks.png" alt="Jambot track sequencers"><span class="object-index mono">jambot.to ↗</span></a><span><em>sing,</em></span></div>
    <div class="letter-line"><span>and old things</span><a class="inline-object inline-mac" href="https://github.com/bdecrem/Macinclaude" target="_blank" rel="noopener" aria-label="Macinclaude on GitHub"><img src="/hi/alts/assets/mac-plus.jpg" alt="The Macintosh Plus on Bart’s desk"><span class="object-index mono">macinclaude ↗</span></a></div>
    <div class="letter-line last-letter"><span><em>new again.</em></span><span class="letter-period" aria-hidden="true">✳</span></div>
  </div>
  <div class="three-bottom"><div class="three-bio"><p>This year I’m at CASBS, exploring AI × human flourishing.</p><p>My door is open. Swing by room 16, especially if you want to talk AI &amp; your work.</p><a href="mailto:bdecrem@gmail.com">bdecrem@gmail.com ↗</a></div></div>
</main>
<footer class="three-footer"><a href="sms:6508989508">650 898 9508</a><a href="/hi/about">About me</a><a href="https://decremental.com" target="_blank" rel="noopener">decremental.com ↗</a><a href="https://decremental.substack.com" target="_blank" rel="noopener">Substack ↗</a><a href="https://linkedin.com/in/bartdecrem" target="_blank" rel="noopener">LinkedIn ↗</a><a href="https://x.com/bartdecrem" target="_blank" rel="noopener">X ↗</a></footer>
<nav class="edition-nav" aria-label="Alternate homepage designs"><a class="edition-label" href="/hi">HOME /</a><a href="/hi/alt3" aria-current="page" title="Small wonders">03</a><a href="/hi/alt4" title="Room for play">04</a></nav>`

export const html = alternateDocument({
  title: "Bart in 16 — Small wonders",
  description: "Learning, making music, and giving old things a new life. Bart Decrem at CASBS.",
  bodyClass: "edition-three",
  body,
})
