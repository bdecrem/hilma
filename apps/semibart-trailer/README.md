# CASBS Quest — trailer

A 48-second 1920×1080 trailer for the game (ola.cx/semibart), 2026-11-13. Act 1 is a movie trailer in
high fidelity (`public/semibart/intro3d.js`, three.js 0.170 from the CDN, the same module the demo page
plays live): THIS. / CHANGES. / EVERYTHING. as extruded, bevelled metal in Anton, one color to a word.
THIS. is cold steel under an ultramarine light; CHANGES. lands as steel and a white-hot line crosses it
and leaves it copper; EVERYTHING. is gold. Each word comes over the camera's shoulder on a whoosh and
slams onto a black mirror floor on a braam, sparks leave the floor and a ring runs out across it, a
light comes up behind the word and shines through the letters, and the camera drifts low around it and
swings to the other side in the dark of the pause; a riser, with gold glitter pouring upward. The hinge:
the riser cuts, the last full-fidelity frame is resampled into ever bigger
blocks snapped to the game's palette and they fall away, while the braam's chord powers down as square
waves, the game's own start jingle plays, and the title card steps out of the mosaic. (`render.mjs`
makes `out/Anton.ttf` from the bundled woff2 with fontTools, for three's text geometry.) Act 2 is the game: a chiptune theme built on that jingle (120 BPM,
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
