# Quick mode: sound for a page, in one pass

The default. Read this file only (and `melody.md` if a tune is asked for). Copy, pick, wire, listen
once, fix, hand off.

## 1. Copy the kit

    cp /opt/ola/skills/sound/assets/olasound.js .

and in the page, before your own script: `<script src="olasound.js"></script>`.

## 2. Pick the sound for each moment (do not make your own)

| The moment | Call |
|---|---|
| any button press, a tab, a checkbox | `OlaSound.play('tap')` (very quiet; use it sparingly, not on every link) |
| a notification, an alert that something arrived | `OlaSound.play('notify')` |
| a new message, a reply | `OlaSound.play('message')` |
| a reminder, "it is time" | `OlaSound.play('reminder')` |
| a step done, saved, sent, "Next" | `OlaSound.play('success')` (for Next in a flow, `tap` is often enough) |
| a mistake, a missing field | `OlaSound.play('error')` (gentle, low; never a buzzer) |
| the big moment: signed, joined, donated, finished | `OlaSound.play('celebrate')` (once, about 2 seconds) |
| calm background music | `const bed = OlaSound.loop('pad')`, later `bed.stop()` |
| darker, slow pulse (an evening event, a night page) | `OlaSound.loop('dub')` |
| a short signature tune | `OlaSound.melody(score, { bpm, chords })`, written by `melody.md` |

Different moments get different sounds from the same family: that is what makes them feel designed.
Do not play two sounds for one click. A sound plays only inside a click or key handler.

## 3. The sound on/off button (always)

    <button id="sound" type="button" aria-pressed="true">Sound on</button>
    <script>OlaSound.toggleButton(document.getElementById('sound'))</script>

Put it where people look for it (the top corner, or beside the play button). It needs a real
label (Sound on / Sound off), a visible focus style, and at least 44 px of height on a phone.
For music, one button can both start and stop the bed:

    let bed = null
    playButton.addEventListener('click', () => {
      if (bed && bed.playing) { bed.stop(); bed = null; playButton.textContent = 'Play music' }
      else { bed = OlaSound.loop('pad'); playButton.textContent = 'Stop music' }
    })

Then the music button is the switch, and the sound on/off button is still there for everything else.

## 4. A tune

Read `/opt/ola/skills/sound/references/melody.md`, write the score by its four-bar plan, and play it
from a button: `OlaSound.melody('D4 q, F#4 e, A4 e, B4 h, ...', { bpm: 100, chords: 'D | Bm | G | A' })`.

## 5. Fixing a page whose sounds are harsh

Keep every moment that has a sound (the same buttons, the same events), and replace each sound with
the closest kit sound: beep or click to `tap`, alert or ding to `notify`, error buzz to `error`,
win or fanfare to `celebrate`, any background music to `loop('pad')`. Remove anything that plays on
load or on a timer, remove every `new AudioContext()` and oscillator the page made itself, and add
the sound on/off button. Listen before and after (step 6) and say what changed.

## 6. Listen, fix, done

    python3 /opt/ola/skills/sound/scripts/listen.py index.html

It presses the buttons like a visitor. For a flow it cannot finish by itself, give it the steps:

    python3 /opt/ola/skills/sound/scripts/listen.py signup.html --do click:#next --do fill --do click:#next --do click:#submit

Fix every [fail] line, most important first, and run it once more. Look at `sound-check/spectrogram.png`
with `ola-see` only if a line confuses you: good interface sounds are a few thin horizontal lines
that fade, nothing above the dashed 5 kHz line, no dark vertical bars.

Then tell the person in three sentences: what plays when, that there is a sound on/off button and
where, and that the sound check passed (or what it could not check).
If they asked for a real-world sound (birdsong, rain, a voice), the first of those sentences says it
is a sound made in code that only comes close, not a recording, and the button says what it really plays.
