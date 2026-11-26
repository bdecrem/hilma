---
name: sound
description: Only when the person asks by name for Ola's sound skill. Not for an ordinary request for sound or music in a page or app, which you make yourself in code (AGENTS.md).
license: Proprietary
metadata:
  ola/version: "4"
  ola/specialists: "none"
  ola/evals: "v1-app-chimes v2-signature-tune v3-calm-loop v4-signup-sounds v5-petition-win v6-fix-harsh"
  ola/owner: "ola"
  ola/needs: "none"
  ola/mac: "yes"
---

# Sound for pages and apps

Sound is the first thing people turn off when it is wrong. Good interface sound is quiet, short,
soft at the start, made of few tones, one family throughout, and never a surprise. Good music on a
page is calm, in one key, and stops when asked. The kit does the sound design; your job is to choose,
wire, write a tune when asked, and listen.

## Two modes

- **Quick (the default, for every request unless the person asks for more):** read
  `/opt/ola/skills/sound/references/quick.md` and follow it: copy the kit, pick its sounds, add a
  sound on/off button, write a tune by the rules if one is asked for, run `listen.py` once, fix
  every [fail], hand off. Nothing else.
- **Thorough (only when the person asks: "take your time", "a full sound design", "options",
  "make our own sounds"):** read `/opt/ola/skills/sound/references/thorough.md`.

## The files

- `assets/olasound.js`: the kit. Copy it beside the page:
  `cp /opt/ola/skills/sound/assets/olasound.js .` and load it with `<script src="olasound.js"></script>`.
- `scripts/listen.py`: plays the page in the headless browser, renders every sound exactly, and
  prints [fail] / [warn] / [ok] lines on loudness, clipping, harshness above 5 kHz, clicks at the
  start or end, sound before a click, the on/off switch, and whether a tune stays in one key, has a
  figure that comes back and lands on the home note. It also writes a spectrogram picture and one
  .wav per sound in `sound-check/`.
  `python3 /opt/ola/skills/sound/scripts/listen.py index.html`
- `references/melody.md`: how to write a short tune that is not cheesy (read it when a tune is asked).
- `references/music.md`: the two music beds and what may and may not be changed in them.
- `references/levels.md`: the numbers listen.py holds sounds to, and why.
- `references/swift.md`: the same sounds in a SwiftUI app (AVAudioEngine).

## Rules that are never broken

- No sound before a click or a key press. Never on page load, scroll, hover or a timer the person
  did not start. The kit makes its sound system on the first `OlaSound.play` call from a click.
- Always a visible sound on/off button (`OlaSound.toggleButton`), and it turns everything off,
  music and echoes included. The choice is remembered; reduced motion starts with sound off.
- Use the kit's sounds. Do not write your own oscillators for interface sounds: no square or
  sawtooth tones, no beeps, no gain above 0.3, no new AudioContext per sound.
- Music beds are the kit's (`pad`, `dub`). Their kick, bass and voices are copied from approved
  work and stay as they are; change chords, tempo or level only.
- A tune follows `references/melody.md`: a motif that comes back, long and short notes, in one key,
  ending on the home note. Never random notes, never a pentatonic noodle.
- No sound files from anywhere, no speech, nothing from the internet.
- Every sound here is made in code. When the person asks for a real-world sound (birdsong, rain,
  a voice, a dog, a recording of anything), your reply opens with it, as its first sentence, before
  anything about checks, loudness or files: "I can't use a recording; this is a sound made in code
  that comes close to birdsong" (or plainly: a short tune). Do not report the sound checks' numbers
  or warnings to the person; say only a problem they must know. Name the
  button and the page for what it really plays ("Tap for a bird-like tune"), never "birdsong"; and
  never say it is exactly what they asked.
- Never say the sounds are done until `listen.py` prints no [fail] line. If it cannot run here,
  say plainly that the sounds were not checked.
