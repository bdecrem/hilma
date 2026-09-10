import { alternateDocument } from '../_alts/document'

export const body = `<header class="three-header"><a href="/hi">Bart Decrem<span> / </span>16</a><span class="mono">A FEW THINGS<br>THAT MAKE ME TICK.</span><a href="mailto:bdecrem@gmail.com">Say hello ↗</a></header>
<main class="three-main">
  <div class="three-kicker"><span class="mono">BUILDER, TINKERER, PRACTITIONER FELLOW.</span><span class="mono">CASBS / STANFORD</span></div>
  <h1 class="three-title">Hey, I’m <em>Bart.</em></h1>
  <div class="three-letter" aria-label="I like making learning stick, machines sing, and old things new again.">
    <div class="letter-line"><span>I like making</span><span class="letter-aside mono">SMALL EXPERIMENTS.<br>OPEN POSSIBILITIES.</span></div>
    <div class="letter-line"><button class="inline-object inline-dodo" data-project="dodo" aria-label="Explore Dodo"><img class="inline-front" src="/hi/alts/assets/dodo-peck.png" alt="Dodo’s playful Peck learning path"><img class="inline-back" src="/hi/alts/assets/dodo-topics.png" alt="Dodo’s topics library"><span class="object-index mono">01</span></button><span>learning <em>stick,</em></span></div>
    <div class="letter-line"><span>machines</span><button class="inline-object inline-jam" data-project="jambot" aria-label="Explore Jambot"><img class="inline-front" src="/hi/alts/assets/jambot-controls.png" alt="Jambot synth controls"><img class="inline-back" src="/hi/alts/assets/jambot-tracks.png" alt="Jambot track sequencers"><span class="object-index mono">02</span></button><span><em>sing,</em></span></div>
    <div class="letter-line"><span>and old things</span><button class="inline-object inline-mac" data-project="mac" aria-label="Explore Macinclaude"><img src="/hi/alts/assets/mac-plus.jpg" alt="The Macintosh Plus on Bart’s desk"><span class="object-index mono">03</span></button></div>
    <div class="letter-line last-letter"><span><em>new again.</em></span><span class="letter-period" aria-hidden="true">✳</span></div>
  </div>
  <div class="three-bottom"><div class="three-bottom-caption"><span class="mono">A SMALL COLLECTION<br>OF WORKS IN PROGRESS.</span><nav class="three-project-index" aria-label="Projects"><button data-project="dodo"><sup>01</sup> Dodo</button><button data-project="jambot"><sup>02</sup> Jambot</button><button data-project="mac"><sup>03</sup> Mac Plus</button></nav></div><div class="three-bio"><p>This year I’m at CASBS, exploring<br>AI × human flourishing.</p><p>My door is open. Swing by room 16,<br>especially if you want to talk AI &amp; your work.</p><a href="mailto:bdecrem@gmail.com">bdecrem@gmail.com ↗</a></div></div>
</main>
<footer class="three-footer"><a href="sms:6508989508">650 898 9508</a><a href="/hi/about">About me</a><a href="https://decremental.com">More experiments ↗</a><a href="https://decremental.substack.com">Substack ↗</a></footer>
<nav class="edition-nav" aria-label="Alternate homepage designs"><a class="edition-label" href="/hi">HOME /</a><a href="/hi/alt3" aria-current="page" title="Small wonders">03</a><a href="/hi/alt4" title="Room for play">04</a></nav>
<dialog class="project-dialog" aria-labelledby="project-title"><button class="dialog-close" aria-label="Close project">×</button><div class="dialog-copy"><span class="mono">FROM BART’S DESK</span><h2 id="project-title"></h2><p id="project-description"></p><a id="project-link">Explore the project ↗</a></div><div class="dialog-images"></div><div class="dialog-instrument" hidden><button class="beat-toggle" aria-pressed="false">Play a little sketch</button><span class="mono">128 BPM / TAP STEPS TO CHANGE THE RHYTHM</span><div class="beat-steps" role="group" aria-label="Kick drum sequence"></div></div></dialog>`

export const html = alternateDocument({
  title: "Bart in 16 — Small wonders",
  description: "Learning, making music, and giving old things a new life. Bart Decrem at CASBS.",
  bodyClass: "edition-three",
  body,
})
