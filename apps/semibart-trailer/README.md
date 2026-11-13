# CASBS Quest — trailer

A 48-second 1920×1080 trailer for the game (ola.cx/semibart), 2026-11-13. Act 1 is a movie trailer on
black: three braams and THIS. / CHANGES. / EVERYTHING. slammed in Anton, a pause of black after each,
then a riser. The hinge: the riser cuts, EVERYTHING. crumbles into yellow and cyan 8-bit blocks while
the last braam's chord powers down as square waves, the game's own start jingle plays, and the title
card steps out of the mosaic. Act 2 is the game: a chiptune theme built on that jingle (120 BPM,
C – Am – F – G, pulse lead with an echo, triangle bass, noise drums), cut on the bar to real footage,
with the game's own sounds and garble voices in sync, a reprise of the three words in the game's font,
and an end card with the address.

Everything is code; nothing is committed but the source.

- `capture.mjs` films the game frame by frame: a fresh page per shot against `next dev -p 3277`, the
  clock frozen (Playwright `page.clock`), every API answered locally (nothing read or written), signed
  in as Bart only in the page. It logs every SFX call and spoken line with its frame number.
  `rats.js` is the room decorator's real answer to "add ten cute rats" for Study 16
  (`scripts/semibart/decorate-try.ts`, not saved), shown when the chat answers.
- `edit.mjs` is the timeline both halves read: hit times, the hinge, the footage segments with their
  zooms, the cards.
- `score.js` renders the soundtrack offline (OfflineAudioContext), using the game's own `tone`,
  `noise`, SFX and `garble` code; the music ducks under the characters' voices.
- `scene.js` draws each frame; `render.mjs` builds the score and pipes the frames to ffmpeg.

    node apps/semibart-trailer/capture.mjs                    # out/shots/<shot>/*.jpg + log.json (~2 min)
    node apps/semibart-trailer/render.mjs --stills 1.4,8.6,30.5 --sheet apps/semibart-trailer/out/s.jpg
    node apps/semibart-trailer/render.mjs                     # out/casbs-quest-trailer.mp4 (~3 min)
    apps/semibart-trailer/sheet.sh <shot> <frames…>           # look at a captured shot

Checks used: a spectrogram and 0.25 s loudness table of `out/score.wav` (ffmpeg `showspectrumpic`),
and a 1 fps contact sheet of the MP4.
