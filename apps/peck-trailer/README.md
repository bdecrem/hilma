# Peck or Perish — trailer

A 30-second vertical trailer for the Dodo rest-stop game, drawn frame by frame in code with the same
pipeline and style recipe as `apps/strangers` (see its PROCESS.md). The dodo, egg, rats, pig, monkey
and VOC ship reuse the game's geometry (`public/peck-or-perish/index.html`), re-inked for the trailer:
heavier outlines, flat riso colour (vermillion, ultramarine dodo, sunflower, lime spark on ink and cream — the game's teal/pink read as synthwave, so the trailer drops them), halftone dots for shading.

Music: INTERWORLD — METAMORPHOSIS, 0:07 → 0:37 (172 BPM; drop at 4.0 s, break 14.7 → 25.3 s, second
drop at 25.3 s). Not committed; `audio/clip.wav` is cut with:

    yt-dlp -x --audio-format wav -o "song.%(ext)s" "https://www.youtube.com/watch?v=NS9z2QHcZdY"
    ffmpeg -ss 7 -t 30 -i song.wav -ac 2 -ar 44100 audio/clip.wav

Story: Mauritius 1598 → the ships land → one egg → rats, pigs, monkeys → one dodo → a peck montage →
P(extinct) climbs → the museum specimen, "history says you lose" → the eye opens, the glass breaks →
PECK / OR / PERISH → title card.

    node render.mjs --stills 4,9.6,22 --sheet out/s.jpg   # contact sheet
    node render.mjs                                       # out/peck-or-perish-trailer.mp4 (~1 min)
