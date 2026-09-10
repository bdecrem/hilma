import { alternateDocument } from '../_alts/document'

export const body = `<main>
<section class="four-stage">
  <img class="four-sculpture" src="/hi/alts/assets/room-16-sculpture.jpg" alt="A sculptural chrome number 16 on a dark studio surface" width="1536" height="1024">
  <header class="four-header"><a class="four-brand" href="/hi">bart<span>in</span>16<span class="brand-period">.</span></a><span class="mono">CASBS, STANFORD<br>A RESIDENCY IN CURIOSITY.</span><a href="mailto:bdecrem@gmail.com">Come on in <span aria-hidden="true">↗</span></a></header>
  <div class="four-intro"><span class="mono">OPEN MIND. OPEN DOOR.</span><h1>Room<br>for <em>play.</em></h1><p>Hey, I’m Bart. I build things.<br>Some useful. Some joyful.<br>Ideally, a little of both.</p></div>
  <div class="four-studio-caption mono"><span>THREE EXPERIMENTS.<br>ONE VERY OPEN QUESTION:</span><span>WHAT ELSE<br>IS POSSIBLE?</span></div>
  <div class="four-objects" aria-label="Projects on Bart’s desk">
    <button class="studio-object studio-mac" data-project="mac" data-draggable aria-label="Explore Macinclaude. Drag to rearrange."><span class="studio-print"><img src="/hi/alts/assets/mac-plus.jpg" alt="Bart’s Mac Plus running Macinclaude"><span class="mac-greeting" aria-hidden="true">hello, again<span>_</span></span></span><span class="studio-label"><span><small>03 / REANIMATE</small>Mac Plus</span><span aria-hidden="true">↗</span></span></button>
    <button class="studio-object studio-dodo" data-project="dodo" data-draggable aria-label="Explore Dodo. Drag to rearrange."><span class="studio-screen screen-back"><img src="/hi/alts/assets/dodo-topics.png" alt="Dodo Topics learning library"></span><span class="studio-screen screen-front"><img src="/hi/alts/assets/dodo-peck.png" alt="Dodo’s colorful learning path"></span><span class="studio-label"><span><small>01 / REDISCOVER</small>Dodo</span><span aria-hidden="true">↗</span></span></button>
    <button class="studio-object studio-jam" data-project="jambot" data-draggable aria-label="Explore Jambot. Drag to rearrange."><span class="studio-synth"><span class="synth-status"><span>JAMBOT</span><span class="synth-status-right">128 BPM</span></span><span class="synth-image"><img src="/hi/alts/assets/jambot-tracks.png" alt="Jambot tracks and sequencer patterns"><img class="synth-hover" src="/hi/alts/assets/jambot-controls.png" alt="Jambot synth controls"></span><span class="synth-meter" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><span>LET IT LOOP</span></span></span><span class="studio-label"><span><small>02 / REMIX</small>Jambot</span><span aria-hidden="true">↗</span></span></button>
  </div>
  <div class="four-floor"><span class="mono"><span class="desktop-instructions">HOVER TO DISCOVER. DRAG TO REARRANGE.</span><span class="touch-instructions">TAP SOMETHING THAT MAKES YOU CURIOUS.</span></span><button class="desk-reset mono" aria-label="Reset the project positions">RESET THE DESK ↺</button><span class="mono">A FEW THINGS ON MY DESK.</span></div>
</section>
<section class="four-about"><div><span class="mono">THE REASON I’M HERE</span><h2>Technology is interesting.<br><em>People, even more so.</em></h2></div><div class="four-bio"><p>I’m a practitioner fellow at CASBS this year, thinking and prototyping on AI × human flourishing.</p><p>Come by room 16. Tell me what you’re working on. Let’s see what happens.</p><a href="mailto:bdecrem@gmail.com">bdecrem@gmail.com ↗</a></div></section>
<footer class="four-footer"><a href="sms:6508989508">650 898 9508</a><a href="/hi/about">About me</a><a href="https://decremental.com">More experiments ↗</a><a href="https://decremental.substack.com">Substack ↗</a><span class="mono">NEVER QUITE FINISHED.</span></footer>
</main>
<nav class="edition-nav" aria-label="Alternate homepage designs"><a class="edition-label" href="/hi">HOME /</a><a href="/hi/alt3" title="Small wonders">03</a><a href="/hi/alt4" aria-current="page" title="Room for play">04</a></nav>
<dialog class="project-dialog" aria-labelledby="project-title"><button class="dialog-close" aria-label="Close project">×</button><div class="dialog-copy"><span class="mono">FROM BART’S DESK</span><h2 id="project-title"></h2><p id="project-description"></p><a id="project-link">Explore the project ↗</a></div><div class="dialog-images"></div><div class="dialog-instrument" hidden><button class="beat-toggle" aria-pressed="false">Play a little sketch</button><span class="mono">128 BPM / TAP STEPS TO CHANGE THE RHYTHM</span><div class="beat-steps" role="group" aria-label="Kick drum sequence"></div></div></dialog>`

export const html = alternateDocument({
  title: "Bart in 16 — Room for play",
  description: "Learning, making music, giving old things a second life. Welcome to Bart’s room for play.",
  bodyClass: "edition-four",
  body,
})
