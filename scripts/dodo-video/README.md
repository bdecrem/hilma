# Dodo overview video pipeline

Everything about the ~50s overview video on dodogo.cc is regenerable from
this folder. To change the video:

1. **Storyline / captions / timings** — edit `storyboard.json`. Shots are
   played in order; `kind` is `still` (default), `title`, `outro`, or
   `video` (splices an mp4 into the same rounded window). Stills reference
   either `frames/` (live captures) or the tour stills in
   `public/dodo/tour/`.
2. **Fresh screenshots after UI changes** — build the app for the
   simulator, then `./capture.sh` (signs into bart's account, drives each
   screen via the app's launch hooks, writes `frames/`).
3. **Music** — `node music.mjs` re-renders the jambot deep-house bed
   (`music.wav`, ~67s; recipe from vibeceo/jambot/library.json). Gitignored;
   regenerate it before the first build on a fresh checkout.
4. **Build** — `python3 build.py`. Composes every shot (butter-paper
   canvas, Fredoka captions, rounded screenshot with a soft shadow and a
   gentle push-in), crossfades the segments, lays the music underneath, and
   copies the result to `public/dodo/tour/overview.mp4` (+ poster). Push to
   deploy.
